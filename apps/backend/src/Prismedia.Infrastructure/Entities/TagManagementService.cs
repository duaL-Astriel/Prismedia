using Microsoft.EntityFrameworkCore;
using Prismedia.Application.Entities;
using Prismedia.Contracts.Entities;
using Prismedia.Domain.Entities;
using Prismedia.Domain.Taxonomy;
using Prismedia.Infrastructure.Persistence;
using Prismedia.Infrastructure.Persistence.Entities;

namespace Prismedia.Infrastructure.Entities;

/// <summary>
/// EF-backed implementation of <see cref="ITagManagementService"/>.
/// Handles tag alias management and tag merge operations with deduplication of relationship links.
/// </summary>
public sealed class TagManagementService(PrismediaDbContext db) : ITagManagementService {
    /// <inheritdoc />
    public async Task<TagOperationResult> AddAliasAsync(Guid tagId, string alias, CancellationToken cancellationToken) {
        if (string.IsNullOrWhiteSpace(alias)) {
            return new TagOperationResult(TagOperationStatus.Invalid, "Alias cannot be empty.", tagId);
        }

        var trimmed = alias.Trim();
        var tagCode = EntityKind.Tag.ToCode();
        var tagRow = await db.Entities.FirstOrDefaultAsync(
            e => e.Id == tagId && e.KindCode == tagCode,
            cancellationToken);

        if (tagRow is null) {
            return new TagOperationResult(TagOperationStatus.NotFound, "Tag not found.", tagId);
        }

        var detail = await db.TagDetails.AsNoTracking().FirstOrDefaultAsync(d => d.EntityId == tagId, cancellationToken);
        var existingAliases = await db.TagAliases.Where(a => a.TagId == tagId).ToListAsync(cancellationToken);

        var domainTag = new Tag(tagRow.Id, tagRow.Title, detail?.IgnoreAutoTag ?? false, existingAliases.Select(a => a.Alias));
        try {
            if (!domainTag.AddAlias(trimmed)) {
                // Idempotent: alias already present on this tag
                return new TagOperationResult(TagOperationStatus.Success, TagId: tagId);
            }
        } catch (ArgumentException ex) {
            return new TagOperationResult(TagOperationStatus.Invalid, ex.Message, tagId);
        }

        var lower = trimmed.ToLower();
        var tagTitleConflict = await db.Entities.AnyAsync(
            e => e.KindCode == tagCode && e.Id != tagId && e.Title.ToLower() == lower,
            cancellationToken);
        if (tagTitleConflict) {
            return new TagOperationResult(TagOperationStatus.Conflict, "A tag with this name already exists. Use merge instead.", tagId);
        }

        var tagAliasConflict = await db.TagAliases.AnyAsync(
            a => a.TagId != tagId && a.Alias.ToLower() == lower,
            cancellationToken);
        if (tagAliasConflict) {
            return new TagOperationResult(TagOperationStatus.Conflict, "Another tag already has this alias.", tagId);
        }

        db.TagAliases.Add(new TagAliasRow { TagId = tagId, Alias = trimmed });
        tagRow.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(cancellationToken);

        return new TagOperationResult(TagOperationStatus.Success, TagId: tagId);
    }

    /// <inheritdoc />
    public async Task<TagOperationResult> RemoveAliasAsync(Guid tagId, string alias, CancellationToken cancellationToken) {
        if (string.IsNullOrWhiteSpace(alias)) {
            return new TagOperationResult(TagOperationStatus.Invalid, "Alias cannot be empty.", tagId);
        }

        var trimmed = alias.Trim();
        var tagCode = EntityKind.Tag.ToCode();
        var tagRow = await db.Entities.FirstOrDefaultAsync(
            e => e.Id == tagId && e.KindCode == tagCode,
            cancellationToken);

        if (tagRow is null) {
            return new TagOperationResult(TagOperationStatus.NotFound, "Tag not found.", tagId);
        }

        var lower = trimmed.ToLower();
        var matching = await db.TagAliases.Where(
            a => a.TagId == tagId && a.Alias.ToLower() == lower).ToListAsync(cancellationToken);

        if (matching.Count > 0) {
            db.TagAliases.RemoveRange(matching);
            tagRow.UpdatedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(cancellationToken);
        }

        return new TagOperationResult(TagOperationStatus.Success, TagId: tagId);
    }

    /// <inheritdoc />
    public async Task<TagOperationResult> MergeAsync(Guid canonicalTagId, Guid sourceTagId, CancellationToken cancellationToken) {
        if (canonicalTagId == sourceTagId) {
            return new TagOperationResult(TagOperationStatus.Invalid, "Cannot merge a tag into itself.", canonicalTagId);
        }

        var tagCode = EntityKind.Tag.ToCode();
        var canonicalRow = await db.Entities.FirstOrDefaultAsync(
            e => e.Id == canonicalTagId && e.KindCode == tagCode,
            cancellationToken);
        if (canonicalRow is null) {
            return new TagOperationResult(TagOperationStatus.NotFound, "Canonical tag not found.", canonicalTagId);
        }

        var sourceRow = await db.Entities.FirstOrDefaultAsync(
            e => e.Id == sourceTagId && e.KindCode == tagCode,
            cancellationToken);
        if (sourceRow is null) {
            return new TagOperationResult(TagOperationStatus.NotFound, "Source tag not found.", sourceTagId);
        }

        var canonicalAliases = await db.TagAliases.Where(a => a.TagId == canonicalTagId).ToListAsync(cancellationToken);
        var sourceAliases = await db.TagAliases.Where(a => a.TagId == sourceTagId).ToListAsync(cancellationToken);

        var canonicalDetail = await db.TagDetails.FirstOrDefaultAsync(d => d.EntityId == canonicalTagId, cancellationToken);
        var sourceDetail = await db.TagDetails.FirstOrDefaultAsync(d => d.EntityId == sourceTagId, cancellationToken);

        var canonicalDomain = new Tag(canonicalRow.Id, canonicalRow.Title, canonicalDetail?.IgnoreAutoTag ?? false, canonicalAliases.Select(a => a.Alias));
        var sourceDomain = new Tag(sourceRow.Id, sourceRow.Title, sourceDetail?.IgnoreAutoTag ?? false, sourceAliases.Select(a => a.Alias));

        canonicalDomain.MergeFrom(sourceDomain);

        var existingCanonicalSet = new HashSet<string>(canonicalAliases.Select(a => a.Alias), StringComparer.OrdinalIgnoreCase);
        foreach (var alias in canonicalDomain.Aliases) {
            if (existingCanonicalSet.Add(alias)) {
                db.TagAliases.Add(new TagAliasRow { TagId = canonicalTagId, Alias = alias });
            }
        }

        var tagsCode = RelationshipKind.Tags.ToCode();
        var sourceLinks = await db.EntityRelationshipLinks.Where(
            l => l.TargetEntityId == sourceTagId && l.RelationshipCode == tagsCode).ToListAsync(cancellationToken);

        var canonicalLinkedEntityIds = await db.EntityRelationshipLinks.Where(
            l => l.TargetEntityId == canonicalTagId && l.RelationshipCode == tagsCode).Select(l => l.EntityId).ToHashSetAsync(cancellationToken);

        foreach (var link in sourceLinks) {
            db.EntityRelationshipLinks.Remove(link);
            if (!canonicalLinkedEntityIds.Contains(link.EntityId)) {
                db.EntityRelationshipLinks.Add(new EntityRelationshipLinkRow {
                    EntityId = link.EntityId,
                    RelationshipCode = tagsCode,
                    TargetEntityId = canonicalTagId,
                    TargetKindCode = link.TargetKindCode,
                    Label = link.Label,
                    SortOrder = link.SortOrder,
                    CreatedAt = link.CreatedAt
                });
                canonicalLinkedEntityIds.Add(link.EntityId);
            }
        }

        db.TagAliases.RemoveRange(sourceAliases);
        if (sourceDetail is not null) {
            db.TagDetails.Remove(sourceDetail);
        }
        db.Entities.Remove(sourceRow);

        canonicalRow.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(cancellationToken);

        return new TagOperationResult(TagOperationStatus.Success, TagId: canonicalTagId);
    }
}

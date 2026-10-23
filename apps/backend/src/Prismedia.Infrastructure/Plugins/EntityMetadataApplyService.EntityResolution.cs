using Microsoft.EntityFrameworkCore;
using Prismedia.Application.Entities;
using Prismedia.Domain.Entities;
using Prismedia.Infrastructure.Persistence.Entities;

namespace Prismedia.Infrastructure.Plugins;

public sealed partial class EntityMetadataApplyService {
    /// <summary>
    /// Whether an entity of <paramref name="entityKind"/> may be patched through a route or
    /// proposal addressed at <paramref name="expectedKind"/>. Beyond exact kind matches, a
    /// Movie accepts the generic video code through its definition model.
    /// </summary>
    private static bool IsKindCompatible(string entityKind, string expectedKind) =>
        entityKind.Equals(expectedKind, StringComparison.OrdinalIgnoreCase) ||
        IsDefinitionCompatible(entityKind, expectedKind);

    private static bool IsDefinitionCompatible(string entityKind, string expectedKind) =>
        EntityKindRegistry.TryDescribe(entityKind, out var definition) &&
        EntityKindRegistry.TryGet(expectedKind, out var pluginKind) &&
        definition.AcceptsPluginKind(pluginKind);

    /// <summary>
    /// Resolves an existing entity for a proposal using one consistent rule across the whole apply
    /// walk: the proposal's complete valid external-identity set is the strongest evidence and is
    /// resolved in one operation, then a normalized case-insensitive title match is used only when no
    /// identity matches. <paramref name="parentEntityId"/> scopes the match to one parent's children
    /// (structural children), or is null for parent-agnostic taxonomy (people/studios/tags). Returns
    /// null when nothing matches so the caller can create the entity.
    /// </summary>
    private async Task<EntityRow?> FindEntityAsync(
        string kindCode,
        IReadOnlyDictionary<string, string>? externalIds,
        string? title,
        Guid? parentEntityId,
        CancellationToken cancellationToken) {
        var identities = BuildExternalIdentityAssociations(externalIds, [])
            .Select(association => association.Identity)
            .ToArray();
        if (identities.Length > 0) {
            var kind = kindCode.DecodeAs<EntityKind>();
            var resolution = await _externalIdentities.ResolveAsync(
                kind,
                identities,
                parentEntityId,
                cancellationToken);
            if (resolution.Status == ExternalIdentityResolutionStatus.Ambiguous) {
                throw new ExternalIdentityAmbiguityException(kind, resolution);
            }

            if (resolution.EntityId is { } matchedEntityId) {
                return _db.Entities.Local.FirstOrDefault(row =>
                        row.Id == matchedEntityId && _db.Entry(row).State != EntityState.Deleted)
                    ?? await _db.Entities.FirstOrDefaultAsync(
                        row => row.Id == matchedEntityId,
                        cancellationToken);
            }
        }

        return string.IsNullOrWhiteSpace(title)
            ? null
            : kindCode == EntityKind.Tag.ToCode()
                ? await FindTagByNameOrAliasAsync(title, cancellationToken)
                : await FindEntityByTitleAsync(kindCode, title, parentEntityId, cancellationToken);
    }

    /// <summary>
    /// Converts plugin-provided identity maps into canonical associations once for both resolution
    /// and persistence. Invalid and URL-shaped locator values are transient proposal hints, not
    /// persistable identities, so they are deliberately omitted here.
    /// </summary>
    private static IReadOnlyList<EntityExternalId> BuildExternalIdentityAssociations(
        IReadOnlyDictionary<string, string>? externalIds,
        IReadOnlyList<string> urls) {
        if (externalIds is not { Count: > 0 }) {
            return [];
        }

        var normalizedUrls = urls
            .Where(url => !string.IsNullOrWhiteSpace(url))
            .Select(url => url.Trim())
            .ToArray();
        var associations = new List<EntityExternalId>();
        foreach (var (identityNamespace, value) in externalIds) {
            if (!TryCreateExternalIdentity(identityNamespace, value, out var identity)) {
                continue;
            }

            var url = normalizedUrls.FirstOrDefault(candidate =>
                candidate.Contains(identity.Value, StringComparison.OrdinalIgnoreCase));
            associations.Add(new EntityExternalId(identity, url));
        }

        return associations
            .DistinctBy(association => association.Identity)
            .ToArray();
    }

    private static bool TryCreateExternalIdentity(
        string identityNamespace,
        string value,
        out ExternalIdentity identity) {
        identity = null!;
        if (string.IsNullOrWhiteSpace(identityNamespace) || string.IsNullOrWhiteSpace(value)) {
            return false;
        }

        try {
            identity = new ExternalIdentity(identityNamespace, value);
            return true;
        } catch (ArgumentException) {
            return false;
        }
    }

    /// <summary>
    /// Matches an existing entity by kind and case-insensitive title (optionally parent-scoped). The
    /// change-tracked (Local) lookup and the database lookup use the SAME ToLower comparison, so an
    /// entity created earlier in this apply matches the same way a persisted row does — closing the gap
    /// where a Local Ordinal compare and a DB ToLower compare could disagree and create a duplicate.
    /// </summary>
    private async Task<EntityRow?> FindEntityByTitleAsync(
        string kindCode,
        string title,
        Guid? parentEntityId,
        CancellationToken cancellationToken) {
        var lowered = title.Trim().ToLower();
        return _db.Entities.Local.FirstOrDefault(row =>
                row.KindCode == kindCode &&
                (parentEntityId == null || row.ParentEntityId == parentEntityId) &&
                row.Title.ToLower() == lowered)
            ?? await _db.Entities.FirstOrDefaultAsync(row =>
                row.KindCode == kindCode &&
                (parentEntityId == null || row.ParentEntityId == parentEntityId) &&
                row.Title.ToLower() == lowered,
                cancellationToken);
    }

    /// <summary>
    /// Matches a tag entity by canonical title or any registered alias (case-insensitive).
    /// </summary>
    private async Task<EntityRow?> FindTagByNameOrAliasAsync(string name, CancellationToken cancellationToken) {
        var tagCode = EntityKind.Tag.ToCode();
        var byTitle = await FindEntityByTitleAsync(tagCode, name, parentEntityId: null, cancellationToken);
        if (byTitle is not null) {
            return byTitle;
        }

        var lowered = name.Trim().ToLower();
        var aliasRow = _db.TagAliases.Local.FirstOrDefault(a => a.Alias.ToLower() == lowered)
            ?? await _db.TagAliases.AsNoTracking().FirstOrDefaultAsync(a => a.Alias.ToLower() == lowered, cancellationToken);

        if (aliasRow is not null) {
            return _db.Entities.Local.FirstOrDefault(e => e.Id == aliasRow.TagId && _db.Entry(e).State != EntityState.Deleted)
                ?? await _db.Entities.FirstOrDefaultAsync(e => e.Id == aliasRow.TagId, cancellationToken);
        }

        return null;
    }

    private EntityRow CreateEntity(string kind, string title, DateTimeOffset now) {
        var entity = new EntityRow {
            Id = Guid.NewGuid(),
            KindCode = kind,
            Title = title,
            CreatedAt = now,
            UpdatedAt = now
        };
        _db.Entities.Add(entity);
        return entity;
    }
}

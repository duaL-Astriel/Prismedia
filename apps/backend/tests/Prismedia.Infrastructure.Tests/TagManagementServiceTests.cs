using Microsoft.EntityFrameworkCore;
using Prismedia.Application.Entities;
using Prismedia.Application.Plugins;
using Prismedia.Contracts.Entities;
using Prismedia.Contracts.Plugins;
using Prismedia.Domain.Entities;
using Prismedia.Domain.Taxonomy;
using Prismedia.Infrastructure.Entities;
using Prismedia.Infrastructure.Persistence;
using Prismedia.Infrastructure.Persistence.Entities;
using Prismedia.Infrastructure.Plugins;

namespace Prismedia.Infrastructure.Tests;

public sealed class TagManagementServiceTests {
    private static PrismediaDbContext CreateDb() =>
        new(new DbContextOptionsBuilder<PrismediaDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);

    [Fact]
    public async Task AddAliasAsyncAddsAliasToDb() {
        await using var db = CreateDb();
        var tagId = Guid.NewGuid();
        var tagCode = EntityKind.Tag.ToCode();
        db.Entities.Add(new EntityRow { Id = tagId, KindCode = tagCode, Title = "Documentary", CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow });
        await db.SaveChangesAsync();

        var service = new TagManagementService(db);
        var result = await service.AddAliasAsync(tagId, "Docu", CancellationToken.None);

        Assert.Equal(TagOperationStatus.Success, result.Status);
        var aliasRow = await db.TagAliases.SingleOrDefaultAsync(a => a.TagId == tagId && a.Alias == "Docu");
        Assert.NotNull(aliasRow);
    }

    [Fact]
    public async Task AddAliasAsyncRejectsDuplicateOnDifferentTagAsConflict() {
        await using var db = CreateDb();
        var tagCode = EntityKind.Tag.ToCode();
        var tagA = Guid.NewGuid();
        var tagB = Guid.NewGuid();
        db.Entities.Add(new EntityRow { Id = tagA, KindCode = tagCode, Title = "Horror", CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow });
        db.Entities.Add(new EntityRow { Id = tagB, KindCode = tagCode, Title = "Suspense", CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow });
        db.TagAliases.Add(new TagAliasRow { TagId = tagA, Alias = "Creepy" });
        await db.SaveChangesAsync();

        var service = new TagManagementService(db);
        var result = await service.AddAliasAsync(tagB, "creepy", CancellationToken.None);

        Assert.Equal(TagOperationStatus.Conflict, result.Status);
    }

    [Fact]
    public async Task AddAliasAsyncRejectsAliasEqualToTagTitle() {
        await using var db = CreateDb();
        var tagId = Guid.NewGuid();
        var tagCode = EntityKind.Tag.ToCode();
        db.Entities.Add(new EntityRow { Id = tagId, KindCode = tagCode, Title = "Action", CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow });
        await db.SaveChangesAsync();

        var service = new TagManagementService(db);
        var result = await service.AddAliasAsync(tagId, "action", CancellationToken.None);

        Assert.Equal(TagOperationStatus.Invalid, result.Status);
    }

    [Fact]
    public async Task RemoveAliasAsyncRemovesAliasRow() {
        await using var db = CreateDb();
        var tagId = Guid.NewGuid();
        var tagCode = EntityKind.Tag.ToCode();
        db.Entities.Add(new EntityRow { Id = tagId, KindCode = tagCode, Title = "Sci-Fi", CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow });
        db.TagAliases.Add(new TagAliasRow { TagId = tagId, Alias = "SF" });
        await db.SaveChangesAsync();

        var service = new TagManagementService(db);
        var result = await service.RemoveAliasAsync(tagId, "sf", CancellationToken.None);

        Assert.Equal(TagOperationStatus.Success, result.Status);
        Assert.Empty(await db.TagAliases.Where(a => a.TagId == tagId).ToListAsync());
    }

    [Fact]
    public async Task MergeAsyncReassignsLinksDeduplicatingAndTransfersAliasesThenDeletesSource() {
        await using var db = CreateDb();
        var tagCode = EntityKind.Tag.ToCode();
        var videoCode = EntityKind.Video.ToCode();
        var tagsRel = RelationshipKind.Tags.ToCode();

        var canonicalId = Guid.NewGuid();
        var sourceId = Guid.NewGuid();
        var media1Id = Guid.NewGuid();
        var media2Id = Guid.NewGuid();

        // Canonical tag
        db.Entities.Add(new EntityRow { Id = canonicalId, KindCode = tagCode, Title = "Post-Apocalyptic", CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow });
        db.TagAliases.Add(new TagAliasRow { TagId = canonicalId, Alias = "Wasteland" });

        // Source tag
        db.Entities.Add(new EntityRow { Id = sourceId, KindCode = tagCode, Title = "Post-Apocalypse", CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow });
        db.TagDetails.Add(new TagDetailRow { EntityId = sourceId, IgnoreAutoTag = false });
        db.TagAliases.Add(new TagAliasRow { TagId = sourceId, Alias = "Wasteland" }); // Duplicate alias
        db.TagAliases.Add(new TagAliasRow { TagId = sourceId, Alias = "After the Fall" }); // New alias

        // Media 1 is linked ONLY to source
        db.EntityRelationshipLinks.Add(new EntityRelationshipLinkRow {
            EntityId = media1Id,
            RelationshipCode = tagsRel,
            TargetEntityId = sourceId,
            TargetKindCode = tagCode,
            CreatedAt = DateTimeOffset.UtcNow
        });

        // Media 2 is linked to BOTH canonical and source (needs deduplication)
        db.EntityRelationshipLinks.Add(new EntityRelationshipLinkRow {
            EntityId = media2Id,
            RelationshipCode = tagsRel,
            TargetEntityId = canonicalId,
            TargetKindCode = tagCode,
            CreatedAt = DateTimeOffset.UtcNow
        });
        db.EntityRelationshipLinks.Add(new EntityRelationshipLinkRow {
            EntityId = media2Id,
            RelationshipCode = tagsRel,
            TargetEntityId = sourceId,
            TargetKindCode = tagCode,
            CreatedAt = DateTimeOffset.UtcNow
        });

        await db.SaveChangesAsync();

        var service = new TagManagementService(db);
        var result = await service.MergeAsync(canonicalId, sourceId, CancellationToken.None);

        Assert.Equal(TagOperationStatus.Success, result.Status);

        // Verify source tag deleted
        Assert.Null(await db.Entities.FindAsync(sourceId));
        Assert.Null(await db.TagDetails.FindAsync(sourceId));
        Assert.Empty(await db.TagAliases.Where(a => a.TagId == sourceId).ToListAsync());

        // Verify canonical tag received source title ("Post-Apocalypse") and alias ("After the Fall")
        var canonicalAliases = await db.TagAliases.Where(a => a.TagId == canonicalId).Select(a => a.Alias).ToListAsync();
        Assert.Contains("Wasteland", canonicalAliases);
        Assert.Contains("Post-Apocalypse", canonicalAliases);
        Assert.Contains("After the Fall", canonicalAliases);
        Assert.Equal(3, canonicalAliases.Count);

        // Verify links: Media 1 is linked to canonical
        var media1Links = await db.EntityRelationshipLinks.Where(l => l.EntityId == media1Id).ToListAsync();
        Assert.Single(media1Links);
        Assert.Equal(canonicalId, media1Links[0].TargetEntityId);

        // Verify links: Media 2 is linked to canonical exactly once
        var media2Links = await db.EntityRelationshipLinks.Where(l => l.EntityId == media2Id).ToListAsync();
        Assert.Single(media2Links);
        Assert.Equal(canonicalId, media2Links[0].TargetEntityId);

        // No links remain pointing to source tag
        Assert.Empty(await db.EntityRelationshipLinks.Where(l => l.TargetEntityId == sourceId).ToListAsync());
    }

    [Fact]
    public async Task MergeAsyncRejectsSelfMerge() {
        await using var db = CreateDb();
        var tagId = Guid.NewGuid();
        var service = new TagManagementService(db);

        var result = await service.MergeAsync(tagId, tagId, CancellationToken.None);

        Assert.Equal(TagOperationStatus.Invalid, result.Status);
    }

    [Fact]
    public async Task MetadataApplyResolvesExistingTagByAliasWithoutCreatingDuplicate() {
        await using var db = CreateDb();
        var entityId = Guid.NewGuid();
        var videoCode = EntityKind.Video.ToCode();
        var tagCode = EntityKind.Tag.ToCode();

        db.Entities.Add(new EntityRow {
            Id = entityId,
            KindCode = videoCode,
            Title = "Movie 1",
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        });

        var canonicalTagId = Guid.NewGuid();
        db.Entities.Add(new EntityRow {
            Id = canonicalTagId,
            KindCode = tagCode,
            Title = "Science Fiction",
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        });
        db.TagAliases.Add(new TagAliasRow { TagId = canonicalTagId, Alias = "Sci-Fi" });
        await db.SaveChangesAsync();

        var service = new EntityMetadataApplyService(db, new PluginArtworkServiceOptions(Path.GetTempPath()));
        await service.ApplyPatchAsync(
            entityId,
            new EntityMetadataUpdateRequest(
                [MetadataPatchField.Tags.ToCode()],
                EmptyPatch() with { Tags = ["sci-fi"] }),
            CancellationToken.None);

        var links = await db.EntityRelationshipLinks
            .Where(r => r.EntityId == entityId && r.RelationshipCode == RelationshipKind.Tags.ToCode())
            .ToListAsync();
        Assert.Single(links);
        Assert.Equal(canonicalTagId, links[0].TargetEntityId);

        var allTags = await db.Entities.Where(r => r.KindCode == tagCode).ToListAsync();
        Assert.Single(allTags);
        Assert.Equal("Science Fiction", allTags[0].Title);
    }

    private static EntityMetadataPatch EmptyPatch() => new(
        Title: null,
        Description: null,
        ExternalIds: new Dictionary<string, string>(),
        Urls: [],
        Tags: [],
        Studio: null,
        Credits: [],
        Dates: new Dictionary<string, string>(),
        Stats: new Dictionary<string, int>(),
        Positions: new Dictionary<string, int>(),
        Classification: null);
}

using Microsoft.EntityFrameworkCore;
using Prismedia.Application.Entities;
using Prismedia.Contracts.Entities;
using Prismedia.Domain.Entities;
using Prismedia.Infrastructure.Persistence.Entities;

namespace Prismedia.Infrastructure.Entities;

public sealed partial class EfEntityReadService {
    private async Task<EntityCard> EnrichFallbackCoverAsync(
        EntityCard card,
        bool hideNsfw,
        bool enforceLibraryVisibility,
        CancellationToken cancellationToken) {
        var images = card.Capabilities.OfType<ImagesCapability>().FirstOrDefault();
        if (images?.CoverUrl is not null || images?.ThumbnailUrl is not null) {
            return card;
        }

        if (card.Kind == EntityKind.Gallery) {
            var detail = await _db.GalleryDetails.AsNoTracking()
                .FirstOrDefaultAsync(d => d.EntityId == card.Id, cancellationToken);
            var targetImageId = detail?.CoverImageEntityId;
            if (targetImageId is null) {
                var childQuery = _db.Entities.AsNoTracking()
                    .Where(e => e.ParentEntityId == card.Id);
                if (enforceLibraryVisibility) {
                    childQuery = ApplyEnabledLibraryVisibility(childQuery);
                }
                childQuery = ApplyNsfwVisibility(childQuery, hideNsfw);
                targetImageId = await childQuery
                    .OrderBy(e => e.SortOrder)
                    .ThenBy(e => e.Title)
                    .ThenBy(e => e.Id)
                    .Select(e => (Guid?)e.Id)
                    .FirstOrDefaultAsync(cancellationToken);
            }

            if (targetImageId is { } childId) {
                var covers = await LoadCoverPathsAsync([childId], cancellationToken);
                if (covers.TryGetValue(childId, out var coverUrl)) {
                    return card with {
                        Capabilities = WithImageCoverFallback(card.Capabilities, coverUrl)
                    };
                }
                var generatedUrl = await LoadGeneratedThumbnailPathAsync(childId, cancellationToken);
                if (generatedUrl is not null) {
                    return card with {
                        Capabilities = WithImageCoverFallback(card.Capabilities, generatedUrl)
                    };
                }
            }
        } else if (card.Kind is EntityKind.Person or EntityKind.Tag or EntityKind.Studio) {
            var mediaKindCodes = EntityKindRegistry.All
                .Where(def => def.Category == EntityKindCategory.Media)
                .Select(def => def.Code)
                .ToHashSet();

            var links = await _db.EntityRelationshipLinks.AsNoTracking()
                .Where(link => link.TargetEntityId == card.Id || link.EntityId == card.Id)
                .OrderBy(link => link.SortOrder)
                .ThenBy(link => link.EntityId)
                .ToArrayAsync(cancellationToken);

            var candidateMediaIds = links
                .Select(link => link.TargetEntityId == card.Id ? link.EntityId : link.TargetEntityId)
                .Distinct()
                .ToArray();

            if (candidateMediaIds.Length > 0) {
                var mediaEntitiesQuery = _db.Entities.AsNoTracking()
                    .Where(e => candidateMediaIds.Contains(e.Id) && mediaKindCodes.Contains(e.KindCode));
                if (enforceLibraryVisibility) {
                    mediaEntitiesQuery = ApplyEnabledLibraryVisibility(mediaEntitiesQuery);
                }
                mediaEntitiesQuery = ApplyNsfwVisibility(mediaEntitiesQuery, hideNsfw);
                var validMediaIds = await mediaEntitiesQuery
                    .Select(e => e.Id)
                    .ToHashSetAsync(cancellationToken);

                var chosenMediaId = candidateMediaIds.FirstOrDefault(id => validMediaIds.Contains(id));
                if (chosenMediaId != Guid.Empty) {
                    var covers = await LoadCoverPathsAsync([chosenMediaId], cancellationToken);
                    if (covers.TryGetValue(chosenMediaId, out var coverUrl)) {
                        return card with {
                            Capabilities = WithImageCoverFallback(card.Capabilities, coverUrl)
                        };
                    }
                    var generatedUrl = await LoadGeneratedThumbnailPathAsync(chosenMediaId, cancellationToken);
                    if (generatedUrl is not null) {
                        return card with {
                            Capabilities = WithImageCoverFallback(card.Capabilities, generatedUrl)
                        };
                    }
                }
            }
        }

        return card;
    }

    /// <summary>
    /// Loads the generated grid thumbnail URL for an entity with no explicit artwork. Only
    /// cache-served variants qualify; the entity's Source file is a library path the client
    /// cannot load and is never returned.
    /// </summary>
    private async Task<string?> LoadGeneratedThumbnailPathAsync(Guid id, CancellationToken cancellationToken) {
        var files = await _db.EntityFiles.AsNoTracking()
            .Where(f => f.EntityId == id &&
                (f.Role == EntityFileRole.GridThumbnail2x || f.Role == EntityFileRole.GridThumbnail))
            .ToArrayAsync(cancellationToken);
        return (files.FirstOrDefault(f => f.Role == EntityFileRole.GridThumbnail2x)
            ?? files.FirstOrDefault(f => f.Role == EntityFileRole.GridThumbnail))?.Path;
    }

    private async Task<IReadOnlyDictionary<Guid, (string Path, Guid EntityId)>> ProjectTaxonomyArtworkAsync(
        IReadOnlyList<EntityRow> taxonomyRows,
        bool hideNsfw,
        bool enforceLibraryVisibility,
        CancellationToken cancellationToken) {
        var taxonomyIds = taxonomyRows.Select(row => row.Id).ToArray();
        var mediaKindCodes = EntityKindRegistry.All
            .Where(def => def.Category == EntityKindCategory.Media)
            .Select(def => def.Code)
            .ToHashSet();

        var links = await _db.EntityRelationshipLinks.AsNoTracking()
            .Where(link => taxonomyIds.Contains(link.TargetEntityId) || taxonomyIds.Contains(link.EntityId))
            .OrderBy(link => link.SortOrder)
            .ThenBy(link => link.EntityId)
            .ToArrayAsync(cancellationToken);

        var linksByTaxonomy = taxonomyIds.ToDictionary(
            id => id,
            id => links
                .Where(link => link.TargetEntityId == id || link.EntityId == id)
                .Select(link => link.TargetEntityId == id ? link.EntityId : link.TargetEntityId)
                .Distinct()
                .ToArray());

        var allMediaCandidateIds = linksByTaxonomy.Values.SelectMany(ids => ids).Distinct().ToArray();
        if (allMediaCandidateIds.Length == 0) {
            return new Dictionary<Guid, (string Path, Guid EntityId)>();
        }

        var mediaQuery = _db.Entities.AsNoTracking()
            .Where(e => allMediaCandidateIds.Contains(e.Id) && mediaKindCodes.Contains(e.KindCode));
        if (enforceLibraryVisibility) {
            mediaQuery = ApplyEnabledLibraryVisibility(mediaQuery);
        }
        mediaQuery = ApplyNsfwVisibility(mediaQuery, hideNsfw);
        var validMediaIds = await mediaQuery.Select(e => e.Id).ToHashSetAsync(cancellationToken);

        var firstMediaByTaxonomy = new Dictionary<Guid, Guid>();
        foreach (var pair in linksByTaxonomy) {
            var firstMediaId = pair.Value.FirstOrDefault(id => validMediaIds.Contains(id));
            if (firstMediaId != Guid.Empty) {
                firstMediaByTaxonomy[pair.Key] = firstMediaId;
            }
        }

        if (firstMediaByTaxonomy.Count == 0) {
            return new Dictionary<Guid, (string Path, Guid EntityId)>();
        }

        var coversByMedia = await LoadCoverPathsAsync(firstMediaByTaxonomy.Values.Distinct().ToArray(), cancellationToken);
        var result = new Dictionary<Guid, (string Path, Guid EntityId)>();
        foreach (var (taxonomyId, mediaId) in firstMediaByTaxonomy) {
            if (coversByMedia.TryGetValue(mediaId, out var path)) {
                result[taxonomyId] = (path, mediaId);
            }
        }
        return result;
    }
}

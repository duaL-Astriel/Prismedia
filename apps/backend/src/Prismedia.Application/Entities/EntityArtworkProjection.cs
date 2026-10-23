using Prismedia.Contracts.Entities;
using Prismedia.Domain.Entities;
using Prismedia.Domain.Media;
using ContractEntityImageAsset = Prismedia.Contracts.Entities.EntityImageAsset;

namespace Prismedia.Application.Entities;

/// <summary>
/// Projects the canonical artwork ordering and URLs shared by entity documents and
/// nested thumbnails. Keeping the ordering in one place prevents the same entity from
/// selecting different artwork on detail and grid surfaces.
/// </summary>
internal static class EntityArtworkProjection {
    private static readonly EntityFileRole[] SupportedManualImageRoles =
    [
        EntityFileRole.Thumbnail,
        EntityFileRole.Poster,
        EntityFileRole.Backdrop,
        EntityFileRole.Cover,
        EntityFileRole.Logo
    ];

    /// <summary>Projects the entity's ordered artwork and derived thumbnail URLs.</summary>
    internal static ImagesCapability Project(Entity entity) {
        var assets = OrderedArtworkFiles(entity)
            .Select(file => new ContractEntityImageAsset(file.Role, file.Path, file.MimeType))
            .ToArray();
        var originalCoverUrl = assets.FirstOrDefault()?.Path;
        string? fallbackThumbnailUrl = null;
        string? fallbackThumbnail2xUrl = null;

        if (originalCoverUrl is null) {
            if (entity.Kind == EntityKind.Gallery) {
                var coverChild = ResolveGalleryCoverChild(entity);
                if (coverChild is not null) {
                    var childArtwork = Project(coverChild);
                    originalCoverUrl = childArtwork.CoverUrl
                        ?? childArtwork.ThumbnailUrl
                        ?? coverChild.EntityFiles.FirstOrDefault(file => file.Role == EntityFileRole.Source)?.Path;
                    fallbackThumbnailUrl = childArtwork.ThumbnailUrl ?? childArtwork.CoverUrl ?? originalCoverUrl;
                    fallbackThumbnail2xUrl = childArtwork.Thumbnail2xUrl;
                }
            } else if (entity.Kind is EntityKind.Person or EntityKind.Tag or EntityKind.Studio) {
                var linkedMedia = ResolveFirstLinkedMediaEntity(entity);
                if (linkedMedia is not null) {
                    var mediaArtwork = Project(linkedMedia);
                    originalCoverUrl = mediaArtwork.CoverUrl
                        ?? mediaArtwork.ThumbnailUrl
                        ?? linkedMedia.EntityFiles.FirstOrDefault(file => file.Role == EntityFileRole.Source)?.Path;
                    fallbackThumbnailUrl = mediaArtwork.ThumbnailUrl ?? mediaArtwork.CoverUrl ?? originalCoverUrl;
                    fallbackThumbnail2xUrl = mediaArtwork.Thumbnail2xUrl;
                }
            }
        }

        var preservesOriginalArtwork = EntityKindRegistry.Describe(entity.Kind).Presentation.ArtworkSurface ==
            EntityArtworkSurface.BrandPlate;
        var thumbnailUrl = preservesOriginalArtwork
            ? originalCoverUrl
            : entity.EntityFiles.FirstOrDefault(file => file.Role == EntityFileRole.GridThumbnail)?.Path
                ?? fallbackThumbnailUrl
                ?? originalCoverUrl;
        var thumbnail2xUrl = preservesOriginalArtwork
            ? null
            : entity.EntityFiles.FirstOrDefault(file => file.Role == EntityFileRole.GridThumbnail2x)?.Path
                ?? fallbackThumbnail2xUrl;

        return new ImagesCapability(
            SupportedManualImageRoles,
            assets,
            thumbnailUrl,
            thumbnail2xUrl,
            originalCoverUrl);
    }

    private static Entity? ResolveGalleryCoverChild(Entity entity) {
        if (entity is Gallery gallery && gallery.CoverImageId.HasValue) {
            var explicitChild = entity.ChildEntities.FirstOrDefault(child => child.Id == gallery.CoverImageId.Value);
            if (explicitChild is not null) {
                return explicitChild;
            }
        }

        return entity.ChildEntities
            .OrderBy(child => child.SortOrder ?? int.MaxValue)
            .ThenBy(child => child.Title)
            .ThenBy(child => child.Id)
            .FirstOrDefault();
    }

    private static Entity? ResolveFirstLinkedMediaEntity(Entity entity) =>
        entity.Relationships
            .Where(relationship => EntityKindRegistry.Describe(relationship.Kind).Category == EntityKindCategory.Media)
            .OrderBy(relationship => relationship.SortOrder ?? int.MaxValue)
            .ThenBy(relationship => relationship.Title)
            .ThenBy(relationship => relationship.Id)
            .FirstOrDefault();

    private static IEnumerable<Prismedia.Domain.Entities.EntityFile> OrderedArtworkFiles(Entity entity) =>
        entity.EntityFiles
            .Where(file => file.Role is EntityFileRole.Thumbnail or EntityFileRole.Poster
                or EntityFileRole.Cover or EntityFileRole.Backdrop or EntityFileRole.Logo)
            .OrderBy(file => ImageSourcePriority(file.Role, file.Path))
            .ThenBy(file => file.Role switch {
                EntityFileRole.Thumbnail => 0,
                EntityFileRole.Poster => 1,
                EntityFileRole.Cover => 2,
                EntityFileRole.Logo => 3,
                _ => 4
            });

    private static bool IsCustomPath(string path) =>
        path.Contains("/custom/artwork/", StringComparison.OrdinalIgnoreCase) ||
        path.Contains("/plugins/artwork/", StringComparison.OrdinalIgnoreCase);

    private static int ImageSourcePriority(EntityFileRole role, string path) =>
        role == EntityFileRole.Backdrop ? 2 : IsCustomPath(path) ? 0 : 1;
}

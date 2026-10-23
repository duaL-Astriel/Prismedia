using Microsoft.EntityFrameworkCore;
using Prismedia.Application.Entities;
using Prismedia.Application.Jobs.Ports;
using Prismedia.Domain.Entities;
using Prismedia.Infrastructure.Persistence;
using Prismedia.Infrastructure.Persistence.Entities;

namespace Prismedia.Infrastructure.Entities;

/// <summary>
/// EF-backed implementation for persisting an included item's image as the entity's cover.
/// </summary>
public sealed class SetEntityCoverService(
    PrismediaDbContext db,
    IGridThumbnailService gridThumbnails) : ISetEntityCoverService {
    /// <inheritdoc />
    public async Task<SetEntityCoverResult> SetCoverAsync(
        SetEntityCoverCommand command,
        CancellationToken cancellationToken) {
        var target = await db.Entities.FirstOrDefaultAsync(e => e.Id == command.TargetEntityId, cancellationToken);
        if (target is null) {
            return SetEntityCoverResult.NotFound;
        }

        var item = await db.Entities.FirstOrDefaultAsync(e => e.Id == command.ItemEntityId, cancellationToken);
        if (item is null) {
            return SetEntityCoverResult.ItemNotFound;
        }

        var itemFiles = await db.EntityFiles
            .Where(f => f.EntityId == command.ItemEntityId)
            .ToListAsync(cancellationToken);

        // Find the winning cover/artwork file on the item entity
        var coverFile = EntityCoverSelection.Select(
            itemFiles.Where(f => EntityCoverSelection.CoverRoles.Contains(f.Role)));

        // If no standard artwork role, check for source file if it's an image
        if (coverFile is null) {
            var sourceFile = itemFiles.FirstOrDefault(f => f.Role == EntityFileRole.Source);
            if (sourceFile is not null && IsImageFile(sourceFile, item.KindCode)) {
                coverFile = sourceFile;
            }
        }

        // If still no artwork, check for grid thumbnail
        coverFile ??= itemFiles.FirstOrDefault(f => f.Role == EntityFileRole.GridThumbnail2x)
            ?? itemFiles.FirstOrDefault(f => f.Role == EntityFileRole.GridThumbnail);

        if (coverFile is null) {
            return SetEntityCoverResult.NoCoverAvailable;
        }

        var now = DateTimeOffset.UtcNow;

        // Persist as EntityFileRole.Cover on the target entity.
        // Remove any existing Cover or manual Thumbnail to make sure the new cover is the clear winner.
        var existingCovers = await db.EntityFiles
            .Where(f => f.EntityId == command.TargetEntityId &&
                        (f.Role == EntityFileRole.Cover || f.Role == EntityFileRole.Thumbnail))
            .ToListAsync(cancellationToken);
        db.EntityFiles.RemoveRange(existingCovers);

        db.EntityFiles.Add(new EntityFileRow {
            Id = Guid.NewGuid(),
            EntityId = command.TargetEntityId,
            Role = EntityFileRole.Cover,
            Path = coverFile.Path,
            MimeType = coverFile.MimeType,
            SizeBytes = coverFile.SizeBytes,
            Source = FileSourceKind.Custom.ToCode(),
            CreatedAt = now,
            UpdatedAt = now
        });

        // If target is a gallery, also persist CoverImageEntityId in GalleryDetails
        if (target.KindCode == EntityKind.Gallery.ToCode()) {
            var galleryDetail = await db.GalleryDetails
                .FirstOrDefaultAsync(d => d.EntityId == command.TargetEntityId, cancellationToken);
            if (galleryDetail is null) {
                db.GalleryDetails.Add(new GalleryDetailRow {
                    EntityId = command.TargetEntityId,
                    CoverImageEntityId = command.ItemEntityId,
                    GalleryType = GalleryType.Folder
                });
            } else {
                galleryDetail.CoverImageEntityId = command.ItemEntityId;
            }
        }

        target.UpdatedAt = now;
        await db.SaveChangesAsync(cancellationToken);

        // Regenerate grid thumbnail for the target entity
        await gridThumbnails.EnsureAsync(command.TargetEntityId, cancellationToken);

        return SetEntityCoverResult.Updated;
    }

    private static bool IsImageFile(EntityFileRow file, string kindCode) {
        if (kindCode == EntityKind.Image.ToCode()) {
            return true;
        }

        if (file.MimeType is not null && file.MimeType.StartsWith("image/", StringComparison.OrdinalIgnoreCase)) {
            return true;
        }

        var ext = Path.GetExtension(file.Path).ToLowerInvariant();
        return ext is ".jpg" or ".jpeg" or ".png" or ".webp" or ".gif" or ".avif";
    }
}

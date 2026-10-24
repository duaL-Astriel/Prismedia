using Microsoft.EntityFrameworkCore;
using Prismedia.Application.Entities;
using Prismedia.Application.Jobs.Ports;
using Prismedia.Contracts.Media;
using Prismedia.Domain.Entities;
using Prismedia.Infrastructure.Media.Processing;
using Prismedia.Infrastructure.Persistence;
using Prismedia.Infrastructure.Persistence.Entities;

namespace Prismedia.Infrastructure.Entities;

/// <summary>
/// EF-backed implementation for persisting an included item's image as the entity's cover.
/// Source files are library paths the client cannot load, so they are copied into the served
/// custom artwork cache before being persisted as the cover.
/// </summary>
public sealed class SetEntityCoverService(
    PrismediaDbContext db,
    EntityImageAssetStorageOptions options,
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

        var now = DateTimeOffset.UtcNow;
        string? coverPath = coverFile?.Path;
        var coverMimeType = coverFile?.MimeType;
        var coverSizeBytes = coverFile?.SizeBytes;

        // If no standard artwork role, copy the source file when it's an image. The raw source
        // path is a library filesystem path, never a client-servable URL.
        if (coverFile is null) {
            var sourceFile = itemFiles.FirstOrDefault(f => f.Role == EntityFileRole.Source);
            if (sourceFile is not null && IsImageFile(sourceFile, item.KindCode)) {
                var copied = await CopySourceToServedArtworkAsync(
                    sourceFile, command.TargetEntityId, now, cancellationToken);
                if (copied is not null) {
                    coverPath = copied.Value.PublicPath;
                    coverMimeType = copied.Value.MimeType;
                    coverSizeBytes = copied.Value.SizeBytes;
                }
            }
        }

        // If still no artwork, check for grid thumbnail
        if (coverPath is null) {
            var gridFile = itemFiles.FirstOrDefault(f => f.Role == EntityFileRole.GridThumbnail2x)
                ?? itemFiles.FirstOrDefault(f => f.Role == EntityFileRole.GridThumbnail);
            coverPath = gridFile?.Path;
            coverMimeType = gridFile?.MimeType;
            coverSizeBytes = gridFile?.SizeBytes;
        }

        if (coverPath is null) {
            return SetEntityCoverResult.NoCoverAvailable;
        }

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
            Path = coverPath,
            MimeType = coverMimeType,
            SizeBytes = coverSizeBytes,
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

    private async Task<(string PublicPath, string MimeType, long SizeBytes)?> CopySourceToServedArtworkAsync(
        EntityFileRow sourceFile,
        Guid targetEntityId,
        DateTimeOffset now,
        CancellationToken cancellationToken) {
        var extension = Path.GetExtension(sourceFile.Path).ToLowerInvariant();
        var mimeType = ImageMimeTypeForExtension(extension);
        if (mimeType is null || !File.Exists(sourceFile.Path)) {
            return null;
        }

        var relativePath = Path.Combine(
            AssetPaths.Custom,
            AssetPaths.Artwork,
            targetEntityId.ToString(),
            $"{EntityFileRole.Cover.ToCode()}-{now.ToUnixTimeMilliseconds()}{extension}");
        var physicalPath = Path.Combine(options.CacheRoot, relativePath);
        Directory.CreateDirectory(Path.GetDirectoryName(physicalPath)!);
        await using (var input = new FileStream(sourceFile.Path, FileMode.Open, FileAccess.Read, FileShare.Read))
        await using (var output = new FileStream(physicalPath, FileMode.Create, FileAccess.Write, FileShare.None)) {
            await input.CopyToAsync(output, cancellationToken);
        }

        var publicPath = $"{AssetPaths.AssetsUrlPrefix}{relativePath.Replace(Path.DirectorySeparatorChar, '/')}";
        return (publicPath, mimeType, new FileInfo(physicalPath).Length);
    }

    private static string? ImageMimeTypeForExtension(string extension) =>
        extension switch {
            ".jpg" or ".jpeg" => MediaContentTypes.ImageJpeg,
            ".png" => MediaContentTypes.ImagePng,
            ".webp" => MediaContentTypes.ImageWebp,
            ".gif" => MediaContentTypes.ImageGif,
            ".avif" => MediaContentTypes.ImageAvif,
            _ => null
        };

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

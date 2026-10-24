using Microsoft.EntityFrameworkCore;
using Prismedia.Application.Entities;
using Prismedia.Application.Jobs.Ports;
using Prismedia.Domain.Entities;
using Prismedia.Domain.Media;
using Prismedia.Domain.Taxonomy;
using Prismedia.Infrastructure.Entities;
using Prismedia.Infrastructure.Persistence;
using Prismedia.Infrastructure.Persistence.Entities;

namespace Prismedia.Infrastructure.Tests;

public sealed class SetEntityCoverServiceTests {
    private sealed class TestGridThumbnailService : IGridThumbnailService {
        public List<Guid> RefreshedEntities { get; } = [];

        public Task EnsureAsync(Guid entityId, CancellationToken cancellationToken) {
            RefreshedEntities.Add(entityId);
            return Task.CompletedTask;
        }

        public Task<IReadOnlyList<Guid>> ListEntitiesNeedingRefreshAsync(CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyList<Guid>>([]);
    }

    [Fact]
    public async Task SetCoverOnGallery_UpdatesCoverFileAndCoverImageEntityId_AndCallsGridThumbnailService() {
        var options = new DbContextOptionsBuilder<PrismediaDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        await using var db = new PrismediaDbContext(options);

        var galleryId = Guid.NewGuid();
        var imageId = Guid.NewGuid();

        db.Entities.Add(new EntityRow {
            Id = galleryId,
            KindCode = EntityKind.Gallery.ToCode(),
            Title = "Vacation 2026",
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        });

        db.GalleryDetails.Add(new GalleryDetailRow {
            EntityId = galleryId,
            GalleryType = GalleryType.Folder,
            CoverImageEntityId = null
        });

        // Existing old cover file for gallery
        db.EntityFiles.Add(new EntityFileRow {
            Id = Guid.NewGuid(),
            EntityId = galleryId,
            Role = EntityFileRole.Cover,
            Path = "/galleries/old_cover.jpg",
            Source = FileSourceKind.Scan.ToCode(),
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        });

        // Item image entity with its own cover file
        db.Entities.Add(new EntityRow {
            Id = imageId,
            KindCode = EntityKind.Image.ToCode(),
            Title = "Beach Sunset",
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        });

        db.EntityFiles.Add(new EntityFileRow {
            Id = Guid.NewGuid(),
            EntityId = imageId,
            Role = EntityFileRole.Cover,
            Path = "/images/beach_sunset.jpg",
            MimeType = "image/jpeg",
            Source = FileSourceKind.Scan.ToCode(),
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        });

        await db.SaveChangesAsync();

        var thumbnailService = new TestGridThumbnailService();
        var service = new SetEntityCoverService(db, new EntityImageAssetStorageOptions(Path.GetTempPath()), thumbnailService);

        var result = await service.SetCoverAsync(new SetEntityCoverCommand(galleryId, imageId), CancellationToken.None);

        Assert.Equal(SetEntityCoverResult.Updated, result);

        var galleryDetail = await db.GalleryDetails.SingleAsync(gd => gd.EntityId == galleryId);
        Assert.Equal(imageId, galleryDetail.CoverImageEntityId);

        var galleryCovers = await db.EntityFiles
            .Where(f => f.EntityId == galleryId && f.Role == EntityFileRole.Cover)
            .ToListAsync();

        Assert.Single(galleryCovers);
        Assert.Equal("/images/beach_sunset.jpg", galleryCovers[0].Path);
        Assert.Equal(FileSourceKind.Custom.ToCode(), galleryCovers[0].Source);
        Assert.Equal("image/jpeg", galleryCovers[0].MimeType);

        Assert.Contains(galleryId, thumbnailService.RefreshedEntities);
    }

    [Fact]
    public async Task SetCoverOnPerson_PersistsCustomCover_FromLinkedMediaCover() {
        var options = new DbContextOptionsBuilder<PrismediaDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        await using var db = new PrismediaDbContext(options);

        var personId = Guid.NewGuid();
        var videoId = Guid.NewGuid();

        db.Entities.Add(new EntityRow {
            Id = personId,
            KindCode = EntityKind.Person.ToCode(),
            Title = "Jane Doe",
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        });

        db.Entities.Add(new EntityRow {
            Id = videoId,
            KindCode = EntityKind.Video.ToCode(),
            Title = "Short Film",
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        });

        db.EntityFiles.Add(new EntityFileRow {
            Id = Guid.NewGuid(),
            EntityId = videoId,
            Role = EntityFileRole.Cover,
            Path = "/videos/short_film_thumb.jpg",
            MimeType = "image/jpeg",
            Source = FileSourceKind.Scan.ToCode(),
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        });

        await db.SaveChangesAsync();

        var thumbnailService = new TestGridThumbnailService();
        var service = new SetEntityCoverService(db, new EntityImageAssetStorageOptions(Path.GetTempPath()), thumbnailService);

        var result = await service.SetCoverAsync(new SetEntityCoverCommand(personId, videoId), CancellationToken.None);

        Assert.Equal(SetEntityCoverResult.Updated, result);

        var personCovers = await db.EntityFiles
            .Where(f => f.EntityId == personId && f.Role == EntityFileRole.Cover)
            .ToListAsync();

        Assert.Single(personCovers);
        Assert.Equal("/videos/short_film_thumb.jpg", personCovers[0].Path);
        Assert.Equal(FileSourceKind.Custom.ToCode(), personCovers[0].Source);

        Assert.Contains(personId, thumbnailService.RefreshedEntities);
    }

    [Fact]
    public async Task SetCover_TargetNotFound_ReturnsEntityNotFound() {
        var options = new DbContextOptionsBuilder<PrismediaDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        await using var db = new PrismediaDbContext(options);
        var thumbnailService = new TestGridThumbnailService();
        var service = new SetEntityCoverService(db, new EntityImageAssetStorageOptions(Path.GetTempPath()), thumbnailService);

        var result = await service.SetCoverAsync(new SetEntityCoverCommand(Guid.NewGuid(), Guid.NewGuid()), CancellationToken.None);

        Assert.Equal(SetEntityCoverResult.NotFound, result);
    }

    [Fact]
    public async Task SetCover_ItemNotFound_ReturnsItemNotFound() {
        var options = new DbContextOptionsBuilder<PrismediaDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        await using var db = new PrismediaDbContext(options);

        var personId = Guid.NewGuid();
        db.Entities.Add(new EntityRow {
            Id = personId,
            KindCode = EntityKind.Person.ToCode(),
            Title = "Jane Doe",
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync();

        var thumbnailService = new TestGridThumbnailService();
        var service = new SetEntityCoverService(db, new EntityImageAssetStorageOptions(Path.GetTempPath()), thumbnailService);

        var result = await service.SetCoverAsync(new SetEntityCoverCommand(personId, Guid.NewGuid()), CancellationToken.None);

        Assert.Equal(SetEntityCoverResult.ItemNotFound, result);
    }

    [Fact]
    public async Task SetCover_ItemHasNoCoverOrSource_ReturnsNoCoverAvailable() {
        var options = new DbContextOptionsBuilder<PrismediaDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        await using var db = new PrismediaDbContext(options);

        var personId = Guid.NewGuid();
        var videoId = Guid.NewGuid();

        db.Entities.Add(new EntityRow {
            Id = personId,
            KindCode = EntityKind.Person.ToCode(),
            Title = "Jane Doe",
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        });

        db.Entities.Add(new EntityRow {
            Id = videoId,
            KindCode = EntityKind.Video.ToCode(),
            Title = "No Cover Video",
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        });

        await db.SaveChangesAsync();

        var thumbnailService = new TestGridThumbnailService();
        var service = new SetEntityCoverService(db, new EntityImageAssetStorageOptions(Path.GetTempPath()), thumbnailService);

        var result = await service.SetCoverAsync(new SetEntityCoverCommand(personId, videoId), CancellationToken.None);

        Assert.Equal(SetEntityCoverResult.NoCoverAvailable, result);
    }

    [Fact]
    public async Task SetCover_FromSourceImage_CopiesFileIntoServedArtworkCache() {
        var cacheRoot = Path.Combine(Path.GetTempPath(), "prismedia-cover-" + Guid.NewGuid());
        var sourceDir = Path.Combine(Path.GetTempPath(), "prismedia-src-" + Guid.NewGuid());
        Directory.CreateDirectory(sourceDir);
        var sourcePath = Path.Combine(sourceDir, "photo.jpg");
        await File.WriteAllBytesAsync(sourcePath, [1, 2, 3, 4]);
        try {
            var options = new DbContextOptionsBuilder<PrismediaDbContext>()
                .UseInMemoryDatabase(Guid.NewGuid().ToString())
                .Options;
            await using var db = new PrismediaDbContext(options);
            var personId = Guid.NewGuid();
            var imageId = Guid.NewGuid();
            var now = DateTimeOffset.UtcNow;
            db.Entities.Add(new EntityRow { Id = personId, KindCode = EntityKind.Person.ToCode(), Title = "Jane", CreatedAt = now, UpdatedAt = now });
            db.Entities.Add(new EntityRow { Id = imageId, KindCode = EntityKind.Image.ToCode(), Title = "Photo", CreatedAt = now, UpdatedAt = now });
            db.EntityFiles.Add(new EntityFileRow {
                Id = Guid.NewGuid(), EntityId = imageId, Role = EntityFileRole.Source, Path = sourcePath,
                Source = FileSourceKind.Scan.ToCode(), CreatedAt = now, UpdatedAt = now
            });
            await db.SaveChangesAsync();

            var service = new SetEntityCoverService(db, new EntityImageAssetStorageOptions(cacheRoot), new TestGridThumbnailService());
            var result = await service.SetCoverAsync(new SetEntityCoverCommand(personId, imageId), CancellationToken.None);

            Assert.Equal(SetEntityCoverResult.Updated, result);
            var cover = await db.EntityFiles.SingleAsync(f => f.EntityId == personId && f.Role == EntityFileRole.Cover);
            Assert.StartsWith("/assets/custom/artwork/" + personId + "/", cover.Path);
            Assert.NotEqual(sourcePath, cover.Path);
            Assert.Equal("image/jpeg", cover.MimeType);
            Assert.True(File.Exists(Path.Combine(cacheRoot, cover.Path.TrimStart('/').Substring("assets/".Length))));
        } finally {
            Directory.Delete(sourceDir, recursive: true);
            if (Directory.Exists(cacheRoot)) Directory.Delete(cacheRoot, recursive: true);
        }
    }

    [Fact]
    public async Task SetCover_FromSourceImageMissingOnDisk_ReturnsNoCoverAvailable() {
        var options = new DbContextOptionsBuilder<PrismediaDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        await using var db = new PrismediaDbContext(options);
        var personId = Guid.NewGuid();
        var imageId = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;
        db.Entities.Add(new EntityRow { Id = personId, KindCode = EntityKind.Person.ToCode(), Title = "Jane", CreatedAt = now, UpdatedAt = now });
        db.Entities.Add(new EntityRow { Id = imageId, KindCode = EntityKind.Image.ToCode(), Title = "Photo", CreatedAt = now, UpdatedAt = now });
        db.EntityFiles.Add(new EntityFileRow {
            Id = Guid.NewGuid(), EntityId = imageId, Role = EntityFileRole.Source, Path = "/nonexistent/photo.jpg",
            Source = FileSourceKind.Scan.ToCode(), CreatedAt = now, UpdatedAt = now
        });
        await db.SaveChangesAsync();

        var service = new SetEntityCoverService(db, new EntityImageAssetStorageOptions(Path.GetTempPath()), new TestGridThumbnailService());
        var result = await service.SetCoverAsync(new SetEntityCoverCommand(personId, imageId), CancellationToken.None);

        Assert.Equal(SetEntityCoverResult.NoCoverAvailable, result);
        Assert.DoesNotContain(db.EntityFiles, f => f.EntityId == personId);
    }
}

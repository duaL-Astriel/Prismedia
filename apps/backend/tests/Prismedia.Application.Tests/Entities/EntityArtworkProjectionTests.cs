using Prismedia.Application.Entities;
using Prismedia.Contracts.Media;
using Prismedia.Domain.Entities;
using Prismedia.Domain.Media;
using Prismedia.Domain.Taxonomy;

namespace Prismedia.Application.Tests.Entities;

public sealed class EntityArtworkProjectionTests {
    [Fact]
    public void GalleryWithoutCover_FallsBackToFirstChildItemArtwork() {
        var gallery = new Gallery(Guid.NewGuid(), "Holiday Trip", GalleryType.Folder, coverImageId: null);
        var image1 = new Image(Guid.NewGuid(), "Image 1");
        image1.AttachFile(EntityFileRole.Cover, "/images/img1_cover.jpg");
        var image2 = new Image(Guid.NewGuid(), "Image 2");
        image2.AttachFile(EntityFileRole.Cover, "/images/img2_cover.jpg");

        gallery.AddChild(image1, sortOrder: 1);
        gallery.AddChild(image2, sortOrder: 2);

        var projection = EntityArtworkProjection.Project(gallery);

        Assert.Equal("/images/img1_cover.jpg", projection.CoverUrl);
    }

    [Fact]
    public void GalleryWithExplicitCover_ExplicitCoverWinsOverChild() {
        var gallery = new Gallery(Guid.NewGuid(), "Holiday Trip", GalleryType.Folder, coverImageId: null);
        gallery.AttachFile(EntityFileRole.Cover, "/images/gallery_custom_cover.jpg");

        var image1 = new Image(Guid.NewGuid(), "Image 1");
        image1.AttachFile(EntityFileRole.Cover, "/images/img1_cover.jpg");
        gallery.AddChild(image1, sortOrder: 1);

        var projection = EntityArtworkProjection.Project(gallery);

        Assert.Equal("/images/gallery_custom_cover.jpg", projection.CoverUrl);
    }

    [Fact]
    public void GalleryWithCoverImageId_ProjectsSpecifiedChildArtwork() {
        var image1 = new Image(Guid.NewGuid(), "Image 1");
        image1.AttachFile(EntityFileRole.Cover, "/images/img1_cover.jpg");
        var image2 = new Image(Guid.NewGuid(), "Image 2");
        image2.AttachFile(EntityFileRole.Cover, "/images/img2_cover.jpg");

        var gallery = new Gallery(Guid.NewGuid(), "Holiday Trip", GalleryType.Folder, coverImageId: image2.Id);
        gallery.AddChild(image1, sortOrder: 1);
        gallery.AddChild(image2, sortOrder: 2);

        var projection = EntityArtworkProjection.Project(gallery);

        Assert.Equal("/images/img2_cover.jpg", projection.CoverUrl);
    }

    [Fact]
    public void PersonWithoutArtwork_FallsBackToFirstLinkedMediaArtwork() {
        var person = new Person(Guid.NewGuid(), "Actor Alice");
        var video = new Video(Guid.NewGuid(), "Sample Video");
        video.AttachFile(EntityFileRole.Cover, "/videos/vid_cover.jpg");

        person.AddRelationship(video);

        var projection = EntityArtworkProjection.Project(person);

        Assert.Equal("/videos/vid_cover.jpg", projection.CoverUrl);
    }

    [Fact]
    public void PersonWithExplicitArtwork_ExplicitArtworkWins() {
        var person = new Person(Guid.NewGuid(), "Actor Alice");
        person.AttachFile(EntityFileRole.Cover, "/people/alice.jpg");

        var video = new Video(Guid.NewGuid(), "Sample Video");
        video.AttachFile(EntityFileRole.Cover, "/videos/vid_cover.jpg");
        person.AddRelationship(video);

        var projection = EntityArtworkProjection.Project(person);

        Assert.Equal("/people/alice.jpg", projection.CoverUrl);
    }

    [Fact]
    public void TagWithoutArtwork_FallsBackToFirstLinkedMediaArtwork() {
        var tag = new Tag(Guid.NewGuid(), "Nature");
        var image = new Image(Guid.NewGuid(), "Forest");
        image.AttachFile(EntityFileRole.Cover, "/images/forest.jpg");

        tag.AddRelationship(image);

        var projection = EntityArtworkProjection.Project(tag);

        Assert.Equal("/images/forest.jpg", projection.CoverUrl);
    }

    [Fact]
    public void StudioWithoutArtwork_FallsBackToFirstLinkedMediaArtwork() {
        var studio = new Studio(Guid.NewGuid(), "Acme Productions");
        var video = new Video(Guid.NewGuid(), "Acme Movie");
        video.AttachFile(EntityFileRole.Cover, "/videos/acme_movie.jpg");

        studio.AddRelationship(video);

        var projection = EntityArtworkProjection.Project(studio);

        Assert.Equal("/videos/acme_movie.jpg", projection.CoverUrl);
    }

    [Fact]
    public void GalleryChildWithOnlySourceFile_NeverExposesFilesystemPath() {
        var gallery = new Gallery(Guid.NewGuid(), "Holiday Trip", GalleryType.Folder, coverImageId: null);
        var image = new Image(Guid.NewGuid(), "Raw");
        image.AttachFile(EntityFileRole.Source, "/media/library/raw.jpg");
        gallery.AddChild(image, sortOrder: 1);

        var projection = EntityArtworkProjection.Project(gallery);

        Assert.Null(projection.CoverUrl);
        Assert.Null(projection.ThumbnailUrl);
    }

    [Fact]
    public void GalleryChildWithGeneratedThumbnail_ProjectsServableUrl() {
        var gallery = new Gallery(Guid.NewGuid(), "Holiday Trip", GalleryType.Folder, coverImageId: null);
        var image = new Image(Guid.NewGuid(), "Raw");
        image.AttachFile(EntityFileRole.Source, "/media/library/raw.jpg");
        image.AttachFile(EntityFileRole.Thumbnail, "/assets/images/raw/thumb.jpg");
        gallery.AddChild(image, sortOrder: 1);

        var projection = EntityArtworkProjection.Project(gallery);

        Assert.Equal("/assets/images/raw/thumb.jpg", projection.CoverUrl);
    }

    [Fact]
    public void PersonLinkedMediaWithOnlySourceFile_NeverExposesFilesystemPath() {
        var person = new Person(Guid.NewGuid(), "Actor Alice");
        var video = new Video(Guid.NewGuid(), "Sample Video");
        video.AttachFile(EntityFileRole.Source, "/media/library/video.mp4");
        person.AddRelationship(video);

        var projection = EntityArtworkProjection.Project(person);

        Assert.Null(projection.CoverUrl);
        Assert.Null(projection.ThumbnailUrl);
    }
}

using Prismedia.Contracts.Entities;
using Prismedia.Domain.Entities;
using Prismedia.Domain.Taxonomy;

namespace Prismedia.Domain.Tests;

public sealed class TagTests {
    [Fact]
    public void ConstructorNormalizesAndDeduplicatesAliases() {
        var id = Guid.NewGuid();
        var aliases = new[] { "  Action  ", "action", "Sci-Fi", "Action Movie" };

        var tag = new Tag(id, "Action Movie", ignoreAutoTag: false, aliases);

        // "action" matches "Action" (case-insensitive duplicate)
        // "Action Movie" matches tag title (excluded)
        Assert.Equal(2, tag.Aliases.Count);
        Assert.Contains("Action", tag.Aliases);
        Assert.Contains("Sci-Fi", tag.Aliases);
        Assert.DoesNotContain("Action Movie", tag.Aliases);
    }

    [Fact]
    public void AddAliasAddsValidAlias() {
        var tag = new Tag(Guid.NewGuid(), "Adventure");

        var added = tag.AddAlias("Quest");

        Assert.True(added);
        Assert.Single(tag.Aliases);
        Assert.Equal("Quest", tag.Aliases[0]);
    }

    [Fact]
    public void AddAliasIsIdempotentForDuplicates() {
        var tag = new Tag(Guid.NewGuid(), "Comedy", aliases: ["Funny"]);

        var addedSameCase = tag.AddAlias("Funny");
        var addedDiffCase = tag.AddAlias("FUNNY");

        Assert.False(addedSameCase);
        Assert.False(addedDiffCase);
        Assert.Single(tag.Aliases);
    }

    [Fact]
    public void AddAliasThrowsWhenAliasMatchesTitle() {
        var tag = new Tag(Guid.NewGuid(), "Drama");

        Assert.Throws<ArgumentException>(() => tag.AddAlias("drama"));
        Assert.Throws<ArgumentException>(() => tag.AddAlias("  Drama  "));
    }

    [Fact]
    public void AddAliasThrowsWhenAliasIsEmptyOrWhitespace() {
        var tag = new Tag(Guid.NewGuid(), "Thriller");

        Assert.Throws<ArgumentException>(() => tag.AddAlias(""));
        Assert.Throws<ArgumentException>(() => tag.AddAlias("   "));
    }

    [Fact]
    public void RemoveAliasRemovesCaseInsensitively() {
        var tag = new Tag(Guid.NewGuid(), "Horror", aliases: ["Spooky", "Scary"]);

        var removed = tag.RemoveAlias("spooky");
        var removedMissing = tag.RemoveAlias("ghost");

        Assert.True(removed);
        Assert.False(removedMissing);
        Assert.Single(tag.Aliases);
        Assert.Equal("Scary", tag.Aliases[0]);
    }

    [Fact]
    public void MergeFromMergesTitleAndAliasesWithoutDuplicates() {
        var canonical = new Tag(Guid.NewGuid(), "Science Fiction", aliases: ["Sci-Fi"]);
        var source = new Tag(Guid.NewGuid(), "Sci-Fi Channel", aliases: ["Sci-Fi", "SF"]);

        canonical.MergeFrom(source);

        Assert.Equal(3, canonical.Aliases.Count);
        Assert.Contains("Sci-Fi", canonical.Aliases);
        Assert.Contains("Sci-Fi Channel", canonical.Aliases);
        Assert.Contains("SF", canonical.Aliases);
    }

    [Fact]
    public void MergeFromThrowsWhenMergingSelf() {
        var tag = new Tag(Guid.NewGuid(), "Fantasy");

        Assert.Throws<InvalidOperationException>(() => tag.MergeFrom(tag));
    }

    [Fact]
    public void ProjectCapabilitiesSurfacesAliasesInTagPolicyCapability() {
        var tag = new Tag(Guid.NewGuid(), "Mystery", ignoreAutoTag: true, aliases: ["Whodunit"]);

        var capabilities = tag.Definition.ProjectCapabilities(tag, new EntityKindProjectionContext(null));

        var policy = Assert.Single(capabilities.OfType<TagPolicyCapability>());
        Assert.True(policy.IgnoreAutoTag);
        Assert.NotNull(policy.Aliases);
        Assert.Equal(["Whodunit"], policy.Aliases);
    }
}

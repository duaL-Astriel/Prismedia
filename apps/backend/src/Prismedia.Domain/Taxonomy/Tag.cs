using Prismedia.Domain.Capabilities;
using Prismedia.Domain.Entities;
using ContractCapability = Prismedia.Contracts.Entities.EntityCapability;
using TagPolicyDocumentCapability = Prismedia.Contracts.Entities.TagPolicyCapability;

namespace Prismedia.Domain.Taxonomy;

/// <summary>Defines the tag taxonomy kind.</summary>
public sealed class TagEntityKindDefinition() : EntityKindDefinition<Tag>(
    EntityKind.Tag,
    "tag",
    "Tag",
    "Tags",
    EntityKindCategory.Taxonomy,
    EntityStorageShape.None,
    new EntityKindPresentation(
        EntityKindIcon.Tag,
        EntityKindIcon.Tag,
        1,
        1,
        EntityAccentHue.Green,
        EntityAccentHue.Yellow,
        EntityArtworkFit.Cover),
    new EntityKindNavigation(EntityKind.Tag, "tags", "/tags", "/tags/{id}"),
    new EntityKindSearch(5, expandsRelationshipResults: true),
    new EntityKindBehavior(supportsManualManagement: true)) {
    /// <inheritdoc />
    public override EntityProgressTopology ProgressTopology => EntityProgressTopology.None;

    /// <inheritdoc />
    public override EntityStructurePolicy StructurePolicy => EntityStructurePolicy.RootOnly;

    /// <inheritdoc />
    public override IReadOnlyList<Type> ProjectedCapabilityTypes => [typeof(TagPolicyDocumentCapability)];

    /// <inheritdoc />
    protected override IReadOnlyList<ContractCapability> ProjectCapabilities(
        Tag entity,
        EntityKindProjectionContext context) =>
        [new TagPolicyDocumentCapability(entity.IgnoreAutoTag, entity.Aliases)];
}

/// <summary>
/// Domain model for a tag taxonomy entity.
/// </summary>
public sealed class Tag : Entity<TagEntityKindDefinition> {
    private readonly List<string> _aliases = [];

    /// <summary>
    /// Initializes a new instance of the <see cref="Tag"/> aggregate.
    /// </summary>
    public Tag(
        Guid id,
        string title,
        bool ignoreAutoTag = false,
        IEnumerable<string>? aliases = null,
        IEnumerable<EntityCapability>? capabilities = null)
        : base(id, title, capabilities) {
        IgnoreAutoTag = ignoreAutoTag;
        if (aliases is not null) {
            foreach (var alias in aliases) {
                if (!string.IsNullOrWhiteSpace(alias) &&
                    !string.Equals(alias.Trim(), title.Trim(), StringComparison.OrdinalIgnoreCase)) {
                    AddAlias(alias);
                }
            }
        }
    }

    /// <summary>Whether automatic tagging should ignore this tag.</summary>
    public bool IgnoreAutoTag { get; private set; }

    /// <summary>Alternative synonymous names associated with this tag.</summary>
    public IReadOnlyList<string> Aliases => _aliases;

    /// <summary>
    /// Adds a synonymous alias to this tag.
    /// </summary>
    /// <param name="alias">The alias string.</param>
    /// <returns>True if the alias was added; false if it was already present.</returns>
    /// <exception cref="ArgumentException">Thrown when the alias is blank or equal to the tag's title.</exception>
    public bool AddAlias(string alias) {
        if (string.IsNullOrWhiteSpace(alias)) {
            throw new ArgumentException("Tag alias cannot be empty.", nameof(alias));
        }

        var trimmed = alias.Trim();
        if (string.Equals(trimmed, Title, StringComparison.OrdinalIgnoreCase)) {
            throw new ArgumentException($"Tag alias '{trimmed}' cannot equal its own title.", nameof(alias));
        }

        if (_aliases.Contains(trimmed, StringComparer.OrdinalIgnoreCase)) {
            return false;
        }

        _aliases.Add(trimmed);
        return true;
    }

    /// <summary>
    /// Removes a synonymous alias from this tag.
    /// </summary>
    /// <param name="alias">The alias to remove.</param>
    /// <returns>True if an alias was removed; false otherwise.</returns>
    public bool RemoveAlias(string alias) {
        if (string.IsNullOrWhiteSpace(alias)) {
            return false;
        }

        var trimmed = alias.Trim();
        var removed = _aliases.RemoveAll(a => string.Equals(a, trimmed, StringComparison.OrdinalIgnoreCase));
        return removed > 0;
    }

    /// <summary>
    /// Merges another tag into this canonical tag, adopting the other tag's title and aliases as aliases.
    /// </summary>
    /// <param name="source">The tag to merge into this tag.</param>
    /// <exception cref="ArgumentNullException">Thrown when <paramref name="source"/> is null.</exception>
    /// <exception cref="InvalidOperationException">Thrown when trying to merge a tag into itself.</exception>
    public void MergeFrom(Tag source) {
        ArgumentNullException.ThrowIfNull(source);
        if (source.Id == Id) {
            throw new InvalidOperationException("Cannot merge a tag into itself.");
        }

        if (!string.Equals(source.Title.Trim(), Title.Trim(), StringComparison.OrdinalIgnoreCase)) {
            AddAlias(source.Title);
        }

        foreach (var alias in source.Aliases) {
            if (!string.Equals(alias, Title, StringComparison.OrdinalIgnoreCase) &&
                !_aliases.Contains(alias, StringComparer.OrdinalIgnoreCase)) {
                AddAlias(alias);
            }
        }
    }
}

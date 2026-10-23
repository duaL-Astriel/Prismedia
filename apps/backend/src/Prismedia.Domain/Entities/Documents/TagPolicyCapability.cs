namespace Prismedia.Contracts.Entities;

/// <summary>Automatic-tagging policy and taxonomy aliases owned by a Tag Entity.</summary>
/// <param name="IgnoreAutoTag">Whether automatic metadata application must ignore the tag.</param>
/// <param name="Aliases">Alternative synonymous names associated with this tag.</param>
[CapabilityKind("tag-policy")]
public sealed record TagPolicyCapability(
    bool IgnoreAutoTag,
    IReadOnlyList<string>? Aliases = null) : EntityCapability;

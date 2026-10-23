namespace Prismedia.Contracts.Entities;

/// <summary>
/// Representation of a tag taxonomy entity, including aliases.
/// </summary>
/// <param name="Id">Stable entity identifier.</param>
/// <param name="Title">Primary display title.</param>
/// <param name="IgnoreAutoTag">Whether automatic tagging ignores this tag.</param>
/// <param name="Aliases">Synonymous alternative names.</param>
public sealed record TagDto(
    Guid Id,
    string Title,
    bool IgnoreAutoTag,
    IReadOnlyList<string> Aliases);

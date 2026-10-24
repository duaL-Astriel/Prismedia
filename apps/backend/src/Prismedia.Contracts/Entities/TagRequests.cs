namespace Prismedia.Contracts.Entities;

/// <summary>Request body for adding or removing an alias for a tag.</summary>
/// <param name="Alias">The alternative name/alias.</param>
public sealed record TagAliasRequest(string Alias);

/// <summary>Request body for merging a tag into a canonical tag.</summary>
/// <param name="SourceTagId">The tag to merge into the canonical tag and delete.</param>
public sealed record TagMergeRequest(Guid SourceTagId);

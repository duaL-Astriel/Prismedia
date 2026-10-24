using Prismedia.Contracts.Entities;

namespace Prismedia.Application.Entities;

/// <summary>Outcome category for tag alias and merge operations.</summary>
public enum TagOperationStatus {
    /// <summary>The operation succeeded.</summary>
    Success,

    /// <summary>The target or source tag was not found.</summary>
    NotFound,

    /// <summary>The request was structurally invalid (e.g. blank alias, alias equal to title).</summary>
    Invalid,

    /// <summary>The operation would cause an unresolvable conflict (e.g. merging a tag into itself).</summary>
    Conflict
}

/// <summary>Result of a tag management operation.</summary>
/// <param name="Status">Command outcome category.</param>
/// <param name="Message">Human-readable error explanation when unsuccessful.</param>
/// <param name="TagId">Identifier of the affected tag.</param>
public sealed record TagOperationResult(TagOperationStatus Status, string? Message = null, Guid? TagId = null);

/// <summary>
/// Application port for managing tag aliases and merging synonymous tags.
/// </summary>
public interface ITagManagementService {
    /// <summary>
    /// Adds an alias to an existing tag.
    /// </summary>
    /// <param name="tagId">Target tag identifier.</param>
    /// <param name="alias">The alias string to add.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>Result indicating success or reason for failure.</returns>
    Task<TagOperationResult> AddAliasAsync(Guid tagId, string alias, CancellationToken cancellationToken);

    /// <summary>
    /// Removes an alias from an existing tag.
    /// </summary>
    /// <param name="tagId">Target tag identifier.</param>
    /// <param name="alias">The alias string to remove.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>Result indicating success or reason for failure.</returns>
    Task<TagOperationResult> RemoveAliasAsync(Guid tagId, string alias, CancellationToken cancellationToken);

    /// <summary>
    /// Merges a source tag into a canonical tag, reassigning media relationships without duplicates,
    /// adding the source tag's title and aliases as aliases on the canonical tag, and deleting the source tag.
    /// </summary>
    /// <param name="canonicalTagId">Identifier of the canonical tag to retain.</param>
    /// <param name="sourceTagId">Identifier of the source tag to merge and remove.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>Result indicating success or reason for failure.</returns>
    Task<TagOperationResult> MergeAsync(Guid canonicalTagId, Guid sourceTagId, CancellationToken cancellationToken);
}

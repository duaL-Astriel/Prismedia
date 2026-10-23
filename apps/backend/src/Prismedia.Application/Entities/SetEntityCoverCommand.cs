namespace Prismedia.Application.Entities;

/// <summary>
/// Command to set an included or linked item's image as the target entity's cover artwork.
/// </summary>
/// <param name="TargetEntityId">Target entity receiving the cover artwork (e.g. Gallery, Person, Tag, Studio).</param>
/// <param name="ItemEntityId">Item entity providing the cover image.</param>
public sealed record SetEntityCoverCommand(Guid TargetEntityId, Guid ItemEntityId);

/// <summary>
/// Outcome of executing a <see cref="SetEntityCoverCommand"/>.
/// </summary>
public enum SetEntityCoverResult {
    /// <summary>The cover was successfully updated.</summary>
    Updated,

    /// <summary>The target entity was not found.</summary>
    NotFound,

    /// <summary>The chosen item entity was not found.</summary>
    ItemNotFound,

    /// <summary>The chosen item entity has no available cover or image artwork.</summary>
    NoCoverAvailable
}

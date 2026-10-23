namespace Prismedia.Application.Entities;

/// <summary>
/// Application port for setting an entity's cover artwork from an included or linked item.
/// </summary>
public interface ISetEntityCoverService {
    /// <summary>
    /// Persists the chosen item's image as the target entity's cover artwork.
    /// </summary>
    /// <param name="command">Set cover parameters specifying target entity and chosen item entity.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>Result indicating whether the cover was updated, entity was missing, or no cover image was available.</returns>
    Task<SetEntityCoverResult> SetCoverAsync(SetEntityCoverCommand command, CancellationToken cancellationToken);
}

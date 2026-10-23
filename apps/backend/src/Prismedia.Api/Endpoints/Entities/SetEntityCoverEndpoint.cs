using Prismedia.Api.Security;
using Prismedia.Application.Entities;
using Prismedia.Contracts.Entities;
using Prismedia.Contracts.System;

namespace Prismedia.Api.Endpoints;

/// <summary>Request payload specifying the item entity to use as cover.</summary>
/// <param name="ItemEntityId">Item entity providing the cover image.</param>
public sealed record SetEntityCoverRequest(Guid ItemEntityId);

internal static class SetEntityCoverEndpoint {
    internal static RouteGroupBuilder MapSetEntityCoverEndpoint(this RouteGroupBuilder group) {
        group.MapPost("/{id:guid}/cover", async (
            Guid id,
            SetEntityCoverRequest request,
            ISetEntityCoverService coverService,
            IEntityReadService entities,
            CancellationToken cancellationToken) => {
            var result = await coverService.SetCoverAsync(new SetEntityCoverCommand(id, request.ItemEntityId), cancellationToken);
            return result switch {
                SetEntityCoverResult.Updated =>
                    await EntityEndpointResults.GetEntityAsync(id, false, entities, cancellationToken),
                SetEntityCoverResult.NotFound =>
                    Results.NotFound(new ApiProblem(ApiProblemCodes.EntityNotFound, $"Entity '{id}' was not found.")),
                SetEntityCoverResult.ItemNotFound =>
                    Results.NotFound(new ApiProblem(ApiProblemCodes.EntityNotFound, $"Item entity '{request.ItemEntityId}' was not found.")),
                SetEntityCoverResult.NoCoverAvailable =>
                    Results.BadRequest(new ApiProblem(ApiProblemCodes.InvalidEntityImageUpload, "The chosen item has no artwork or image file to set as cover.")),
                _ =>
                    Results.BadRequest(new ApiProblem(ApiProblemCodes.InvalidEntityImageUpload, "The cover could not be set."))
            };
        })
            .RequireAdmin()
            .WithName("SetEntityCover")
            .WithSummary("Sets an included or linked item's image as the entity's cover artwork.")
            .Produces<EntityCard>()
            .Produces<ApiProblem>(StatusCodes.Status400BadRequest)
            .Produces<ApiProblem>(StatusCodes.Status404NotFound);

        return group;
    }
}

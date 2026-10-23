using Microsoft.AspNetCore.Mvc;
using Prismedia.Api.Security;
using Prismedia.Application.Entities;
using Prismedia.Contracts.Entities;
using Prismedia.Contracts.System;
using Prismedia.Domain.Entities;

namespace Prismedia.Api.Endpoints;

/// <summary>Tag routes: listing, detail, alias management, and tag merging.</summary>
public static class TagEndpoints {
    /// <summary>Maps the tag entity kind routes and alias/merge operations.</summary>
    public static RouteGroupBuilder MapTagEndpoints(this IEndpointRouteBuilder routes) {
        var group = routes.MapEntityKindRoutes(
            "/api/tags",
            EntityKind.Tag.ToCode(),
            "Taxonomy",
            "ListTags",
            "GetTag");

        group.MapPost("/{id:guid}/aliases", async (
            Guid id,
            TagAliasRequest request,
            ITagManagementService tagManagement,
            IEntityReadService entities,
            CancellationToken cancellationToken) => {
                var result = await tagManagement.AddAliasAsync(id, request.Alias, cancellationToken);
                return result.Status switch {
                    TagOperationStatus.Success =>
                        await ReturnTagDetailAsync(id, entities, cancellationToken),
                    TagOperationStatus.NotFound =>
                        Results.NotFound(new ApiProblem(ApiProblemCodes.EntityNotFound, result.Message ?? "Tag not found.")),
                    TagOperationStatus.Conflict =>
                        Results.Conflict(new ApiProblem(ApiProblemCodes.InvalidEntity, result.Message ?? "Tag conflict.")),
                    _ => Results.BadRequest(new ApiProblem(ApiProblemCodes.InvalidEntity, result.Message ?? "Invalid alias.")),
                };
            })
            .RequireAdmin()
            .WithName("AddTagAlias")
            .WithSummary("Add an alias to a tag.")
            .Produces<EntityCard>()
            .Produces<ApiProblem>(StatusCodes.Status400BadRequest)
            .Produces<ApiProblem>(StatusCodes.Status404NotFound)
            .Produces<ApiProblem>(StatusCodes.Status409Conflict);

        group.MapDelete("/{id:guid}/aliases/{alias}", async (
            Guid id,
            string alias,
            ITagManagementService tagManagement,
            IEntityReadService entities,
            CancellationToken cancellationToken) => {
                var result = await tagManagement.RemoveAliasAsync(id, alias, cancellationToken);
                return result.Status switch {
                    TagOperationStatus.Success =>
                        await ReturnTagDetailAsync(id, entities, cancellationToken),
                    TagOperationStatus.NotFound =>
                        Results.NotFound(new ApiProblem(ApiProblemCodes.EntityNotFound, result.Message ?? "Tag not found.")),
                    _ => Results.BadRequest(new ApiProblem(ApiProblemCodes.InvalidEntity, result.Message ?? "Invalid alias.")),
                };
            })
            .RequireAdmin()
            .WithName("RemoveTagAlias")
            .WithSummary("Remove an alias from a tag.")
            .Produces<EntityCard>()
            .Produces<ApiProblem>(StatusCodes.Status400BadRequest)
            .Produces<ApiProblem>(StatusCodes.Status404NotFound);

        group.MapPost("/{id:guid}/merge", async (
            Guid id,
            TagMergeRequest request,
            ITagManagementService tagManagement,
            IEntityReadService entities,
            CancellationToken cancellationToken) => {
                var result = await tagManagement.MergeAsync(id, request.SourceTagId, cancellationToken);
                return result.Status switch {
                    TagOperationStatus.Success =>
                        await ReturnTagDetailAsync(id, entities, cancellationToken),
                    TagOperationStatus.NotFound =>
                        Results.NotFound(new ApiProblem(ApiProblemCodes.EntityNotFound, result.Message ?? "Tag not found.")),
                    TagOperationStatus.Conflict =>
                        Results.Conflict(new ApiProblem(ApiProblemCodes.InvalidEntity, result.Message ?? "Merge conflict.")),
                    _ => Results.BadRequest(new ApiProblem(ApiProblemCodes.InvalidEntity, result.Message ?? "Invalid merge request.")),
                };
            })
            .RequireAdmin()
            .WithName("MergeTag")
            .WithSummary("Merge a source tag into this canonical tag.")
            .Produces<EntityCard>()
            .Produces<ApiProblem>(StatusCodes.Status400BadRequest)
            .Produces<ApiProblem>(StatusCodes.Status404NotFound)
            .Produces<ApiProblem>(StatusCodes.Status409Conflict);

        return group;
    }

    private static async Task<IResult> ReturnTagDetailAsync(
        Guid id,
        IEntityReadService entities,
        CancellationToken cancellationToken) {
        var card = await entities.GetAsync(id, hideNsfw: false, cancellationToken);
        return card is not null
            ? Results.Ok(card)
            : Results.NotFound(new ApiProblem(ApiProblemCodes.EntityNotFound, "Tag not found."));
    }
}

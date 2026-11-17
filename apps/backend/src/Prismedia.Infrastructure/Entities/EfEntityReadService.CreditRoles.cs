using System.Linq.Expressions;
using System.Reflection;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Prismedia.Domain.Entities;
using Prismedia.Infrastructure.Persistence.Entities;

namespace Prismedia.Infrastructure.Entities;

public sealed partial class EfEntityReadService {
    private static readonly string CastRelationshipCode = RelationshipKind.Cast.ToCode();
    private static readonly string CreditsRelationshipCode = RelationshipKind.Credits.ToCode();
    private static readonly CreditRole[] AllCreditRoles = Enum.GetValues<CreditRole>();
    private static readonly MethodInfo NpgsqlJsonContainsMethod =
        ((MethodCallExpression)((Expression<Func<string, string, bool>>)
            ((json, contained) => EF.Functions.JsonContains(json, contained))).Body).Method;

    /// <summary>
    /// Filters entities (typically <see cref="EntityKind.Person"/>) by the <see cref="CreditRole"/>
    /// codes recorded on their inbound <c>cast</c>/<c>credits</c> relationship links.
    /// </summary>
    private IQueryable<EntityRow> ApplyCreditRoleFilters(
        IQueryable<EntityRow> query,
        string? creditRole,
        string? excludeCreditRole) {
        var includedRoles = ParseCodeList<CreditRole>(creditRole);
        var excludedRoles = ParseCodeList<CreditRole>(excludeCreditRole);
        if (includedRoles.Count == 0 && excludedRoles.Count == 0) {
            return query;
        }

        var allCreditLinks = _db.EntityRelationshipLinks
            .Where(link => link.RelationshipCode == CastRelationshipCode ||
                           link.RelationshipCode == CreditsRelationshipCode);

        if (_db.Database.IsNpgsql()) {
            if (includedRoles.Count > 0) {
                var linkParam = Expression.Parameter(typeof(EntityRelationshipLinkRow), "link");
                var predicate = Expression.Lambda<Func<EntityRelationshipLinkRow, bool>>(
                    BuildNpgsqlCreditRoleOrExpression(linkParam, includedRoles),
                    linkParam);
                var matchingLinks = allCreditLinks.Where(predicate);
                query = query.Where(entity => matchingLinks.Any(link => link.TargetEntityId == entity.Id));
            }

            if (excludedRoles.Count > 0) {
                var allowedKnownRoles = AllCreditRoles
                    .Where(role => !excludedRoles.Contains(role))
                    .ToArray();
                var linkParam = Expression.Parameter(typeof(EntityRelationshipLinkRow), "link");
                var matchesAllowed = BuildNpgsqlCreditRoleOrExpression(linkParam, allowedKnownRoles);
                var matchesExcluded = BuildNpgsqlCreditRoleOrExpression(linkParam, excludedRoles);
                var predicate = Expression.Lambda<Func<EntityRelationshipLinkRow, bool>>(
                    Expression.OrElse(matchesAllowed, Expression.Not(matchesExcluded)),
                    linkParam);
                var nonExcludedLinks = allCreditLinks.Where(predicate);
                query = query.Where(entity =>
                    !allCreditLinks.Any(link => link.TargetEntityId == entity.Id) ||
                    nonExcludedLinks.Any(link => link.TargetEntityId == entity.Id));
            }

            return query;
        }

        if (includedRoles.Count > 0) {
            var includedCodes = includedRoles
                .Select(role => role.ToCode())
                .ToHashSet(StringComparer.OrdinalIgnoreCase);
            query = query.Where(entity =>
                allCreditLinks.Any(link =>
                    link.TargetEntityId == entity.Id &&
                    LinkHasAnyCreditRole(link.MetadataJson, includedCodes)));
        }

        if (excludedRoles.Count > 0) {
            var excludedCodes = excludedRoles
                .Select(role => role.ToCode())
                .ToHashSet(StringComparer.OrdinalIgnoreCase);
            query = query.Where(entity =>
                !allCreditLinks.Any(link => link.TargetEntityId == entity.Id) ||
                allCreditLinks.Any(link =>
                    link.TargetEntityId == entity.Id &&
                    LinkHasNonExcludedCreditRole(link.MetadataJson, excludedCodes)));
        }

        return query;
    }

    private static Expression BuildNpgsqlCreditRoleOrExpression(
        ParameterExpression linkParameter,
        IReadOnlyCollection<CreditRole> roles) {
        if (roles.Count == 0) {
            return Expression.Constant(false);
        }

        var metadataProperty = Expression.Property(linkParameter, nameof(EntityRelationshipLinkRow.MetadataJson));
        var efFunctions = Expression.Property(null, typeof(EF), nameof(EF.Functions));
        var parameters = NpgsqlJsonContainsMethod.GetParameters();
        var jsonParamType = parameters[1].ParameterType;
        var containedParamType = parameters[2].ParameterType;

        Expression? anyMatch = null;
        foreach (var role in roles) {
            var roleCode = role.ToCode();
            var roleObjectJson = JsonSerializer.Serialize(new { role = roleCode });
            var rolesArrayJson = JsonSerializer.Serialize(new { roles = new[] { roleCode } });
            var matchesRole = Expression.Call(
                NpgsqlJsonContainsMethod,
                efFunctions,
                ConvertIfNeeded(metadataProperty, jsonParamType),
                ConvertIfNeeded(Expression.Constant(roleObjectJson), containedParamType));
            var matchesRolesArray = Expression.Call(
                NpgsqlJsonContainsMethod,
                efFunctions,
                ConvertIfNeeded(metadataProperty, jsonParamType),
                ConvertIfNeeded(Expression.Constant(rolesArrayJson), containedParamType));
            var matchesThisRole = Expression.OrElse(matchesRole, matchesRolesArray);
            anyMatch = anyMatch is null ? matchesThisRole : Expression.OrElse(anyMatch, matchesThisRole);
        }

        var notNull = Expression.NotEqual(metadataProperty, Expression.Constant(null, typeof(string)));
        var body = Expression.AndAlso(notNull, anyMatch!);
        if (roles.Contains(CreditRole.Person)) {
            body = Expression.OrElse(
                Expression.Equal(metadataProperty, Expression.Constant(null, typeof(string))),
                body);
        }

        return body;
    }

    private static Expression ConvertIfNeeded(Expression expression, Type targetType) =>
        expression.Type == targetType ? expression : Expression.Convert(expression, targetType);

    private static bool LinkHasAnyCreditRole(string? metadataJson, HashSet<string> includedCodes) =>
        ExtractCreditRoleCodes(metadataJson).Any(includedCodes.Contains);

    private static bool LinkHasNonExcludedCreditRole(string? metadataJson, HashSet<string> excludedCodes) =>
        ExtractCreditRoleCodes(metadataJson).Any(code => !excludedCodes.Contains(code));

    private static IReadOnlyList<string> ExtractCreditRoleCodes(string? metadataJson) {
        var metadata = DecodeCreditMetadata(metadataJson);
        if (metadata.Roles.Count > 0) {
            return metadata.Roles;
        }

        return !string.IsNullOrWhiteSpace(metadata.Role)
            ? [metadata.Role]
            : [CreditRole.Person.ToCode()];
    }
}

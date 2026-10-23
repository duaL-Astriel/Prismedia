using Microsoft.EntityFrameworkCore;
using Prismedia.Domain.Entities;
using Prismedia.Domain.Taxonomy;
using Prismedia.Infrastructure.Persistence;
using Prismedia.Infrastructure.Persistence.Entities;

namespace Prismedia.Infrastructure.Entities.Mappers.Kinds;

internal sealed class TagKindMapper(PrismediaDbContext db) : IEntityKindMapper {
    public EntityKind Kind => EntityKind.Tag;

    public async Task<Entity> ConstructAsync(EntityRow row, CancellationToken cancellationToken) {
        var detail = await db.TagDetails.AsNoTracking()
            .FirstOrDefaultAsync(d => d.EntityId == row.Id, cancellationToken);
        var aliases = await db.TagAliases.AsNoTracking()
            .Where(a => a.TagId == row.Id)
            .Select(a => a.Alias)
            .ToArrayAsync(cancellationToken);
        return new Tag(row.Id, row.Title, detail?.IgnoreAutoTag ?? false, aliases);
    }
}

using Microsoft.EntityFrameworkCore;
using Prismedia.Domain.Entities;
using Prismedia.Infrastructure.Persistence;
using Prismedia.Infrastructure.Persistence.Entities;

namespace Prismedia.Infrastructure.Entities.Thumbnails;

/// <summary>
/// Resolves the sole visible <see cref="EntityKind.ComicInstallment"/> identifier for any
/// <see cref="EntityKind.ComicSeries"/> on the page that contains only a single release, allowing
/// the Comics browse grid to link directly to that comic instead of a one-item series overview.
/// </summary>
internal sealed class ComicSingleReleaseThumbnailContributor : IThumbnailContributor {
    private static readonly string ComicSeriesKindCode = EntityKind.ComicSeries.ToCode();
    private static readonly string ComicVolumeKindCode = EntityKind.ComicVolume.ToCode();
    private static readonly string ComicInstallmentKindCode = EntityKind.ComicInstallment.ToCode();

    /// <summary>Creates the contributor for the scoped persistence context.</summary>
    public ComicSingleReleaseThumbnailContributor(PrismediaDbContext db) {
        // Accepted to match the reflection-based ThumbnailContributors.For(db) contract.
        ArgumentNullException.ThrowIfNull(db);
    }

    /// <inheritdoc />
    public async Task ContributeAsync(
        ThumbnailContributions contributions,
        CancellationToken cancellationToken) {
        var seriesIds = contributions.Rows
            .Where(row => row.KindCode == ComicSeriesKindCode)
            .Select(row => row.Id)
            .Distinct()
            .ToArray();
        if (seriesIds.Length == 0) {
            return;
        }

        var visibleCatalogEntities = contributions.VisibleCatalogEntities;
        var counts = await BuildCountQuery(visibleCatalogEntities, seriesIds)
            .ToArrayAsync(cancellationToken);

        var directSingleSeriesIds = new List<Guid>();
        var nestedSingleSeriesIds = new List<Guid>();
        foreach (var group in counts.GroupBy(count => count.SeriesId)) {
            var directVolumes = 0;
            var directInstallments = 0;
            var nestedInstallments = 0;
            var wantedInstallments = 0;

            foreach (var row in group) {
                if (row.KindCode == ComicVolumeKindCode) {
                    directVolumes += row.Count;
                } else if (row.KindCode == ComicInstallmentKindCode) {
                    if (row.IsWanted) {
                        wantedInstallments += row.Count;
                    } else if (row.Depth == 1) {
                        directInstallments += row.Count;
                    } else if (row.Depth == 2) {
                        nestedInstallments += row.Count;
                    }
                }
            }

            if (wantedInstallments > 0) {
                continue;
            }

            if (directVolumes == 0 && directInstallments == 1 && nestedInstallments == 0) {
                directSingleSeriesIds.Add(group.Key);
            } else if (directVolumes == 1 && directInstallments == 0 && nestedInstallments == 1) {
                nestedSingleSeriesIds.Add(group.Key);
            }
        }

        if (directSingleSeriesIds.Count > 0) {
            var directTargetIds = directSingleSeriesIds.ToArray();
            var directMatches = await visibleCatalogEntities
                .Where(entity =>
                    !entity.IsWanted &&
                    entity.KindCode == ComicInstallmentKindCode &&
                    entity.ParentEntityId != null &&
                    directTargetIds.Contains(entity.ParentEntityId.Value))
                .Select(entity => new {
                    SeriesId = entity.ParentEntityId!.Value,
                    InstallmentId = entity.Id
                })
                .ToArrayAsync(cancellationToken);
            RecordUniqueMatches(
                contributions,
                directMatches.Select(match => (match.SeriesId, match.InstallmentId)));
        }

        if (nestedSingleSeriesIds.Count > 0) {
            var nestedTargetIds = nestedSingleSeriesIds.ToArray();
            var nestedMatches = await (
                from volume in visibleCatalogEntities
                where volume.KindCode == ComicVolumeKindCode &&
                      volume.ParentEntityId != null &&
                      nestedTargetIds.Contains(volume.ParentEntityId.Value)
                join installment in visibleCatalogEntities.Where(child => child.ParentEntityId != null)
                    on volume.Id equals installment.ParentEntityId!.Value
                where !installment.IsWanted && installment.KindCode == ComicInstallmentKindCode
                select new {
                    SeriesId = volume.ParentEntityId!.Value,
                    InstallmentId = installment.Id
                })
                .ToArrayAsync(cancellationToken);
            RecordUniqueMatches(
                contributions,
                nestedMatches.Select(match => (match.SeriesId, match.InstallmentId)));
        }
    }

    /// <summary>
    /// Builds one grouped aggregate over direct volumes/installments and volume-nested installments
    /// so multi-issue series never transfer individual installment rows.
    /// </summary>
    internal static IQueryable<ComicSeriesDescendantCount> BuildCountQuery(
        IQueryable<EntityRow> visibleCatalogEntities,
        Guid[] seriesIds) {
        var directChildren = visibleCatalogEntities
            .Where(child =>
                child.ParentEntityId != null &&
                seriesIds.Contains(child.ParentEntityId.Value) &&
                (child.KindCode == ComicVolumeKindCode || child.KindCode == ComicInstallmentKindCode))
            .Select(child => new {
                SeriesId = child.ParentEntityId!.Value,
                child.KindCode,
                child.IsWanted,
                Depth = 1
            });

        var nestedInstallments =
            from volume in visibleCatalogEntities
            where volume.ParentEntityId != null &&
                  seriesIds.Contains(volume.ParentEntityId.Value) &&
                  volume.KindCode == ComicVolumeKindCode
            join installment in visibleCatalogEntities.Where(child => child.ParentEntityId != null)
                on volume.Id equals installment.ParentEntityId!.Value
            where installment.KindCode == ComicInstallmentKindCode
            select new {
                SeriesId = volume.ParentEntityId!.Value,
                installment.KindCode,
                installment.IsWanted,
                Depth = 2
            };

        return directChildren
            .Concat(nestedInstallments)
            .GroupBy(item => new {
                item.SeriesId,
                item.KindCode,
                item.IsWanted,
                item.Depth
            })
            .Select(group => new ComicSeriesDescendantCount(
                group.Key.SeriesId,
                group.Key.KindCode,
                group.Key.IsWanted,
                group.Key.Depth,
                group.Count()));
    }

    private static void RecordUniqueMatches(
        ThumbnailContributions contributions,
        IEnumerable<(Guid SeriesId, Guid InstallmentId)> matches) {
        foreach (var group in matches.GroupBy(match => match.SeriesId)) {
            var items = group.ToArray();
            if (items.Length == 1) {
                contributions.SetSingleReleaseEntityId(group.Key, items[0].InstallmentId);
            }
        }
    }
}

/// <summary>One grouped descendant count returned for comic single-release detection.</summary>
internal sealed record ComicSeriesDescendantCount(
    Guid SeriesId,
    string KindCode,
    bool IsWanted,
    int Depth,
    int Count);

import type { EntityCard } from "$lib/api/entities";
import { ENTITY_KIND } from "./entity-codes";
import { resolveEntityHref } from "./entity-routes";

/**
 * Resolves the browse card destination for a comic series in the Comics tab.
 * Single-release comic series navigate directly to their sole installment detail
 * page instead of an intermediate one-item series overview.
 */
export function resolveComicBrowseHref(item: EntityCard): string | undefined {
  if (item.kind === ENTITY_KIND.comicSeries && item.singleReleaseEntityId) {
    return resolveEntityHref(ENTITY_KIND.comicInstallment, item.singleReleaseEntityId, {
      kind: ENTITY_KIND.comicSeries,
      id: item.id,
    });
  }

  return resolveEntityHref(item.kind, item.id);
}

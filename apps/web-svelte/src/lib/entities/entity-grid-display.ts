import { ENTITY_LIST_SORT } from "$lib/api/generated/codes";
import { isTaxonomyEntityKind } from "./entity-codes";

/** Local grid ordering keys, including client-only sorts and the persisted legacy date key. */
export const ENTITY_GRID_SORT = {
  title: ENTITY_LIST_SORT.title,
  kind: "kind",
  rating: ENTITY_LIST_SORT.rating,
  position: "position",
  added: "added",
  random: ENTITY_LIST_SORT.random,
  references: ENTITY_LIST_SORT.references,
} as const;
export type EntityGridSort = (typeof ENTITY_GRID_SORT)[keyof typeof ENTITY_GRID_SORT];

/** Frontend-only layout choices; these are not server entity codes. */
export const ENTITY_GRID_VIEW_MODE = { grid: "grid", list: "list", feed: "feed" } as const;
export type EntityGridViewMode = (typeof ENTITY_GRID_VIEW_MODE)[keyof typeof ENTITY_GRID_VIEW_MODE];

/** Media query matching mobile EntityGrid viewports (aligned with Tailwind `sm`). */
export const ENTITY_GRID_MOBILE_QUERY = "(max-width: 639.98px)";

/** Returns the available sort field options for the given entity kind. */
export function entityGridSortOptionsForKind(entityKind?: string): { value: EntityGridSort; label: string }[] {
  return [
    { value: ENTITY_GRID_SORT.title, label: "Title" },
    { value: ENTITY_GRID_SORT.added, label: "Date added" },
    ...(entityKind != null && isTaxonomyEntityKind(entityKind)
      ? [{ value: ENTITY_GRID_SORT.references, label: "References" }]
      : []),
    { value: ENTITY_GRID_SORT.rating, label: "Rating" },
    { value: ENTITY_GRID_SORT.random, label: "Random" },
    { value: ENTITY_GRID_SORT.kind, label: "Kind" },
    { value: ENTITY_GRID_SORT.position, label: "Position" },
  ];
}

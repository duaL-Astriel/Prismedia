import { RELATIONSHIP_CODE, type RelationshipCode } from "./entity-codes";
import { getRelationshipIds } from "./entity-children";
import type { EntityThumbnailCard } from "./entity-thumbnail";

const TAG_FILTER_PREFIX = `${RELATIONSHIP_CODE.tags}:`;

/** Option metadata shape returned for selected tag filters in EntityGrid. */
export interface EntityGridTagFilterOption {
  id: string;
  count: number;
  label: string;
  capabilityKind: RelationshipCode;
  value?: string;
}

/** Builds the canonical EntityGrid filter ID for a selected tag entity. */
export function tagFilterId(tagId: string): string {
  return `${TAG_FILTER_PREFIX}${tagId}`;
}

/** Returns whether an EntityGrid filter ID represents a tag selection. */
export function isTagFilterId(id: string): boolean {
  return id.startsWith(TAG_FILTER_PREFIX) && id.length > TAG_FILTER_PREFIX.length;
}

/** Extracts the underlying tag entity ID from a tag filter ID, if valid. */
export function tagIdFromFilterId(id: string): string | undefined {
  return isTagFilterId(id) ? id.slice(TAG_FILTER_PREFIX.length) : undefined;
}

/** Formats the active chip label for a selected tag filter. */
export function tagFilterLabel(title?: string | null): string {
  const trimmed = title?.trim();
  return trimmed ? `Tag: ${trimmed}` : "Tag";
}

/** Builds a filter option metadata entry for a resolved tag item. */
export function tagFilterOption(tagId: string, title?: string | null): EntityGridTagFilterOption {
  const trimmed = title?.trim();
  return {
    id: tagFilterId(tagId),
    count: 0,
    label: tagFilterLabel(trimmed),
    capabilityKind: RELATIONSHIP_CODE.tags,
    value: trimmed || undefined,
  };
}

/** Evaluates a tag filter locally for detail grids that do not re-query the server. */
export function cardMatchesTagFilter(
  card: EntityThumbnailCard,
  filter: { id: string; value?: string },
): boolean {
  const tagId = tagIdFromFilterId(filter.id);
  if (card.tagTitles === undefined && tagId) {
    return getRelationshipIds(card.entity, RELATIONSHIP_CODE.tags).includes(tagId);
  }
  const expectedTitle = filter.value?.trim().toLowerCase();
  if (!expectedTitle) return true;
  return (card.tagTitles ?? []).some((title) => title.trim().toLowerCase() === expectedTitle);
}

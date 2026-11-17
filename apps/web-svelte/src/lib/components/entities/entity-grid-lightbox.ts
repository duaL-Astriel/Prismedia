import { buildHrefWithFrom } from "$lib/back-navigation";
import {
  getImagesCapability,
  getRatingValue,
  isNsfw,
  withRatingCapability,
} from "$lib/api/capabilities";
import type { EntityCard, EntityCardFull } from "$lib/api/entities";
import type { UniversalLightboxEntity } from "$lib/components/universal-lightbox-media";
import { ENTITY_KIND } from "$lib/entities/entity-codes";
import { resolveEntityHref } from "$lib/entities/entity-routes";
import { entityCardToThumbnailCard } from "$lib/entities/entity-grid";
import type { EntityThumbnailCard } from "$lib/entities/entity-thumbnail";

export interface GridLightboxSession {
  cards: EntityThumbnailCard[];
  initialIndex: number;
}

/**
 * Returns whether an {@link EntityThumbnailCard} renders natively inside {@link UniversalLightbox}.
 * Non-lightboxable entity kinds (galleries, movies, books, etc.) keep their standard detail links.
 */
export function isLightboxableCard(card: EntityThumbnailCard): boolean {
  return card.entity.kind === ENTITY_KIND.image || card.entity.kind === ENTITY_KIND.video;
}

/**
 * Builds the ordered lightbox playlist from the currently visible grid cards so Prev/Next
 * navigation traverses the active view's elements rather than unrelated directories.
 */
export function buildGridLightboxSession(
  clickedCard: EntityThumbnailCard,
  visibleCards: EntityThumbnailCard[],
): GridLightboxSession {
  if (!isLightboxableCard(clickedCard)) {
    return { cards: [], initialIndex: 0 };
  }

  const candidateCards = visibleCards.length > 0 ? visibleCards : [clickedCard];
  const filteredCards = candidateCards.filter(isLightboxableCard);
  const clickedIndex = filteredCards.findIndex((card) => card.entity.id === clickedCard.entity.id);

  if (clickedIndex === -1) {
    return { cards: [clickedCard], initialIndex: 0 };
  }

  return {
    cards: filteredCards,
    initialIndex: clickedIndex,
  };
}

/**
 * Maps a hydrated {@link EntityCardFull} into a {@link UniversalLightboxEntity}.
 */
export function lightboxEntityFromFullEntity(entity: EntityCardFull): UniversalLightboxEntity {
  const rating = getRatingValue(entity.capabilities);
  return {
    id: entity.id,
    kind: entity.kind,
    title: entity.title,
    capabilities: entity.capabilities,
    coverUrl: getImagesCapability(entity.capabilities)?.coverUrl ?? null,
    isNsfw: isNsfw(entity.capabilities),
    rating: rating > 0 ? rating : null,
  };
}

/**
 * Updates the cached rating capability for matching cards inside a card array.
 */
export function applyRatingToCards(
  cards: EntityThumbnailCard[],
  entityId: string,
  rating: number | null,
): EntityThumbnailCard[] {
  return cards.map((card) =>
    card.entity.id === entityId
      ? {
          ...card,
          entity: {
            ...card.entity,
            capabilities: withRatingCapability(card.entity.capabilities, rating),
          },
        }
      : card,
  );
}

/**
 * Updates a cached hydrated {@link UniversalLightboxEntity} after an optimistic rating change.
 */
export function applyRatingToHydratedEntities(
  hydrated: Record<string, UniversalLightboxEntity>,
  entityId: string,
  rating: number | null,
): Record<string, UniversalLightboxEntity> {
  const existing = hydrated[entityId];
  if (!existing) return hydrated;

  return {
    ...hydrated,
    [entityId]: {
      ...existing,
      capabilities: withRatingCapability(existing.capabilities, rating),
      rating,
    },
  };
}

/**
 * Returns the active lightbox card followed by its immediate next/previous neighbors
 * that are lightboxable and not yet hydrated, so full-resolution media sources can
 * be pre-warmed before the user navigates.
 */
export function selectLightboxCardsToHydrate(
  cards: EntityThumbnailCard[],
  index: number,
  hydrated: Record<string, UniversalLightboxEntity>,
  inFlight: readonly string[] | ReadonlySet<string>,
): EntityThumbnailCard[] {
  if (cards.length === 0 || index < 0 || index >= cards.length) return [];

  const candidateIndices = [
    index,
    (index + 1) % cards.length,
    (index - 1 + cards.length) % cards.length,
  ];
  const seenIds = new Set<string>();
  const result: EntityThumbnailCard[] = [];

  for (const candidateIndex of candidateIndices) {
    const card = cards[candidateIndex];
    if (!card || !isLightboxableCard(card)) continue;
    const id = card.entity.id;
    const isInFlight = inFlight instanceof Set ? inFlight.has(id) : (inFlight as readonly string[]).includes(id);
    if (seenIds.has(id) || hydrated[id] || isInFlight) continue;
    seenIds.add(id);
    result.push(card);
  }

  return result;
}

/**
 * Maps related entity cards into thumbnail cards preserving the origin route in `?from=`
 * so links opened away from the view can navigate back cleanly.
 */
export function buildRelatedThumbnailCards(
  items: EntityCard[],
  fromHref: string,
): EntityThumbnailCard[] {
  return items.map((item) => {
    const baseHref = resolveEntityHref(item.kind, item.id);
    const href = baseHref ? buildHrefWithFrom(baseHref, fromHref) : undefined;
    return entityCardToThumbnailCard(item, href);
  });
}

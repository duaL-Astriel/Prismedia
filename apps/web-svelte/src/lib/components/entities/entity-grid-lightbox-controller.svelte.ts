import type { EntityThumbnailCard } from "$lib/entities/entity-thumbnail";
import { applyRatingToCards, buildGridLightboxSession } from "./entity-grid-lightbox";

/**
 * Reactive controller tracking the active {@link EntityGridLightbox} playlist and index
 * for a host grid view.
 */
export class GridLightboxController {
  cards = $state<EntityThumbnailCard[]>([]);
  index = $state(0);

  /**
   * Opens the lightbox centered on {@link card} with Prev/Next navigation scoped to the
   * lightboxable items in {@link visibleCards}.
   */
  open(card: EntityThumbnailCard, visibleCards: EntityThumbnailCard[]): void {
    const session = buildGridLightboxSession(card, visibleCards);
    if (session.cards.length === 0) return;

    this.cards = session.cards;
    this.index = session.initialIndex;
  }

  /**
   * Closes the active lightbox and clears its playlist.
   */
  close(): void {
    this.cards = [];
    this.index = 0;
  }

  /**
   * Updates the current index as the user navigates within the lightbox.
   */
  setIndex(index: number): void {
    this.index = index;
  }

  /**
   * Synchronizes an optimistic rating update across the active playlist.
   */
  applyRating(entityId: string, rating: number | null): void {
    this.cards = applyRatingToCards(this.cards, entityId, rating);
  }
}

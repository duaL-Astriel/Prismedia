import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import type { EntityCard, EntityCardFull } from "$lib/api/entities";
import { THUMBNAIL_HOVER_KIND } from "$lib/api/generated/codes";
import type { EntityCapability } from "$lib/api/generated/model";
import { CAPABILITY_KIND, ENTITY_KIND, type EntityKindCode } from "$lib/entities/entity-codes";
import type { EntityThumbnailCard } from "$lib/entities/entity-thumbnail";
import EntityGrid from "./EntityGrid.test-harness.svelte";
import {
  applyRatingToCards,
  applyRatingToHydratedEntities,
  buildGridLightboxSession,
  buildRelatedThumbnailCards,
  isLightboxableCard,
  lightboxEntityFromFullEntity,
  selectLightboxCardsToHydrate,
} from "./entity-grid-lightbox";

function makeCard(id: string, kind: EntityKindCode, title: string, rating?: number): EntityThumbnailCard {
  const capabilities: EntityCapability[] =
    rating != null ? [{ kind: CAPABILITY_KIND.rating, value: rating }] : [];
  return {
    entity: {
      id,
      kind,
      title,
      parentEntityId: null,
      sortOrder: null,
      capabilities,
      childrenByKind: [],
      relationships: [],
    },
    aspectRatio: "video",
    cover: null,
    hover: { kind: THUMBNAIL_HOVER_KIND.none },
    href: `/entities/${id}`,
  };
}

function makeEntityCard(id: string, kind: EntityKindCode, title: string, rating?: number): EntityCard {
  return {
    id,
    kind,
    title,
    parentEntityId: null,
    sortOrder: null,
    coverUrl: null,
    coverThumbUrl: null,
    hoverKind: THUMBNAIL_HOVER_KIND.none,
    hoverUrl: null,
    hoverImages: [],
    meta: [],
    rating: rating ?? null,
    isFavorite: false,
    isNsfw: false,
    isOrganized: true,
  };
}

function makeFullEntity(
  id: string,
  kind: EntityKindCode,
  title: string,
  capabilities: EntityCapability[] = [],
): EntityCardFull {
  return {
    id,
    kind,
    title,
    parentEntityId: null,
    sortOrder: null,
    capabilities,
    childrenByKind: [],
    relationships: [],
  };
}

describe("entity-grid-lightbox helpers", () => {
  it("treats images and videos as lightboxable while leaving container kinds as links", () => {
    expect(isLightboxableCard(makeCard("img-1", ENTITY_KIND.image, "Image 1"))).toBe(true);
    expect(isLightboxableCard(makeCard("vid-1", ENTITY_KIND.video, "Video 1"))).toBe(true);
    expect(isLightboxableCard(makeCard("gal-1", ENTITY_KIND.gallery, "Gallery 1"))).toBe(false);
    expect(isLightboxableCard(makeCard("mov-1", ENTITY_KIND.movie, "Movie 1"))).toBe(false);
  });

  it("scopes the lightbox playlist to lightboxable items in the current view order", () => {
    const img1 = makeCard("img-1", ENTITY_KIND.image, "Image 1");
    const gal1 = makeCard("gal-1", ENTITY_KIND.gallery, "Gallery 1");
    const vid1 = makeCard("vid-1", ENTITY_KIND.video, "Video 1");
    const img2 = makeCard("img-2", ENTITY_KIND.image, "Image 2");

    const session = buildGridLightboxSession(vid1, [img1, gal1, vid1, img2]);
    expect(session.cards.map((card) => card.entity.id)).toEqual(["img-1", "vid-1", "img-2"]);
    expect(session.initialIndex).toBe(1);
  });

  it("preserves the origin path in ?from= when building related thumbnail cards", () => {
    const related = buildRelatedThumbnailCards(
      [
        makeEntityCard("img-1", ENTITY_KIND.image, "Image 1"),
        makeEntityCard("gal-1", ENTITY_KIND.gallery, "Gallery 1"),
      ],
      "/people/person-1?sort=recent",
    );

    expect(related[0]?.href).toBe("/images/img-1?from=%2Fpeople%2Fperson-1%3Fsort%3Drecent");
    expect(related[1]?.href).toBe("/galleries/gal-1?from=%2Fpeople%2Fperson-1%3Fsort%3Drecent");
  });

  it("updates ratings in both card lists and hydrated entity caches", () => {
    const img1 = makeCard("img-1", ENTITY_KIND.image, "Image 1", 3);
    const updatedCards = applyRatingToCards([img1], "img-1", 5);
    expect(updatedCards[0]?.entity.capabilities).toContainEqual({
      kind: CAPABILITY_KIND.rating,
      value: 5,
    });

    const fullEntity = makeFullEntity("img-1", ENTITY_KIND.image, "Image 1", [
      { kind: CAPABILITY_KIND.rating, value: 3 },
      {
        kind: CAPABILITY_KIND.images,
        supportedKinds: [],
        items: [],
        thumbnailUrl: null,
        thumbnail2xUrl: null,
        coverUrl: "/thumb.jpg",
      },
    ]);
    const hydrated = lightboxEntityFromFullEntity(fullEntity);
    const updatedHydrated = applyRatingToHydratedEntities({ "img-1": hydrated }, "img-1", 5);
    expect(updatedHydrated["img-1"]?.rating).toBe(5);
  });

  it("selects the active card and immediate lightboxable neighbors for pre-hydration", () => {
    const img1 = makeCard("img-1", ENTITY_KIND.image, "Image 1");
    const img2 = makeCard("img-2", ENTITY_KIND.image, "Image 2");
    const gal1 = makeCard("gal-1", ENTITY_KIND.gallery, "Gallery 1");
    const vid1 = makeCard("vid-1", ENTITY_KIND.video, "Video 1");
    const cards = [img1, img2, gal1, vid1];

    const selected = selectLightboxCardsToHydrate(
      cards,
      1,
      { "img-2": lightboxEntityFromFullEntity(makeFullEntity("img-2", ENTITY_KIND.image, "Image 2")) },
      ["img-1"],
    );

    expect(selected.map((card) => card.entity.id)).toEqual([]);

    const selectedWithNext = selectLightboxCardsToHydrate(cards, 0, {}, new Set(["img-2"]));
    expect(selectedWithNext.map((card) => card.entity.id)).toEqual(["img-1", "vid-1"]);
  });
});

describe("EntityGrid canActivateCard mixed-kind handling", () => {
  it("activates lightboxable cards as buttons while keeping other kinds as navigation links", async () => {
    const img = makeCard("img-1", ENTITY_KIND.image, "Alpha Photo");
    const vid = makeCard("vid-1", ENTITY_KIND.video, "Beta Clip");
    const gallery = makeCard("gal-1", ENTITY_KIND.gallery, "Gamma Album");
    const onCardActivate = vi.fn();

    render(EntityGrid, {
      props: {
        cards: [img, vid, gallery],
        dockControls: false,
        showPagination: false,
        prefsKey: undefined,
        canActivateCard: isLightboxableCard,
        onCardActivate,
      },
    });

    const imageButton = screen.getByRole("button", { name: "Alpha Photo" });
    const videoButton = screen.getByRole("button", { name: "Beta Clip" });
    const galleryLink = screen.getByRole("link", { name: "Gamma Album" });

    expect(galleryLink).toHaveAttribute("href", "/entities/gal-1");
    expect(imageButton).not.toHaveAttribute("href");
    expect(videoButton).not.toHaveAttribute("href");

    await fireEvent.click(videoButton);
    expect(onCardActivate).toHaveBeenCalledTimes(1);
    expect(onCardActivate).toHaveBeenCalledWith(vid, [img, vid, gallery]);
  });
});

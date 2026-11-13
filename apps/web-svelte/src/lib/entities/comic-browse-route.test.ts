import { describe, expect, it } from "vitest";
import type { EntityCard } from "$lib/api/entities";
import { THUMBNAIL_HOVER_KIND } from "$lib/api/generated/codes";
import { ENTITY_KIND } from "./entity-codes";
import { resolveComicBrowseHref } from "./comic-browse-route";

function comicCard(overrides: Partial<EntityCard> = {}): EntityCard {
  return {
    id: "series-1",
    kind: ENTITY_KIND.comicSeries,
    title: "Test Comic",
    parentEntityId: null,
    sortOrder: null,
    coverUrl: null,
    coverThumbUrl: null,
    hoverKind: THUMBNAIL_HOVER_KIND.none,
    hoverUrl: null,
    hoverImages: [],
    meta: [],
    rating: null,
    isFavorite: false,
    isNsfw: false,
    isOrganized: false,
    ...overrides,
  };
}

describe("resolveComicBrowseHref", () => {
  it("routes single-release comic series directly to the installment detail page", () => {
    expect(
      resolveComicBrowseHref(
        comicCard({
          id: "series-1",
          singleReleaseEntityId: "issue-1",
        }),
      ),
    ).toBe("/comics/series-1/installments/issue-1");
  });

  it("routes multi-release comic series to the series overview", () => {
    expect(
      resolveComicBrowseHref(
        comicCard({
          id: "series-2",
          singleReleaseEntityId: null,
        }),
      ),
    ).toBe("/comics/series-2");
  });
});

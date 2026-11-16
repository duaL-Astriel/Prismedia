import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "$app/state";
import type { EntityCard, EntityCardFull } from "$lib/api/entities";
import { THUMBNAIL_HOVER_KIND } from "$lib/api/generated/codes";
import { CAPABILITY_KIND, ENTITY_KIND, type EntityKindCode } from "$lib/entities/entity-codes";
import TagDetailPage from "./+page.svelte";

vi.mock("vidstack/player", () => ({}));
vi.mock("vidstack/player/layouts", () => ({}));
vi.mock("vidstack/player/ui", () => ({}));
vi.mock("vidstack", () => ({
  isHLSProvider: () => false,
}));

const mocks = vi.hoisted(() => ({
  fetchEntity: vi.fn(),
  fetchEntities: vi.fn(),
  goto: vi.fn(),
}));

vi.mock("$app/navigation", () => ({
  goto: mocks.goto,
  beforeNavigate: vi.fn(),
  afterNavigate: vi.fn(),
}));

vi.mock("$lib/nsfw/store.svelte", () => ({
  useNsfw: () => ({ mode: "off", allowed: true }),
}));

vi.mock("$lib/stores/app-chrome.svelte", () => ({
  useAppChrome: () => ({ setBreadcrumbs: () => () => {} }),
}));

vi.mock("$lib/stores/session.svelte", () => ({
  useSession: () => ({ isAdmin: false, canRequestContent: false }),
}));

vi.mock("$lib/api/entities", async (importOriginal) => ({
  ...(await importOriginal<typeof import("$lib/api/entities")>()),
  fetchEntity: mocks.fetchEntity,
  fetchEntities: mocks.fetchEntities,
}));

vi.mock("$lib/api/consumption", async (importOriginal) => ({
  ...(await importOriginal<typeof import("$lib/api/consumption")>()),
  recordEntityConsumptionEvent: vi.fn().mockResolvedValue(undefined),
  updateEntityConsumption: vi.fn().mockResolvedValue(undefined),
}));

function makeEntityCard(id: string, kind: EntityKindCode, title: string): EntityCard {
  return {
    id,
    kind,
    title,
    parentEntityId: null,
    sortOrder: null,
    coverUrl: `/api/entities/${id}/thumb`,
    coverThumbUrl: null,
    hoverKind: THUMBNAIL_HOVER_KIND.none,
    hoverUrl: null,
    hoverImages: [],
    meta: [],
    rating: null,
    isFavorite: false,
    isNsfw: false,
    isOrganized: true,
  };
}

function makeEntityFull(id: string, kind: EntityKindCode, title: string): EntityCardFull {
  return {
    id,
    kind,
    title,
    parentEntityId: null,
    sortOrder: null,
    capabilities: [
      {
        kind: CAPABILITY_KIND.images,
        supportedKinds: [],
        items: [],
        thumbnailUrl: null,
        thumbnail2xUrl: null,
        coverUrl: `/api/entities/${id}/thumb`,
      },
    ],
    childrenByKind: [],
    relationships: [],
  };
}

describe("tags/[id] detail page lightbox navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    page.params = { id: "tag-1" } as typeof page.params;
    page.url = new URL("http://localhost/tags/tag-1") as typeof page.url;

    const tag = makeEntityFull("tag-1", ENTITY_KIND.tag, "Synthwave");
    const related = [
      makeEntityCard("img-1", ENTITY_KIND.image, "Alpha Grid"),
      makeEntityCard("vid-1", ENTITY_KIND.video, "Neon Drive"),
      makeEntityCard("img-2", ENTITY_KIND.image, "Zenith Skyline"),
    ];

    mocks.fetchEntity.mockImplementation(async (id: string) => {
      if (id === "tag-1") return tag;
      const found = related.find((item) => item.id === id);
      return found ? makeEntityFull(found.id, found.kind, found.title) : tag;
    });
    mocks.fetchEntities.mockResolvedValue({
      items: related,
      nextCursor: null,
      totalCount: related.length,
    });
  });

  it("navigates across elements in the tag view and returns to the tag view on close", async () => {
    render(TagDetailPage);

    const videoCard = await screen.findByRole("button", { name: "Neon Drive" });
    await fireEvent.click(videoCard);

    const dialog = await screen.findByRole("dialog", { name: "Neon Drive" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getAllByText("2 / 3").length).toBeGreaterThan(0);
    expect(mocks.goto).not.toHaveBeenCalled();

    await fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    await waitFor(() => expect(screen.getAllByText("1 / 3").length).toBeGreaterThan(0));
    expect(screen.getByRole("dialog", { name: "Alpha Grid" })).toBeInTheDocument();

    await fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(screen.getAllByText("2 / 3").length).toBeGreaterThan(0));
    await fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(screen.getAllByText("3 / 3").length).toBeGreaterThan(0));
    expect(screen.getByRole("dialog", { name: "Zenith Skyline" })).toBeInTheDocument();

    await fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocks.goto).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Synthwave" })).toBeInTheDocument();
  });
});

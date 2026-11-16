import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "$app/state";
import type { EntityCard, EntityCardFull } from "$lib/api/entities";
import { THUMBNAIL_HOVER_KIND } from "$lib/api/generated/codes";
import { CAPABILITY_KIND, ENTITY_KIND, type EntityKindCode } from "$lib/entities/entity-codes";
import PersonDetailPage from "./+page.svelte";

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

describe("people/[id] detail page lightbox navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    page.params = { id: "person-1" } as typeof page.params;
    page.url = new URL("http://localhost/people/person-1") as typeof page.url;

    const person = makeEntityFull("person-1", ENTITY_KIND.person, "Alex Mercer");
    const related = [
      makeEntityCard("img-1", ENTITY_KIND.image, "First Still"),
      makeEntityCard("gal-1", ENTITY_KIND.gallery, "Promo Gallery"),
      makeEntityCard("vid-1", ENTITY_KIND.video, "Midway Clip"),
      makeEntityCard("img-2", ENTITY_KIND.image, "Second Still"),
    ];

    mocks.fetchEntity.mockImplementation(async (id: string) => {
      if (id === "person-1") return person;
      const found = related.find((item) => item.id === id);
      return found ? makeEntityFull(found.id, found.kind, found.title) : person;
    });
    mocks.fetchEntities.mockResolvedValue({
      items: related,
      nextCursor: null,
      totalCount: related.length,
    });
  });

  it("opens the lightbox scoped to the person's elements and closes back to the person view", async () => {
    render(PersonDetailPage);

    const firstStill = await screen.findByRole("button", { name: "First Still" });
    const galleryLink = screen.getByRole("link", { name: "Promo Gallery" });
    expect(galleryLink).toHaveAttribute("href", "/galleries/gal-1?from=%2Fpeople%2Fperson-1");

    await fireEvent.click(firstStill);

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAttribute("aria-label", "First Still");
    expect(screen.getAllByText("1 / 3").length).toBeGreaterThan(0);
    expect(mocks.goto).not.toHaveBeenCalled();

    await fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(screen.getAllByText("2 / 3").length).toBeGreaterThan(0));
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-label", "Midway Clip");

    await fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(screen.getAllByText("3 / 3").length).toBeGreaterThan(0));
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-label", "Second Still");

    await fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocks.goto).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Alex Mercer" })).toBeInTheDocument();
  });
});

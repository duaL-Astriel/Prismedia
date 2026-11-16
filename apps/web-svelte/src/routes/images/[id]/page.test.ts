import { fireEvent, render, screen } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "$app/state";
import type { EntityCardFull } from "$lib/api/entities";
import { CAPABILITY_KIND, ENTITY_KIND } from "$lib/entities/entity-codes";
import ImageDetailPage from "./+page.svelte";

vi.mock("vidstack/player", () => ({}));
vi.mock("vidstack/player/layouts", () => ({}));
vi.mock("vidstack/player/ui", () => ({}));
vi.mock("vidstack", () => ({
  isHLSProvider: () => false,
}));

const mocks = vi.hoisted(() => ({
  fetchEntity: vi.fn(),
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
}));

vi.mock("$lib/api/consumption", async (importOriginal) => ({
  ...(await importOriginal<typeof import("$lib/api/consumption")>()),
  recordEntityConsumptionEvent: vi.fn().mockResolvedValue(undefined),
  updateEntityConsumption: vi.fn().mockResolvedValue(undefined),
}));

function makeImageEntity(): EntityCardFull {
  return {
    id: "img-1",
    kind: ENTITY_KIND.image,
    title: "Single Image",
    parentEntityId: null,
    sortOrder: null,
    capabilities: [
      {
        kind: CAPABILITY_KIND.images,
        supportedKinds: [],
        items: [],
        thumbnailUrl: null,
        thumbnail2xUrl: null,
        coverUrl: "/api/entities/img-1/thumb",
      },
    ],
    childrenByKind: [],
    relationships: [],
  };
}

describe("images/[id] close navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    page.params = { id: "img-1" } as typeof page.params;
    mocks.fetchEntity.mockResolvedValue(makeImageEntity());
  });

  it("navigates back to the ?from= origin when closing the image route", async () => {
    page.url = new URL("http://localhost/images/img-1?from=%2Fpeople%2Fperson-1") as typeof page.url;

    render(ImageDetailPage);
    await screen.findByRole("dialog");
    await fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(mocks.goto).toHaveBeenCalledWith("/people/person-1");
  });

  it("falls back to /images when no ?from= query param is present", async () => {
    page.url = new URL("http://localhost/images/img-1") as typeof page.url;

    render(ImageDetailPage);
    await screen.findByRole("dialog");
    await fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(mocks.goto).toHaveBeenCalledWith("/images");
  });
});

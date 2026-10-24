import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ENTITY_KIND, THUMBNAIL_HOVER_KIND } from "$lib/api/generated/codes";
import type { EntityThumbnailCard } from "$lib/entities/entity-thumbnail";
import EntityGrid from "./EntityGrid.test-harness.svelte";

// These tests assert selection state, not enter/leave motion.
vi.mock("svelte/transition", async (importOriginal) => ({
  ...await importOriginal<typeof import("svelte/transition")>(),
  fly: () => ({ duration: 0 }),
  slide: () => ({ duration: 0 }),
}));

const selectionBar = () => screen.queryByRole("status", { name: "Selection actions" });

describe("EntityGrid selection", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("offers per-card checkboxes without a toolbar toggle and only shows the floating bar once something is selected", async () => {
    const onSelectionChange = vi.fn();
    render(EntityGrid, { cards: cards(3), dockControls: false, onSelectionChange, showPagination: false });

    expect(screen.queryByRole("button", { name: "Select" })).not.toBeInTheDocument();
    expect(selectionBar()).not.toBeInTheDocument();
    // Untouched cards stay plain links; their checkbox is the only selection affordance.
    expect(screen.getByRole("link", { name: "Video 1" })).toBeInTheDocument();

    await fireEvent.click(screen.getByRole("checkbox", { name: "Select Video 1" }));

    expect(onSelectionChange).toHaveBeenLastCalledWith(["video-1"]);
    expect(selectionBar()).toHaveTextContent("1 selected");
    expect(selectionBar()?.closest(".bulk-dock")).not.toBeNull();
  });

  it("switches every card into selection mode while a selection exists and back once it is cleared", async () => {
    const { container } = render(EntityGrid, { cards: cards(3), dockControls: false, showPagination: false });

    await fireEvent.click(screen.getByRole("checkbox", { name: "Select Video 1" }));

    expect(container.querySelectorAll(".entity-thumbnail.is-select-mode")).toHaveLength(3);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    // A plain click on another card now toggles it instead of navigating.
    await fireEvent.click(screen.getByRole("checkbox", { name: "Video 2" }));
    expect(selectionBar()).toHaveTextContent("2 selected");

    await fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    await waitFor(() => expect(selectionBar()).not.toBeInTheDocument());
    expect(container.querySelectorAll(".entity-thumbnail.is-select-mode")).toHaveLength(0);
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });

  it("toggles instead of activating cards with a custom activation handler while selecting", async () => {
    const onCardActivate = vi.fn();
    render(EntityGrid, { cards: cards(2), dockControls: false, onCardActivate, showPagination: false });

    await fireEvent.click(screen.getByRole("checkbox", { name: "Select Video 0" }));
    await fireEvent.click(screen.getByRole("checkbox", { name: "Video 1" }));

    expect(onCardActivate).not.toHaveBeenCalled();
    expect(selectionBar()).toHaveTextContent("2 selected");
  });

  it("keeps a persistent selection-mode grid toggling on click and renders host bar actions", async () => {
    const bulkBarActions = createRawSnippet(() => ({ render: () => "<button>Identify selection</button>" }));
    const { container } = render(EntityGrid, {
      bulkBarActions,
      cardLinks: false,
      cards: cards(2),
      dockControls: false,
      selectionMode: true,
      showPagination: false,
    });

    expect(container.querySelectorAll(".entity-thumbnail.is-select-mode")).toHaveLength(2);
    expect(selectionBar()).not.toBeInTheDocument();

    await fireEvent.click(screen.getByRole("checkbox", { name: "Video 0" }));

    expect(selectionBar()).toHaveTextContent("1 selected");
    expect(screen.getByRole("button", { name: "Identify selection" })).toBeInTheDocument();

    await fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    await waitFor(() => expect(selectionBar()).not.toBeInTheDocument());
    expect(container.querySelectorAll(".entity-thumbnail.is-select-mode")).toHaveLength(2);
  });
});

function cards(count: number): EntityThumbnailCard[] {
  return Array.from({ length: count }, (_, index) => ({
    entity: {
      id: `video-${index}`,
      kind: ENTITY_KIND.video,
      title: `Video ${index}`,
      parentEntityId: null,
      sortOrder: null,
      relationships: [],
      capabilities: [],
      childrenByKind: [],
    },
    aspectRatio: "video",
    cover: null,
    hover: { kind: THUMBNAIL_HOVER_KIND.none },
  }));
}

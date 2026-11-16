import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import { CAPABILITY_KIND, ENTITY_SORT_DIRECTION } from "$lib/api/generated/codes";
import { ENTITY_GRID_SORT, ENTITY_GRID_VIEW_MODE } from "$lib/entities/entity-grid";
import EntityGridToolbar from "./EntityGridToolbar.svelte";

function baseProps() {
  return {
    activeFilterIds: [] as string[],
    activePresetId: null,
    barsCollapsed: false,
    canClearFilters: false,
    dockControls: true,
    drawerOpen: false,
    enableFeedView: true,
    filterOptions: [
      {
        id: "flags:favorite",
        label: "Favorites",
        count: 4,
        capabilityKind: CAPABILITY_KIND.flags,
      },
    ],
    maxScale: 6,
    mediaWall: false,
    minScale: 2,
    mobile: true,
    onActiveFilterIdsChange: vi.fn(),
    onApplyPreset: vi.fn(),
    onClearFilters: vi.fn(),
    onDeletePreset: vi.fn(),
    onDrawerOpenChange: vi.fn(),
    onMediaWallChange: vi.fn(),
    onOverwritePreset: vi.fn(),
    onQueryChange: vi.fn(),
    onReshuffle: vi.fn(),
    onSavePreset: vi.fn(),
    onScaleChange: vi.fn(),
    onSortByChange: vi.fn(),
    onSortDirChange: vi.fn(),
    onViewModeChange: vi.fn(),
    presets: [],
    query: "",
    scale: 3,
    sortBy: ENTITY_GRID_SORT.title,
    sortDir: ENTITY_SORT_DIRECTION.ascending,
    viewMode: ENTITY_GRID_VIEW_MODE.grid,
  };
}

describe("EntityGridToolbar mobile rail", () => {
  it("renders a compact single rail and expands search with Escape focus return", async () => {
    const props = baseProps();
    render(EntityGridToolbar, props);

    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    const searchPill = screen.getByRole("button", { name: "Search the library" });
    await fireEvent.click(searchPill);

    const searchbox = await screen.findByRole("searchbox", { name: "Search the library" });
    await waitFor(() => expect(searchbox).toHaveFocus());
    await fireEvent.input(searchbox, { target: { value: "night" } });
    expect(props.onQueryChange).toHaveBeenCalledWith("night");

    await fireEvent.keyDown(searchbox, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("searchbox")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("button", { name: "Search the library" })).toHaveFocus());
  });

  it("opens Sort and Display popovers and renders active filters outside the sticky shell", async () => {
    const props = {
      ...baseProps(),
      activeFilterIds: ["flags:favorite"],
      canClearFilters: true,
    };
    const { container } = render(EntityGridToolbar, props);

    // Active filter chips live in normal document flow outside the sticky toolbar shell.
    const shell = container.querySelector(".toolbar-shell");
    const clearBtn = screen.getByRole("button", { name: "Clear search and filters" });
    expect(shell).not.toContainElement(clearBtn);

    await fireEvent.click(screen.getByRole("button", { name: /Sort by/ }));
    await fireEvent.click(await screen.findByRole("radio", { name: "Rating" }));
    expect(props.onSortByChange).toHaveBeenCalledWith(ENTITY_GRID_SORT.rating);

    await fireEvent.click(screen.getByRole("button", { name: "Display and presets" }));
    await fireEvent.click(await screen.findByRole("radio", { name: "List view" }));
    expect(props.onViewModeChange).toHaveBeenCalledWith(ENTITY_GRID_VIEW_MODE.list);
  });

  it("hides the rail when scrolling down and reveals it when scrolling up", async () => {
    const host = document.createElement("div");
    host.style.overflowY = "auto";
    document.body.appendChild(host);
    let scrollTop = 0;
    Object.defineProperty(host, "scrollTop", {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = value;
      },
    });

    const { container } = render(EntityGridToolbar, { target: host, props: baseProps() });
    const railWrap = container.querySelector(".mobile-rail-wrap");
    expect(railWrap).not.toHaveClass("is-hidden");

    scrollTop = 140;
    host.dispatchEvent(new Event("scroll"));
    await waitFor(() => expect(railWrap).toHaveClass("is-hidden"));
    expect(railWrap).toHaveAttribute("aria-hidden", "true");

    scrollTop = 110;
    host.dispatchEvent(new Event("scroll"));
    await waitFor(() => expect(railWrap).not.toHaveClass("is-hidden"));
    expect(railWrap).not.toHaveAttribute("aria-hidden");

    host.remove();
  });
});

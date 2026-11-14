import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import { ENTITY_KIND } from "$lib/entities/entity-codes";
import { AVAILABILITY_FILTER_DEFS, tagFilterId } from "$lib/entities/entity-grid";
import { searchEntityPickerItems } from "$lib/entities/entity-picker-search";
import EntityGridFilterDrawer from "./EntityGridFilterDrawer.svelte";

vi.mock("$lib/entities/entity-picker-search", () => ({
  searchEntityPickerItems: vi.fn(),
}));

describe("EntityGridFilterDrawer availability", () => {
  it("shows one exclusive availability family", async () => {
    const onChange = vi.fn();
    render(EntityGridFilterDrawer, {
      activeFilterIds: ["availability:wanted"],
      filterOptions: AVAILABILITY_FILTER_DEFS.map((definition) => ({
        ...definition,
        count: 0,
      })),
      entityKind: ENTITY_KIND.videoSeason,
      onActiveFilterIdsChange: onChange,
    });

    expect(screen.getByText("Availability")).toBeInTheDocument();
    expect(screen.queryByText("Has file")).not.toBeInTheDocument();

    await fireEvent.click(screen.getByRole("button", { name: "Downloaded" }));
    expect(onChange).toHaveBeenCalledWith(["availability:downloaded"]);
  });

  it("derives status visibility and vocabulary from the entity definition", async () => {
    const { rerender } = render(EntityGridFilterDrawer, {
      activeFilterIds: [],
      filterOptions: [],
      entityKind: ENTITY_KIND.bookChapter,
      onActiveFilterIdsChange: vi.fn(),
    });

    expect(screen.getByRole("button", { name: "Read" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unread" })).toBeInTheDocument();

    await rerender({
      activeFilterIds: [],
      filterOptions: [],
      entityKind: ENTITY_KIND.person,
      onActiveFilterIdsChange: vi.fn(),
    });

    expect(screen.queryByText("Status")).not.toBeInTheDocument();
  });

  it("renders tag autocomplete only for media and mixed grids, not taxonomy or collection grids", async () => {
    const { rerender } = render(EntityGridFilterDrawer, {
      activeFilterIds: [],
      filterOptions: [],
      entityKind: ENTITY_KIND.video,
      onActiveFilterIdsChange: vi.fn(),
    });
    expect(screen.getByText("Tags")).toBeInTheDocument();

    await rerender({
      activeFilterIds: [],
      filterOptions: [],
      entityKind: undefined,
      onActiveFilterIdsChange: vi.fn(),
    });
    expect(screen.getByText("Tags")).toBeInTheDocument();

    await rerender({
      activeFilterIds: [],
      filterOptions: [],
      entityKind: ENTITY_KIND.tag,
      onActiveFilterIdsChange: vi.fn(),
    });
    expect(screen.queryByText("Tags")).not.toBeInTheDocument();

    await rerender({
      activeFilterIds: [],
      filterOptions: [],
      entityKind: ENTITY_KIND.collection,
      onActiveFilterIdsChange: vi.fn(),
    });
    expect(screen.queryByText("Tags")).not.toBeInTheDocument();
  });

  it("supports multi-select tag autocomplete and chip removal", async () => {
    const mockSearch = vi.mocked(searchEntityPickerItems);
    mockSearch.mockResolvedValue([
      { id: "tag-1", title: "Cyberpunk", thumbnailUrl: null },
      { id: "tag-2", title: "Neon", thumbnailUrl: null },
    ]);

    let activeFilterIds: string[] = [];
    const onTagItemsKnown = vi.fn();
    const onChange = vi.fn((ids: string[]) => {
      activeFilterIds = ids;
    });

    const { rerender } = render(EntityGridFilterDrawer, {
      activeFilterIds,
      filterOptions: [],
      entityKind: ENTITY_KIND.book,
      onTagItemsKnown,
      onActiveFilterIdsChange: onChange,
    });

    await fireEvent.click(screen.getByRole("button", { name: "Add tag" }));
    const input = screen.getByRole("combobox", { name: "Search tag" });
    await fireEvent.input(input, { target: { value: "cyb" } });

    await waitFor(() =>
      expect(mockSearch).toHaveBeenCalledWith(ENTITY_KIND.tag, "cyb", { hideNsfw: false }),
    );
    await fireEvent.click((await screen.findByText("Cyberpunk")).closest('[role="option"]')!);
    expect(onChange).toHaveBeenLastCalledWith([tagFilterId("tag-1")]);
    expect(onTagItemsKnown).toHaveBeenLastCalledWith([
      { id: "tag-1", title: "Cyberpunk", thumbnailUrl: null },
    ]);

    await rerender({
      activeFilterIds,
      filterOptions: [],
      entityKind: ENTITY_KIND.book,
      onTagItemsKnown,
      onActiveFilterIdsChange: onChange,
    });

    await fireEvent.click((await screen.findByText("Neon")).closest('[role="option"]')!);
    expect(onChange).toHaveBeenLastCalledWith([tagFilterId("tag-1"), tagFilterId("tag-2")]);

    await rerender({
      activeFilterIds,
      filterOptions: [],
      entityKind: ENTITY_KIND.book,
      onTagItemsKnown,
      onActiveFilterIdsChange: onChange,
    });

    await fireEvent.click(screen.getByRole("button", { name: "Remove Cyberpunk" }));
    expect(onChange).toHaveBeenLastCalledWith([tagFilterId("tag-2")]);
  });
});

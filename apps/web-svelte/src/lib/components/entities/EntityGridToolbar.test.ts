import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import EntityGridToolbar from "./EntityGridToolbar.test-harness.svelte";

describe("EntityGridToolbar", () => {
  it("keeps search and view controls in separate rows and leaves selection to the grid's floating bar", () => {
    render(EntityGridToolbar, { props: { canClearFilters: false } });
    const viewRow = screen.getByRole("radio", { name: "Grid view" }).closest(".controls-row");
    expect(viewRow).toContainElement(screen.getByRole("button", { name: "Filters" }));
    expect(viewRow).not.toContainElement(screen.getByRole("searchbox"));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Select" })).not.toBeInTheDocument();
    // With no filter row to fold away, the collapse toggle has nothing to do.
    expect(screen.queryByRole("button", { name: "Hide filter row" })).not.toBeInTheDocument();
  });

  it("keeps manual filter-row collapse as the public persisted callback", async () => {
    const onBarsCollapsedChange = vi.fn();
    render(EntityGridToolbar, { props: { onBarsCollapsedChange } });

    await fireEvent.click(screen.getByRole("button", { name: "Hide filter row" }));
    expect(onBarsCollapsedChange).toHaveBeenCalledWith(true);
    expect(screen.getByRole("button", { name: "Show filter row" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Grid view" })).toBeInTheDocument();

    await fireEvent.click(screen.getByRole("button", { name: "Show filter row" }));
    expect(onBarsCollapsedChange).toHaveBeenLastCalledWith(false);
  });

  it("renders the filter drawer inside the sticky toolbar stack alongside the search bar", () => {
    render(EntityGridToolbar, { props: { drawerOpen: true } });

    const toolbarStack = screen.getByRole("searchbox").closest(".toolbar-stack");
    const filterPanel = screen.getByRole("region", { name: "Filter options" });
    expect(toolbarStack).toContainElement(filterPanel);
    expect(filterPanel).toHaveClass("filter-drawer-panel");
    expect(screen.getByRole("button", { name: "Filters" })).toHaveAttribute("aria-controls", filterPanel.id);
  });
});

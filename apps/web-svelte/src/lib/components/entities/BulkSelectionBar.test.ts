import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import BulkSelectionBar from "./BulkSelectionBar.svelte";

describe("BulkSelectionBar", () => {
  afterEach(cleanup);

  it("hides contextual actions that do not support the current selection", async () => {
    const run = vi.fn();
    const view = render(BulkSelectionBar, {
      bulkActions: [{
        id: "delete-files",
        label: "Delete files",
        isAvailable: (ids: string[]) => ids.every((id) => id === "on-disk"),
        onRun: run,
      }],
      onClearSelection: vi.fn(),
      onSelectAllVisible: vi.fn(),
      selectedCount: 1,
      selectedIds: ["wanted"],
    });

    expect(screen.queryByRole("button", { name: "Bulk actions" })).toBeNull();

    await view.rerender({
      bulkActions: [{
        id: "delete-files",
        label: "Delete files",
        isAvailable: (ids: string[]) => ids.every((id) => id === "on-disk"),
        onRun: run,
      }],
      onClearSelection: vi.fn(),
      onSelectAllVisible: vi.fn(),
      selectedCount: 1,
      selectedIds: ["on-disk"],
    });

    await fireEvent.click(screen.getByRole("button", { name: "Bulk actions" }));
    await fireEvent.click(screen.getByRole("menuitem", { name: "Delete files" }));
    expect(run).toHaveBeenCalledWith(["on-disk"]);
  });

  it("opens actions by keyboard and returns focus on Escape without running an action", async () => {
    const run = vi.fn();
    render(BulkSelectionBar, {
      bulkActions: [{ id: "inspect", label: "Inspect selection", onRun: run }],
      onClearSelection: vi.fn(), onSelectAllVisible: vi.fn(),
      selectedCount: 1, selectedIds: ["item-1"],
    });
    const trigger = screen.getByRole("button", { name: "Bulk actions" });
    trigger.focus();
    await fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const item = await screen.findByRole("menuitem", { name: "Inspect selection" });
    await waitFor(() => expect(item).toHaveFocus());
    await fireEvent.keyDown(item, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    expect(run).not.toHaveBeenCalled();
  });

  it("keeps selection controls on shared buttons and disables clearing an empty selection", () => {
    render(BulkSelectionBar, {
      onClearSelection: vi.fn(), onSelectAllVisible: vi.fn(),
      selectedCount: 0, selectedIds: [],
    });
    expect(screen.getByRole("button", { name: "Select all" })).toHaveClass("inline-flex");
    expect(screen.getByRole("button", { name: "Clear" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Bulk actions" })).not.toBeInTheDocument();
  });

  it("renders host actions after the built-in ones only while something is selected", async () => {
    const children = createRawSnippet(() => ({ render: () => "<button>Identify 2 with TMDB</button>" }));
    const view = render(BulkSelectionBar, {
      children,
      onClearSelection: vi.fn(), onSelectAllVisible: vi.fn(),
      selectedCount: 2, selectedIds: ["a", "b"], variant: "floating",
    });
    const bar = screen.getByRole("status", { name: "Selection actions" });
    expect(bar).toHaveClass("floating-bar");
    expect(bar).toHaveTextContent("2 selected");
    expect(screen.getByRole("button", { name: "Identify 2 with TMDB" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Select" })).not.toBeInTheDocument();

    await view.rerender({ selectedCount: 0, selectedIds: [] });
    expect(screen.queryByRole("button", { name: "Identify 2 with TMDB" })).not.toBeInTheDocument();
  });
});

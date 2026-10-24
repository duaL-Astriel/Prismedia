<script lang="ts">
  import type { Snippet } from "svelte";
  import { BellOff, CheckCheck, EllipsisVertical, Flame, X } from "@lucide/svelte";
  import { cubicOut } from "svelte/easing";
  import { slide } from "svelte/transition";
  import { Button, buttonVariants, cn, DropdownMenu, Separator } from "@prismedia/ui-svelte";
  import type { CollectionEntityType } from "$lib/collections/models";
  import type { EntityGridBulkAction } from "$lib/entities/entity-grid";
  import AddToCollectionMenu from "./AddToCollectionMenu.svelte";

  interface Props {
    allSelectedNsfw?: boolean;
    /** True when every selected card is a wanted placeholder; enables the Remove wanted action. */
    allSelectedWanted?: boolean;
    /** Removes the selected wanted placeholders (delete + discovery blacklist; a direct re-request restores). */
    onRemoveWanted?: () => void;
    bulkActions?: EntityGridBulkAction[];
    /** Host-specific primary actions rendered after the built-in ones, e.g. Identify's queue button. */
    children?: Snippet;
    class?: string;
    collectionItems?: { entityType: CollectionEntityType; entityId: string }[];
    onClearSelection: () => void;
    onSelectAllVisible: () => void;
    onToggleNsfwFlag?: (markNsfw: boolean) => void;
    selectedCount: number;
    selectedIds: string[];
    showNsfwAction?: boolean;
    /**
     * `floating` is the frosted bar an EntityGrid docks at the bottom of the viewport while a
     * selection exists; `track-list` is the inline row under an album's track list header.
     */
    variant?: "floating" | "track-list";
  }

  let {
    allSelectedNsfw = false,
    allSelectedWanted = false,
    onRemoveWanted,
    bulkActions = [],
    children,
    class: className = "",
    collectionItems = [],
    onClearSelection,
    onSelectAllVisible,
    onToggleNsfwFlag,
    selectedCount,
    selectedIds,
    showNsfwAction = true,
    variant = "track-list",
  }: Props = $props();

  const canToggleNsfw = $derived(showNsfwAction && typeof onToggleNsfwFlag === "function");
  const canRemoveWanted = $derived(allSelectedWanted && typeof onRemoveWanted === "function");
  const availableBulkActions = $derived(
    bulkActions.filter((action) => action.isAvailable?.(selectedIds) ?? true),
  );

  // The floating bar's host owns its enter/leave motion, so only the inline row slides here.
  function rowTransition(node: Element) {
    return variant === "track-list" ? slide(node, { duration: 200, easing: cubicOut }) : {};
  }
</script>

<div
  class={cn(
    "bulk-bar",
    variant === "floating" && "floating-bar app-glass",
    variant === "track-list" && "track-list-bar",
    className,
  )}
  role="status"
  aria-live="polite"
  aria-label="Selection actions"
  transition:rowTransition
>
  <span class="bulk-count">{selectedCount} selected</span>

  <div class="bulk-controls">
    <Button
      variant="ghost"
      size="sm"
      aria-label="Select all"
      title="Select all visible"
      onclick={onSelectAllVisible}
    >
      <CheckCheck class="h-3.5 w-3.5" />
      <span class="bulk-btn-label">Select all</span>
    </Button>
    <Button
      variant="ghost"
      size="sm"
      aria-label="Clear"
      title="Clear selection"
      disabled={selectedCount === 0}
      onclick={onClearSelection}
    >
      <X class="h-3.5 w-3.5" />
      <span class="bulk-btn-label">Clear</span>
    </Button>

    {#if selectedCount > 0}
      {#if canToggleNsfw}
        <Separator orientation="vertical" class="mx-0.5 h-4" />
        <Button
          variant="ghost"
          size="sm"
          aria-label={allSelectedNsfw ? "Mark SFW" : "Mark NSFW"}
          title={allSelectedNsfw ? "Mark SFW" : "Mark NSFW"}
          onclick={() => onToggleNsfwFlag?.(!allSelectedNsfw)}
        >
          <Flame class="h-3.5 w-3.5" />
          <span class="bulk-btn-label">{allSelectedNsfw ? "Mark SFW" : "Mark NSFW"}</span>
        </Button>
      {/if}

      {#if canRemoveWanted}
        <Separator orientation="vertical" class="mx-0.5 h-4" />
        <Button
          variant="danger"
          size="sm"
          aria-label="Remove wanted"
          title="Remove from Wanted — deletes these placeholders and keeps them out of future discovery; requesting one again brings it back"
          onclick={() => onRemoveWanted?.()}
        >
          <BellOff class="h-3.5 w-3.5" />
          <span class="bulk-btn-label">Remove wanted</span>
        </Button>
      {/if}

      {#if collectionItems.length > 0}
        <AddToCollectionMenu items={collectionItems} />
      {/if}

      {#if availableBulkActions.length > 0}
        <Separator orientation="vertical" class="mx-0.5 h-4" />
        <DropdownMenu.Root>
          <DropdownMenu.Trigger
            class={buttonVariants({ variant: "secondary", size: "sm" })}
            title="Actions"
            aria-label="Bulk actions"
          >
            <EllipsisVertical class="h-3.5 w-3.5" />
            <span class="bulk-btn-label">Actions</span>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="end" aria-label="Bulk actions">
            <DropdownMenu.Group>
              {#each availableBulkActions as action (action.id)}
                <DropdownMenu.Item
                  variant={action.tone === "danger" ? "destructive" : "default"}
                  onSelect={() => action.onRun(selectedIds)}
                >
                  {action.label}
                </DropdownMenu.Item>
              {/each}
            </DropdownMenu.Group>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      {/if}

      {#if children}
        <Separator orientation="vertical" class="mx-0.5 h-4" />
        {@render children()}
      {/if}
    {/if}
  </div>
</div>

<style>
  .bulk-bar {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-width: 0;
    min-height: 2.55rem;
    color: var(--color-text-muted);
    font-family: var(--font-mono, "JetBrains Mono", monospace);
    font-size: 0.7rem;
    pointer-events: auto;
  }

  /* Frosted floating control: sized to its actions, never wider than the grid it serves. */
  .floating-bar {
    max-width: 100%;
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-lg, 12px);
    padding: 0.4rem 0.45rem 0.4rem 0.9rem;
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.07), 0 18px 48px rgb(0 0 0 / 0.55);
  }

  .track-list-bar {
    border-top: 1px solid var(--color-border-subtle, rgba(148, 158, 178, 0.07));
    background: rgb(255 255 255 / 0.02);
    padding: 0.65rem 0.75rem;
  }

  .bulk-count {
    color: var(--color-text-accent);
    text-transform: uppercase;
    flex-shrink: 0;
  }

  .bulk-controls {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    margin-left: auto;
    min-width: 0;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .bulk-btn-label {
    display: none;
  }

  @media (min-width: 520px) {
    .bulk-btn-label {
      display: inline;
    }
  }
</style>

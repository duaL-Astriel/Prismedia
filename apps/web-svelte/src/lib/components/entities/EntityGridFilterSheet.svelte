<script lang="ts">
  import { RotateCcw, SlidersHorizontal, X } from "@lucide/svelte";
  import { Badge, Button, Sheet } from "@prismedia/ui-svelte";
  import type { EntityPickerItem } from "$lib/components/forms/EntityPicker.svelte";
  import type { EntityGridFilterOption } from "$lib/entities/entity-grid";
  import EntityGridFilterDrawer from "./EntityGridFilterDrawer.svelte";

  interface Props {
    open: boolean;
    activeFilterIds: string[];
    filterOptions: EntityGridFilterOption[];
    entityKind?: string;
    lockBookFilters?: boolean;
    hideNsfw?: boolean;
    knownTags?: ReadonlyMap<string, EntityPickerItem>;
    canClearFilters: boolean;
    totalCount: number;
    totalIsExact?: boolean;
    onOpenChange: (open: boolean) => void;
    onTagItemsKnown?: (items: EntityPickerItem[]) => void;
    onActiveFilterIdsChange: (ids: string[]) => void;
    onClearFilters: () => void;
  }

  let {
    open,
    activeFilterIds,
    filterOptions,
    entityKind,
    lockBookFilters = false,
    hideNsfw = false,
    knownTags,
    canClearFilters,
    totalCount,
    totalIsExact = true,
    onOpenChange,
    onTagItemsKnown,
    onActiveFilterIdsChange,
    onClearFilters,
  }: Props = $props();

  const countText = $derived(`${totalCount}${totalIsExact ? "" : "+"}`);
  const itemNoun = $derived(totalCount === 1 && totalIsExact ? "item" : "items");
</script>

<Sheet.Root {open} {onOpenChange}>
  <Sheet.Content
    side="bottom"
    showCloseButton={false}
    class="flex max-h-[82dvh] flex-col gap-0 rounded-t-lg border-t border-border-default bg-popover p-0"
  >
    <div class="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-surface-4" aria-hidden="true"></div>
    <div class="flex items-center justify-between gap-2 border-b border-border-subtle px-4 py-3">
      <div class="flex items-center gap-2">
        <SlidersHorizontal class="size-4 text-text-muted" />
        <Sheet.Title class="font-heading text-sm font-medium text-text-primary">Filters</Sheet.Title>
        {#if activeFilterIds.length > 0}
          <Badge class="h-5 px-1.5 font-mono text-[10px]">{activeFilterIds.length}</Badge>
        {/if}
      </div>
      <div class="flex items-center gap-1">
        {#if canClearFilters}
          <Button variant="ghost" size="xs" onclick={onClearFilters}>
            <RotateCcw class="size-3" />
            Reset
          </Button>
        {/if}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Close filters"
          onclick={() => onOpenChange(false)}
        >
          <X class="size-4" />
        </Button>
      </div>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto p-2">
      <EntityGridFilterDrawer
        {activeFilterIds}
        {filterOptions}
        {entityKind}
        {lockBookFilters}
        {hideNsfw}
        {knownTags}
        {onTagItemsKnown}
        {onActiveFilterIdsChange}
      />
    </div>

    <div class="flex items-center justify-between gap-3 border-t border-border-subtle bg-surface-1 px-4 pt-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom,0px))]">
      <span class="font-mono text-[11px] text-text-muted">
        {countText} {itemNoun}
      </span>
      <Button variant="primary" size="sm" onclick={() => onOpenChange(false)}>
        Show {countText} {itemNoun}
      </Button>
    </div>
  </Sheet.Content>
</Sheet.Root>

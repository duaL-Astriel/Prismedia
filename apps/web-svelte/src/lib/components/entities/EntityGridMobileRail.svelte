<script lang="ts">
  import {
    ArrowDownWideNarrow,
    ArrowUpNarrowWide,
    Bookmark,
    Check,
    Ellipsis,
    Grid2x2,
    Grid3x3,
    LayoutGrid,
    List,
    Rows3,
    Search,
    Shuffle,
    SlidersHorizontal,
    X,
  } from "@lucide/svelte";
  import {
    Badge,
    Button,
    buttonVariants,
    cn,
    Popover,
    SearchInput,
    Separator,
    Slider,
    Toggle,
    ToggleGroup,
  } from "@prismedia/ui-svelte";
  import { tick } from "svelte";
  import { ENTITY_SORT_DIRECTION } from "$lib/api/generated/codes";
  import { entityGridSortOptionsForKind } from "$lib/entities/entity-grid-display";
  import {
    ENTITY_GRID_SORT,
    ENTITY_GRID_VIEW_MODE,
    type EntityGridSort,
    type EntityGridSortDir,
    type EntityGridViewMode,
  } from "$lib/entities/entity-grid";
  import type { FilterPreset } from "$lib/filter-presets";
  import EntityGridPresetMenuContent from "./EntityGridPresetMenuContent.svelte";

  interface Props {
    activeFilterCount: number;
    activePresetId: string | null;
    drawerOpen: boolean;
    enableFeedView: boolean;
    entityKind?: string;
    hidden: boolean;
    maxScale: number;
    mediaWall: boolean;
    minScale: number;
    onApplyPreset: (preset: FilterPreset) => void;
    onDeletePreset: (id: string) => void;
    onDrawerOpenChange: (open: boolean) => void;
    onMediaWallChange: (mediaWall: boolean) => void;
    onOverwritePreset: (id: string) => void;
    onPinnedChange?: (pinned: boolean) => void;
    onQueryChange: (query: string) => void;
    onReshuffle: () => void;
    onSavePreset: (name: string) => void;
    onScaleChange: (scale: number) => void;
    onSortByChange: (sortBy: EntityGridSort) => void;
    onSortDirChange: (sortDir: EntityGridSortDir) => void;
    onViewModeChange: (viewMode: EntityGridViewMode) => void;
    presets: FilterPreset[];
    query: string;
    scale: number;
    sortBy: EntityGridSort;
    sortDir: EntityGridSortDir;
    viewMode: EntityGridViewMode;
  }

  let {
    activeFilterCount,
    activePresetId,
    drawerOpen,
    enableFeedView,
    entityKind,
    hidden,
    maxScale,
    mediaWall,
    minScale,
    onApplyPreset,
    onDeletePreset,
    onDrawerOpenChange,
    onMediaWallChange,
    onOverwritePreset,
    onPinnedChange,
    onQueryChange,
    onReshuffle,
    onSavePreset,
    onScaleChange,
    onSortByChange,
    onSortDirChange,
    onViewModeChange,
    presets,
    query,
    scale,
    sortBy,
    sortDir,
    viewMode,
  }: Props = $props();

  const id = $props.id();
  let searchExpanded = $state(false);
  let sortOpen = $state(false);
  let displayOpen = $state(false);
  let searchInputEl = $state<HTMLInputElement | null>(null);
  let searchPillEl = $state<HTMLButtonElement | null>(null);

  const sortOptions = $derived(entityGridSortOptionsForKind(entityKind));
  const ascending = $derived(sortDir === ENTITY_SORT_DIRECTION.ascending);
  const activeSortLabel = $derived(
    sortOptions.find((option) => option.value === sortBy)?.label ?? "Title",
  );
  const views = $derived([
    { value: ENTITY_GRID_VIEW_MODE.grid, label: "Grid", icon: LayoutGrid },
    { value: ENTITY_GRID_VIEW_MODE.list, label: "List", icon: List },
    ...(enableFeedView
      ? [{ value: ENTITY_GRID_VIEW_MODE.feed, label: "Feed", icon: Rows3 }]
      : []),
  ]);

  $effect(() => {
    onPinnedChange?.(searchExpanded || sortOpen || displayOpen);
  });

  async function openSearch() {
    searchExpanded = true;
    sortOpen = false;
    displayOpen = false;
    await tick();
    searchInputEl?.focus();
  }

  async function closeSearch(restoreFocus = false) {
    searchExpanded = false;
    if (restoreFocus) {
      await tick();
      searchPillEl?.focus();
    }
  }

  function selectView(next: string) {
    const view = views.find((item) => item.value === next);
    if (view && view.value !== viewMode) onViewModeChange(view.value);
  }
</script>

<div
  class="mobile-rail-wrap"
  class:is-hidden={hidden}
  aria-hidden={hidden || undefined}
  inert={hidden || undefined}
>
  <div class="mobile-rail app-glass">
    {#if searchExpanded}
      <div class="flex min-w-0 flex-1 items-center gap-1.5">
        <SearchInput
          bind:element={searchInputEl}
          value={query}
          ariaLabel="Search the library"
          placeholder="Search the library…"
          class="h-8 min-w-0 flex-1 border-border-default bg-surface-1"
          oninput={(event) => onQueryChange(event.currentTarget.value)}
          onClear={() => onQueryChange("")}
          onkeydown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              void closeSearch(true);
            }
          }}
        />
        <Button variant="ghost" size="sm" onclick={() => void closeSearch(true)}>
          Done
        </Button>
      </div>
    {:else}
      <Button
        bind:ref={searchPillEl}
        variant="outline"
        size="sm"
        class="h-8 min-w-0 flex-1 justify-start gap-2 rounded-xs border-border-subtle bg-surface-1 px-2.5 font-normal hover:border-border-default"
        aria-label="Search the library"
        onclick={openSearch}
      >
        <Search class="size-3.5 shrink-0 text-text-muted" />
        {#if query}
          <span class="min-w-0 flex-1 truncate text-left text-text-primary">{query}</span>
        {:else}
          <span class="min-w-0 flex-1 truncate text-left text-text-disabled">Search…</span>
        {/if}
      </Button>

      {#if query}
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Clear search"
          onclick={() => onQueryChange("")}
        >
          <X class="size-3.5" />
        </Button>
      {/if}

      <div class="flex shrink-0 items-center gap-1">
        <Popover.Root bind:open={sortOpen}>
          <Popover.Trigger
            class={buttonVariants({ variant: "ghost", size: "icon-sm" })}
            title={`Sort: ${activeSortLabel}`}
            aria-label={`Sort by (${activeSortLabel})`}
          >
            {#if sortBy === ENTITY_GRID_SORT.random}
              <Shuffle class="size-3.5" />
            {:else if ascending}
              <ArrowUpNarrowWide class="size-3.5" />
            {:else}
              <ArrowDownWideNarrow class="size-3.5" />
            {/if}
          </Popover.Trigger>
          <Popover.Content align="end" aria-label="Sort options" class="w-56 gap-2 p-2.5">
            <div class="flex items-center justify-between px-1.5 pt-0.5">
              <span class="text-kicker text-text-muted">Sort order</span>
              {#if sortBy === ENTITY_GRID_SORT.random}
                <Button variant="ghost" size="xs" onclick={onReshuffle}>
                  <Shuffle class="size-3" />
                  Reshuffle
                </Button>
              {:else}
                <Button
                  variant="ghost"
                  size="xs"
                  onclick={() =>
                    onSortDirChange(
                      ascending
                        ? ENTITY_SORT_DIRECTION.descending
                        : ENTITY_SORT_DIRECTION.ascending,
                    )}
                >
                  {#if ascending}
                    <ArrowUpNarrowWide class="size-3" />
                    Ascending
                  {:else}
                    <ArrowDownWideNarrow class="size-3" />
                    Descending
                  {/if}
                </Button>
              {/if}
            </div>
            <Separator />
            <div class="flex flex-col gap-0.5" role="radiogroup" aria-label="Sort field">
              {#each sortOptions as option (option.value)}
                {@const selected = option.value === sortBy}
                <Button
                  variant={selected ? "secondary" : "ghost"}
                  size="sm"
                  role="radio"
                  aria-checked={selected}
                  class="justify-start"
                  onclick={() => {
                    onSortByChange(option.value);
                    sortOpen = false;
                  }}
                >
                  <Check class={cn("size-3.5 shrink-0", !selected && "invisible")} />
                  <span>{option.label}</span>
                </Button>
              {/each}
            </div>
          </Popover.Content>
        </Popover.Root>

        <Button
          variant={drawerOpen || activeFilterCount > 0 ? "secondary" : "outline"}
          size="sm"
          aria-label="Filters"
          aria-expanded={drawerOpen}
          class="gap-1.5 px-2.5"
          onclick={() => onDrawerOpenChange(!drawerOpen)}
        >
          <SlidersHorizontal class="size-3.5" />
          <span class="text-label">Filter</span>
          {#if activeFilterCount > 0}
            <Badge class="h-4 min-w-4 justify-center px-1 font-mono text-[10px]">
              {activeFilterCount}
            </Badge>
          {/if}
        </Button>

        <Popover.Root bind:open={displayOpen}>
          <Popover.Trigger
            class={buttonVariants({ variant: "ghost", size: "icon-sm" })}
            title="Display and presets"
            aria-label="Display and presets"
          >
            <Ellipsis class="size-4" />
          </Popover.Trigger>
          <Popover.Content align="end" aria-label="Display and presets" class="w-72 gap-3 p-3.5">
            <div class="space-y-2">
              <div class="text-kicker text-text-muted">View mode</div>
              <ToggleGroup.Root
                type="single"
                variant="outline"
                size="sm"
                class="w-full"
                aria-label="View mode"
                bind:value={() => viewMode, selectView}
              >
                {#each views as view (view.value)}
                  <ToggleGroup.Item value={view.value} aria-label={`${view.label} view`} class="flex-1 gap-1.5">
                    <view.icon class="size-3.5" />
                    <span>{view.label}</span>
                  </ToggleGroup.Item>
                {/each}
              </ToggleGroup.Root>
            </div>

            {#if viewMode !== ENTITY_GRID_VIEW_MODE.list}
              <div class="space-y-2">
                <div class="flex items-center justify-between text-xs">
                  <span class="text-text-secondary">Thumbnail columns</span>
                  <span class="font-mono text-text-muted">{scale}</span>
                </div>
                <div class="flex items-center gap-2.5">
                  <Grid2x2 class="size-3.5 shrink-0 text-text-disabled" aria-hidden="true" />
                  <Slider
                    type="single"
                    min={minScale}
                    max={maxScale}
                    step={1}
                    bind:value={() => scale, onScaleChange}
                    thumbLabel="Thumbnail columns"
                  />
                  <Grid3x3 class="size-4 shrink-0 text-text-disabled" aria-hidden="true" />
                </div>
              </div>

              <label class="flex cursor-pointer items-center justify-between gap-3 py-0.5">
                <span class="text-xs text-text-secondary">Media wall (hide captions)</span>
                <Toggle
                  ariaLabel="Media wall"
                  checked={mediaWall}
                  size="sm"
                  onchange={(next) => onMediaWallChange(next)}
                />
              </label>
            {/if}

            <Separator />

            <div class="space-y-2">
              <div class="flex items-center gap-1.5 text-kicker text-text-muted">
                <Bookmark class="size-3" />
                <span>Filter presets</span>
              </div>
              <EntityGridPresetMenuContent
                {activePresetId}
                {presets}
                open={displayOpen}
                compact
                idPrefix={`${id}-mobile-presets`}
                {onApplyPreset}
                {onDeletePreset}
                {onOverwritePreset}
                {onSavePreset}
                onClose={() => (displayOpen = false)}
              />
            </div>
          </Popover.Content>
        </Popover.Root>
      </div>
    {/if}
  </div>
</div>

<style>
  .mobile-rail-wrap {
    pointer-events: auto;
    transition: transform 200ms cubic-bezier(0.22, 1, 0.36, 1), opacity 160ms ease;
    will-change: transform, opacity;
  }

  .mobile-rail-wrap.is-hidden {
    transform: translateY(calc(-100% - 0.65rem));
    opacity: 0;
    pointer-events: none;
  }

  .mobile-rail {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.35rem;
    min-height: 3rem;
    padding: 0.35rem 0.45rem;
    border-radius: var(--radius-sm, 6px);
    box-shadow: var(--shadow-panel);
  }

  .mobile-rail::before {
    content: "";
    position: absolute;
    inset: 0 var(--radius-sm, 6px) auto var(--radius-sm, 6px);
    height: 2px;
    background: linear-gradient(
      to right,
      transparent 0%,
      color-mix(in srgb, var(--toolbar-page-accent) 46%, transparent) 12%,
      color-mix(in srgb, var(--toolbar-page-accent) 78%, #c7c9cc) 50%,
      color-mix(in srgb, var(--toolbar-page-accent) 46%, transparent) 88%,
      transparent 100%
    );
    pointer-events: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .mobile-rail-wrap {
      transition: none;
    }
  }
</style>

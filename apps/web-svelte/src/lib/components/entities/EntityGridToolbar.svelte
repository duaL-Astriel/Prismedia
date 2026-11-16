<script lang="ts">
  import { onMount } from "svelte";
  import type { FilterPreset } from "$lib/filter-presets";
  import { entityGridFilterFromId } from "$lib/entities/entity-grid";
  import type {
    EntityGridFilterOption,
    EntityGridSort,
    EntityGridSortDir,
    EntityGridViewMode,
  } from "$lib/entities/entity-grid";
  import EntityGridFilterDrawer from "./EntityGridFilterDrawer.svelte";
  import EntityGridToolbarActiveFilters from "./EntityGridToolbarActiveFilters.svelte";
  import EntityGridToolbarHero from "./EntityGridToolbarHero.svelte";
  import { EntityGridToolbarCollapseController } from "./entity-grid-toolbar-collapse-controller.svelte";

  interface Props {
    activeFilterIds: string[];
    activePresetId?: string | null;
    /** Persisted collapse state for the secondary toolbar rows; seeds the initial view. */
    barsCollapsed?: boolean;
    canClearFilters: boolean;
    /** When true, exposes the vertical feed view mode toggle. */
    enableFeedView?: boolean;
    drawerOpen: boolean;
    /** Kind code of the grid, used to offer kind-specific sorts (e.g. references for taxonomy). */
    entityKind?: string;
    filterOptions: EntityGridFilterOption[];
    /** Hide the book type/format chips (constrained views that already lock those filters). */
    lockBookFilters?: boolean;
    maxScale: number;
    minScale: number;
    onActiveFilterIdsChange: (ids: string[]) => void;
    onApplyPreset: (preset: FilterPreset) => void;
    /** Fired when the user manually collapses/expands the secondary rows, so the state can persist. */
    onBarsCollapsedChange?: (collapsed: boolean) => void;
    onClearFilters: () => void;
    onDeletePreset: (id: string) => void;
    onDrawerOpenChange: (open: boolean) => void;
    onOverwritePreset: (id: string) => void;
    onQueryChange: (query: string) => void;
    onMediaWallChange: (mediaWall: boolean) => void;
    onSavePreset: (name: string) => void;
    onScaleChange: (scale: number) => void;
    onSortByChange: (sortBy: EntityGridSort) => void;
    onSortDirChange: (sortDir: EntityGridSortDir) => void;
    onReshuffle: () => void;
    onViewModeChange: (viewMode: EntityGridViewMode) => void;
    presets: FilterPreset[];
    mediaWall: boolean;
    query: string;
    scale: number;
    sortBy: EntityGridSort;
    sortDir: EntityGridSortDir;
    viewMode: EntityGridViewMode;
  }

  let {
    activeFilterIds,
    activePresetId = null,
    barsCollapsed: initialBarsCollapsed = false,
    canClearFilters,
    enableFeedView = false,
    drawerOpen,
    entityKind,
    filterOptions,
    lockBookFilters = false,
    maxScale,
    minScale,
    onActiveFilterIdsChange,
    onApplyPreset,
    onBarsCollapsedChange,
    onClearFilters,
    onDeletePreset,
    onDrawerOpenChange,
    onOverwritePreset,
    onQueryChange,
    onMediaWallChange,
    onSavePreset,
    onScaleChange,
    onSortByChange,
    onSortDirChange,
    onReshuffle,
    onViewModeChange,
    presets,
    mediaWall,
    query,
    scale,
    sortBy,
    sortDir,
    viewMode,
  }: Props = $props();

  const activeFilters = $derived(
    activeFilterIds
      .map((id) => entityGridFilterFromId(id, filterOptions))
      .filter((option): option is EntityGridFilterOption => Boolean(option)),
  );

  // The active-filter chip row is the secondary toolbar row that can be collapsed
  // to keep the bar compact (especially on mobile). Selection actions live in the
  // grid's floating bar instead, so they are never collapsed or scrolled away.
  const hasCollapsibleRows = $derived(activeFilters.length > 0 || canClearFilters);

  // A persisted value seeds this mount; later prop changes must not overwrite a
  // manual in-session choice or the controller's scroll-driven compact state.
  // svelte-ignore state_referenced_locally
  const collapse = new EntityGridToolbarCollapseController(
    initialBarsCollapsed,
    (collapsed) => onBarsCollapsedChange?.(collapsed),
  );

  onMount(() => collapse.connectScroll());

  const filterDrawerId = `${$props.id()}-filters`;
</script>

<div class="toolbar-shell">
  <div class="toolbar-stack">
    <EntityGridToolbarHero
      activeFilterCount={activeFilterIds.length}
      {activePresetId}
      barsCollapsed={collapse.barsCollapsed}
      {drawerOpen}
      {enableFeedView}
      {entityKind}
      {filterDrawerId}
      {hasCollapsibleRows}
      {maxScale}
      {mediaWall}
      {minScale}
      {onApplyPreset}
      {onDeletePreset}
      {onDrawerOpenChange}
      {onMediaWallChange}
      {onOverwritePreset}
      {onQueryChange}
      {onReshuffle}
      {onSavePreset}
      {onScaleChange}
      {onSortByChange}
      {onSortDirChange}
      onToggleCollapse={() => collapse.toggle()}
      {onViewModeChange}
      {presets}
      {query}
      {scale}
      {sortBy}
      {sortDir}
      {viewMode}
    />

    {#if !collapse.barsCollapsed && (activeFilters.length > 0 || canClearFilters)}
      <EntityGridToolbarActiveFilters
        {activeFilterIds}
        {activeFilters}
        {canClearFilters}
        {onActiveFilterIdsChange}
        {onClearFilters}
      />
    {/if}

    {#if drawerOpen}
      <div
        id={filterDrawerId}
        class="filter-drawer-panel"
        role="region"
        aria-label="Filter options"
      >
        <EntityGridFilterDrawer
          {activeFilterIds}
          {filterOptions}
          {entityKind}
          {lockBookFilters}
          {onActiveFilterIdsChange}
        />
      </div>
    {/if}
  </div>
</div>

<style>
  .toolbar-shell {
    position: sticky;
    top: var(--prismedia-canvas-header-height, 3.5rem);
    /* Float above grid cards (2), detail sections (3), and pagination (4), below bulk-dock (30) and header (40). */
    z-index: 20;
    display: flex;
    flex-direction: column;
    padding-top: 0.5rem;
    background: transparent;
    pointer-events: none;

    --toolbar-detail-border: var(--color-border, #1c2235);
    --toolbar-detail-glass: rgb(12 15 21);
    --toolbar-detail-slideout-inset: 5px;
    --toolbar-bar-overlap: 0.5rem;
    --toolbar-page-accent: var(--page-accent, var(--entity-accent, #739b96));
  }

  .toolbar-shell::before {
    display: none;
  }

  .toolbar-stack {
    position: relative;
    display: flex;
    flex-direction: column;
    min-width: 0;
    pointer-events: auto;
  }

  /*
   * Anchor the filter panel to the sticky toolbar stack so it moves with the
   * search bar and floats over the element grid without shifting scroll.
   */
  .filter-drawer-panel {
    position: absolute;
    top: calc(100% + 0.35rem);
    left: 0;
    right: 0;
    z-index: 2;
    max-height: max(
      11rem,
      calc(
        100dvh - var(--prismedia-canvas-header-height, 3.5rem) -
          var(--prismedia-mobile-bottom-clearance, 5rem) - 10rem
      )
    );
    overflow-y: auto;
    overscroll-behavior: contain;
    border: 1px solid var(--toolbar-detail-border, var(--color-border-default));
    border-radius: var(--radius-sm, 6px);
    background: var(--color-surface-1, #111214);
    box-shadow: var(--shadow-elevated);
  }

  .filter-drawer-panel > :global(.surface-well) {
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }

  @media (min-width: 768px) {
    .filter-drawer-panel {
      max-height: max(
        14rem,
        min(
          38rem,
          calc(
            100dvh - var(--prismedia-canvas-header-height, 3.5rem) -
              var(--prismedia-desktop-bottom-clearance, 0px) - 11rem
          )
        )
      );
    }
  }

  .toolbar-stack :global(.toolbar-bar) {
    position: relative;
    display: flex;
    align-items: center;
    min-width: 0;
    margin-inline: var(--toolbar-detail-slideout-inset);
    margin-top: calc(-1 * var(--toolbar-bar-overlap));
    border: 1px solid var(--toolbar-detail-border);
    border-top: 0;
    border-radius: 0 0 var(--radius-md, 10px) var(--radius-md, 10px);
    background: var(--toolbar-detail-glass);
  }

</style>

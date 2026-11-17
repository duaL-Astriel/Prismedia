<script lang="ts">
  import { browser } from "$app/environment";
  import { onMount } from "svelte";
  import type { FilterPreset } from "$lib/filter-presets";
  import { entityGridFilterFromId } from "$lib/entities/entity-grid";
  import { ENTITY_GRID_MOBILE_QUERY } from "$lib/entities/entity-grid-display";
  import type {
    EntityGridFilterOption,
    EntityGridSort,
    EntityGridSortDir,
    EntityGridViewMode,
  } from "$lib/entities/entity-grid";
  import type { EntityPickerItem } from "$lib/components/forms/EntityPicker.svelte";
  import EntityGridFilterDrawer from "./EntityGridFilterDrawer.svelte";
  import EntityGridMobileRail from "./EntityGridMobileRail.svelte";
  import EntityGridToolbarActiveFilters from "./EntityGridToolbarActiveFilters.svelte";
  import EntityGridToolbarHero from "./EntityGridToolbarHero.svelte";
  import { EntityGridMobileHeadroomController } from "./entity-grid-mobile-headroom.svelte";
  import { EntityGridToolbarCollapseController } from "./entity-grid-toolbar-collapse-controller.svelte";

  interface Props {
    activeFilterIds: string[];
    activePresetId?: string | null;
    /** Persisted collapse state for the secondary toolbar rows; seeds the initial view. */
    barsCollapsed?: boolean;
    canClearFilters: boolean;
    /** Whether the toolbar docks as a sticky header; disables scroll headroom when static. */
    dockControls?: boolean;
    /** When true, exposes the vertical feed view mode toggle. */
    enableFeedView?: boolean;
    drawerOpen: boolean;
    /** Kind code of the grid, used to offer kind-specific sorts (e.g. references for taxonomy). */
    entityKind?: string;
    filterOptions: EntityGridFilterOption[];
    /** Whether tag autocomplete searches should suppress NSFW tags. */
    hideNsfw?: boolean;
    /** Resolved tag items keyed by tag ID, supplied by the parent EntityGrid. */
    knownTags?: ReadonlyMap<string, EntityPickerItem>;
    /** Hide the book type/format chips (constrained views that already lock those filters). */
    lockBookFilters?: boolean;
    /** Hide the person credit-role chips (constrained views that already lock a role scope). */
    lockPersonRoleFilters?: boolean;
    maxScale: number;
    minScale: number;
    /** Explicit mobile layout override; defaults to matching `(max-width: 639.98px)`. */
    mobile?: boolean;
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
    /** Reports newly picked tag items so parent toolbars can render full tag titles. */
    onTagItemsKnown?: (items: EntityPickerItem[]) => void;
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
    dockControls = true,
    enableFeedView = false,
    drawerOpen,
    entityKind,
    filterOptions,
    hideNsfw = false,
    knownTags,
    lockBookFilters = false,
    lockPersonRoleFilters = false,
    maxScale,
    minScale,
    mobile: mobileOverride,
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
    onTagItemsKnown,
    onViewModeChange,
    presets,
    mediaWall,
    query,
    scale,
    sortBy,
    sortDir,
    viewMode,
  }: Props = $props();

  let shellEl = $state<HTMLDivElement | null>(null);
  let mediaMatchesMobile = $state(
    browser && typeof window.matchMedia === "function"
      ? window.matchMedia(ENTITY_GRID_MOBILE_QUERY).matches
      : false,
  );
  let mobilePinnedOpen = $state(false);

  const isMobile = $derived(mobileOverride ?? mediaMatchesMobile);
  const activeFilters = $derived(
    activeFilterIds
      .map((id) => entityGridFilterFromId(id, filterOptions))
      .filter((option): option is EntityGridFilterOption => Boolean(option)),
  );

  // The active-filter chip row is the secondary toolbar row that can be collapsed
  // to keep the bar compact (especially on desktop). Selection actions live in the
  // grid's floating bar instead, so they are never collapsed or scrolled away.
  const hasCollapsibleRows = $derived(activeFilters.length > 0 || canClearFilters);

  // A persisted value seeds this mount; later prop changes must not overwrite a
  // manual in-session choice or the controller's scroll-driven compact state.
  // svelte-ignore state_referenced_locally
  const collapse = new EntityGridToolbarCollapseController(
    initialBarsCollapsed,
    (collapsed) => onBarsCollapsedChange?.(collapsed),
  );

  const headroom = new EntityGridMobileHeadroomController(
    () => isMobile && dockControls,
    () => drawerOpen || mobilePinnedOpen,
  );

  const toolbarId = $props.id();
  const filterDrawerId = `${toolbarId}-filters`;

  onMount(() => {
    const cleanups: (() => void)[] = [];
    if (mobileOverride === undefined && typeof window.matchMedia === "function") {
      const mql = window.matchMedia(ENTITY_GRID_MOBILE_QUERY);
      mediaMatchesMobile = mql.matches;
      const onChange = (event: MediaQueryListEvent) => {
        mediaMatchesMobile = event.matches;
      };
      mql.addEventListener("change", onChange);
      cleanups.push(() => mql.removeEventListener("change", onChange));
    }
    cleanups.push(collapse.connectScroll());
    return () => {
      for (const cleanup of cleanups) cleanup();
    };
  });

  $effect(() => {
    void isMobile;
    void dockControls;
    void drawerOpen;
    void mobilePinnedOpen;
    headroom.sync();
  });

  $effect(() => {
    if (!isMobile || !dockControls || !shellEl) return;
    return headroom.connect(shellEl);
  });
</script>

<div bind:this={shellEl} class="toolbar-shell" class:is-mobile={isMobile}>
  <div class="toolbar-stack" class:is-passthrough={isMobile && headroom.hidden}>
    {#if isMobile}
      <EntityGridMobileRail
        activeFilterCount={activeFilterIds.length}
        {activePresetId}
        {drawerOpen}
        {enableFeedView}
        {entityKind}
        hidden={headroom.hidden}
        {maxScale}
        {mediaWall}
        {minScale}
        {onApplyPreset}
        {onDeletePreset}
        {onDrawerOpenChange}
        {onMediaWallChange}
        {onOverwritePreset}
        onPinnedChange={(pinned) => (mobilePinnedOpen = pinned)}
        {onQueryChange}
        {onReshuffle}
        {onSavePreset}
        {onScaleChange}
        {onSortByChange}
        {onSortDirChange}
        {onViewModeChange}
        {presets}
        {query}
        {scale}
        {sortBy}
        {sortDir}
        {viewMode}
      />
    {:else}
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
            {lockPersonRoleFilters}
            {hideNsfw}
            {knownTags}
            {onTagItemsKnown}
            {onActiveFilterIdsChange}
          />
        </div>
      {/if}
    {/if}
  </div>
</div>

{#if isMobile && (activeFilters.length > 0 || canClearFilters)}
  <div class="mobile-active-filters">
    <EntityGridToolbarActiveFilters
      standalone
      {activeFilterIds}
      {activeFilters}
      {canClearFilters}
      {onActiveFilterIdsChange}
      {onClearFilters}
    />
  </div>
{/if}

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

  .toolbar-shell.is-mobile {
    padding-top: 0.35rem;
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

  .toolbar-stack.is-passthrough {
    pointer-events: none;
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
      14rem,
      min(
        38rem,
        calc(
          100dvh - var(--prismedia-canvas-header-height, 3.5rem) -
            var(--prismedia-desktop-bottom-clearance, 0px) - 11rem
        )
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

  .mobile-active-filters {
    min-width: 0;
  }
</style>

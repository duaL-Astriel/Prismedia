<script lang="ts">
  import type { ComponentProps } from "svelte";
  import EntityGridToolbar from "./EntityGridToolbar.svelte";

  let {
    barsCollapsed = false,
    onBarsCollapsedChange = () => {},
    canClearFilters = true,
    drawerOpen = false,
    onDrawerOpenChange = () => {},
  }: Partial<Pick<ComponentProps<typeof EntityGridToolbar>, "barsCollapsed" | "onBarsCollapsedChange" | "canClearFilters" | "drawerOpen" | "onDrawerOpenChange">> = $props();

  const noop = () => {};
</script>

<EntityGridToolbar
  activeFilterIds={[]}
  {barsCollapsed}
  {canClearFilters}
  {drawerOpen}
  filterOptions={[]}
  maxScale={12}
  minScale={2}
  onActiveFilterIdsChange={noop}
  onApplyPreset={noop}
  {onBarsCollapsedChange}
  onClearFilters={noop}
  onDeletePreset={noop}
  {onDrawerOpenChange}
  onMediaWallChange={noop}
  onOverwritePreset={noop}
  onQueryChange={noop}
  onReshuffle={noop}
  onSavePreset={noop}
  onScaleChange={noop}
  onSortByChange={noop}
  onSortDirChange={noop}
  onViewModeChange={noop}
  presets={[]}
  mediaWall={false}
  query=""
  scale={6}
  sortBy="title"
  sortDir="asc"
  viewMode="grid"
/>

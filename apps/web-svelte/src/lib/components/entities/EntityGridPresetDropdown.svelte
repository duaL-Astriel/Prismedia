<script lang="ts">
  import { Bookmark, X } from "@lucide/svelte";
  import { buttonVariants, Popover } from "@prismedia/ui-svelte";
  import type { FilterPreset } from "$lib/filter-presets";
  import EntityGridPresetMenuContent from "./EntityGridPresetMenuContent.svelte";

  interface Props {
    activePresetId?: string | null;
    onApplyPreset?: (preset: FilterPreset) => void;
    onDeletePreset?: (id: string) => void;
    onOverwritePreset?: (id: string) => void;
    onSavePreset?: (name: string) => void;
    presets?: FilterPreset[];
  }

  let {
    activePresetId = null,
    onApplyPreset,
    onDeletePreset,
    onOverwritePreset,
    onSavePreset,
    presets = [],
  }: Props = $props();

  const id = $props.id();
  let open = $state(false);
  const activePreset = $derived(presets.find((preset) => preset.id === activePresetId));

  function close() {
    open = false;
  }
</script>

<Popover.Root bind:open>
  <Popover.Trigger
    class={buttonVariants({ variant: "secondary", size: "md" })}
    title={activePreset ? `Preset: ${activePreset.name}` : "Filter presets"}
    aria-label={activePreset?.name ?? "Presets"}
  >
    <Bookmark class="size-3.5" />
    <span class="hidden max-w-36 truncate min-[520px]:inline">{activePreset?.name ?? "Presets"}</span>
  </Popover.Trigger>
  <Popover.Content align="end" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}>
    <Popover.Header>
      <div class="flex items-center justify-between gap-2">
        <Popover.Title id={`${id}-title`}>Filter presets</Popover.Title>
        <Popover.Close class={buttonVariants({ variant: "ghost", size: "icon" })} aria-label="Close presets">
          <X class="size-4" />
        </Popover.Close>
      </div>
      <Popover.Description id={`${id}-description`}>Save a view to return to it later.</Popover.Description>
    </Popover.Header>

    <EntityGridPresetMenuContent
      {activePresetId}
      {presets}
      {open}
      idPrefix={id}
      {onApplyPreset}
      {onDeletePreset}
      {onOverwritePreset}
      {onSavePreset}
      onClose={close}
    />
  </Popover.Content>
</Popover.Root>

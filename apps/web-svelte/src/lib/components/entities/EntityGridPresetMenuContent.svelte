<script lang="ts">
  import { Check, Plus, Trash2 } from "@lucide/svelte";
  import { Button, cn, Separator, TextInput } from "@prismedia/ui-svelte";
  import type { FilterPreset } from "$lib/filter-presets";

  interface Props {
    activePresetId?: string | null;
    presets?: FilterPreset[];
    open?: boolean;
    compact?: boolean;
    idPrefix?: string;
    onApplyPreset?: (preset: FilterPreset) => void;
    onDeletePreset?: (id: string) => void;
    onOverwritePreset?: (id: string) => void;
    onSavePreset?: (name: string) => void;
    onClose?: () => void;
  }

  let {
    activePresetId = null,
    presets = [],
    open = false,
    compact = false,
    idPrefix = "presets",
    onApplyPreset,
    onDeletePreset,
    onOverwritePreset,
    onSavePreset,
    onClose,
  }: Props = $props();

  let nameInput = $state<HTMLInputElement | null>(null);
  let saveName = $state("");
  let saving = $state<"idle" | "name" | "confirm">("idle");
  const activePreset = $derived(presets.find((preset) => preset.id === activePresetId));

  $effect(() => {
    if (open) {
      saving = "idle";
      saveName = "";
    }
  });

  $effect(() => {
    if (saving === "name" && nameInput) nameInput.focus();
  });

  function resetForm() {
    saving = "idle";
    saveName = "";
  }

  function save(event: SubmitEvent) {
    event.preventDefault();
    const trimmed = saveName.trim();
    if (!trimmed) return;
    onSavePreset?.(trimmed);
    onClose?.();
  }
</script>

{#if presets.length > 0}
  <div
    class={cn("flex flex-col gap-1 overflow-y-auto", compact ? "max-h-40" : "max-h-56")}
    role="group"
    aria-label="Saved presets"
  >
    {#each presets as preset (preset.id)}
      <div class="flex items-center gap-1">
        <Button
          variant={preset.id === activePresetId ? "secondary" : "ghost"}
          size={compact ? "sm" : "md"}
          class="min-w-0 flex-1 justify-start"
          aria-label={`Apply preset ${preset.name}`}
          aria-pressed={preset.id === activePresetId}
          onclick={() => {
            onApplyPreset?.(preset);
            onClose?.();
          }}
        >
          <Check class={cn("size-3.5 shrink-0", preset.id !== activePresetId && "invisible")} />
          <span class="truncate">{preset.name}</span>
        </Button>
        <Button
          variant="ghost"
          size={compact ? "icon-sm" : "icon"}
          aria-label={`Delete preset ${preset.name}`}
          onclick={() => onDeletePreset?.(preset.id)}
        >
          <Trash2 class="size-3.5" />
        </Button>
      </div>
    {/each}
  </div>
{:else}
  <p class={cn("text-text-muted", compact ? "py-1 text-xs" : "py-2 text-sm")}>No saved presets</p>
{/if}

{#if !compact}
  <Separator />
{/if}

{#if saving === "idle"}
  <Button
    variant="secondary"
    size={compact ? "sm" : "md"}
    class="w-full"
    onclick={() => (saving = activePreset ? "confirm" : "name")}
  >
    <Plus class="size-4" />Save current filters
  </Button>
{:else if saving === "name"}
  <form class="flex flex-col gap-3" onsubmit={save}>
    <label for={`${idPrefix}-name`} class="text-sm text-text-secondary">Preset name</label>
    <TextInput
      id={`${idPrefix}-name`}
      bind:ref={nameInput}
      value={saveName}
      maxlength={100}
      placeholder="e.g. Unread books"
      oninput={(event) => (saveName = event.currentTarget.value)}
    />
    <div class="flex justify-end gap-2">
      <Button variant="ghost" size={compact ? "sm" : "md"} onclick={resetForm}>Cancel</Button>
      <Button type="submit" size={compact ? "sm" : "md"} disabled={!saveName.trim()}>Save</Button>
    </div>
  </form>
{:else if saving === "confirm" && activePreset}
  <div class="flex flex-col gap-3">
    <p class="text-sm text-text-secondary">
      Replace the saved filters in <strong class="font-medium text-text-primary">{activePreset.name}</strong>?
    </p>
    <div class="flex flex-wrap justify-end gap-2">
      <Button variant="ghost" size={compact ? "sm" : "md"} onclick={resetForm}>Cancel</Button>
      <Button variant="secondary" size={compact ? "sm" : "md"} onclick={() => (saving = "name")}>Save as new</Button>
      <Button
        size={compact ? "sm" : "md"}
        onclick={() => {
          onOverwritePreset?.(activePreset.id);
          onClose?.();
        }}
      >
        Overwrite
      </Button>
    </div>
  </div>
{/if}

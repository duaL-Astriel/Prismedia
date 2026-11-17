<script lang="ts">
  import { Button, cn } from "@prismedia/ui-svelte";
  import type { UniversalLightboxEntity } from "./universal-lightbox-media";

  interface Props {
    entities: UniversalLightboxEntity[];
    index: number;
    onSelect: (index: number) => void;
  }

  let { entities, index, onSelect }: Props = $props();
  let thumbEls: Array<HTMLButtonElement | undefined> = $state([]);

  $effect(() => {
    const el = thumbEls[index];
    if (!el?.scrollIntoView) return;
    el.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  });
</script>

{#if entities.length > 1}
  <div class="thumb-strip">
    {#each entities as item, i (item.id)}
      <Button
        variant="outline"
        size="icon"
        onclick={() => onSelect(i)}
        bind:ref={() => thumbEls[i] ?? null, (next) => (thumbEls[i] = next ?? undefined)}
        class={cn(
          "size-13 shrink-0 overflow-hidden p-0 opacity-60 hover:opacity-100 sm:size-12",
          i === index && "border-ring opacity-100",
        )}
        aria-label={`Image ${i + 1}`}
      >
        {#if item.coverUrl}
          <img src={item.coverUrl} alt="" loading="lazy" class="size-full object-cover" />
        {:else}
          <span>{i + 1}</span>
        {/if}
      </Button>
    {/each}
  </div>
{/if}

<style>
  .thumb-strip {
    position: relative;
    z-index: 20;
    display: flex;
    gap: 0.35rem;
    overflow-x: auto;
    border-top: 1px solid var(--color-border-subtle, #1c2235);
    background: rgb(0 0 0 / 0.72);
    backdrop-filter: blur(var(--glass-blur-md));
    /* Keep the strip clear of the device's home indicator / gesture area so the
       thumbnails stay tappable instead of sitting flush against the edge. */
    padding: 0.4rem 0.5rem calc(0.4rem + env(safe-area-inset-bottom, 0px));
  }

  @media (max-width: 640px) {
    /* Larger, more separated targets and extra bottom clearance make the strip
       comfortable to use on touch devices. */
    .thumb-strip {
      gap: 0.45rem;
      padding: 0.5rem 0.5rem calc(0.55rem + env(safe-area-inset-bottom, 0px));
    }
  }
</style>

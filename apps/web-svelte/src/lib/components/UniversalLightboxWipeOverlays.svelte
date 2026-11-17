<script lang="ts">
  import NsfwBlur from "./nsfw/NsfwBlur.svelte";

  export interface LightboxWipePreview {
    src: string | null;
    isNsfw: boolean;
  }

  interface Props {
    outgoing: LightboxWipePreview | null;
    adjacent: (LightboxWipePreview & { offset: number }) | null;
    showOutgoing: boolean;
    outgoingOffsetX: number;
    transitionStyle: string;
  }

  let {
    outgoing,
    adjacent,
    showOutgoing,
    outgoingOffsetX,
    transitionStyle,
  }: Props = $props();
</script>

{#snippet previewContent(src: string | null, isNsfw: boolean)}
  <NsfwBlur {isNsfw} class="lightbox-media-guard">
    {#if src}
      <img
        {src}
        alt=""
        aria-hidden="true"
        class="lightbox-wipe-preview-image"
        draggable="false"
      />
    {/if}
  </NsfwBlur>
{/snippet}

{#if outgoing && showOutgoing}
  <div
    class="lightbox-wipe-pane pointer-events-none"
    data-lightbox-wipe-outgoing
    style:transform={`translate3d(${outgoingOffsetX}px, 0, 0)`}
    style:transition={transitionStyle}
  >
    {@render previewContent(outgoing.src, outgoing.isNsfw)}
  </div>
{/if}

{#if adjacent}
  <div
    class="lightbox-wipe-pane pointer-events-none"
    data-lightbox-wipe-adjacent
    style:transform={`translate3d(${adjacent.offset}px, 0, 0)`}
  >
    {@render previewContent(adjacent.src, adjacent.isNsfw)}
  </div>
{/if}

<style>
  .lightbox-wipe-pane {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    will-change: transform;
  }

  .lightbox-wipe-pane :global(.lightbox-media-guard) {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
  }

  .lightbox-wipe-preview-image {
    max-width: 98%;
    max-height: 98%;
    object-fit: contain;
    pointer-events: none;
    user-select: none;
  }
</style>

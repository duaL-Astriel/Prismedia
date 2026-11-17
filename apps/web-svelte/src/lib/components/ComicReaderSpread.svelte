<script lang="ts">
  import { ChevronRight } from "@lucide/svelte";
  import { Button } from "@prismedia/ui-svelte";
  import type { ImageListItemDto } from "$lib/entities/media-view-models";
  import NsfwBlur from "./nsfw/NsfwBlur.svelte";
  import { COMIC_FIT_MODE, type ComicFitMode } from "./comic-reader";

  interface Props {
    spreadImages: ImageListItemDto[];
    isEndPage: boolean;
    interactive: boolean;
    fitMode: ComicFitMode;
    spreadClass: string;
    blurClass: string;
    imageClass: string;
    hasNextChapter: boolean;
    chapterEndTitle: string;
    chapterEndActionLabel: string;
    nextChapterBusy: boolean;
    imageSrc: (image: ImageListItemDto) => string;
    onChapterEndAction: () => void;
  }

  let {
    spreadImages,
    isEndPage,
    interactive,
    fitMode,
    spreadClass,
    blurClass,
    imageClass,
    hasNextChapter,
    chapterEndTitle,
    chapterEndActionLabel,
    nextChapterBusy,
    imageSrc,
    onChapterEndAction,
  }: Props = $props();
</script>

{#if isEndPage}
  <div class="my-auto flex w-full flex-col items-center justify-center">
    <div class="reader-next-chapter-page text-center">
      <div class="font-mono text-[0.64rem] uppercase tracking-[0.18em] text-text-accent">
        {hasNextChapter ? "Next Chapter" : "No next chapter"}
      </div>
      <h3 class="mt-3 max-w-[32rem] text-center font-heading text-2xl font-semibold text-text-primary sm:text-4xl">
        {chapterEndTitle}
      </h3>
      {#if interactive}
        <Button
          variant="outline"
          size="sm"
          type="button"
          data-reader-control
          onclick={onChapterEndAction}
          disabled={nextChapterBusy}
          class="mt-6"
        >
          {chapterEndActionLabel}
          <ChevronRight class="h-4 w-4" />
        </Button>
      {/if}
    </div>
  </div>
{:else}
  <div
    class={fitMode === COMIC_FIT_MODE.screen
      ? `${spreadClass} ${spreadImages.length > 1 ? "max-w-7xl" : "max-w-5xl"}`
      : spreadClass}
  >
    {#each spreadImages as image (image.id)}
      <NsfwBlur isNsfw={false} class={blurClass}>
        <img
          src={imageSrc(image)}
          alt={interactive ? image.title : ""}
          aria-hidden={interactive ? undefined : true}
          class={imageClass}
          loading={interactive ? "eager" : undefined}
          decoding={interactive ? "sync" : undefined}
          draggable="false"
        />
      </NsfwBlur>
    {/each}
  </div>
{/if}

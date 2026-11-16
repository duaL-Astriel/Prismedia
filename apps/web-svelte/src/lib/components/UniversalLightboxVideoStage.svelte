<script lang="ts">
  import { PLAYBACK_MODE } from "$lib/api/generated/codes";
  import { positiveNumberValue } from "$lib/utils/format";
  import VideoPlayer, { type VideoPlayerHandle } from "./VideoPlayer.svelte";
  import type { UniversalLightboxVideoSource } from "./universal-lightbox-media";

  interface Props {
    usesNativeAnimatedVideo: boolean;
    videoSources: UniversalLightboxVideoSource[];
    primaryVideoSource: UniversalLightboxVideoSource | null;
    mediaKey: string | null;
    technicalWidth?: number | string | null;
    technicalHeight?: number | string | null;
    initialAspectRatio?: { width: number; height: number } | null;
    primaryVideoCodec?: string | null;
    fallbackPoster?: string;
    videoMuted: boolean;
    videoReady: boolean;
    videoIntrinsicW: number;
    videoIntrinsicH: number;
    nativeVideoEl?: HTMLVideoElement;
    videoPlayerHandle?: VideoPlayerHandle;
    stageEl?: HTMLDivElement;
    onMutedChange: (muted: boolean) => void;
    onReadyChange: (ready: boolean) => void;
    onDimensionsChange: (width: number, height: number) => void;
  }

  let {
    usesNativeAnimatedVideo,
    videoSources,
    primaryVideoSource,
    mediaKey,
    technicalWidth,
    technicalHeight,
    initialAspectRatio,
    primaryVideoCodec,
    fallbackPoster,
    videoMuted,
    videoReady,
    videoIntrinsicW,
    videoIntrinsicH,
    nativeVideoEl = $bindable(),
    videoPlayerHandle = $bindable(),
    stageEl,
    onMutedChange,
    onReadyChange,
    onDimensionsChange,
  }: Props = $props();

  const currentVideoFit = $derived.by(() => {
    const width =
      positiveNumberValue(technicalWidth) ??
      positiveNumberValue(videoIntrinsicW) ??
      positiveNumberValue(initialAspectRatio?.width);
    const height =
      positiveNumberValue(technicalHeight) ??
      positiveNumberValue(videoIntrinsicH) ??
      positiveNumberValue(initialAspectRatio?.height);
    if (!width || !height) return null;

    return {
      aspectRatio: `${width} / ${height}`,
      widthToHeightRatio: width / height,
    };
  });

  function rememberVideoDimensions(video: HTMLVideoElement | null | undefined) {
    const nextW = video?.videoWidth || videoIntrinsicW;
    const nextH = video?.videoHeight || videoIntrinsicH;
    onDimensionsChange(nextW, nextH);
  }

  function handleVideoCanPlay() {
    rememberVideoDimensions(stageEl?.querySelector("video"));
    onReadyChange(true);
  }

  async function handleNativeVideoCanPlay(event: Event) {
    const video = event.currentTarget as HTMLVideoElement;
    rememberVideoDimensions(video);
    onReadyChange(true);
    if (!video.paused) return;
    try {
      await video.play();
    } catch {
      // Muted autoplay is requested declaratively as well; native controls remain available
      // if a browser policy still requires an explicit user gesture.
    }
  }

  function handleNativeVolumeChange(event: Event) {
    onMutedChange((event.currentTarget as HTMLVideoElement).muted);
  }
</script>

{#if usesNativeAnimatedVideo && videoSources.length > 0}
  <div
    class="lightbox-video-shell"
    class:has-natural-ratio={Boolean(currentVideoFit)}
    class:is-ready={videoReady}
    style={`--lightbox-video-aspect-ratio: ${currentVideoFit?.aspectRatio ?? "16 / 9"}; --lightbox-video-width-ratio: ${currentVideoFit?.widthToHeightRatio ?? 1.7777777778};`}
  >
    {#if fallbackPoster}
      <img class="lightbox-video-poster" src={fallbackPoster} alt="" aria-hidden="true" />
    {/if}
    {#key mediaKey}
      <video
        bind:this={nativeVideoEl}
        class="lightbox-native-video"
        controls
        autoplay
        loop
        playsinline
        muted={videoMuted}
        poster={fallbackPoster}
        onloadedmetadata={handleNativeVideoCanPlay}
        oncanplay={handleNativeVideoCanPlay}
        onvolumechange={handleNativeVolumeChange}
      >
        {#each videoSources as source (`${source.quality}:${source.src}`)}
          <source src={source.src} type={source.type ?? undefined} />
        {/each}
      </video>
    {/key}
  </div>
{:else if primaryVideoSource}
  <div
    class="lightbox-video-shell"
    class:has-natural-ratio={Boolean(currentVideoFit)}
    class:is-ready={videoReady}
    style={`--lightbox-video-aspect-ratio: ${currentVideoFit?.aspectRatio ?? "16 / 9"}; --lightbox-video-width-ratio: ${currentVideoFit?.widthToHeightRatio ?? 1.7777777778};`}
  >
    {#if fallbackPoster}
      <img class="lightbox-video-poster" src={fallbackPoster} alt="" aria-hidden="true" />
    {/if}
    <VideoPlayer
      bind:handle={videoPlayerHandle}
      directSrc={primaryVideoSource.src}
      codec={primaryVideoCodec}
      sourceWidth={positiveNumberValue(technicalWidth)}
      sourceHeight={positiveNumberValue(technicalHeight)}
      poster={fallbackPoster}
      defaultPlaybackMode={PLAYBACK_MODE.direct}
      showCastControls={false}
      chrome="minimal"
      enableKeyboardShortcuts={false}
      initialMuted={videoMuted}
      onCanPlay={handleVideoCanPlay}
      autoPlay
      autoRepeat
    />
  </div>
{/if}

<style>
  .lightbox-video-shell {
    --lightbox-video-aspect-ratio: 16 / 9;
    --lightbox-video-max-height: calc((100dvh - 10rem) * 0.98);
    --lightbox-video-width-ratio: 1.7777777778;
    position: relative;
    display: flex;
    width: min(98dvw, 100%, calc(var(--lightbox-video-max-height) * var(--lightbox-video-width-ratio)));
    max-width: min(98dvw, 100%);
    height: auto;
    max-height: min(98%, var(--lightbox-video-max-height));
    aspect-ratio: var(--lightbox-video-aspect-ratio);
    align-items: center;
    justify-content: center;
    background: #000;
  }

  .lightbox-video-shell.has-natural-ratio {
    width: min(98dvw, 100%, calc(var(--lightbox-video-max-height) * var(--lightbox-video-width-ratio)));
  }

  .lightbox-video-shell :global(.prismedia-player-surface) {
    border: 0;
    background: transparent;
  }

  .lightbox-video-shell :global([data-testid="vidstack-video-player"]) {
    aspect-ratio: inherit;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: auto;
    max-width: 100%;
    max-height: 100%;
    opacity: 0;
    transition: opacity 160ms ease;
  }

  .lightbox-video-shell :global([data-testid="vidstack-video-player"] .prismedia-player-surface) {
    width: 100%;
    height: auto;
    max-height: 100%;
    aspect-ratio: inherit;
  }

  .lightbox-video-shell :global(.prismedia-media-engine) {
    width: 100%;
    height: auto;
    max-width: 100%;
    max-height: 100%;
    aspect-ratio: inherit;
  }

  .lightbox-video-poster {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
    opacity: 1;
    transition: opacity 160ms ease;
    /* The poster stacks above the in-flow video; once faded out it must not swallow
       the hover and clicks that reveal and drive the native controls. */
    pointer-events: none;
  }

  .lightbox-native-video {
    width: 100%;
    max-width: 100%;
    height: 100%;
    max-height: 100%;
    object-fit: contain;
    opacity: 0;
    transition: opacity 160ms ease;
  }

  .lightbox-video-shell.is-ready .lightbox-native-video {
    opacity: 1;
  }

  .lightbox-video-shell.is-ready :global([data-testid="vidstack-video-player"]) {
    opacity: 1;
  }

  .lightbox-video-shell.is-ready .lightbox-video-poster {
    opacity: 0;
  }
</style>

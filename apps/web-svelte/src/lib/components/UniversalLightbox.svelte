<script lang="ts">
  import { browser } from "$app/environment";
  import { onMount, untrack, type Snippet } from "svelte";
  import { Button, Dialog, cn } from "@prismedia/ui-svelte";
  import { getCapability } from "$lib/api/capabilities";
  import { positiveNumberValue } from "$lib/utils/format";
  import { createNavigationKeyHandler } from "$lib/keyboard/navigation-keyboard";
  import { CAPABILITY_KIND, ENTITY_KIND } from "$lib/entities/entity-codes";
  import { PLAYBACK_MODE } from "$lib/api/generated/codes";
  import NsfwBlur from "./nsfw/NsfwBlur.svelte";
  import UniversalLightboxChrome from "./UniversalLightboxChrome.svelte";
  import VideoPlayer, { type VideoPlayerHandle } from "./VideoPlayer.svelte";
  import {
    buildLightboxImageSources,
    buildLightboxPreloadSources,
    buildLightboxVideoSources,
    isLightboxVideoCapable,
    type UniversalLightboxEntity,
  } from "./universal-lightbox-media";
  import {
    calculateClampBounds,
    calculateFocalZoom,
    clampTranslation,
    clientToStage,
    createLightboxGestureHandler,
    isZoomedBeyondFit,
  } from "./universal-lightbox-zoom";

  interface Props {
    entities: UniversalLightboxEntity[];
    initialIndex: number;
    onClose: () => void;
    onIndexChange?: (index: number) => void;
    onRatingChange?: (entityId: string, rating: number | null) => void;
    detailsContent?: Snippet<[UniversalLightboxEntity]>;
    sharedKey?: string;
    showRatingControls?: boolean;
  }

  interface WarmedImageDimensions {
    width: number;
    height: number;
  }

  let {
    entities,
    initialIndex,
    onClose,
    onIndexChange,
    onRatingChange,
    detailsContent,
    showRatingControls = true,
  }: Props = $props();

  const MIN_SCALE = 0.3;
  const MAX_SCALE = 8;
  const DOUBLE_TAP_MS = 300;

  let navigationRoot = $state<HTMLDivElement | null>(null);
  let index = $state(untrack(() => initialIndex));
  let scale = $state(1);
  let translateX = $state(0);
  let translateY = $state(0);
  let fitScale = $state(1);
  let infoOpen = $state(false);
  let ready = $state(false);
  let naturalW = $state(0);
  let naturalH = $state(0);
  let ratingOverrides = $state<Record<string, number | null>>({});
  let stageEl: HTMLDivElement | undefined = $state();
  let imageEl: HTMLImageElement | undefined = $state();
  let nativeVideoEl: HTMLVideoElement | undefined = $state();
  let videoPlayerHandle: VideoPlayerHandle | undefined = $state();
  let videoMuted = $state(true);
  let videoReady = $state(false);
  let videoIntrinsicW = $state(0);
  let videoIntrinsicH = $state(0);
  let warmedImages = $state<Record<string, WarmedImageDimensions>>({});
  let imageSourceIndex = $state(0);
  let imageSourcesExhausted = $state(false);
  let stripThumbEls: Array<HTMLButtonElement | undefined> = $state([]);
  let panning = $state(false);
  let isAnimating = $state(false);
  let transitionTimeout: ReturnType<typeof setTimeout> | null = null;
  let activeMediaKey: string | null = null;
  let activeEntityId: string | null = null;
  const pendingImageWarmers = new Map<string, HTMLImageElement>();
  // When a swipe over a video is consumed as navigation/dismiss, the browser
  // still fires a trailing click that would otherwise toggle play. This flag
  // lets a capture-phase click handler swallow exactly that one click.
  let suppressStageClick = false;

  const current = $derived(entities[index] ?? null);
  const currentTechnical = $derived(current ? getCapability(current.capabilities, CAPABILITY_KIND.technical) : null);
  const currentRating = $derived.by(() => {
    if (!current) return null;
    const override = ratingOverrides[current.id];
    if (override !== undefined) return override;
    const rating = getCapability(current.capabilities, CAPABILITY_KIND.rating)?.value ?? current.rating ?? null;
    return rating == null ? null : Number(rating);
  });
  const currentImageSources = $derived(current ? buildLightboxImageSources(current) : []);
  const currentImageSource = $derived(currentImageSources[imageSourceIndex] ?? null);
  const isCurrentVideo = $derived(current ? isLightboxVideoCapable(current) : false);
  const currentVideoSources = $derived(current ? buildLightboxVideoSources(current, { preferOriginal: true }) : []);
  const primaryVideoSource = $derived(currentVideoSources[0] ?? null);
  const usesNativeAnimatedVideo = $derived(current?.kind === ENTITY_KIND.image && isCurrentVideo);
  const currentMediaKey = $derived(current ? `${current.id}:${currentImageSource?.src ?? primaryVideoSource?.src ?? ""}` : null);
  const hasCurrentVideoPlayback = $derived(Boolean(isCurrentVideo && currentVideoSources.length > 0));
  const primaryVideoCodec = $derived(primaryVideoSource?.quality === "original" ? currentTechnical?.codec : null);
  const currentVideoFit = $derived.by(() => {
    const width =
      positiveNumberValue(currentTechnical?.width) ??
      positiveNumberValue(videoIntrinsicW) ??
      positiveNumberValue(current?.initialAspectRatio?.width);
    const height =
      positiveNumberValue(currentTechnical?.height) ??
      positiveNumberValue(videoIntrinsicH) ??
      positiveNumberValue(current?.initialAspectRatio?.height);
    if (!width || !height) return null;

    return {
      aspectRatio: `${width} / ${height}`,
      widthToHeightRatio: width / height,
    };
  });
  const fallbackPoster = $derived(current?.coverUrl ?? undefined);
  const preloadSources = $derived(buildLightboxPreloadSources(entities, index, { preferOriginal: true }));
  const preloadImageSources = $derived(
    preloadSources.filter((source) => source.as === "image").map((source) => source.src),
  );
  const counterText = $derived(`${index + 1} / ${entities.length}`);
  const canOpenDetails = $derived(Boolean(detailsContent && current));
  const keyboardHintText = $derived.by(() => {
    const ratingHint = showRatingControls ? " · 1-5 rate" : "";
    return canOpenDetails
      ? `← → navigate · +/- zoom · 0 reset · i details${ratingHint} · esc close`
      : `← → navigate · +/- zoom · 0 reset${ratingHint} · esc close`;
  });
  const downloadHref = $derived(currentImageSource?.src ?? primaryVideoSource?.src ?? undefined);

  $effect(() => {
    onIndexChange?.(index);
  });

  $effect(() => {
    const el = stripThumbEls[index];
    if (!el?.scrollIntoView) return;
    el.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  });

  $effect(() => {
    if (!current) return;
    if (activeEntityId !== current.id) {
      activeEntityId = current.id;
      imageSourceIndex = 0;
      imageSourcesExhausted = false;
    }
    if (activeMediaKey === currentMediaKey) return;
    activeMediaKey = currentMediaKey;

    const warmed = !isCurrentVideo && currentImageSource
      ? untrack(() => warmedImages[currentImageSource.src])
      : undefined;
    ready = isCurrentVideo || Boolean(warmed);
    naturalW = positiveNumberValue(currentTechnical?.width) ?? warmed?.width ?? 0;
    naturalH = positiveNumberValue(currentTechnical?.height) ?? warmed?.height ?? 0;
    translateX = 0;
    translateY = 0;
    scale = 1;
    fitScale = 1;
    gestureHandler.reset();
    isAnimating = false;
    if (transitionTimeout) {
      clearTimeout(transitionTimeout);
      transitionTimeout = null;
    }
    videoMuted = true;
    videoReady = false;
    videoIntrinsicW = 0;
    videoIntrinsicH = 0;
    videoPlayerHandle = undefined;
    nativeVideoEl = undefined;
    if (warmed) {
      scheduleFitForCurrentMedia(currentMediaKey);
    }
  });

  $effect(() => {
    if (!browser) return;
    for (const src of preloadImageSources) {
      warmImage(src);
    }
  });

  $effect(() => {
    if (!current || isCurrentVideo || ready || !currentImageSource) return;
    const warmed = warmedImages[currentImageSource.src];
    if (!warmed) return;
    naturalW = naturalW || positiveNumberValue(currentTechnical?.width) || warmed.width;
    naturalH = naturalH || positiveNumberValue(currentTechnical?.height) || warmed.height;
    scheduleFitForCurrentMedia(currentMediaKey);
  });

  function goPrev() {
    if (entities.length === 0) return;
    index = (index - 1 + entities.length) % entities.length;
  }

  function goNext() {
    if (entities.length === 0) return;
    index = (index + 1) % entities.length;
  }

  function animateTransform(durationMs = 240) {
    isAnimating = true;
    if (transitionTimeout) clearTimeout(transitionTimeout);
    transitionTimeout = setTimeout(() => {
      isAnimating = false;
      transitionTimeout = null;
    }, durationMs);
  }

  function resetTransform(animated = true) {
    scale = fitScale || 1;
    translateX = 0;
    translateY = 0;
    if (animated) animateTransform();
  }

  function clampTranslate(allowMargin = false) {
    if (!stageEl || !naturalW || !naturalH) return;
    const rect = stageEl.getBoundingClientRect();
    const margin = allowMargin ? Math.max(40, Math.min(rect.width, rect.height) * 0.1) : 0;
    const bounds = calculateClampBounds(rect, { width: naturalW, height: naturalH }, scale, { margin });
    const clamped = clampTranslation({ x: translateX, y: translateY }, bounds);
    translateX = clamped.x;
    translateY = clamped.y;
  }

  function applyFit() {
    if (!stageEl || !naturalW || !naturalH) return;
    const rect = stageEl.getBoundingClientRect();
    const next = Math.min((rect.width * 0.98) / naturalW, (rect.height * 0.98) / naturalH, MAX_SCALE);
    fitScale = next;
    scale = next;
    translateX = 0;
    translateY = 0;
    ready = true;
  }

  function scheduleFitForCurrentMedia(mediaKey: string | null) {
    if (!mediaKey) return;
    queueMicrotask(() => {
      if (activeMediaKey !== mediaKey) return;
      applyFit();
    });
  }

  function rememberWarmedImage(src: string | null | undefined, width: number, height: number) {
    if (!src) return;
    const next = {
      width: width > 0 ? width : 1,
      height: height > 0 ? height : 1,
    };
    const currentDimensions = warmedImages[src];
    if (currentDimensions?.width === next.width && currentDimensions.height === next.height) return;
    warmedImages = { ...warmedImages, [src]: next };
  }

  function warmImage(src: string | null | undefined) {
    if (!browser || !src) return;
    if (untrack(() => warmedImages[src]) || pendingImageWarmers.has(src)) return;

    const img = new Image();
    pendingImageWarmers.set(src, img);
    img.decoding = "async";
    img.onload = () => {
      pendingImageWarmers.delete(src);
      rememberWarmedImage(src, img.naturalWidth, img.naturalHeight);
    };
    img.onerror = () => {
      pendingImageWarmers.delete(src);
    };
    img.src = src;
    if (img.complete && img.naturalWidth > 0) {
      img.onload?.(new Event("load"));
    }
  }

  function handleImageLoad(event: Event) {
    const el = event.currentTarget as HTMLImageElement;
    naturalW = el.naturalWidth || naturalW || 1;
    naturalH = el.naturalHeight || naturalH || 1;
    rememberWarmedImage(el.getAttribute("src") ?? currentImageSource?.src, naturalW, naturalH);
    applyFit();
  }

  function handleImageError() {
    if (imageSourceIndex + 1 < currentImageSources.length) {
      imageSourceIndex += 1;
      return;
    }

    imageSourcesExhausted = true;
    ready = true;
  }

  function rememberVideoDimensions(video: HTMLVideoElement | null | undefined) {
    videoIntrinsicW = video?.videoWidth || videoIntrinsicW;
    videoIntrinsicH = video?.videoHeight || videoIntrinsicH;
  }

  function handleVideoCanPlay() {
    rememberVideoDimensions(stageEl?.querySelector("video"));
    videoReady = true;
  }

  async function handleNativeVideoCanPlay(event: Event) {
    const video = event.currentTarget as HTMLVideoElement;
    rememberVideoDimensions(video);
    videoReady = true;
    if (!video.paused) return;
    try {
      await video.play();
    } catch {
      // Muted autoplay is requested declaratively as well; native controls remain available
      // if a browser policy still requires an explicit user gesture.
    }
  }

  function handleNativeVolumeChange(event: Event) {
    videoMuted = (event.currentTarget as HTMLVideoElement).muted;
  }

  const gestureHandler = createLightboxGestureHandler({
    getState: () => ({
      scale,
      translateX,
      translateY,
      fitScale,
      stageRect: stageEl ? stageEl.getBoundingClientRect() : null,
      naturalW,
      naturalH,
      isVideo: isCurrentVideo,
    }),
    setTransform: (next, options) => {
      scale = next.scale;
      translateX = next.translateX;
      translateY = next.translateY;
      if (options?.animated) animateTransform();
      else isAnimating = false;
    },
    setPanning: (next) => {
      panning = next;
    },
    onNavigate: (action) => {
      if (action === "next") goNext();
      else goPrev();
    },
    onDismiss: () => {
      onClose();
    },
    suppressClick: () => {
      suppressStageClick = true;
    },
    doubleTapMs: DOUBLE_TAP_MS,
    minScale: MIN_SCALE,
    maxScale: MAX_SCALE,
  });

  function zoomBy(delta: number, centerX?: number, centerY?: number, animated = true) {
    const old = scale;
    let next = old * (1 + delta);
    next = Math.min(MAX_SCALE, Math.max(MIN_SCALE * fitScale, next));
    if (next === old) return;
    if (centerX != null && centerY != null && stageEl) {
      const rect = stageEl.getBoundingClientRect();
      const focal = clientToStage({ x: centerX, y: centerY }, rect);
      const updated = calculateFocalZoom({ scale: old, translateX, translateY }, next, focal);
      translateX = updated.translateX;
      translateY = updated.translateY;
    }
    scale = next;
    clampTranslate(false);
    if (animated) animateTransform();
  }

  function handleWheel(event: WheelEvent) {
    if (isCurrentVideo) return;
    event.preventDefault();
    isAnimating = false;
    zoomBy(event.deltaY < 0 ? 0.12 : -0.12, event.clientX, event.clientY, false);
  }

  function handleStageClickCapture(event: MouseEvent) {
    if (!suppressStageClick) return;
    suppressStageClick = false;
    event.preventDefault();
    event.stopPropagation();
  }

  function handleRate(value: number) {
    if (!current || !showRatingControls) return;
    const next = currentRating === value ? null : value;
    ratingOverrides = { ...ratingOverrides, [current.id]: next };
    onRatingChange?.(current.id, next);
  }

  function toggleVideoMute() {
    if (nativeVideoEl) {
      nativeVideoEl.muted = !nativeVideoEl.muted;
      videoMuted = nativeVideoEl.muted;
      return;
    }
    videoPlayerHandle?.toggleMute();
    videoMuted = !videoMuted;
  }

  onMount(() => {

    const onKey = createNavigationKeyHandler({
      scope: () => navigationRoot,
      prev: goPrev,
      next: goNext,
      extraKeys: {
        "+": () => zoomBy(0.25),
        "=": () => zoomBy(0.25),
        "-": () => zoomBy(-0.2),
        "_": () => zoomBy(-0.2),
        "0": () => resetTransform(),
        "i": () => { if (canOpenDetails) infoOpen = !infoOpen; },
        "I": () => { if (canOpenDetails) infoOpen = !infoOpen; },
        ...(showRatingControls
          ? {
              "1": () => handleRate(1),
              "2": () => handleRate(2),
              "3": () => handleRate(3),
              "4": () => handleRate(4),
              "5": () => handleRate(5),
            }
          : {}),
      },
    });

    window.addEventListener("keydown", onKey);
    const observer = new ResizeObserver(() => {
      if (naturalW && naturalH) applyFit();
    });
    if (stageEl) observer.observe(stageEl);

    return () => {
      window.removeEventListener("keydown", onKey);
      observer.disconnect();
      if (transitionTimeout) clearTimeout(transitionTimeout);
    };
  });

</script>

<svelte:head>
  {#each preloadSources as source (`${source.rel}:${source.as}:${source.src}`)}
    <link data-lightbox-preload rel={source.rel} as={source.as} href={source.src} />
  {/each}
</svelte:head>

<Dialog open fullscreen ariaLabel={current?.title ?? "Media viewer"} {onClose}>
<div bind:this={navigationRoot} class="universal-lightbox">
  <UniversalLightboxChrome
    section="top"
    title={current?.title}
    {counterText}
    {showRatingControls}
    {currentRating}
    {canOpenDetails}
    {infoOpen}
    hasVideoPlayback={hasCurrentVideoPlayback}
    {videoMuted}
    {downloadHref}
    downloadName={current?.title ?? "media"}
    {onClose}
    onRate={handleRate}
    onToggleInfo={() => (infoOpen = !infoOpen)}
    onToggleVideoMute={toggleVideoMute}
    onPrevious={goPrev}
    onNext={goNext}
    onZoomOut={() => zoomBy(-0.2)}
    onZoomIn={() => zoomBy(0.25)}
    onResetZoom={resetTransform}
  />

  {#if infoOpen && detailsContent && current}
    <div class="details-back-page">
      {@render detailsContent(current)}
    </div>
  {:else}
    <div class="stage-row">
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        bind:this={stageEl}
        class="stage"
        onwheel={handleWheel}
        onpointerdown={(e) => gestureHandler.onPointerDown(e)}
        onpointermove={(e) => gestureHandler.onPointerMove(e)}
        onpointerup={(e) => gestureHandler.onPointerUp(e)}
        onpointercancel={(e) => gestureHandler.onPointerUp(e)}
        onclickcapture={handleStageClickCapture}
        ondblclick={(e) => gestureHandler.onDoubleClick(e)}
        style:cursor={!isCurrentVideo && isZoomedBeyondFit(scale, fitScale) ? (panning ? "grabbing" : "grab") : "default"}
      >
        {#if current}
          <div
            class="media-frame"
            data-lightbox-media
            style:transform={isCurrentVideo ? undefined : `translate(${translateX}px, ${translateY}px) scale(${scale})`}
            style:transition={!isCurrentVideo && isAnimating ? "transform 240ms cubic-bezier(0.16, 1, 0.3, 1)" : "none"}
            style:opacity={ready ? 1 : 0}
          >
            <NsfwBlur isNsfw={current.isNsfw === true} class="lightbox-media-guard">
              {#if usesNativeAnimatedVideo && currentVideoSources.length > 0}
                <div
                  class="lightbox-video-shell"
                  class:has-natural-ratio={Boolean(currentVideoFit)}
                  class:is-ready={videoReady}
                  style={`--lightbox-video-aspect-ratio: ${currentVideoFit?.aspectRatio ?? "16 / 9"}; --lightbox-video-width-ratio: ${currentVideoFit?.widthToHeightRatio ?? 1.7777777778};`}
                >
                  {#if fallbackPoster}
                    <img class="lightbox-video-poster" src={fallbackPoster} alt="" aria-hidden="true" />
                  {/if}
                  {#key currentMediaKey}
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
                      {#each currentVideoSources as source (`${source.quality}:${source.src}`)}
                        <source src={source.src} type={source.type ?? undefined} />
                      {/each}
                    </video>
                  {/key}
                </div>
              {:else if isCurrentVideo && primaryVideoSource}
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
                    sourceWidth={positiveNumberValue(currentTechnical?.width)}
                    sourceHeight={positiveNumberValue(currentTechnical?.height)}
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
              {:else if isCurrentVideo && fallbackPoster}
                <img
                  bind:this={imageEl}
                  src={fallbackPoster}
                  alt={current.title}
                  class="lightbox-image"
                  referrerpolicy="no-referrer"
                  style:width={naturalW ? `${naturalW}px` : undefined}
                  style:height={naturalH ? `${naturalH}px` : undefined}
                  onload={handleImageLoad}
                  onerror={handleImageError}
                  draggable="false"
                />
              {:else if imageSourcesExhausted}
                <div class="unsupported">The original file and available previews could not be loaded</div>
              {:else if currentImageSource}
                <img
                  bind:this={imageEl}
                  src={currentImageSource.src}
                  alt={current.title}
                  class="lightbox-image"
                  referrerpolicy="no-referrer"
                  style:width={naturalW ? `${naturalW}px` : undefined}
                  style:height={naturalH ? `${naturalH}px` : undefined}
                  onload={handleImageLoad}
                  onerror={handleImageError}
                  draggable="false"
                />
              {:else}
                <div class="unsupported">No displayable media source</div>
              {/if}
            </NsfwBlur>
          </div>
        {/if}

        <div class="keyboard-hints">
          {keyboardHintText}
        </div>
      </div>

    </div>
  {/if}

  <UniversalLightboxChrome
    section="bottom"
    {counterText}
    onPrevious={goPrev}
    onNext={goNext}
    onZoomOut={() => zoomBy(-0.2)}
    onZoomIn={() => zoomBy(0.25)}
    onResetZoom={resetTransform}
  />

  {#if entities.length > 1}
    <div class="thumb-strip">
      {#each entities as item, i (item.id)}
        <Button variant="outline" size="icon"
          onclick={() => (index = i)}
          bind:ref={() => stripThumbEls[i] ?? null, next => stripThumbEls[i] = next ?? undefined}
          class={cn("size-13 shrink-0 overflow-hidden p-0 opacity-60 hover:opacity-100 sm:size-12", i === index && "border-ring opacity-100")}
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
</div>
</Dialog>

<style>
  .universal-lightbox {
    position: relative;
    display: flex;
    flex-direction: column;
    width: 100dvw;
    height: 100dvh;
    max-width: 100dvw;
    max-height: 100dvh;
    overflow: hidden;
    isolation: isolate;
    background: #000;
    color: var(--color-text-primary, #f2eed8);
  }

  .thumb-strip {
    position: relative;
    z-index: 20;
    border-color: var(--color-border-subtle, #1c2235);
    background: rgb(0 0 0 / 0.72);
    backdrop-filter: blur(var(--glass-blur-md));
  }

  .stage-row {
    display: flex;
    overflow: hidden;
    min-height: 0;
    flex: 1;
  }

  .details-back-page {
    min-height: 0;
    flex: 1;
    overflow-y: auto;
    background:
      radial-gradient(circle at top left, rgb(199 201 204 / 0.1), transparent 34rem),
      var(--color-bg, #050508);
  }

  .details-back-page :global(.entity-detail) {
    min-height: 100%;
  }

  .stage {
    position: relative;
    min-width: 0;
    flex: 1;
    overflow: hidden;
    user-select: none;
    /* Deliver all touch gestures to our pointer handlers; without this the
       browser claims horizontal swipes for back-navigation and fires
       pointercancel mid-swipe, so swipe-to-navigate/dismiss never registers. */
    touch-action: none;
  }

  .media-frame {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    transform-origin: center center;
  }

  .media-frame :global(.lightbox-media-guard) {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
  }

  .media-frame :global(.prismedia-player-surface) {
    border: 0;
    background: transparent;
  }

  .media-frame :global([data-testid="vidstack-video-player"]) {
    aspect-ratio: inherit;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: auto;
    max-width: 100%;
    max-height: 100%;
  }

  .media-frame :global([data-testid="vidstack-video-player"] .prismedia-player-surface) {
    width: 100%;
    height: auto;
    max-height: 100%;
    aspect-ratio: inherit;
  }

  .media-frame :global(.prismedia-media-engine) {
    width: 100%;
    height: auto;
    max-width: 100%;
    max-height: 100%;
    aspect-ratio: inherit;
  }

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

  .lightbox-video-poster {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
    opacity: 1;
    transition: opacity 160ms ease;
  }

  .lightbox-video-shell :global([data-testid="vidstack-video-player"]) {
    width: 100%;
    max-width: 100%;
    height: auto;
    opacity: 0;
    transition: opacity 160ms ease;
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

  .lightbox-image {
    max-width: none;
    pointer-events: none;
  }

  .unsupported {
    border: 1px solid var(--color-border, #1c2235);
    background: var(--color-surface-2, #101420);
    padding: 1rem 1.25rem;
    color: var(--color-text-muted, #8a93a6);
    font-size: 0.85rem;
  }

  .keyboard-hints {
    position: absolute;
    bottom: 0.75rem;
    left: 0.75rem;
    z-index: 10;
    pointer-events: none;
    color: rgb(255 255 255 / 0.25);
    font-family: var(--font-mono, "JetBrains Mono", monospace);
    font-size: 0.56rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .thumb-strip {
    display: flex;
    gap: 0.35rem;
    overflow-x: auto;
    border-top: 1px solid var(--color-border-subtle, #1c2235);
    /* Keep the strip clear of the device's home indicator / gesture area so the
       thumbnails stay tappable instead of sitting flush against the edge. */
    padding: 0.4rem 0.5rem calc(0.4rem + env(safe-area-inset-bottom, 0px));
  }




  @media (max-width: 640px) {
    .keyboard-hints {
      display: none;
    }

    /* Larger, more separated targets and extra bottom clearance make the strip
       comfortable to use on touch devices. */
    .thumb-strip {
      gap: 0.45rem;
      padding: 0.5rem 0.5rem calc(0.55rem + env(safe-area-inset-bottom, 0px));
    }


  }
</style>

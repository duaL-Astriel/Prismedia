<script lang="ts">
  import { browser } from "$app/environment";
  import { onMount, untrack, type Snippet } from "svelte";
  import { Dialog, prefersReducedMotion } from "@prismedia/ui-svelte";
  import { getCapability } from "$lib/api/capabilities";
  import { positiveNumberValue } from "$lib/utils/format";
  import { createNavigationKeyHandler } from "$lib/keyboard/navigation-keyboard";
  import { CAPABILITY_KIND, ENTITY_KIND } from "$lib/entities/entity-codes";
  import {
    computeAdjacentPreviewOffset,
    createWipeTransitionController,
    formatWipeTransform,
    formatWipeTransition,
    idleWipeVisualState,
    type WipeVisualState,
  } from "$lib/gestures/wipe-gesture";
  import NsfwBlur from "./nsfw/NsfwBlur.svelte";
  import UniversalLightboxChrome from "./UniversalLightboxChrome.svelte";
  import UniversalLightboxThumbStrip from "./UniversalLightboxThumbStrip.svelte";
  import UniversalLightboxVideoStage from "./UniversalLightboxVideoStage.svelte";
  import UniversalLightboxWipeOverlays from "./UniversalLightboxWipeOverlays.svelte";
  import type { VideoPlayerHandle } from "./VideoPlayer.svelte";
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
  let loadedEntityId = $state<string | null>(null);
  let loadedEntityImageSrc = $state<string | null>(null);
  let failedPosterSrcs = $state<Record<string, boolean>>({});
  let imageSourceIndex = $state(0);
  let imageSourcesExhausted = $state(false);
  let panning = $state(false);
  let isAnimating = $state(false);
  let transitionTimeout: ReturnType<typeof setTimeout> | null = null;
  let activeMediaKey: string | null = null;
  let activeEntityId: string | null = null;
  const pendingImageWarmers = new Map<string, HTMLImageElement>();
  // When a swipe over a video is consumed as navigation/dismiss, the browser
  // still fires a trailing click that would otherwise toggle play. This flag
  // lets a capture-phase click handler swallow exactly that one click, while
  // a safety timeout + pointerdown/cancel reset prevent stale suppression.
  let suppressStageClick = false;
  let suppressStageClickTimer: ReturnType<typeof setTimeout> | null = null;

  function armSuppressClick() {
    suppressStageClick = true;
    if (suppressStageClickTimer) clearTimeout(suppressStageClickTimer);
    suppressStageClickTimer = setTimeout(() => {
      suppressStageClick = false;
      suppressStageClickTimer = null;
    }, 400);
  }

  function clearSuppressClick() {
    suppressStageClick = false;
    if (suppressStageClickTimer) {
      clearTimeout(suppressStageClickTimer);
      suppressStageClickTimer = null;
    }
  }
  let wipeVisuals = $state<WipeVisualState>(idleWipeVisualState());
  let outgoingSnapshot = $state<{ src: string | null; isNsfw: boolean; title: string } | null>(null);

  const wipeController = createWipeTransitionController({
    onUpdate: (next) => {
      wipeVisuals = next;
    },
    onAnimationEnd: () => {
      outgoingSnapshot = null;
    },
    isReducedMotion: prefersReducedMotion,
  });

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
  const fallbackPoster = $derived(current?.coverUrl ?? undefined);
  const primaryImageLoaded = $derived(
    Boolean(!isCurrentVideo && currentImageSource && warmedImages[currentImageSource.src]),
  );
  const stillPosterSrc = $derived.by((): string | null => {
    if (isCurrentVideo || imageSourcesExhausted || !current || !currentImageSource) return null;
    if (primaryImageLoaded) return null;

    if (
      loadedEntityId === current.id &&
      loadedEntityImageSrc &&
      loadedEntityImageSrc !== currentImageSource.src &&
      !failedPosterSrcs[loadedEntityImageSrc]
    ) {
      return loadedEntityImageSrc;
    }

    const warmedAlternate = currentImageSources.find(
      (source) =>
        source.src !== currentImageSource.src &&
        Boolean(warmedImages[source.src]) &&
        !failedPosterSrcs[source.src],
    );
    if (warmedAlternate) return warmedAlternate.src;

    if (
      fallbackPoster &&
      fallbackPoster !== currentImageSource.src &&
      !failedPosterSrcs[fallbackPoster]
    ) {
      return fallbackPoster;
    }

    return null;
  });
  const preloadSources = $derived(buildLightboxPreloadSources(entities, index, { preferOriginal: true }));
  const preloadImageSources = $derived(
    preloadSources.filter((source) => source.as === "image").map((source) => source.src),
  );
  const counterText = $derived(`${index + 1} / ${entities.length}`);
  const adjacentWipePreview = $derived.by(() => {
    if (
      entities.length <= 1 ||
      wipeVisuals.phase !== "dragging" ||
      wipeVisuals.axis !== "horizontal" ||
      wipeVisuals.offsetX === 0
    ) {
      return null;
    }
    const stageWidth = stageEl?.getBoundingClientRect().width ?? 0;
    const offset = computeAdjacentPreviewOffset(wipeVisuals.offsetX, stageWidth);
    if (offset === null) return null;
    const neighborIndex =
      wipeVisuals.offsetX < 0
        ? (index + 1) % entities.length
        : (index - 1 + entities.length) % entities.length;
    const neighbor = entities[neighborIndex];
    if (!neighbor) return null;
    return {
      offset,
      src: previewSrcForEntity(neighbor),
      isNsfw: neighbor.isNsfw === true,
      title: neighbor.title,
    };
  });
  const reducedMotion = $derived(prefersReducedMotion());
  const wipeActiveTransform = $derived(formatWipeTransform(wipeVisuals));
  const wipeTransitionStyle = $derived(formatWipeTransition(wipeVisuals.phase, reducedMotion));
  const isVerticalDismissWipe = $derived(wipeVisuals.axis === "vertical" && wipeVisuals.offsetY > 0);
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

  function resetStagePlaybackAndTransform() {
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
  }

  $effect(() => {
    if (!current) return;
    const isNewEntity = activeEntityId !== current.id;
    if (isNewEntity) {
      activeEntityId = current.id;
      imageSourceIndex = 0;
      imageSourcesExhausted = false;
    }
    if (activeMediaKey === currentMediaKey) return;
    activeMediaKey = currentMediaKey;

    const warmed = !isCurrentVideo && currentImageSource
      ? untrack(() => warmedImages[currentImageSource.src])
      : undefined;
    const posterSrc = untrack(() => stillPosterSrc);
    const posterWarmed = !isCurrentVideo && posterSrc
      ? untrack(() => warmedImages[posterSrc])
      : undefined;

    const prevW = untrack(() => naturalW);
    const prevH = untrack(() => naturalH);
    const nextW =
      positiveNumberValue(currentTechnical?.width) ??
      warmed?.width ??
      posterWarmed?.width ??
      (isNewEntity ? 0 : prevW);
    const nextH =
      positiveNumberValue(currentTechnical?.height) ??
      warmed?.height ??
      posterWarmed?.height ??
      (isNewEntity ? 0 : prevH);

    if (isNewEntity) {
      ready = isCurrentVideo || Boolean(warmed) || Boolean(posterWarmed);
      naturalW = nextW;
      naturalH = nextH;
      resetStagePlaybackAndTransform();
      if (warmed || posterWarmed) {
        scheduleFitForCurrentMedia(currentMediaKey);
      }
      return;
    }

    // Same entity updated (e.g. hydration upgraded cover -> source, fallback
    // advanced after an error, or an image entity resolved to video): keep the
    // visible preview on screen while the higher-resolution source loads.
    const wasReady = untrack(() => ready);
    const currentScale = untrack(() => scale);
    const currentFitScale = untrack(() => fitScale);
    const zoomed = !isCurrentVideo && wasReady && isZoomedBeyondFit(currentScale, currentFitScale);

    naturalW = nextW;
    naturalH = nextH;
    ready = wasReady || isCurrentVideo || Boolean(warmed) || Boolean(posterWarmed);

    if (isCurrentVideo) {
      resetStagePlaybackAndTransform();
      return;
    }

    if (zoomed && prevW > 0 && nextW > 0 && prevW !== nextW) {
      const nextFit = computeFitScale(nextW, nextH);
      if (nextFit != null) fitScale = nextFit;
      scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE * fitScale, currentScale * (prevW / nextW)));
      clampTranslate(false);
    } else if (!zoomed && (warmed || posterWarmed || wasReady)) {
      const nextFit = untrack(() => computeFitScale(nextW, nextH));
      if (nextFit != null) {
        fitScale = nextFit;
        scale = nextFit;
        translateX = 0;
        translateY = 0;
      } else {
        scheduleFitForCurrentMedia(currentMediaKey);
      }
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
    const warmed =
      warmedImages[currentImageSource.src] ??
      (stillPosterSrc ? warmedImages[stillPosterSrc] : undefined);
    if (!warmed) return;
    naturalW = naturalW || positiveNumberValue(currentTechnical?.width) || warmed.width;
    naturalH = naturalH || positiveNumberValue(currentTechnical?.height) || warmed.height;
    scheduleFitForCurrentMedia(currentMediaKey);
  });

  function previewSrcForEntity(entity: UniversalLightboxEntity | null | undefined): string | null {
    if (!entity) return null;
    if (isLightboxVideoCapable(entity)) {
      return entity.coverUrl ?? null;
    }
    return buildLightboxImageSources(entity)[0]?.src ?? entity.coverUrl ?? null;
  }

  function selectIndex(nextIndex: number) {
    outgoingSnapshot = null;
    wipeController.reset();
    index = nextIndex;
  }

  function stepIndex(delta: number) {
    if (entities.length === 0) return;
    index = (index + delta + entities.length) % entities.length;
  }

  function goPrev() {
    outgoingSnapshot = null;
    wipeController.reset();
    stepIndex(-1);
  }

  function goNext() {
    outgoingSnapshot = null;
    wipeController.reset();
    stepIndex(1);
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

  function computeFitScale(width: number, height: number): number | null {
    if (!stageEl || !width || !height) return null;
    const rect = stageEl.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return Math.min((rect.width * 0.98) / width, (rect.height * 0.98) / height, MAX_SCALE);
  }

  function applyFit() {
    if (!stageEl || !naturalW || !naturalH) return;
    const next = computeFitScale(naturalW, naturalH);
    if (next != null) {
      fitScale = next;
      scale = next;
      translateX = 0;
      translateY = 0;
    }
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

  function applyLoadedDimensions(nextW: number, nextH: number) {
    const prevW = naturalW;
    const wasReady = ready;
    const zoomed = wasReady && isZoomedBeyondFit(scale, fitScale);

    naturalW = nextW;
    naturalH = nextH;

    if (!wasReady || !zoomed) {
      applyFit();
      return;
    }

    if (prevW > 0 && nextW > 0 && prevW !== nextW) {
      const nextFit = computeFitScale(nextW, nextH);
      if (nextFit != null) fitScale = nextFit;
      scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE * fitScale, scale * (prevW / nextW)));
      clampTranslate(false);
    }
  }

  function handleImageLoad(event: Event) {
    const el = event.currentTarget as HTMLImageElement;
    const src = el.getAttribute("src") ?? currentImageSource?.src ?? null;
    const nextW = el.naturalWidth || naturalW || 1;
    const nextH = el.naturalHeight || naturalH || 1;
    rememberWarmedImage(src, nextW, nextH);
    if (current) {
      loadedEntityId = current.id;
      loadedEntityImageSrc = src;
    }
    applyLoadedDimensions(nextW, nextH);
  }

  function handlePosterImageLoad(event: Event) {
    const el = event.currentTarget as HTMLImageElement;
    const src = el.getAttribute("src") ?? stillPosterSrc ?? null;
    const nextW = el.naturalWidth || naturalW || 1;
    const nextH = el.naturalHeight || naturalH || 1;
    rememberWarmedImage(src, nextW, nextH);
    if (!ready) {
      const resolvedW = positiveNumberValue(currentTechnical?.width) ?? nextW;
      const resolvedH = positiveNumberValue(currentTechnical?.height) ?? nextH;
      applyLoadedDimensions(resolvedW, resolvedH);
    }
  }

  function handlePosterImageError(event: Event) {
    const el = event.currentTarget as HTMLImageElement;
    const src = el.getAttribute("src");
    if (src) {
      failedPosterSrcs = { ...failedPosterSrcs, [src]: true };
    }
  }

  function handleImageError() {
    if (imageSourceIndex + 1 < currentImageSources.length) {
      imageSourceIndex += 1;
      return;
    }

    imageSourcesExhausted = true;
    ready = true;
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
      canNavigate: entities.length > 1,
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
    onWipeDrag: (wipe) => {
      outgoingSnapshot = null;
      wipeController.drag(wipe);
    },
    onWipeSnapBack: () => {
      outgoingSnapshot = null;
      wipeController.snapBack();
    },
    onWipeCommit: (action, { fromOffsetX, stageWidth }) => {
      const leaving = current;
      outgoingSnapshot = leaving
        ? {
            src: previewSrcForEntity(leaving),
            isNsfw: leaving.isNsfw === true,
            title: leaving.title,
          }
        : null;
      wipeController.commitHorizontal({
        direction: action === "next" ? "left" : "right",
        fromOffsetX,
        stageWidth,
        onSwap: () => stepIndex(action === "next" ? 1 : -1),
      });
    },
    onDismiss: () => {
      outgoingSnapshot = null;
      wipeController.reset();
      onClose();
    },
    suppressClick: armSuppressClick,
    clearSuppressClick,
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
    clearSuppressClick();
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
      clearSuppressClick();
      wipeController.reset();
    };
  });

</script>

<svelte:head>
  {#each preloadSources as source (`${source.rel}:${source.as}:${source.src}`)}
    <link data-lightbox-preload rel={source.rel} as={source.as} href={source.src} />
  {/each}
</svelte:head>

<Dialog open fullscreen ariaLabel={current?.title ?? "Media viewer"} {onClose}>
<div
  bind:this={navigationRoot}
  class="universal-lightbox"
  style:background={isVerticalDismissWipe ? `rgb(0 0 0 / ${wipeVisuals.backdropOpacity})` : undefined}
>
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
        onpointercancel={(e) => gestureHandler.onPointerCancel(e)}
        onclickcapture={handleStageClickCapture}
        ondblclick={(e) => gestureHandler.onDoubleClick(e)}
        style:cursor={!isCurrentVideo && isZoomedBeyondFit(scale, fitScale) ? (panning ? "grabbing" : "grab") : "default"}
      >
        <UniversalLightboxWipeOverlays
          outgoing={outgoingSnapshot}
          adjacent={adjacentWipePreview}
          showOutgoing={wipeVisuals.phase === "entering" || wipeVisuals.phase === "settling"}
          outgoingOffsetX={wipeVisuals.outgoingOffsetX}
          transitionStyle={wipeTransitionStyle}
        />

        {#if current}
          <div
            class="lightbox-wipe-pane"
            data-lightbox-wipe-active
            style:transform={wipeActiveTransform}
            style:transition={wipeTransitionStyle}
            style:opacity={isVerticalDismissWipe ? Math.max(0.45, wipeVisuals.backdropOpacity) : undefined}
          >
          <div
            class="media-frame"
            data-lightbox-media
            style:transform={isCurrentVideo ? undefined : `translate(${translateX}px, ${translateY}px) scale(${scale})`}
            style:transition={!isCurrentVideo && isAnimating ? "transform 240ms cubic-bezier(0.16, 1, 0.3, 1)" : "none"}
            style:opacity={ready ? 1 : 0}
          >
            <NsfwBlur isNsfw={current.isNsfw === true} class="lightbox-media-guard">
              {#if (usesNativeAnimatedVideo && currentVideoSources.length > 0) || (isCurrentVideo && primaryVideoSource)}
                <UniversalLightboxVideoStage
                  {usesNativeAnimatedVideo}
                  videoSources={currentVideoSources}
                  {primaryVideoSource}
                  mediaKey={currentMediaKey}
                  technicalWidth={currentTechnical?.width}
                  technicalHeight={currentTechnical?.height}
                  initialAspectRatio={current.initialAspectRatio}
                  {primaryVideoCodec}
                  {fallbackPoster}
                  {videoMuted}
                  {videoReady}
                  {videoIntrinsicW}
                  {videoIntrinsicH}
                  bind:nativeVideoEl
                  bind:videoPlayerHandle
                  {stageEl}
                  onMutedChange={(muted) => (videoMuted = muted)}
                  onReadyChange={(isReady) => (videoReady = isReady)}
                  onDimensionsChange={(width, height) => {
                    videoIntrinsicW = width;
                    videoIntrinsicH = height;
                  }}
                />
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
                {#key current.id}
                  <div class="lightbox-image-shell">
                    {#if stillPosterSrc}
                      <img
                        src={stillPosterSrc}
                        alt=""
                        aria-hidden="true"
                        class="lightbox-image-poster"
                        referrerpolicy="no-referrer"
                        onload={handlePosterImageLoad}
                        onerror={handlePosterImageError}
                        draggable="false"
                      />
                    {/if}
                    <img
                      bind:this={imageEl}
                      src={currentImageSource.src}
                      alt={current.title}
                      class="lightbox-image"
                      class:is-pending={Boolean(stillPosterSrc) && !primaryImageLoaded}
                      referrerpolicy="no-referrer"
                      style:width={naturalW ? `${naturalW}px` : undefined}
                      style:height={naturalH ? `${naturalH}px` : undefined}
                      onload={handleImageLoad}
                      onerror={handleImageError}
                      draggable="false"
                    />
                  </div>
                {/key}
              {:else}
                <div class="unsupported">No displayable media source</div>
              {/if}
            </NsfwBlur>
          </div>
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

  <UniversalLightboxThumbStrip {entities} {index} onSelect={selectIndex} />
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

  .lightbox-wipe-pane {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    will-change: transform;
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

  .lightbox-image-shell {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .lightbox-image-poster {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    max-width: none;
    object-fit: contain;
    pointer-events: none;
  }

  .lightbox-image {
    max-width: none;
    pointer-events: none;
  }

  .lightbox-image.is-pending {
    opacity: 0;
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

  @media (max-width: 640px) {
    .keyboard-hints {
      display: none;
    }
  }
</style>

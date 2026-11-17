/**
 * Pure transform and gesture math for the universal lightbox.
 *
 * Provides coordinate transformations, focal-point scaling, two-finger pinch-to-zoom,
 * translation clamping, and gesture disambiguation (pan vs. wipe-to-navigate/dismiss).
 */

import {
  WIPE_DOMINANCE_RATIO,
  applyWipeResistance,
  lockWipeAxis,
  resolveWipeCommit,
  type WipeAxis,
} from "$lib/gestures/wipe-gesture";

export interface Point {
  x: number;
  y: number;
}

export interface Dimensions {
  width: number;
  height: number;
}

export interface ViewportRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface TransformState {
  scale: number;
  translateX: number;
  translateY: number;
}

export interface ClampBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export type SwipeAction = "next" | "prev" | "dismiss" | "none";

export interface SwipeDecisionParams {
  scale: number;
  fitScale: number;
  deltaX: number;
  deltaY: number;
  elapsedMs: number;
  currentTranslate: Point;
  bounds: ClampBounds;
  pointerType?: string;
  maxDurationMs?: number;
  minDistancePx?: number;
  boundaryTolerancePx?: number;
}

export interface LightboxGestureState {
  scale: number;
  translateX: number;
  translateY: number;
  fitScale: number;
  stageRect: ViewportRect | null;
  naturalW: number;
  naturalH: number;
  isVideo: boolean;
  canNavigate?: boolean;
}

export interface LightboxWipeDragEvent {
  axis: WipeAxis;
  offsetX: number;
  offsetY: number;
  stageWidth: number;
  stageHeight: number;
}

export interface LightboxGestureHandlerOptions {
  getState: () => LightboxGestureState;
  setTransform: (next: TransformState, options?: { animated?: boolean }) => void;
  setPanning?: (panning: boolean) => void;
  onNavigate: (action: "next" | "prev") => void;
  onDismiss: () => void;
  onWipeDrag?: (wipe: LightboxWipeDragEvent) => void;
  onWipeSnapBack?: () => void;
  onWipeCommit?: (
    action: "next" | "prev",
    details: { fromOffsetX: number; stageWidth: number },
  ) => void;
  suppressClick?: () => void;
  clearSuppressClick?: () => void;
  doubleTapMs?: number;
  minScale?: number;
  maxScale?: number;
}

export interface LightboxGestureHandler {
  onPointerDown: (event: PointerEvent) => void;
  onPointerMove: (event: PointerEvent) => void;
  onPointerUp: (event: PointerEvent) => void;
  onPointerCancel: (event: PointerEvent) => void;
  onDoubleClick: (event: MouseEvent) => void;
  reset: () => void;
}

/**
 * Calculates Euclidean distance between two points.
 */
export function getDistance(p1: Point, p2: Point): number {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

/**
 * Calculates midpoint (centroid) between two points.
 */
export function getCentroid(p1: Point, p2: Point): Point {
  return {
    x: (p1.x + p2.x) / 2,
    y: (p1.y + p2.y) / 2,
  };
}

/**
 * Converts a client viewport coordinate (clientX, clientY) into stage-center-relative
 * coordinates where (0, 0) is the center of the stage.
 */
export function clientToStage(clientPoint: Point, stageRect: ViewportRect): Point {
  return {
    x: clientPoint.x - stageRect.left - stageRect.width / 2,
    y: clientPoint.y - stageRect.top - stageRect.height / 2,
  };
}

/**
 * Checks whether the current scale represents a zoomed state beyond the fit-to-screen scale.
 */
export function isZoomedBeyondFit(scale: number, fitScale: number, threshold = 0.02): boolean {
  return scale > fitScale + threshold;
}

/**
 * Calculates focal-point zoom such that the content point underneath the focal point
 * remains at the same visual position after the scale changes.
 *
 * @param current Current transform state
 * @param nextScale Target scale
 * @param focalPoint Focal point in stage-center-relative coordinates
 */
export function calculateFocalZoom(
  current: TransformState,
  nextScale: number,
  focalPoint: Point,
): TransformState {
  if (current.scale <= 0 || nextScale <= 0 || current.scale === nextScale) {
    return { ...current, scale: Math.max(0.001, nextScale) };
  }
  const ratio = nextScale / current.scale;
  return {
    scale: nextScale,
    translateX: focalPoint.x - (focalPoint.x - current.translateX) * ratio,
    translateY: focalPoint.y - (focalPoint.y - current.translateY) * ratio,
  };
}

/**
 * Calculates a continuous two-finger pinch-to-zoom update that simultaneously handles
 * scaling around the pinch centroid and panning as the fingers move.
 *
 * Focal-point invariance holds: the content under startCentroid tracks currentCentroid
 * while scaling by (currentDistance / startDistance).
 */
export function calculatePinchTransform(
  startTransform: TransformState,
  startDistance: number,
  currentDistance: number,
  startCentroid: Point,
  currentCentroid: Point,
  limits?: { minScale?: number; maxScale?: number },
): TransformState {
  if (startDistance <= 1e-4 || currentDistance <= 1e-4 || startTransform.scale <= 0) {
    return {
      scale: startTransform.scale,
      translateX: startTransform.translateX + (currentCentroid.x - startCentroid.x),
      translateY: startTransform.translateY + (currentCentroid.y - startCentroid.y),
    };
  }

  const distanceRatio = currentDistance / startDistance;
  let nextScale = startTransform.scale * distanceRatio;
  if (limits?.minScale != null) nextScale = Math.max(limits.minScale, nextScale);
  if (limits?.maxScale != null) nextScale = Math.min(limits.maxScale, nextScale);

  const scaleRatio = nextScale / startTransform.scale;
  return {
    scale: nextScale,
    translateX: currentCentroid.x - (startCentroid.x - startTransform.translateX) * scaleRatio,
    translateY: currentCentroid.y - (startCentroid.y - startTransform.translateY) * scaleRatio,
  };
}

/**
 * Calculates the transform for a double-tap gesture.
 *
 * If currently zoomed beyond fit, resets transform to fit scale centered at (0, 0).
 * If at fit scale, zooms into the tapped point so that the tapped content coordinate
 * becomes the center of the viewport (0, 0 in stage-center coordinates).
 *
 * @param current Current transform state
 * @param fitScale Target scale for fit-to-screen
 * @param tapPoint Tapped coordinate in stage-center-relative coordinates
 * @param options Zoom configuration
 */
export function calculateDoubleTapZoom(
  current: TransformState,
  fitScale: number,
  tapPoint: Point,
  options?: {
    zoomMultiplier?: number;
    maxScale?: number;
    zoomThreshold?: number;
  },
): TransformState {
  const threshold = options?.zoomThreshold ?? 0.02;
  const isCurrentlyZoomed = isZoomedBeyondFit(current.scale, fitScale, threshold);

  if (isCurrentlyZoomed) {
    return {
      scale: fitScale,
      translateX: 0,
      translateY: 0,
    };
  }

  const multiplier = options?.zoomMultiplier ?? 2.5;
  const maxScale = options?.maxScale ?? 8;
  const targetScale = Math.min(maxScale, Math.max(fitScale * multiplier, fitScale));

  if (current.scale <= 0) {
    return { scale: targetScale, translateX: 0, translateY: 0 };
  }

  const mediaX = (tapPoint.x - current.translateX) / current.scale;
  const mediaY = (tapPoint.y - current.translateY) / current.scale;

  const tx = -mediaX * targetScale;
  const ty = -mediaY * targetScale;

  return {
    scale: targetScale,
    translateX: tx === 0 ? 0 : tx,
    translateY: ty === 0 ? 0 : ty,
  };
}

/**
 * Calculates translation clamp boundaries for the image within the viewport.
 *
 * When the displayed dimension is larger than the viewport, translation is bounded
 * so the image edges do not pull inside the viewport edges. When smaller, translation
 * is clamped to 0 (centered).
 */
export function calculateClampBounds(
  viewport: Dimensions,
  media: Dimensions,
  scale: number,
  options?: { margin?: number },
): ClampBounds {
  const dispW = media.width * scale;
  const dispH = media.height * scale;
  const margin = options?.margin ?? 0;

  const boundX = Math.max(0, (dispW - viewport.width) / 2);
  const boundY = Math.max(0, (dispH - viewport.height) / 2);

  const totalX = boundX + margin;
  const totalY = boundY + margin;

  return {
    minX: totalX === 0 ? 0 : -totalX,
    maxX: totalX,
    minY: totalY === 0 ? 0 : -totalY,
    maxY: totalY,
  };
}

/**
 * Clamps a translation point to the provided clamp bounds.
 */
export function clampTranslation(point: Point, bounds: ClampBounds): Point {
  return {
    x: Math.min(bounds.maxX, Math.max(bounds.minX, point.x)),
    y: Math.min(bounds.maxY, Math.max(bounds.minY, point.y)),
  };
}

/**
 * Disambiguates between image panning and swipe navigation/dismissal gestures.
 *
 * Rules:
 * 1. Mouse interactions never trigger touch swipe navigation.
 * 2. Drags taking longer than maxDurationMs or shorter than minDistancePx do not swipe.
 * 3. Directional dominance is required (horizontal > 1.3 * vertical or vertical > 1.3 * horizontal).
 * 4. At fit scale (not zoomed), swipe navigates prev/next horizontally or dismisses downwards.
 * 5. While zoomed beyond fit, drags pan the image within bounds and NEVER swipe, UNLESS
 *    the image is already at the pan boundary edge in that direction.
 */
export function resolveSwipeAction(params: SwipeDecisionParams): SwipeAction {
  const {
    scale,
    fitScale,
    deltaX,
    deltaY,
    elapsedMs,
    currentTranslate,
    bounds,
    pointerType = "touch",
    maxDurationMs = 700,
    minDistancePx = 60,
    boundaryTolerancePx = 4,
  } = params;

  if (pointerType === "mouse") {
    return "none";
  }

  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);

  if (elapsedMs > maxDurationMs || Math.max(absX, absY) < minDistancePx) {
    return "none";
  }

  const isHorizontal = absX > absY * WIPE_DOMINANCE_RATIO;
  const isVerticalDismiss = absY > absX * WIPE_DOMINANCE_RATIO && deltaY > 0;

  if (!isHorizontal && !isVerticalDismiss) {
    return "none";
  }

  const isZoomed = isZoomedBeyondFit(scale, fitScale);

  if (!isZoomed) {
    return isHorizontal ? (deltaX < 0 ? "next" : "prev") : "dismiss";
  }

  // When zoomed beyond fit, only allow swipe at the pan boundary
  if (isHorizontal) {
    if (deltaX < 0 && currentTranslate.x <= bounds.minX + boundaryTolerancePx) return "next";
    if (deltaX > 0 && currentTranslate.x >= bounds.maxX - boundaryTolerancePx) return "prev";
    return "none";
  }

  return currentTranslate.y >= bounds.maxY - boundaryTolerancePx ? "dismiss" : "none";
}

/**
 * Creates a cohesive gesture handler managing multi-touch pointers, pinch scaling,
 * panning, focal-point double-tap, and swipe disambiguation.
 */
export function createLightboxGestureHandler(
  options: LightboxGestureHandlerOptions,
): LightboxGestureHandler {
  const doubleTapMs = options.doubleTapMs ?? 300;
  const minScale = options.minScale ?? 0.3;
  const maxScale = options.maxScale ?? 8;
  const boundaryTolerancePx = 4;

  const activePointers = new Map<number, Point>();
  let pointerStart: { x: number; y: number; t: number; pointerId: number } | null = null;
  let dragStartTranslate: Point = { x: 0, y: 0 };
  let lastPointerPos: Point = { x: 0, y: 0 };
  let isPinching = false;
  let pinchStartDist = 0;
  let pinchStartCentroid: Point = { x: 0, y: 0 };
  let pinchStartTransform: TransformState = { scale: 1, translateX: 0, translateY: 0 };
  let lastTapAt = 0;
  let lastTapPos: Point = { x: 0, y: 0 };
  let wipeAxis: WipeAxis = "none";
  let wipeOffsetX = 0;
  let wipeOffsetY = 0;
  let capturedTarget: HTMLElement | null = null;

  const transformOf = (state: LightboxGestureState): TransformState => ({
    scale: state.scale,
    translateX: state.translateX,
    translateY: state.translateY,
  });

  const boundsFor = (state: LightboxGestureState, rect: ViewportRect, scale: number, margin?: number) =>
    calculateClampBounds(rect, { width: state.naturalW, height: state.naturalH }, scale, { margin });

  const panMargin = (rect: ViewportRect) => Math.max(40, Math.min(rect.width, rect.height) * 0.1);

  function capturePointer(target: EventTarget | null, pointerId: number) {
    const el = target as HTMLElement | null;
    if (typeof el?.setPointerCapture !== "function") return;
    try {
      el.setPointerCapture(pointerId);
      capturedTarget = el;
    } catch {}
  }

  function releaseCapture(target: EventTarget | null, pointerId: number) {
    const el = (target as HTMLElement | null) ?? capturedTarget;
    capturedTarget = null;
    if (typeof el?.releasePointerCapture !== "function") return;
    try {
      el.releasePointerCapture(pointerId);
    } catch {}
  }

  function isInsideVideoControlStrip(event: PointerEvent): boolean {
    const target = event.target as HTMLElement | null;
    if (!target) return false;
    if (target.closest("media-time-slider, [data-lightbox-no-wipe], [role='slider']")) return true;
    if (typeof HTMLVideoElement !== "undefined" && target instanceof HTMLVideoElement && target.controls) {
      const rect = target.getBoundingClientRect();
      if (rect.height > 0 && event.clientY >= rect.bottom - 48) {
        return true;
      }
    }
    return false;
  }

  function clearWipeTracking() {
    wipeAxis = "none";
    wipeOffsetX = 0;
    wipeOffsetY = 0;
  }

  function isZoomedBoundaryWipeAllowed(
    state: LightboxGestureState,
    bounds: ClampBounds,
    axis: WipeAxis,
    dx: number,
    dy: number,
  ): boolean {
    if (!isZoomedBeyondFit(state.scale, state.fitScale)) return true;
    if (axis === "horizontal") {
      if (dx < 0 && dragStartTranslate.x <= bounds.minX + boundaryTolerancePx) return true;
      if (dx > 0 && dragStartTranslate.x >= bounds.maxX - boundaryTolerancePx) return true;
      return false;
    }
    if (axis === "vertical") {
      return dy > 0 && dragStartTranslate.y >= bounds.maxY - boundaryTolerancePx;
    }
    return false;
  }

  function emitWipeDrag(state: LightboxGestureState, axis: WipeAxis, dx: number, dy: number) {
    const stageWidth = state.stageRect?.width ?? 0;
    const stageHeight = state.stageRect?.height ?? 0;
    const canNavigate = state.canNavigate ?? true;

    if (axis === "horizontal") {
      wipeOffsetX = applyWipeResistance(dx, canNavigate);
      wipeOffsetY = 0;
    } else if (axis === "vertical") {
      wipeOffsetX = 0;
      wipeOffsetY = Math.max(0, dy);
    } else {
      wipeOffsetX = 0;
      wipeOffsetY = 0;
    }

    options.onWipeDrag?.({
      axis,
      offsetX: wipeOffsetX,
      offsetY: wipeOffsetY,
      stageWidth,
      stageHeight,
    });
  }

  function commitNavigation(action: "next" | "prev", state: LightboxGestureState, fromOffsetX: number) {
    if (options.onWipeCommit) {
      options.onWipeCommit(action, {
        fromOffsetX,
        stageWidth: state.stageRect?.width ?? 0,
      });
    } else {
      options.onNavigate(action);
    }
  }

  /** Clamps `next` into the media bounds at its own scale and commits it. */
  function commitClamped(
    state: LightboxGestureState,
    rect: ViewportRect,
    next: TransformState,
    animated: boolean,
    margin?: number,
  ) {
    const clamped = clampTranslation(
      { x: next.translateX, y: next.translateY },
      boundsFor(state, rect, next.scale, margin),
    );
    options.setTransform({ scale: next.scale, translateX: clamped.x, translateY: clamped.y }, { animated });
  }

  function zoomAtClientPoint(state: LightboxGestureState, rect: ViewportRect, clientX: number, clientY: number) {
    const tapPoint = clientToStage({ x: clientX, y: clientY }, rect);
    const next = calculateDoubleTapZoom(transformOf(state), state.fitScale, tapPoint, { maxScale });
    commitClamped(state, rect, next, true);
  }

  function onPointerDown(event: PointerEvent) {
    options.clearSuppressClick?.();
    const state = options.getState();
    const pointerId = event.pointerId ?? 0;

    if (state.isVideo) {
      if (event.pointerType === "mouse" || isInsideVideoControlStrip(event)) {
        pointerStart = null;
        clearWipeTracking();
        options.setPanning?.(false);
        return;
      }
      pointerStart = { x: event.clientX, y: event.clientY, t: Date.now(), pointerId };
      clearWipeTracking();
      options.setPanning?.(false);
      return;
    }
    if (event.pointerType === "mouse" && event.button !== 0) return;

    capturePointer(event.currentTarget, event.pointerId);

    activePointers.set(pointerId, { x: event.clientX, y: event.clientY });

    if (activePointers.size === 1) {
      pointerStart = { x: event.clientX, y: event.clientY, t: Date.now(), pointerId };
      dragStartTranslate = { x: state.translateX, y: state.translateY };
      lastPointerPos = { x: event.clientX, y: event.clientY };
      clearWipeTracking();
      const isZoomed = isZoomedBeyondFit(state.scale, state.fitScale);
      options.setPanning?.(isZoomed);
    } else if (activePointers.size === 2) {
      if (wipeAxis !== "none") {
        clearWipeTracking();
        options.onWipeSnapBack?.();
      }
      const [p1, p2] = Array.from(activePointers.values());
      pinchStartDist = getDistance(p1, p2);
      pinchStartCentroid = state.stageRect
        ? clientToStage(getCentroid(p1, p2), state.stageRect)
        : { x: 0, y: 0 };
      pinchStartTransform = transformOf(state);
      isPinching = true;
      options.setPanning?.(false);
      pointerStart = null;
    }
  }

  function onPointerMove(event: PointerEvent) {
    const state = options.getState();
    const pointerId = event.pointerId ?? 0;

    if (state.isVideo) {
      if (event.pointerType === "mouse" || !pointerStart || pointerStart.pointerId !== pointerId) return;
      const dx = event.clientX - pointerStart.x;
      const dy = event.clientY - pointerStart.y;

      if (wipeAxis === "none") {
        const locked = lockWipeAxis(dx, dy);
        if (locked === "none") return;
        wipeAxis = locked;
        capturePointer(event.currentTarget, event.pointerId);
        options.suppressClick?.();
      }

      emitWipeDrag(state, wipeAxis, dx, dy);
      return;
    }

    if (!activePointers.has(pointerId)) return;
    activePointers.set(pointerId, { x: event.clientX, y: event.clientY });

    if (isPinching && activePointers.size >= 2) {
      if (!state.stageRect) return;
      const [p1, p2] = Array.from(activePointers.values());
      const currentDist = getDistance(p1, p2);
      const currentCentroid = clientToStage(getCentroid(p1, p2), state.stageRect);

      const next = calculatePinchTransform(
        pinchStartTransform,
        pinchStartDist,
        currentDist,
        pinchStartCentroid,
        currentCentroid,
        { minScale: minScale * state.fitScale, maxScale },
      );

      commitClamped(state, state.stageRect, next, false, panMargin(state.stageRect));
      return;
    }

    if (activePointers.size === 1 && !isPinching) {
      if (!pointerStart || pointerStart.pointerId !== pointerId) return;
      const dx = event.clientX - pointerStart.x;
      const dy = event.clientY - pointerStart.y;
      const isZoomed = isZoomedBeyondFit(state.scale, state.fitScale);

      if (!isZoomed && event.pointerType !== "mouse") {
        if (wipeAxis === "none") {
          const locked = lockWipeAxis(dx, dy);
          if (locked === "none") return;
          wipeAxis = locked;
        }
        emitWipeDrag(state, wipeAxis, dx, dy);
        return;
      }

      if (isZoomed && state.stageRect) {
        const bounds = boundsFor(state, state.stageRect, state.scale);
        if (event.pointerType !== "mouse") {
          if (wipeAxis === "none") {
            const candidate = lockWipeAxis(dx, dy);
            if (candidate !== "none" && isZoomedBoundaryWipeAllowed(state, bounds, candidate, dx, dy)) {
              wipeAxis = candidate;
            }
          }
          if (wipeAxis !== "none") {
            const stillInBoundaryDirection = isZoomedBoundaryWipeAllowed(state, bounds, wipeAxis, dx, dy);
            emitWipeDrag(
              state,
              wipeAxis,
              stillInBoundaryDirection ? dx : 0,
              stillInBoundaryDirection ? dy : 0,
            );
            return;
          }
        }

        const deltaX = event.clientX - lastPointerPos.x;
        const deltaY = event.clientY - lastPointerPos.y;
        lastPointerPos = { x: event.clientX, y: event.clientY };

        commitClamped(
          state,
          state.stageRect,
          { scale: state.scale, translateX: state.translateX + deltaX, translateY: state.translateY + deltaY },
          false,
          panMargin(state.stageRect),
        );
      }
    }
  }

  function finishVideoPointer(event: PointerEvent, cancelled: boolean) {
    releaseCapture(event.currentTarget, event.pointerId);
    const start = pointerStart;
    const activeAxis = wipeAxis;
    const fromOffsetX = wipeOffsetX;
    pointerStart = null;
    clearWipeTracking();
    options.setPanning?.(false);
    if (!start) return;

    if (cancelled) {
      options.clearSuppressClick?.();
      if (activeAxis !== "none") options.onWipeSnapBack?.();
      return;
    }

    const state = options.getState();
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    const elapsed = Date.now() - start.t;
    const effectiveAxis = activeAxis !== "none" ? activeAxis : lockWipeAxis(dx, dy);
    const canNavigate = state.canNavigate ?? true;

    const commit = resolveWipeCommit({
      axis: effectiveAxis,
      deltaX: dx,
      deltaY: dy,
      elapsedMs: elapsed,
      stageWidth: state.stageRect?.width ?? 0,
      stageHeight: state.stageRect?.height ?? 0,
      canGoLeft: canNavigate,
      canGoRight: canNavigate,
      canDismiss: true,
      minDistancePx: 60,
    });

    if (commit === "left" || commit === "right") {
      options.suppressClick?.();
      commitNavigation(commit === "left" ? "next" : "prev", state, fromOffsetX);
      return;
    }
    if (commit === "down") {
      options.suppressClick?.();
      options.onDismiss();
      return;
    }
    if (activeAxis !== "none") {
      options.onWipeSnapBack?.();
    }
  }

  function finishPointer(event: PointerEvent, cancelled: boolean) {
    const state = options.getState();
    if (state.isVideo) {
      finishVideoPointer(event, cancelled);
      return;
    }

    releaseCapture(event.currentTarget, event.pointerId);

    const pointerId = event.pointerId ?? 0;
    activePointers.delete(pointerId);

    if (isPinching) {
      clearWipeTracking();
      if (activePointers.size === 0) {
        isPinching = false;
        if (state.scale < state.fitScale) {
          options.setTransform({ scale: state.fitScale, translateX: 0, translateY: 0 }, { animated: true });
        } else if (state.stageRect) {
          commitClamped(state, state.stageRect, transformOf(state), true);
        }
      } else if (activePointers.size === 1) {
        const remaining = activePointers.values().next().value;
        if (remaining) {
          lastPointerPos = { x: remaining.x, y: remaining.y };
        }
        pointerStart = null;
      }
      return;
    }

    const start = pointerStart;
    const activeAxis = wipeAxis;
    const fromOffsetX = wipeOffsetX;
    pointerStart = null;
    clearWipeTracking();
    options.setPanning?.(false);
    const isZoomed = isZoomedBeyondFit(state.scale, state.fitScale);

    if (cancelled) {
      options.clearSuppressClick?.();
      if (activeAxis !== "none") options.onWipeSnapBack?.();
      if (isZoomed && state.stageRect) commitClamped(state, state.stageRect, transformOf(state), true);
      return;
    }

    if (!start) {
      if (activeAxis !== "none") options.onWipeSnapBack?.();
      if (isZoomed && state.stageRect) commitClamped(state, state.stageRect, transformOf(state), true);
      return;
    }

    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    const elapsed = Date.now() - start.t;
    const moved = Math.hypot(dx, dy) > 6;
    const target = event.target as HTMLElement;

    if (!isZoomed && !moved && event.pointerType === "mouse" && !target?.closest("[data-lightbox-media]")) {
      options.onDismiss();
      return;
    }

    const bounds = state.stageRect
      ? boundsFor(state, state.stageRect, state.scale)
      : { minX: 0, maxX: 0, minY: 0, maxY: 0 };

    const canNavigate = state.canNavigate ?? true;

    if (event.pointerType !== "mouse") {
      const effectiveAxis = activeAxis !== "none" ? activeAxis : lockWipeAxis(dx, dy);
      const boundaryAllowed = isZoomedBoundaryWipeAllowed(state, bounds, effectiveAxis, dx, dy);
      const commit = boundaryAllowed
        ? resolveWipeCommit({
            axis: effectiveAxis,
            deltaX: dx,
            deltaY: dy,
            elapsedMs: elapsed,
            stageWidth: state.stageRect?.width ?? 0,
            stageHeight: state.stageRect?.height ?? 0,
            canGoLeft: canNavigate,
            canGoRight: canNavigate,
            canDismiss: true,
            minDistancePx: 60,
          })
        : "none";

      if (commit === "left" || commit === "right") {
        commitNavigation(commit === "left" ? "next" : "prev", state, fromOffsetX);
        return;
      }
      if (commit === "down") {
        options.onDismiss();
        return;
      }
      if (activeAxis !== "none") {
        options.onWipeSnapBack?.();
      }
    } else {
      const swipeAction = resolveSwipeAction({
        scale: state.scale,
        fitScale: state.fitScale,
        deltaX: dx,
        deltaY: dy,
        elapsedMs: elapsed,
        currentTranslate: dragStartTranslate,
        bounds,
        pointerType: event.pointerType,
      });

      if (swipeAction === "next" || swipeAction === "prev") {
        options.onNavigate(swipeAction);
        return;
      }
      if (swipeAction === "dismiss") {
        options.onDismiss();
        return;
      }
    }

    if (isZoomed && state.stageRect) commitClamped(state, state.stageRect, transformOf(state), true);

    if (!moved && event.pointerType !== "mouse" && !state.isVideo && state.stageRect) {
      const now = Date.now();
      const tapDist = Math.hypot(event.clientX - lastTapPos.x, event.clientY - lastTapPos.y);
      if (now - lastTapAt < doubleTapMs && tapDist < 30) {
        lastTapAt = 0;
        zoomAtClientPoint(state, state.stageRect, event.clientX, event.clientY);
        return;
      }
      lastTapAt = now;
      lastTapPos = { x: event.clientX, y: event.clientY };
    }
  }

  function onPointerUp(event: PointerEvent) {
    finishPointer(event, false);
  }

  function onPointerCancel(event: PointerEvent) {
    finishPointer(event, true);
  }

  function onDoubleClick(event: MouseEvent) {
    const state = options.getState();
    if (state.isVideo || !state.stageRect) return;
    zoomAtClientPoint(state, state.stageRect, event.clientX, event.clientY);
  }

  function reset() {
    activePointers.clear();
    isPinching = false;
    pointerStart = null;
    clearWipeTracking();
    options.setPanning?.(false);
  }

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onDoubleClick,
    reset,
  };
}

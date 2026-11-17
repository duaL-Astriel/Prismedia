/**
 * Shared math, gesture disambiguation, and animation state helpers for
 * interactive drag-follow wipe gestures across images, videos, and comics.
 */

export type WipeAxis = "none" | "horizontal" | "vertical";
export type WipeDirection = "left" | "right" | "down";
export type WipePhase = "idle" | "dragging" | "entering" | "settling";

export interface WipeAxisOptions {
  /** Minimum pointer travel in px before locking a wipe axis. */
  slopPx?: number;
  /** Required dominance ratio between primary and secondary axes. */
  dominanceRatio?: number;
  /** Whether horizontal wiping is permitted. */
  allowHorizontal?: boolean;
  /** Whether downward vertical dismiss wiping is permitted. */
  allowDismiss?: boolean;
}

export interface WipeVisualState {
  phase: WipePhase;
  axis: WipeAxis;
  offsetX: number;
  offsetY: number;
  scale: number;
  backdropOpacity: number;
  progress: number;
  /** Offset of the outgoing snapshot during a committed wipe transition. */
  outgoingOffsetX: number;
}

export interface WipeCommitParams {
  axis: WipeAxis;
  deltaX: number;
  deltaY: number;
  elapsedMs: number;
  stageWidth: number;
  stageHeight: number;
  canGoLeft?: boolean;
  canGoRight?: boolean;
  canDismiss?: boolean;
  minDistancePx?: number;
  maxFlickDurationMs?: number;
  minVelocityPxPerMs?: number;
  horizontalExtentRatio?: number;
  verticalExtentRatio?: number;
}

export interface WipeVisualParams {
  phase: WipePhase;
  axis: WipeAxis;
  offsetX: number;
  offsetY: number;
  stageWidth: number;
  stageHeight: number;
  outgoingOffsetX?: number;
}

export interface WipeTransitionHandle {
  /** Start or update live drag visuals while tracking a pointer. */
  drag: (params: {
    axis: WipeAxis;
    offsetX: number;
    offsetY: number;
    stageWidth: number;
    stageHeight: number;
  }) => void;
  /** Animate back to the resting center state after an uncommitted drag. */
  snapBack: () => void;
  /**
   * Commit a horizontal wipe: executes `onSwap` synchronously, places the
   * incoming surface at the dragged continuation offset, and transitions it to rest.
   */
  commitHorizontal: (params: {
    direction: "left" | "right";
    fromOffsetX: number;
    stageWidth: number;
    reducedMotion?: boolean;
    onSwap: () => void;
  }) => void;
  /** Cancel any in-flight animation frame or settle timer and reset to idle. */
  reset: () => void;
}

export const WIPE_SLOP_PX = 10;
export const WIPE_DOMINANCE_RATIO = 1.3;
export const WIPE_BOUNDARY_RESISTANCE = 0.28;
export const WIPE_GUTTER_PX = 16;
export const WIPE_SETTLE_MS = 220;
export const WIPE_EASING = "cubic-bezier(0.16, 1, 0.3, 1)";
export const WIPE_FLICK_MAX_MS = 350;
export const WIPE_FLICK_MIN_DISTANCE_PX = 40;
export const WIPE_FLICK_MIN_VELOCITY = 0.35;

/**
 * Returns an idle, resting `WipeVisualState`.
 */
export function idleWipeVisualState(): WipeVisualState {
  return {
    phase: "idle",
    axis: "none",
    offsetX: 0,
    offsetY: 0,
    scale: 1,
    backdropOpacity: 1,
    progress: 0,
    outgoingOffsetX: 0,
  };
}

/**
 * Determines whether a pointer drag has exceeded slop and locked to a wipe axis.
 */
export function lockWipeAxis(
  dx: number,
  dy: number,
  options: WipeAxisOptions = {},
): WipeAxis {
  const {
    slopPx = WIPE_SLOP_PX,
    dominanceRatio = WIPE_DOMINANCE_RATIO,
    allowHorizontal = true,
    allowDismiss = true,
  } = options;

  if (Math.hypot(dx, dy) <= slopPx) {
    return "none";
  }

  const absX = Math.abs(dx);
  const absY = Math.abs(dy);

  if (allowHorizontal && absX > absY * dominanceRatio) {
    return "horizontal";
  }

  if (allowDismiss && dy > 0 && absY > absX * dominanceRatio) {
    return "vertical";
  }

  return "none";
}

/**
 * Applies rubber-band resistance when dragging past a boundary without a target.
 */
export function applyWipeResistance(
  delta: number,
  canProceed: boolean,
  resistance = WIPE_BOUNDARY_RESISTANCE,
): number {
  return canProceed ? delta : Math.round(delta * resistance * 100) / 100;
}

/**
 * Computes normalized visual transform values (scale, backdrop fade, progress)
 * for an active or settling wipe gesture.
 */
export function computeWipeVisuals(params: WipeVisualParams): WipeVisualState {
  const {
    phase,
    axis,
    offsetX,
    offsetY,
    stageWidth,
    stageHeight,
    outgoingOffsetX = 0,
  } = params;

  if (axis === "vertical") {
    const clampedY = Math.max(0, offsetY);
    const refHeight = Math.max(220, stageHeight * 0.45);
    const progress = Math.min(1, Math.max(0, clampedY / refHeight));
    return {
      phase,
      axis,
      offsetX: 0,
      offsetY: clampedY,
      scale: 1 - progress * 0.14,
      backdropOpacity: 1 - progress * 0.65,
      progress,
      outgoingOffsetX: 0,
    };
  }

  if (axis === "horizontal") {
    const refWidth = Math.max(240, stageWidth);
    const progress = Math.min(1, Math.max(0, Math.abs(offsetX) / refWidth));
    return {
      phase,
      axis,
      offsetX,
      offsetY: 0,
      scale: 1,
      backdropOpacity: 1,
      progress,
      outgoingOffsetX,
    };
  }

  return {
    phase,
    axis: "none",
    offsetX: 0,
    offsetY: 0,
    scale: 1,
    backdropOpacity: 1,
    progress: 0,
    outgoingOffsetX: 0,
  };
}

/**
 * Resolves whether a released wipe drag commits a left/right navigation or
 * downward dismissal, or snaps back (`"none"`).
 */
export function resolveWipeCommit(params: WipeCommitParams): WipeDirection | "none" {
  const {
    axis,
    deltaX,
    deltaY,
    elapsedMs,
    stageWidth,
    stageHeight,
    canGoLeft = true,
    canGoRight = true,
    canDismiss = true,
    minDistancePx = 50,
    maxFlickDurationMs = 700,
    minVelocityPxPerMs = WIPE_FLICK_MIN_VELOCITY,
    horizontalExtentRatio = 0.32,
    verticalExtentRatio = 0.22,
  } = params;

  if (axis === "horizontal") {
    if (deltaX === 0) return "none";
    const direction: "left" | "right" = deltaX < 0 ? "left" : "right";
    const canProceed = direction === "left" ? canGoLeft : canGoRight;
    if (!canProceed) return "none";

    const absX = Math.abs(deltaX);
    const velocity = absX / Math.max(1, elapsedMs);
    const passedExtent = stageWidth > 0 && absX >= stageWidth * horizontalExtentRatio;
    const passedDistance = elapsedMs <= maxFlickDurationMs && absX >= minDistancePx;
    const passedFlick =
      elapsedMs <= WIPE_FLICK_MAX_MS &&
      absX >= WIPE_FLICK_MIN_DISTANCE_PX &&
      velocity >= minVelocityPxPerMs;

    return passedExtent || passedDistance || passedFlick ? direction : "none";
  }

  if (axis === "vertical") {
    if (!canDismiss || deltaY <= 0) return "none";
    const velocity = deltaY / Math.max(1, elapsedMs);
    const passedExtent = stageHeight > 0 && deltaY >= stageHeight * verticalExtentRatio;
    const passedDistance = elapsedMs <= maxFlickDurationMs && deltaY >= minDistancePx;
    const passedFlick =
      elapsedMs <= WIPE_FLICK_MAX_MS &&
      deltaY >= WIPE_FLICK_MIN_DISTANCE_PX &&
      velocity >= minVelocityPxPerMs;

    return passedExtent || passedDistance || passedFlick ? "down" : "none";
  }

  return "none";
}

/**
 * Computes the horizontal offset in px for an adjacent incoming preview pane
 * sitting beside the active dragged surface.
 */
export function computeAdjacentPreviewOffset(
  offsetX: number,
  stageWidth: number,
  gutterPx = WIPE_GUTTER_PX,
): number | null {
  if (stageWidth <= 0 || offsetX === 0) return null;
  const stride = stageWidth + gutterPx;
  return offsetX < 0 ? stride + offsetX : -stride + offsetX;
}

/**
 * Formats a CSS `transform` string for a `WipeVisualState`.
 */
export function formatWipeTransform(visuals: WipeVisualState): string | undefined {
  if (visuals.phase === "idle" && visuals.offsetX === 0 && visuals.offsetY === 0 && visuals.scale === 1) {
    return undefined;
  }
  const scalePart = visuals.scale !== 1 ? ` scale(${visuals.scale})` : "";
  return `translate3d(${visuals.offsetX}px, ${visuals.offsetY}px, 0)${scalePart}`;
}

/**
 * Returns the CSS `transition` value for a given wipe phase.
 */
export function formatWipeTransition(
  phase: WipePhase,
  reducedMotion = false,
  durationMs = WIPE_SETTLE_MS,
): string {
  if (reducedMotion || phase !== "settling") return "none";
  return `transform ${durationMs}ms ${WIPE_EASING}`;
}

/**
 * Creates a transition coordinator for drag-follow, snap-back, and committed
 * horizontal wipe-in animations, cancelling stale timers/frames automatically.
 */
export function createWipeTransitionController(options: {
  onUpdate: (state: WipeVisualState) => void;
  onAnimationEnd?: () => void;
  durationMs?: number;
  gutterPx?: number;
  isReducedMotion?: () => boolean;
}): WipeTransitionHandle {
  const durationMs = options.durationMs ?? WIPE_SETTLE_MS;
  const gutterPx = options.gutterPx ?? WIPE_GUTTER_PX;

  let current: WipeVisualState = idleWipeVisualState();
  let frameA: number | null = null;
  let frameB: number | null = null;
  let settleTimer: ReturnType<typeof setTimeout> | null = null;
  let generation = 0;

  function clearScheduled() {
    if (frameA !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(frameA);
    }
    if (frameB !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(frameB);
    }
    if (settleTimer !== null) {
      clearTimeout(settleTimer);
    }
    frameA = null;
    frameB = null;
    settleTimer = null;
  }

  function emit(next: WipeVisualState) {
    current = next;
    options.onUpdate(next);
  }

  function drag(params: {
    axis: WipeAxis;
    offsetX: number;
    offsetY: number;
    stageWidth: number;
    stageHeight: number;
  }) {
    generation += 1;
    clearScheduled();
    emit(
      computeWipeVisuals({
        phase: "dragging",
        axis: params.axis,
        offsetX: params.offsetX,
        offsetY: params.offsetY,
        stageWidth: params.stageWidth,
        stageHeight: params.stageHeight,
      }),
    );
  }

  function snapBack() {
    if (current.phase === "idle" && current.offsetX === 0 && current.offsetY === 0) return;
    generation += 1;
    const token = generation;
    clearScheduled();

    if (options.isReducedMotion?.()) {
      emit(idleWipeVisualState());
      options.onAnimationEnd?.();
      return;
    }

    emit({
      ...idleWipeVisualState(),
      phase: "settling",
      axis: current.axis,
    });

    settleTimer = setTimeout(() => {
      if (token !== generation) return;
      settleTimer = null;
      emit(idleWipeVisualState());
      options.onAnimationEnd?.();
    }, durationMs);
  }

  function commitHorizontal(params: {
    direction: "left" | "right";
    fromOffsetX: number;
    stageWidth: number;
    reducedMotion?: boolean;
    onSwap: () => void;
  }) {
    generation += 1;
    const token = generation;
    clearScheduled();

    const reduced = params.reducedMotion ?? options.isReducedMotion?.() ?? false;
    const stride = params.stageWidth > 0 ? params.stageWidth + gutterPx : 0;

    params.onSwap();

    if (reduced || stride <= 0) {
      emit(idleWipeVisualState());
      options.onAnimationEnd?.();
      return;
    }

    const incomingStartX =
      params.direction === "left"
        ? stride + params.fromOffsetX
        : -stride + params.fromOffsetX;
    const outgoingEndX = params.direction === "left" ? -stride : stride;

    emit({
      phase: "entering",
      axis: "horizontal",
      offsetX: incomingStartX,
      offsetY: 0,
      scale: 1,
      backdropOpacity: 1,
      progress: 0,
      outgoingOffsetX: params.fromOffsetX,
    });

    const scheduleSettle = () => {
      if (token !== generation) return;
      emit({
        phase: "settling",
        axis: "horizontal",
        offsetX: 0,
        offsetY: 0,
        scale: 1,
        backdropOpacity: 1,
        progress: 0,
        outgoingOffsetX: outgoingEndX,
      });

      settleTimer = setTimeout(() => {
        if (token !== generation) return;
        settleTimer = null;
        emit(idleWipeVisualState());
        options.onAnimationEnd?.();
      }, durationMs);
    };

    if (typeof requestAnimationFrame === "function") {
      frameA = requestAnimationFrame(() => {
        if (token !== generation) return;
        frameB = requestAnimationFrame(scheduleSettle);
      });
    } else {
      scheduleSettle();
    }
  }

  function reset() {
    generation += 1;
    clearScheduled();
    emit(idleWipeVisualState());
  }

  return {
    drag,
    snapBack,
    commitHorizontal,
    reset,
  };
}

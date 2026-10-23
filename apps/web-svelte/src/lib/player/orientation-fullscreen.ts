/**
 * Orientation and auto-fullscreen helpers for mobile/touch viewports.
 */

export type DeviceOrientation = "landscape" | "portrait";

export type OrientationFullscreenAction =
  | "enter-fullscreen"
  | "exit-fullscreen"
  | "none";

export interface OrientationFullscreenState {
  /** The last observed orientation. */
  lastOrientation: DeviceOrientation | null;
  /**
   * Tracks an orientation where the user manually exited fullscreen,
   * preventing auto re-entry until orientation changes.
   */
  manualExitOrientation: DeviceOrientation | null;
}

export interface OrientationDecisionParams {
  /** Current device orientation. */
  currentOrientation: DeviceOrientation;
  /** Whether the user has auto-fullscreen on landscape enabled. */
  autoFullscreenEnabled: boolean;
  /** Whether the viewport is a mobile/touch viewport. */
  isTouchViewport: boolean;
  /** Whether playback is engaged (actively playing, or paused after playback began). */
  isEngaged: boolean;
  /** Whether the player is currently in fullscreen. */
  isFullscreen: boolean;
  /** Current state of the orientation controller. */
  state: OrientationFullscreenState;
}

export interface OrientationDecisionResult {
  action: OrientationFullscreenAction;
  nextState: OrientationFullscreenState;
}

/**
 * Pure decision function that determines what fullscreen action to take
 * when device orientation changes or is evaluated.
 */
export function evaluateOrientationDecision(
  params: OrientationDecisionParams,
): OrientationDecisionResult {
  const {
    currentOrientation,
    autoFullscreenEnabled,
    isTouchViewport,
    isEngaged,
    isFullscreen,
    state,
  } = params;

  const previousOrientation = state.lastOrientation;
  let manualExitOrientation = state.manualExitOrientation;

  // If orientation transitioned to another orientation, clear manual exit block
  // for the prior orientation.
  if (previousOrientation !== null && previousOrientation !== currentOrientation) {
    if (manualExitOrientation !== currentOrientation) {
      manualExitOrientation = null;
    }
  }

  // Auto-fullscreen only acts on mobile/touch viewports when enabled.
  if (!isTouchViewport || !autoFullscreenEnabled) {
    return {
      action: "none",
      nextState: {
        lastOrientation: currentOrientation,
        manualExitOrientation,
      },
    };
  }

  // Only trigger when an orientation transition actually occurred.
  const orientationChanged =
    previousOrientation !== null && previousOrientation !== currentOrientation;

  if (orientationChanged) {
    if (currentOrientation === "landscape") {
      // Rotating to landscape while playback is engaged: enter fullscreen
      // unless currently fullscreen or the user manually dismissed fullscreen in this orientation.
      if (isEngaged && !isFullscreen && manualExitOrientation !== "landscape") {
        return {
          action: "enter-fullscreen",
          nextState: {
            lastOrientation: currentOrientation,
            manualExitOrientation: null,
          },
        };
      }
    } else if (currentOrientation === "portrait") {
      // Rotating back to portrait while in fullscreen: exit fullscreen.
      if (isFullscreen) {
        return {
          action: "exit-fullscreen",
          nextState: {
            lastOrientation: currentOrientation,
            manualExitOrientation: null,
          },
        };
      }
    }
  }

  return {
    action: "none",
    nextState: {
      lastOrientation: currentOrientation,
      manualExitOrientation,
    },
  };
}

/**
 * Updates the orientation controller state when fullscreen state changes.
 * Remembers manual exits in landscape so we do not re-trigger fullscreen
 * while the device remains in landscape.
 */
export function evaluateFullscreenChange(
  isFullscreen: boolean,
  currentOrientation: DeviceOrientation,
  state: OrientationFullscreenState,
): OrientationFullscreenState {
  if (!isFullscreen && currentOrientation === "landscape") {
    return {
      ...state,
      manualExitOrientation: "landscape",
    };
  }
  return state;
}

/**
 * Detects whether the current browser/viewport is a touch or mobile viewport.
 */
export function isTouchViewport(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(pointer: coarse)").matches === true ||
    "ontouchstart" in window ||
    (navigator?.maxTouchPoints ?? 0) > 0
  );
}

/**
 * Returns the current device orientation using the Screen Orientation API
 * with fallback to matchMedia('(orientation: landscape)').
 */
export function getDeviceOrientation(): DeviceOrientation {
  if (typeof window === "undefined") return "portrait";
  const screenOrientation = window.screen?.orientation;
  if (screenOrientation?.type) {
    return screenOrientation.type.startsWith("landscape") ? "landscape" : "portrait";
  }
  if (typeof window.matchMedia === "function") {
    return window.matchMedia("(orientation: landscape)").matches ? "landscape" : "portrait";
  }
  return "portrait";
}

/**
 * Subscribes to device orientation changes using screen.orientation with fallback to matchMedia.
 * Returns an unsubscribe cleanup function.
 */
export function subscribeOrientationChange(
  callback: (orientation: DeviceOrientation) => void,
): () => void {
  if (typeof window === "undefined") return () => {};

  const handler = () => {
    callback(getDeviceOrientation());
  };

  const screenOrientation = window.screen?.orientation;
  if (screenOrientation && typeof screenOrientation.addEventListener === "function") {
    screenOrientation.addEventListener("change", handler);
    return () => {
      screenOrientation.removeEventListener("change", handler);
    };
  }

  if (typeof window.matchMedia === "function") {
    const mql = window.matchMedia("(orientation: landscape)");
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", handler);
      return () => {
        mql.removeEventListener("change", handler);
      };
    } else if ("addListener" in mql) {
      // Legacy Safari fallback
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mql as any).addListener(handler);
      return () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (mql as any).removeListener(handler);
      };
    }
  }

  return () => {};
}

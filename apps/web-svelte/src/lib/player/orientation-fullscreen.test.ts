import { describe, expect, it, vi } from "vitest";
import {
  evaluateFullscreenChange,
  evaluateOrientationDecision,
  getDeviceOrientation,
  isTouchViewport,
  subscribeOrientationChange,
  type OrientationFullscreenState,
} from "./orientation-fullscreen";

describe("orientation-fullscreen pure decision logic", () => {
  const defaultState: OrientationFullscreenState = {
    lastOrientation: "portrait",
    manualExitOrientation: null,
  };

  it("enters fullscreen when rotating to landscape while playback is engaged on touch viewport", () => {
    const result = evaluateOrientationDecision({
      currentOrientation: "landscape",
      autoFullscreenEnabled: true,
      isTouchViewport: true,
      isEngaged: true,
      isFullscreen: false,
      state: defaultState,
    });

    expect(result.action).toBe("enter-fullscreen");
    expect(result.nextState).toEqual({
      lastOrientation: "landscape",
      manualExitOrientation: null,
    });
  });

  it("enters fullscreen when rotating to landscape while paused after playback began", () => {
    // isEngaged is true for paused after playback began
    const result = evaluateOrientationDecision({
      currentOrientation: "landscape",
      autoFullscreenEnabled: true,
      isTouchViewport: true,
      isEngaged: true,
      isFullscreen: false,
      state: defaultState,
    });

    expect(result.action).toBe("enter-fullscreen");
    expect(result.nextState.lastOrientation).toBe("landscape");
  });

  it("does not enter fullscreen before playback starts (not engaged)", () => {
    const result = evaluateOrientationDecision({
      currentOrientation: "landscape",
      autoFullscreenEnabled: true,
      isTouchViewport: true,
      isEngaged: false,
      isFullscreen: false,
      state: defaultState,
    });

    expect(result.action).toBe("none");
    expect(result.nextState).toEqual({
      lastOrientation: "landscape",
      manualExitOrientation: null,
    });
  });

  it("does not enter fullscreen when already in fullscreen", () => {
    const result = evaluateOrientationDecision({
      currentOrientation: "landscape",
      autoFullscreenEnabled: true,
      isTouchViewport: true,
      isEngaged: true,
      isFullscreen: true,
      state: defaultState,
    });

    expect(result.action).toBe("none");
    expect(result.nextState.lastOrientation).toBe("landscape");
  });

  it("exits fullscreen when rotating back to portrait while in fullscreen", () => {
    const landscapeState: OrientationFullscreenState = {
      lastOrientation: "landscape",
      manualExitOrientation: null,
    };

    const result = evaluateOrientationDecision({
      currentOrientation: "portrait",
      autoFullscreenEnabled: true,
      isTouchViewport: true,
      isEngaged: true,
      isFullscreen: true,
      state: landscapeState,
    });

    expect(result.action).toBe("exit-fullscreen");
    expect(result.nextState).toEqual({
      lastOrientation: "portrait",
      manualExitOrientation: null,
    });
  });

  it("does not exit fullscreen when rotating to portrait if not in fullscreen", () => {
    const landscapeState: OrientationFullscreenState = {
      lastOrientation: "landscape",
      manualExitOrientation: null,
    };

    const result = evaluateOrientationDecision({
      currentOrientation: "portrait",
      autoFullscreenEnabled: true,
      isTouchViewport: true,
      isEngaged: true,
      isFullscreen: false,
      state: landscapeState,
    });

    expect(result.action).toBe("none");
    expect(result.nextState.lastOrientation).toBe("portrait");
  });

  it("does not re-enter fullscreen after manual exit while orientation remains unchanged", () => {
    // 1. Enter fullscreen in landscape
    const enterResult = evaluateOrientationDecision({
      currentOrientation: "landscape",
      autoFullscreenEnabled: true,
      isTouchViewport: true,
      isEngaged: true,
      isFullscreen: false,
      state: defaultState,
    });
    expect(enterResult.action).toBe("enter-fullscreen");

    // 2. User manually exits fullscreen while still in landscape
    const afterManualExit = evaluateFullscreenChange(
      false,
      "landscape",
      enterResult.nextState,
    );
    expect(afterManualExit.manualExitOrientation).toBe("landscape");

    // 3. Orientation event or re-check happens while still in landscape
    const recheckResult = evaluateOrientationDecision({
      currentOrientation: "landscape",
      autoFullscreenEnabled: true,
      isTouchViewport: true,
      isEngaged: true,
      isFullscreen: false,
      state: afterManualExit,
    });
    expect(recheckResult.action).toBe("none");
    expect(recheckResult.nextState.manualExitOrientation).toBe("landscape");
  });

  it("resets manual exit guard when rotating back to portrait, allowing future landscape auto-fullscreen", () => {
    const manualExitedState: OrientationFullscreenState = {
      lastOrientation: "landscape",
      manualExitOrientation: "landscape",
    };

    // Rotate to portrait
    const portraitResult = evaluateOrientationDecision({
      currentOrientation: "portrait",
      autoFullscreenEnabled: true,
      isTouchViewport: true,
      isEngaged: true,
      isFullscreen: false,
      state: manualExitedState,
    });
    expect(portraitResult.action).toBe("none");
    expect(portraitResult.nextState.manualExitOrientation).toBeNull();
    expect(portraitResult.nextState.lastOrientation).toBe("portrait");

    // Rotate back to landscape
    const landscapeAgain = evaluateOrientationDecision({
      currentOrientation: "landscape",
      autoFullscreenEnabled: true,
      isTouchViewport: true,
      isEngaged: true,
      isFullscreen: false,
      state: portraitResult.nextState,
    });
    expect(landscapeAgain.action).toBe("enter-fullscreen");
    expect(landscapeAgain.nextState.lastOrientation).toBe("landscape");
  });

  it("takes no action when autoFullscreenEnabled is false", () => {
    const result = evaluateOrientationDecision({
      currentOrientation: "landscape",
      autoFullscreenEnabled: false,
      isTouchViewport: true,
      isEngaged: true,
      isFullscreen: false,
      state: defaultState,
    });

    expect(result.action).toBe("none");
  });

  it("takes no action on desktop/non-touch viewports", () => {
    const result = evaluateOrientationDecision({
      currentOrientation: "landscape",
      autoFullscreenEnabled: true,
      isTouchViewport: false,
      isEngaged: true,
      isFullscreen: false,
      state: defaultState,
    });

    expect(result.action).toBe("none");
  });

  it("takes no action on initial load when previousOrientation is null", () => {
    const initialState: OrientationFullscreenState = {
      lastOrientation: null,
      manualExitOrientation: null,
    };

    const result = evaluateOrientationDecision({
      currentOrientation: "landscape",
      autoFullscreenEnabled: true,
      isTouchViewport: true,
      isEngaged: true,
      isFullscreen: false,
      state: initialState,
    });

    expect(result.action).toBe("none");
    expect(result.nextState.lastOrientation).toBe("landscape");
  });
});

describe("orientation DOM helpers", () => {
  it("determines orientation from screen.orientation when available", () => {
    const originalScreen = window.screen;
    try {
      Object.defineProperty(window, "screen", {
        value: {
          orientation: {
            type: "landscape-primary",
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
          },
        },
        configurable: true,
      });

      expect(getDeviceOrientation()).toBe("landscape");
    } finally {
      Object.defineProperty(window, "screen", {
        value: originalScreen,
        configurable: true,
      });
    }
  });

  it("falls back to matchMedia when screen.orientation is unavailable", () => {
    const originalScreen = window.screen;
    const originalMatchMedia = window.matchMedia;
    try {
      Object.defineProperty(window, "screen", {
        value: {},
        configurable: true,
      });
      window.matchMedia = vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      });

      expect(getDeviceOrientation()).toBe("landscape");
    } finally {
      Object.defineProperty(window, "screen", {
        value: originalScreen,
        configurable: true,
      });
      window.matchMedia = originalMatchMedia;
    }
  });

  it("subscribes to screen.orientation changes", () => {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    const originalScreen = window.screen;

    try {
      Object.defineProperty(window, "screen", {
        value: {
          orientation: {
            type: "landscape-primary",
            addEventListener,
            removeEventListener,
          },
        },
        configurable: true,
      });

      const callback = vi.fn();
      const unsubscribe = subscribeOrientationChange(callback);

      expect(addEventListener).toHaveBeenCalledWith("change", expect.any(Function));
      unsubscribe();
      expect(removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
    } finally {
      Object.defineProperty(window, "screen", {
        value: originalScreen,
        configurable: true,
      });
    }
  });

  it("detects touch viewport via matchMedia or maxTouchPoints", () => {
    const originalMatchMedia = window.matchMedia;
    try {
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query === "(pointer: coarse)",
      }));
      expect(isTouchViewport()).toBe(true);
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });
});

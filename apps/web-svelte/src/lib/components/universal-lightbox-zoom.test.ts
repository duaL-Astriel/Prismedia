import { describe, expect, it } from "vitest";
import {
  calculateClampBounds,
  calculateDoubleTapZoom,
  calculateFocalZoom,
  calculatePinchTransform,
  clampTranslation,
  clientToStage,
  getCentroid,
  getDistance,
  isZoomedBeyondFit,
  resolveSwipeAction,
  type ClampBounds,
  type TransformState,
} from "./universal-lightbox-zoom";

describe("universal-lightbox-zoom math helpers", () => {
  describe("geometry helpers", () => {
    it("computes Euclidean distance accurately", () => {
      expect(getDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBeCloseTo(5);
      expect(getDistance({ x: 10, y: 20 }, { x: 10, y: 20 })).toBe(0);
    });

    it("computes centroid between two points", () => {
      expect(getCentroid({ x: 10, y: 20 }, { x: 30, y: 40 })).toEqual({ x: 20, y: 30 });
    });

    it("transforms client coordinates to stage-center coordinates", () => {
      const stageRect = { left: 100, top: 50, width: 800, height: 600 };
      // Stage center is at client (100 + 400 = 500, 50 + 300 = 350)
      expect(clientToStage({ x: 500, y: 350 }, stageRect)).toEqual({ x: 0, y: 0 });
      expect(clientToStage({ x: 600, y: 300 }, stageRect)).toEqual({ x: 100, y: -50 });
    });

    it("evaluates isZoomedBeyondFit with configurable threshold", () => {
      expect(isZoomedBeyondFit(1.0, 1.0)).toBe(false);
      expect(isZoomedBeyondFit(1.01, 1.0)).toBe(false);
      expect(isZoomedBeyondFit(1.03, 1.0)).toBe(true);
      expect(isZoomedBeyondFit(2.5, 1.0)).toBe(true);
    });
  });

  describe("calculateFocalZoom & focal-point invariance", () => {
    it("preserves the visual screen coordinate of the media point under the focal point", () => {
      const current: TransformState = {
        scale: 1.0,
        translateX: 20,
        translateY: -30,
      };
      const focalPoint = { x: 150, y: -80 };
      const nextScale = 2.5;

      // Identify the media point under focalPoint prior to zoom:
      // screenX = current.translateX + mediaX * current.scale
      // mediaX = (focalPoint.x - current.translateX) / current.scale
      const mediaPoint = {
        x: (focalPoint.x - current.translateX) / current.scale,
        y: (focalPoint.y - current.translateY) / current.scale,
      };

      const next = calculateFocalZoom(current, nextScale, focalPoint);

      // Verify that at nextScale with next translation, the media point still maps to focalPoint:
      const screenXAfter = next.translateX + mediaPoint.x * next.scale;
      const screenYAfter = next.translateY + mediaPoint.y * next.scale;

      expect(next.scale).toBe(nextScale);
      expect(screenXAfter).toBeCloseTo(focalPoint.x);
      expect(screenYAfter).toBeCloseTo(focalPoint.y);
    });

    it("handles zooming in and out around non-zero focal points repeatedly without drift", () => {
      let state: TransformState = { scale: 1.2, translateX: -40, translateY: 60 };
      const focal = { x: 75, y: -120 };

      const mediaX = (focal.x - state.translateX) / state.scale;
      const mediaY = (focal.y - state.translateY) / state.scale;

      state = calculateFocalZoom(state, 2.0, focal);
      expect(state.translateX + mediaX * state.scale).toBeCloseTo(focal.x);
      expect(state.translateY + mediaY * state.scale).toBeCloseTo(focal.y);

      state = calculateFocalZoom(state, 3.5, focal);
      expect(state.translateX + mediaX * state.scale).toBeCloseTo(focal.x);
      expect(state.translateY + mediaY * state.scale).toBeCloseTo(focal.y);

      state = calculateFocalZoom(state, 0.8, focal);
      expect(state.translateX + mediaX * state.scale).toBeCloseTo(focal.x);
      expect(state.translateY + mediaY * state.scale).toBeCloseTo(focal.y);
    });

    it("safely handles identical scale or invalid current scale", () => {
      const current: TransformState = { scale: 1.5, translateX: 10, translateY: 20 };
      expect(calculateFocalZoom(current, 1.5, { x: 50, y: 50 })).toEqual(current);
      expect(calculateFocalZoom({ scale: 0, translateX: 0, translateY: 0 }, 2, { x: 0, y: 0 }).scale).toBe(2);
    });
  });

  describe("calculatePinchTransform", () => {
    it("scales continuously around pinch centroid when centroid is stationary", () => {
      const startTransform: TransformState = { scale: 1.0, translateX: 0, translateY: 0 };
      const centroid = { x: 100, y: 100 };
      const startDistance = 200;
      const currentDistance = 300; // 1.5x zoom

      const next = calculatePinchTransform(
        startTransform,
        startDistance,
        currentDistance,
        centroid,
        centroid,
      );

      expect(next.scale).toBeCloseTo(1.5);
      // The point under centroid (100, 100) must stay at (100, 100):
      // mediaX = 100 / 1.0 = 100.
      // screenX = next.translateX + 100 * 1.5 => 100 = next.translateX + 150 => next.translateX = -50
      expect(next.translateX).toBeCloseTo(-50);
      expect(next.translateY).toBeCloseTo(-50);
    });

    it("simultaneously scales and translates when pinch centroid moves", () => {
      const startTransform: TransformState = { scale: 1.0, translateX: 0, translateY: 0 };
      const startCentroid = { x: 100, y: 100 };
      const currentCentroid = { x: 140, y: 120 }; // Centroid moved by +40, +20
      const startDistance = 200;
      const currentDistance = 400; // 2.0x zoom

      const next = calculatePinchTransform(
        startTransform,
        startDistance,
        currentDistance,
        startCentroid,
        currentCentroid,
      );

      expect(next.scale).toBeCloseTo(2.0);
      // The content point that started under startCentroid must now land at currentCentroid:
      // start media point = (100 - 0) / 1.0 = 100
      // screen pos = next.translateX + 100 * 2.0 = 140 => next.translateX = -60
      expect(next.translateX + 100 * next.scale).toBeCloseTo(currentCentroid.x);
      expect(next.translateY + 100 * next.scale).toBeCloseTo(currentCentroid.y);
    });

    it("respects minScale and maxScale clamping limits", () => {
      const startTransform: TransformState = { scale: 1.0, translateX: 0, translateY: 0 };
      const centroid = { x: 0, y: 0 };

      const zoomedOut = calculatePinchTransform(
        startTransform,
        200,
        50, // 0.25x
        centroid,
        centroid,
        { minScale: 0.5, maxScale: 5.0 },
      );
      expect(zoomedOut.scale).toBe(0.5);

      const zoomedIn = calculatePinchTransform(
        startTransform,
        200,
        1500, // 7.5x
        centroid,
        centroid,
        { minScale: 0.5, maxScale: 5.0 },
      );
      expect(zoomedIn.scale).toBe(5.0);
    });
  });

  describe("calculateDoubleTapZoom", () => {
    it("zooms into tapped point making it the view center when at fit scale", () => {
      const current: TransformState = { scale: 1.0, translateX: 0, translateY: 0 };
      const fitScale = 1.0;
      const tapPoint = { x: 80, y: -60 }; // User tapped at stage-relative (+80, -60)

      const result = calculateDoubleTapZoom(current, fitScale, tapPoint, { zoomMultiplier: 2.5 });

      expect(result.scale).toBe(2.5);
      // At scale 2.5, the point tapped (media point = 80/1.0 = 80) should now be at view center (0, 0):
      // screenX = result.translateX + mediaX * result.scale
      // 0 = result.translateX + 80 * 2.5 => result.translateX = -200
      expect(result.translateX).toBeCloseTo(-200);
      expect(result.translateY).toBeCloseTo(150);
    });

    it("keeps center centered when double tapping at view center (0, 0)", () => {
      const current: TransformState = { scale: 0.75, translateX: 0, translateY: 0 };
      const fitScale = 0.75;
      const tapPoint = { x: 0, y: 0 };

      const result = calculateDoubleTapZoom(current, fitScale, tapPoint);

      expect(result.scale).toBeCloseTo(0.75 * 2.5);
      expect(result.translateX).toBe(0);
      expect(result.translateY).toBe(0);
    });

    it("resets to fit scale centered at (0, 0) when double-tapping while already zoomed", () => {
      const current: TransformState = { scale: 2.5, translateX: -150, translateY: 80 };
      const fitScale = 1.0;
      const tapPoint = { x: 50, y: 50 };

      const result = calculateDoubleTapZoom(current, fitScale, tapPoint);

      expect(result.scale).toBe(fitScale);
      expect(result.translateX).toBe(0);
      expect(result.translateY).toBe(0);
    });
  });

  describe("calculateClampBounds & clampTranslation", () => {
    it("calculates symmetric bounds when displayed size exceeds viewport", () => {
      const viewport = { width: 1000, height: 800 };
      const media = { width: 800, height: 600 };
      const scale = 2.0; // dispW = 1600, dispH = 1200

      const bounds = calculateClampBounds(viewport, media, scale);
      // boundX = (1600 - 1000) / 2 = 300
      // boundY = (1200 - 800) / 2 = 200
      expect(bounds).toEqual({
        minX: -300,
        maxX: 300,
        minY: -200,
        maxY: 200,
      });
    });

    it("locks bounds to zero when displayed size is smaller than viewport", () => {
      const viewport = { width: 1000, height: 800 };
      const media = { width: 800, height: 600 };
      const scale = 1.0; // dispW = 800 < 1000, dispH = 600 < 800

      const bounds = calculateClampBounds(viewport, media, scale);
      expect(bounds).toEqual({
        minX: 0,
        maxX: 0,
        minY: 0,
        maxY: 0,
      });
    });

    it("applies margin option to bounds", () => {
      const viewport = { width: 1000, height: 800 };
      const media = { width: 1000, height: 800 };
      const scale = 1.0;

      const bounds = calculateClampBounds(viewport, media, scale, { margin: 50 });
      expect(bounds).toEqual({
        minX: -50,
        maxX: 50,
        minY: -50,
        maxY: 50,
      });
    });

    it("clamps translations outside bounds while preserving inside translations", () => {
      const bounds: ClampBounds = { minX: -200, maxX: 200, minY: -100, maxY: 100 };

      expect(clampTranslation({ x: 50, y: -20 }, bounds)).toEqual({ x: 50, y: -20 });
      expect(clampTranslation({ x: 350, y: -150 }, bounds)).toEqual({ x: 200, y: -100 });
      expect(clampTranslation({ x: -400, y: 200 }, bounds)).toEqual({ x: -200, y: 100 });
    });
  });

  describe("resolveSwipeAction & swipe gating", () => {
    const defaultBounds: ClampBounds = { minX: -300, maxX: 300, minY: -200, maxY: 200 };

    describe("at fit scale (not zoomed beyond fit)", () => {
      it("triggers next navigation on horizontal swipe left", () => {
        const action = resolveSwipeAction({
          scale: 1.0,
          fitScale: 1.0,
          deltaX: -80,
          deltaY: 10,
          elapsedMs: 250,
          currentTranslate: { x: 0, y: 0 },
          bounds: defaultBounds,
        });
        expect(action).toBe("next");
      });

      it("triggers prev navigation on horizontal swipe right", () => {
        const action = resolveSwipeAction({
          scale: 1.0,
          fitScale: 1.0,
          deltaX: 80,
          deltaY: -5,
          elapsedMs: 250,
          currentTranslate: { x: 0, y: 0 },
          bounds: defaultBounds,
        });
        expect(action).toBe("prev");
      });

      it("triggers dismiss on downward swipe", () => {
        const action = resolveSwipeAction({
          scale: 1.0,
          fitScale: 1.0,
          deltaX: 10,
          deltaY: 90,
          elapsedMs: 300,
          currentTranslate: { x: 0, y: 0 },
          bounds: defaultBounds,
        });
        expect(action).toBe("dismiss");
      });

      it("ignores upward vertical swipe", () => {
        const action = resolveSwipeAction({
          scale: 1.0,
          fitScale: 1.0,
          deltaX: 0,
          deltaY: -90,
          elapsedMs: 300,
          currentTranslate: { x: 0, y: 0 },
          bounds: defaultBounds,
        });
        expect(action).toBe("none");
      });

      it("ignores slow drags (> 700ms)", () => {
        const action = resolveSwipeAction({
          scale: 1.0,
          fitScale: 1.0,
          deltaX: -150,
          deltaY: 0,
          elapsedMs: 800,
          currentTranslate: { x: 0, y: 0 },
          bounds: defaultBounds,
        });
        expect(action).toBe("none");
      });

      it("ignores short drags (< 60px)", () => {
        const action = resolveSwipeAction({
          scale: 1.0,
          fitScale: 1.0,
          deltaX: -45,
          deltaY: 0,
          elapsedMs: 200,
          currentTranslate: { x: 0, y: 0 },
          bounds: defaultBounds,
        });
        expect(action).toBe("none");
      });

      it("ignores mouse pointer drags", () => {
        const action = resolveSwipeAction({
          scale: 1.0,
          fitScale: 1.0,
          deltaX: -150,
          deltaY: 0,
          elapsedMs: 200,
          currentTranslate: { x: 0, y: 0 },
          bounds: defaultBounds,
          pointerType: "mouse",
        });
        expect(action).toBe("none");
      });

      it("ignores diagonal movements without 1.3x directional dominance", () => {
        const action = resolveSwipeAction({
          scale: 1.0,
          fitScale: 1.0,
          deltaX: 70,
          deltaY: 65,
          elapsedMs: 200,
          currentTranslate: { x: 0, y: 0 },
          bounds: defaultBounds,
        });
        expect(action).toBe("none");
      });
    });

    describe("while zoomed beyond fit scale", () => {
      it("gates swipe and returns none while panning within interior bounds", () => {
        // In the middle of an image (currentTranslate.x = 0, bounds are -300 to 300)
        const action = resolveSwipeAction({
          scale: 2.0,
          fitScale: 1.0,
          deltaX: -100,
          deltaY: 5,
          elapsedMs: 200,
          currentTranslate: { x: 0, y: 0 },
          bounds: defaultBounds,
        });
        expect(action).toBe("none");
      });

      it("allows next navigation when swiping left at the right boundary", () => {
        // User has panned all the way to the right edge (currentTranslate.x is at minX = -300)
        const action = resolveSwipeAction({
          scale: 2.0,
          fitScale: 1.0,
          deltaX: -80,
          deltaY: 0,
          elapsedMs: 250,
          currentTranslate: { x: -300, y: 0 },
          bounds: defaultBounds,
        });
        expect(action).toBe("next");
      });

      it("allows prev navigation when swiping right at the left boundary", () => {
        // User has panned all the way to the left edge (currentTranslate.x is at maxX = 300)
        const action = resolveSwipeAction({
          scale: 2.0,
          fitScale: 1.0,
          deltaX: 80,
          deltaY: 0,
          elapsedMs: 250,
          currentTranslate: { x: 300, y: 0 },
          bounds: defaultBounds,
        });
        expect(action).toBe("prev");
      });

      it("does not trigger prev navigation when swiping away from right boundary into image", () => {
        // At right boundary (currentTranslate.x = -300), but dragging right (+80) back into the image
        const action = resolveSwipeAction({
          scale: 2.0,
          fitScale: 1.0,
          deltaX: 80,
          deltaY: 0,
          elapsedMs: 250,
          currentTranslate: { x: -300, y: 0 },
          bounds: defaultBounds,
        });
        expect(action).toBe("none");
      });

      it("allows dismiss when swiping down at the top boundary", () => {
        // At top boundary (currentTranslate.y is at maxY = 200)
        const action = resolveSwipeAction({
          scale: 2.0,
          fitScale: 1.0,
          deltaX: 0,
          deltaY: 80,
          elapsedMs: 250,
          currentTranslate: { x: 0, y: 200 },
          bounds: defaultBounds,
        });
        expect(action).toBe("dismiss");
      });

      it("gates dismiss when swiping down away from top boundary", () => {
        // Not at top boundary (currentTranslate.y = 0)
        const action = resolveSwipeAction({
          scale: 2.0,
          fitScale: 1.0,
          deltaX: 0,
          deltaY: 80,
          elapsedMs: 250,
          currentTranslate: { x: 0, y: 0 },
          bounds: defaultBounds,
        });
        expect(action).toBe("none");
      });
    });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyWipeResistance,
  computeAdjacentPreviewOffset,
  computeWipeVisuals,
  createWipeTransitionController,
  formatWipeTransform,
  formatWipeTransition,
  idleWipeVisualState,
  lockWipeAxis,
  resolveWipeCommit,
  type WipeVisualState,
} from "./wipe-gesture";

describe("wipe-gesture", () => {
  describe("lockWipeAxis", () => {
    it("stays none within slop radius", () => {
      expect(lockWipeAxis(6, 6)).toBe("none");
      expect(lockWipeAxis(-9, 2)).toBe("none");
    });

    it("locks horizontal when horizontal travel dominates", () => {
      expect(lockWipeAxis(-30, 5)).toBe("horizontal");
      expect(lockWipeAxis(45, -12)).toBe("horizontal");
    });

    it("locks vertical only on dominant downward travel", () => {
      expect(lockWipeAxis(5, 30)).toBe("vertical");
      expect(lockWipeAxis(0, -40)).toBe("none");
    });

    it("stays none on ambiguous diagonals", () => {
      expect(lockWipeAxis(25, 22)).toBe("none");
    });

    it("respects allowHorizontal and allowDismiss flags", () => {
      expect(lockWipeAxis(40, 0, { allowHorizontal: false })).toBe("none");
      expect(lockWipeAxis(0, 40, { allowDismiss: false })).toBe("none");
    });
  });

  describe("applyWipeResistance", () => {
    it("passes delta through 1:1 when target exists", () => {
      expect(applyWipeResistance(-120, true)).toBe(-120);
      expect(applyWipeResistance(85, true)).toBe(85);
    });

    it("applies boundary resistance when no target exists", () => {
      expect(applyWipeResistance(-100, false)).toBeCloseTo(-28);
      expect(applyWipeResistance(100, false, 0.25)).toBeCloseTo(25);
    });
  });

  describe("computeWipeVisuals", () => {
    it("tracks horizontal offset without scaling or fading backdrop", () => {
      const visuals = computeWipeVisuals({
        phase: "dragging",
        axis: "horizontal",
        offsetX: -150,
        offsetY: 20,
        stageWidth: 500,
        stageHeight: 800,
      });

      expect(visuals.offsetX).toBe(-150);
      expect(visuals.offsetY).toBe(0);
      expect(visuals.scale).toBe(1);
      expect(visuals.backdropOpacity).toBe(1);
      expect(visuals.progress).toBeCloseTo(0.3);
    });

    it("computes downward dismiss scale and backdrop dimming", () => {
      const visuals = computeWipeVisuals({
        phase: "dragging",
        axis: "vertical",
        offsetX: 25,
        offsetY: 180,
        stageWidth: 500,
        stageHeight: 800,
      });

      expect(visuals.offsetX).toBe(0);
      expect(visuals.offsetY).toBe(180);
      expect(visuals.progress).toBeCloseTo(0.5);
      expect(visuals.scale).toBeCloseTo(0.93);
      expect(visuals.backdropOpacity).toBeCloseTo(0.675);
    });

    it("clamps upward vertical offsets to 0", () => {
      const visuals = computeWipeVisuals({
        phase: "dragging",
        axis: "vertical",
        offsetX: 0,
        offsetY: -40,
        stageWidth: 400,
        stageHeight: 600,
      });

      expect(visuals.offsetY).toBe(0);
      expect(visuals.scale).toBe(1);
      expect(visuals.backdropOpacity).toBe(1);
    });
  });

  describe("resolveWipeCommit", () => {
    it("commits horizontal swipe when passing minimum distance within flick duration", () => {
      expect(
        resolveWipeCommit({
          axis: "horizontal",
          deltaX: -65,
          deltaY: 4,
          elapsedMs: 250,
          stageWidth: 400,
          stageHeight: 800,
        }),
      ).toBe("left");

      expect(
        resolveWipeCommit({
          axis: "horizontal",
          deltaX: 65,
          deltaY: -4,
          elapsedMs: 250,
          stageWidth: 400,
          stageHeight: 800,
        }),
      ).toBe("right");
    });

    it("commits slow horizontal drags that exceed 32% of stage width", () => {
      expect(
        resolveWipeCommit({
          axis: "horizontal",
          deltaX: -140,
          deltaY: 0,
          elapsedMs: 1_100,
          stageWidth: 400,
          stageHeight: 800,
        }),
      ).toBe("left");
    });

    it("snaps back short slow drags or drags blocked by boundary", () => {
      expect(
        resolveWipeCommit({
          axis: "horizontal",
          deltaX: -30,
          deltaY: 0,
          elapsedMs: 300,
          stageWidth: 400,
          stageHeight: 800,
        }),
      ).toBe("none");

      expect(
        resolveWipeCommit({
          axis: "horizontal",
          deltaX: 200,
          deltaY: 0,
          elapsedMs: 200,
          stageWidth: 400,
          stageHeight: 800,
          canGoRight: false,
        }),
      ).toBe("none");
    });

    it("commits quick flicks >= 40px with high velocity", () => {
      expect(
        resolveWipeCommit({
          axis: "horizontal",
          deltaX: -45,
          deltaY: 0,
          elapsedMs: 90,
          stageWidth: 400,
          stageHeight: 800,
          minDistancePx: 60,
        }),
      ).toBe("left");
    });

    it("commits vertical downward dismiss by distance or extent ratio", () => {
      expect(
        resolveWipeCommit({
          axis: "vertical",
          deltaX: 0,
          deltaY: 80,
          elapsedMs: 250,
          stageWidth: 400,
          stageHeight: 800,
        }),
      ).toBe("down");

      expect(
        resolveWipeCommit({
          axis: "vertical",
          deltaX: 0,
          deltaY: 190,
          elapsedMs: 1_200,
          stageWidth: 400,
          stageHeight: 800,
        }),
      ).toBe("down");
    });
  });

  describe("computeAdjacentPreviewOffset & formatting", () => {
    it("positions right neighbor when dragging left and left neighbor when dragging right", () => {
      expect(computeAdjacentPreviewOffset(-100, 400, 16)).toBe(316);
      expect(computeAdjacentPreviewOffset(100, 400, 16)).toBe(-316);
      expect(computeAdjacentPreviewOffset(0, 400, 16)).toBeNull();
      expect(computeAdjacentPreviewOffset(-100, 0, 16)).toBeNull();
    });

    it("formats transform and transition strings cleanly", () => {
      expect(formatWipeTransform(idleWipeVisualState())).toBeUndefined();
      expect(
        formatWipeTransform({
          ...idleWipeVisualState(),
          phase: "dragging",
          axis: "vertical",
          offsetY: 100,
          scale: 0.95,
        }),
      ).toBe("translate3d(0px, 100px, 0) scale(0.95)");

      expect(formatWipeTransition("dragging", false)).toBe("none");
      expect(formatWipeTransition("settling", false, 220)).toContain("transform 220ms");
      expect(formatWipeTransition("settling", true, 220)).toBe("none");
    });
  });

  describe("createWipeTransitionController", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("transitions drag -> snapBack -> idle", () => {
      const states: WipeVisualState[] = [];
      const controller = createWipeTransitionController({
        onUpdate: (next) => states.push(next),
        durationMs: 200,
      });

      controller.drag({
        axis: "horizontal",
        offsetX: -40,
        offsetY: 0,
        stageWidth: 400,
        stageHeight: 800,
      });
      expect(states.at(-1)?.phase).toBe("dragging");
      expect(states.at(-1)?.offsetX).toBe(-40);

      controller.snapBack();
      expect(states.at(-1)?.phase).toBe("settling");
      expect(states.at(-1)?.offsetX).toBe(0);

      vi.advanceTimersByTime(200);
      expect(states.at(-1)?.phase).toBe("idle");
    });

    it("commits horizontal wipe synchronously and animates entering -> settling -> idle", () => {
      const states: WipeVisualState[] = [];
      const onSwap = vi.fn();
      const onAnimationEnd = vi.fn();

      const originalRaf = globalThis.requestAnimationFrame;
      const originalCancelRaf = globalThis.cancelAnimationFrame;
      let nextFrameId = 1;
      const frames = new Map<number, FrameRequestCallback>();
      vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
        const id = nextFrameId++;
        frames.set(id, cb);
        return id;
      });
      vi.stubGlobal("cancelAnimationFrame", (id: number) => {
        frames.delete(id);
      });

      try {
        const controller = createWipeTransitionController({
          onUpdate: (next) => states.push(next),
          onAnimationEnd,
          durationMs: 220,
          gutterPx: 16,
        });

        controller.commitHorizontal({
          direction: "left",
          fromOffsetX: -120,
          stageWidth: 400,
          onSwap,
        });

        expect(onSwap).toHaveBeenCalledTimes(1);
        expect(states.at(-1)?.phase).toBe("entering");
        // Stride = 416; incoming starts at 416 - 120 = 296
        expect(states.at(-1)?.offsetX).toBe(296);
        expect(states.at(-1)?.outgoingOffsetX).toBe(-120);

        // Flush double-rAF
        const raf1 = Array.from(frames.values())[0];
        frames.clear();
        raf1?.(16);
        const raf2 = Array.from(frames.values())[0];
        frames.clear();
        raf2?.(32);

        expect(states.at(-1)?.phase).toBe("settling");
        expect(states.at(-1)?.offsetX).toBe(0);
        expect(states.at(-1)?.outgoingOffsetX).toBe(-416);

        vi.advanceTimersByTime(220);
        expect(states.at(-1)?.phase).toBe("idle");
        expect(onAnimationEnd).toHaveBeenCalledTimes(1);
      } finally {
        vi.stubGlobal("requestAnimationFrame", originalRaf);
        vi.stubGlobal("cancelAnimationFrame", originalCancelRaf);
      }
    });

    it("skips animations when reducedMotion is true", () => {
      const states: WipeVisualState[] = [];
      const onSwap = vi.fn();
      const onAnimationEnd = vi.fn();

      const controller = createWipeTransitionController({
        onUpdate: (next) => states.push(next),
        onAnimationEnd,
        isReducedMotion: () => true,
      });

      controller.commitHorizontal({
        direction: "right",
        fromOffsetX: 120,
        stageWidth: 400,
        onSwap,
      });

      expect(onSwap).toHaveBeenCalledTimes(1);
      expect(states.at(-1)?.phase).toBe("idle");
      expect(onAnimationEnd).toHaveBeenCalledTimes(1);
    });
  });
});

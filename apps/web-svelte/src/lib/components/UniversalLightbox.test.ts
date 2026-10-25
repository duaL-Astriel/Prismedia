import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { tick } from "svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import UniversalLightboxHarness from "./UniversalLightbox.test-harness.svelte";
import UniversalLightboxDetailsHarness from "./UniversalLightbox.details-test-harness.svelte";
import type { UniversalLightboxEntity } from "./universal-lightbox-media";

vi.mock("vidstack/player", () => ({}));
vi.mock("vidstack/player/layouts", () => ({}));
vi.mock("vidstack/player/ui", () => ({}));
vi.mock("vidstack", () => ({
  isHLSProvider: () => false,
}));

const still: UniversalLightboxEntity = {
  id: "image-1",
  kind: "image",
  title: "Still",
  capabilities: [
    { kind: "files", items: [{ role: "source", path: "/media/still.jpg", mimeType: "image/jpeg" }] },
    { kind: "rating", value: 2 },
    { kind: "technical", duration: null, width: 800, height: 600, frameRate: null, bitRate: null, sampleRate: null, channels: null, codec: null, container: null, format: "jpg" },
  ],
  coverUrl: "/assets/images/image-1/thumb.jpg",
};

const second: UniversalLightboxEntity = {
  ...still,
  id: "image-2",
  title: "Second",
  coverUrl: "/assets/images/image-2/thumb.jpg",
};

const animated: UniversalLightboxEntity = {
  id: "image-video-1",
  kind: "image",
  title: "Animated.webm",
  capabilities: [
    { kind: "files", items: [{ role: "source", path: "/media/animated.webm", mimeType: "video/webm" }] },
  ],
  coverUrl: "/assets/images/image-video-1/thumb.jpg",
};

const animatedWithPreview: UniversalLightboxEntity = {
  ...animated,
  capabilities: [
    {
      kind: "files",
      items: [
        { role: "source", path: "/media/animated.webm", mimeType: "video/webm" },
        { role: "preview", path: "/assets/images/image-video-1/preview.mp4", mimeType: "video/mp4" },
      ],
    },
  ],
};

const verticalVideo: UniversalLightboxEntity = {
  ...animatedWithPreview,
  id: "vertical-video-1",
  title: "Vertical clip",
  capabilities: [
    ...animatedWithPreview.capabilities,
    {
      kind: "technical",
      duration: "12",
      width: 1080,
      height: 1920,
      frameRate: 30,
      bitRate: null,
      sampleRate: null,
      channels: null,
      codec: "h264",
      container: "mp4",
      format: "mp4",
    },
  ],
};

const verticalVideoFromThumbnail: UniversalLightboxEntity = {
  ...animatedWithPreview,
  id: "vertical-video-thumb-1",
  title: "Vertical clip from thumbnail",
  initialAspectRatio: { width: 1080, height: 1920 },
};

describe("UniversalLightbox", () => {
  beforeEach(() => {
    if (!globalThis.PointerEvent) {
      globalThis.PointerEvent = class PointerEvent extends MouseEvent {
        pointerId: number;
        pointerType: string;
        constructor(type: string, params: PointerEventInit = {}) {
          super(type, params);
          this.pointerId = params.pointerId ?? 0;
          this.pointerType = params.pointerType ?? "";
        }
      } as unknown as typeof PointerEvent;
    }
    globalThis.ResizeObserver = class {
      observe() {}
      disconnect() {}
      unobserve() {}
    };
    Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", { configurable: true, value: 800 });
    Object.defineProperty(HTMLImageElement.prototype, "naturalHeight", { configurable: true, value: 600 });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ state: "ready" }))),
    );
  });

  it("closes with Escape", async () => {
    const onClose = vi.fn();
    render(UniversalLightboxHarness, {
      props: { entities: [still], initialIndex: 0, onClose },
    });

    await fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("portals the overlay to the document body so it covers the app shell", () => {
    const { container } = render(UniversalLightboxHarness, {
      props: { entities: [still], initialIndex: 0, onClose: vi.fn() },
    });

    const overlay = document.body.querySelector(".universal-lightbox");
    expect(overlay).toBeInTheDocument();
    expect(container.querySelector(".universal-lightbox")).toBeNull();
  });

  it("falls back to the API cover when the original file cannot be loaded", async () => {
    render(UniversalLightboxHarness, {
      props: { entities: [still], initialIndex: 0, onClose: vi.fn() },
    });

    const original = document.querySelector("img.lightbox-image") as HTMLImageElement;
    expect(original).toHaveAttribute("src", "/api/entities/image-1/files/source");

    await fireEvent.error(original);
    await tick();

    expect(document.querySelector("img.lightbox-image")).toHaveAttribute(
      "src",
      "/assets/images/image-1/thumb.jpg",
    );
  });

  it("moves through entities with arrow and vim keys", async () => {
    const onIndexChange = vi.fn();
    render(UniversalLightboxHarness, {
      props: { entities: [still, second], initialIndex: 0, onClose: vi.fn(), onIndexChange },
    });

    await fireEvent.keyDown(window, { key: "ArrowRight" });
    await fireEvent.keyDown(window, { key: "h" });

    expect(onIndexChange).toHaveBeenCalledWith(1);
    expect(onIndexChange).toHaveBeenCalledWith(0);
  });

  it("reports rating hotkeys without rendering inline detail controls", async () => {
    const onRatingChange = vi.fn();
    render(UniversalLightboxHarness, {
      props: { entities: [still], initialIndex: 0, onClose: vi.fn(), onRatingChange },
    });

    await fireEvent.keyDown(window, { key: "5" });
    await fireEvent.keyDown(window, { key: "i" });

    expect(onRatingChange).toHaveBeenCalledWith("image-1", 5);
    expect(screen.queryByRole("button", { name: "Details" })).not.toBeInTheDocument();
    expect(screen.queryByText("Dimensions")).not.toBeInTheDocument();
    expect(screen.queryByText("800 × 600")).not.toBeInTheDocument();
  });

  it("can suppress rating controls and hotkeys for read-only previews", async () => {
    const onRatingChange = vi.fn();
    render(UniversalLightboxHarness, {
      props: {
        entities: [still],
        initialIndex: 0,
        onClose: vi.fn(),
        onRatingChange,
        showRatingControls: false,
      },
    });

    await fireEvent.keyDown(window, { key: "5" });

    expect(onRatingChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Rate 1" })).not.toBeInTheDocument();
    expect(screen.queryByText("1-5 rate")).not.toBeInTheDocument();
  });

  it("uses provided detail content as the info back page", async () => {
    render(UniversalLightboxDetailsHarness, {
      props: {
        entities: [still],
        initialIndex: 0,
        onClose: vi.fn(),
      },
    });

    await fireEvent.keyDown(window, { key: "i" });

    expect(screen.getByText("Details for Still")).toBeInTheDocument();
    expect(screen.queryByText("Dimensions")).not.toBeInTheDocument();
  });

  it("renders video-capable image entities through the browser-native video element", async () => {
    render(UniversalLightboxHarness, {
      props: { entities: [animatedWithPreview], initialIndex: 0, onClose: vi.fn() },
    });

    await waitFor(() => {
      expect(document.querySelector("video.lightbox-native-video")).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "Player settings" })).not.toBeInTheDocument();
  });

  it("autoplays video-capable items muted and looping in the lightbox", async () => {
    render(UniversalLightboxHarness, {
      props: { entities: [animatedWithPreview], initialIndex: 0, onClose: vi.fn() },
    });

    const video = await waitFor(() => {
      const element = document.querySelector("video.lightbox-native-video");
      expect(element).toBeInTheDocument();
      return element as HTMLVideoElement;
    });
    expect(screen.getByRole("button", { name: "Unmute" })).toBeInTheDocument();
    expect(video).toHaveProperty("muted", true);
    expect(video).toHaveAttribute("autoplay");
    expect(video).toHaveAttribute("loop");
    expect(Array.from(video.querySelectorAll("source"), (source) => source.getAttribute("src"))).toEqual([
      "/api/entities/image-video-1/files/source",
      "/api/entities/image-video-1/files/preview",
    ]);
  });

  it("keeps the faded poster from covering the native video controls", async () => {
    render(UniversalLightboxHarness, {
      props: { entities: [animatedWithPreview], initialIndex: 0, onClose: vi.fn() },
    });

    const video = await waitFor(() => {
      const element = document.querySelector("video.lightbox-native-video");
      expect(element).toBeInTheDocument();
      return element as HTMLVideoElement;
    });
    await fireEvent.canPlay(video);

    // The poster is absolutely positioned over the in-flow video, so it must stay
    // hit-test transparent or the browser never delivers hover/clicks to the native
    // controls once they auto-hide.
    const poster = document.querySelector(".lightbox-video-poster") as HTMLImageElement;
    expect(poster).toBeInTheDocument();
    expect(getComputedStyle(poster).pointerEvents).toBe("none");
  });

  it("uses image-video originals in the full-quality lightbox even without generated previews", async () => {
    render(UniversalLightboxHarness, {
      props: { entities: [animated], initialIndex: 0, onClose: vi.fn() },
    });

    await waitFor(() => {
      expect(document.querySelector("video.lightbox-native-video")).toBeInTheDocument();
    });
    expect(document.querySelector("video.lightbox-native-video source")).toHaveAttribute(
      "src",
      "/api/entities/image-video-1/files/source",
    );
  });

  it("preloads neighboring lightbox media for smoother navigation", async () => {
    render(UniversalLightboxHarness, {
      props: { entities: [still, second, animatedWithPreview], initialIndex: 1, onClose: vi.fn() },
    });

    await tick();

    const links = Array.from(
      document.head.querySelectorAll<HTMLLinkElement>("link[data-lightbox-preload]"),
    ).map((link) => ({
      rel: link.getAttribute("rel"),
      as: link.getAttribute("as"),
      href: link.getAttribute("href"),
    }));

    expect(links).toEqual([
      { rel: "preload", as: "image", href: "/api/entities/image-1/files/source" },
      { rel: "preload", as: "image", href: "/assets/images/image-video-1/thumb.jpg" },
      { rel: "prefetch", as: "video", href: "/api/entities/image-video-1/files/preview" },
    ]);
  });

  it("sizes embedded minimal videos from intrinsic dimensions instead of a fixed wide frame", async () => {
    render(UniversalLightboxHarness, {
      props: { entities: [verticalVideo], initialIndex: 0, onClose: vi.fn() },
    });

    await waitFor(() => {
      expect(document.querySelector("video.lightbox-native-video")).toBeInTheDocument();
    });

    const shell = document.querySelector("video.lightbox-native-video")?.closest(".lightbox-video-shell") as HTMLElement | null;
    expect(shell).toBeInTheDocument();
    expect(shell).toHaveClass("has-natural-ratio");
    expect(shell?.getAttribute("style")).toContain("--lightbox-video-aspect-ratio: 1080 / 1920");
    expect(shell?.getAttribute("style")).toContain("--lightbox-video-width-ratio: 0.5625");
  });

  it("can size video from a thumbnail-provided ratio before full metadata hydrates", async () => {
    render(UniversalLightboxHarness, {
      props: { entities: [verticalVideoFromThumbnail], initialIndex: 0, onClose: vi.fn() },
    });

    await waitFor(() => {
      expect(document.querySelector("video.lightbox-native-video")).toBeInTheDocument();
    });

    const shell = document.querySelector("video.lightbox-native-video")?.closest(".lightbox-video-shell") as HTMLElement | null;
    expect(shell).toBeInTheDocument();
    expect(shell).toHaveClass("has-natural-ratio");
    expect(shell?.getAttribute("style")).toContain("--lightbox-video-aspect-ratio: 1080 / 1920");
    expect(shell?.getAttribute("style")).toContain("--lightbox-video-width-ratio: 0.5625");
  });

  it("keeps the lightbox video player in a real aspect-ratio box while it initializes", async () => {
    render(UniversalLightboxHarness, {
      props: { entities: [animated], initialIndex: 0, onClose: vi.fn() },
    });

    await waitFor(() => {
      expect(document.querySelector("video.lightbox-native-video")).toBeInTheDocument();
    });

    const shell = document.querySelector("video.lightbox-native-video")?.closest(".lightbox-video-shell") as HTMLElement | null;
    expect(shell).toBeInTheDocument();
    expect(shell).not.toHaveClass("has-natural-ratio");
    expect(document.body.querySelector(".lightbox-media-guard")).toBeInTheDocument();
    expect(shell).toHaveStyle("--lightbox-video-aspect-ratio: 16 / 9");
  });

  it("zooms into focal point on double-click and resets on second double-click", async () => {
    render(UniversalLightboxHarness, {
      props: { entities: [still], initialIndex: 0, onClose: vi.fn() },
    });

    const stage = document.querySelector(".stage") as HTMLDivElement;
    expect(stage).toBeInTheDocument();
    stage.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 1000,
      height: 800,
      right: 1000,
      bottom: 800,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    const img = document.querySelector("img.lightbox-image") as HTMLImageElement;
    await fireEvent.load(img);
    await tick();

    const mediaFrame = document.querySelector("[data-lightbox-media]") as HTMLElement;
    expect(mediaFrame).toBeInTheDocument();
    expect(mediaFrame.style.transform).toContain("scale(1.225)");

    // Double-click at (600, 400). Center of stage is (500, 400), so focal is (+100, 0).
    await fireEvent.dblClick(stage, { clientX: 600, clientY: 400 });
    await tick();

    // Should be zoomed in to 2.5x fitScale (1.225 * 2.5 = 3.0625) and translated left (-250px)
    expect(mediaFrame.style.transform).toContain("scale(3.0625)");
    expect(mediaFrame.style.transform).toContain("translate(-250px");

    // Second double click while zoomed should reset transform back to fit
    await fireEvent.dblClick(stage, { clientX: 600, clientY: 400 });
    await tick();

    expect(mediaFrame.style.transform).toContain("scale(1.225)");
    expect(mediaFrame.style.transform).toContain("translate(0px, 0px)");
  });

  it("scales continuously with multi-pointer pinch gestures", async () => {
    render(UniversalLightboxHarness, {
      props: { entities: [still], initialIndex: 0, onClose: vi.fn() },
    });

    const stage = document.querySelector(".stage") as HTMLDivElement;
    expect(stage).toBeInTheDocument();
    stage.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 1000,
      height: 800,
      right: 1000,
      bottom: 800,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    const img = document.querySelector("img.lightbox-image") as HTMLImageElement;
    await fireEvent.load(img);
    await tick();

    const mediaFrame = document.querySelector("[data-lightbox-media]") as HTMLElement;
    expect(mediaFrame).toBeInTheDocument();

    const sendPointer = (type: string, init: { pointerId: number; clientX: number; clientY: number }) => {
      const ev = new PointerEvent(type, { bubbles: true, cancelable: true });
      Object.defineProperty(ev, "pointerId", { configurable: true, value: init.pointerId });
      Object.defineProperty(ev, "clientX", { configurable: true, value: init.clientX });
      Object.defineProperty(ev, "clientY", { configurable: true, value: init.clientY });
      Object.defineProperty(ev, "pointerType", { configurable: true, value: "touch" });
      stage.dispatchEvent(ev);
    };

    // Pointer 1 down at (450, 400)
    sendPointer("pointerdown", { pointerId: 1, clientX: 450, clientY: 400 });
    // Pointer 2 down at (550, 400) -> initial distance = 100, centroid = (500, 400) = stage center (0, 0)
    sendPointer("pointerdown", { pointerId: 2, clientX: 550, clientY: 400 });

    // Move pointers apart to distance = 200 (2x pinch zoom)
    sendPointer("pointermove", { pointerId: 1, clientX: 400, clientY: 400 });
    sendPointer("pointermove", { pointerId: 2, clientX: 600, clientY: 400 });
    await tick();

    // Scale should have doubled from fitScale (1.225 * 2 = 2.45)
    expect(mediaFrame.style.transform).toContain("scale(2.45)");

    // Lift fingers
    sendPointer("pointerup", { pointerId: 1, clientX: 400, clientY: 400 });
    sendPointer("pointerup", { pointerId: 2, clientX: 600, clientY: 400 });
    await tick();

    expect(mediaFrame.style.transform).toContain("scale(2.45)");
  });

});

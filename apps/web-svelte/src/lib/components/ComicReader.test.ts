import { fireEvent, render } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ComicReader from "./ComicReader.svelte";
import type { ImageListItemDto } from "$lib/entities/media-view-models";
import { PAGE_READING_DIRECTION } from "$lib/api/generated/codes";

vi.mock("$lib/nsfw/store.svelte", () => ({
  useNsfw: () => ({ mode: "show" }),
}));

function makeImages(count: number): ImageListItemDto[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `image-${index + 1}`,
    title: `Page ${index + 1}`,
    date: null,
    rating: null,
    organized: false,
    isNsfw: false,
    width: 800,
    height: 1200,
    format: "jpg",
    isVideo: false,
    fileSize: 100,
    thumbnailPath: `/assets/images/image-${index + 1}/thumb`,
    previewPath: null,
    fullPath: `/assets/images/image-${index + 1}/full`,
    galleryId: "gallery-1",
    sortOrder: index,
    studioId: null,
    performers: [],
    tags: [],
    createdAt: "2026-05-08T00:00:00.000Z",
  }));
}

const images = makeImages(3);

function readerRoot(container: HTMLElement): HTMLElement {
  return document.body.querySelector('[data-reader-overlay]') ?? container;
}

describe("ComicReader", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.head
      .querySelectorAll('link[rel="preload"][as="image"]')
      .forEach((link) => link.remove());
    document.body.querySelectorAll('[role="dialog"]').forEach((dialog) => dialog.remove());
  });

  it("portals the overlay so it covers the app shell", () => {
    const { container } = render(ComicReader, {
      props: {
        images,
        initialIndex: 0,
        title: "Comic",
        onClose: vi.fn(),
      },
    });

    const overlay = document.body.querySelector("[data-reader-overlay]");
    expect(overlay).toBeInTheDocument();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("can render as a route page with a back control", () => {
    const { getByLabelText } = render(ComicReader, {
      props: {
        images,
        initialIndex: 0,
        title: "Comic",
        presentation: "page",
        closeIcon: "back",
        onClose: vi.fn(),
      },
    });

    const overlay = document.body.querySelector("[data-reader-overlay]");
    expect(overlay).toHaveClass("reader-page-presentation");
    expect(getByLabelText("Back")).toBeInTheDocument();
  });

  it("does not render the mobile bottom control bar", () => {
    const { container } = render(ComicReader, {
      props: {
        images,
        initialIndex: 0,
        title: "Comic",
        onClose: vi.fn(),
      },
    });

    const root = readerRoot(container);
    expect(root.querySelector(".reader-bottom-layer")).toBeNull();
  });

  it("places a right-to-left double spread in manifest reading order", async () => {
    const { container, getByLabelText } = render(ComicReader, {
      props: {
        images,
        initialIndex: 0,
        title: "Manga",
        readingDirection: PAGE_READING_DIRECTION.rightToLeft,
        coverOrdinal: null,
        onClose: vi.fn(),
      },
    });

    await fireEvent.click(getByLabelText("Toggle one or two pages"));

    const visiblePages = [...readerRoot(container).querySelectorAll<HTMLImageElement>(".reader-stage-paged img")];
    expect(visiblePages.map((image) => image.alt)).toEqual(["Page 2", "Page 1"]);
  });

  it("keeps controls hidden while navigating with side taps", async () => {
    const { container } = render(ComicReader, {
      props: {
        images,
        initialIndex: 0,
        title: "Comic",
        onClose: vi.fn(),
      },
    });

    const root = readerRoot(container);
    const topLayer = root.querySelector(".reader-top-layer");
    const stage = root.querySelector(".reader-stage");
    expect(topLayer).not.toBeNull();
    expect(stage).not.toBeNull();

    await tick();
    vi.advanceTimersByTime(2_800);
    await tick();
    expect(topLayer?.classList.contains("reader-layer-hidden")).toBe(true);

    vi.spyOn(stage!, "getBoundingClientRect").mockReturnValue({
      left: 0,
      width: 300,
    } as DOMRect);

    await fireEvent(
      stage!,
      new MouseEvent("pointerup", {
        bubbles: true,
        clientX: 290,
      }),
    );

    expect(topLayer?.classList.contains("reader-layer-hidden")).toBe(true);
  });

  it("shows hidden controls when clicking the center with a mouse", async () => {
    const { container } = render(ComicReader, {
      props: {
        images,
        initialIndex: 0,
        title: "Comic",
        onClose: vi.fn(),
      },
    });

    const root = readerRoot(container);
    const topLayer = root.querySelector(".reader-top-layer");
    const stage = root.querySelector(".reader-stage");
    expect(topLayer).not.toBeNull();
    expect(stage).not.toBeNull();

    await tick();
    vi.advanceTimersByTime(2_800);
    await tick();
    expect(topLayer?.classList.contains("reader-layer-hidden")).toBe(true);

    vi.spyOn(stage!, "getBoundingClientRect").mockReturnValue({
      left: 0,
      width: 300,
    } as DOMRect);

    const event = new MouseEvent("pointerup", {
      bubbles: true,
      clientX: 150,
    });
    Object.defineProperty(event, "pointerType", { value: "mouse" });
    await fireEvent(stage!, event);

    expect(topLayer?.classList.contains("reader-layer-visible")).toBe(true);
  });

  it("keeps controls hidden while touch scrolling in webtoon mode", async () => {
    const { container } = render(ComicReader, {
      props: {
        images,
        initialIndex: 0,
        initialMode: "webtoon",
        title: "Comic",
        onClose: vi.fn(),
      },
    });

    const root = readerRoot(container);
    const topLayer = root.querySelector(".reader-top-layer");
    const stage = root.querySelector(".reader-stage");
    expect(topLayer).not.toBeNull();
    expect(stage).not.toBeNull();

    await tick();
    vi.advanceTimersByTime(2_800);
    await tick();
    expect(topLayer?.classList.contains("reader-layer-hidden")).toBe(true);

    vi.spyOn(stage!, "getBoundingClientRect").mockReturnValue({
      left: 0,
      width: 300,
    } as DOMRect);

    await fireEvent(stage!, readerPointerEvent("pointerdown", 150, 100, "touch", 9));
    await fireEvent(stage!, readerPointerEvent("pointermove", 150, 180, "touch", 9));
    await fireEvent(stage!, readerPointerEvent("pointerup", 150, 180, "touch", 9));

    expect(topLayer?.classList.contains("reader-layer-hidden")).toBe(true);
  });

  it("shows hidden controls when hovering over the top or bottom control edges", async () => {
    const { container } = render(ComicReader, {
      props: {
        images,
        initialIndex: 0,
        title: "Comic",
        onClose: vi.fn(),
      },
    });

    const root = readerRoot(container);
    const topLayer = root.querySelector(".reader-top-layer");
    const topHoverZone = root.querySelector('[data-reader-hover-zone="top"]');
    const bottomHoverZone = root.querySelector('[data-reader-hover-zone="bottom"]');
    expect(topLayer).not.toBeNull();
    expect(topHoverZone).not.toBeNull();
    expect(bottomHoverZone).not.toBeNull();

    await tick();
    vi.advanceTimersByTime(2_800);
    await tick();
    expect(topLayer?.classList.contains("reader-layer-hidden")).toBe(true);

    await fireEvent.pointerEnter(topHoverZone!);
    expect(topLayer?.classList.contains("reader-layer-visible")).toBe(true);

    vi.advanceTimersByTime(2_800);
    await tick();
    expect(topLayer?.classList.contains("reader-layer-hidden")).toBe(true);

    await fireEvent.pointerEnter(bottomHoverZone!);
    expect(topLayer?.classList.contains("reader-layer-visible")).toBe(true);
  });

  it("reports page changes so callers can persist reading progress", async () => {
    const onIndexChange = vi.fn();
    const { getByLabelText } = render(ComicReader, {
      props: {
        images,
        initialIndex: 0,
        title: "Comic",
        onClose: vi.fn(),
        onIndexChange: onIndexChange as never,
      },
    });

    await fireEvent.click(getByLabelText("Next page"));

    expect(onIndexChange).toHaveBeenCalledWith(1);
  });

  it("reports the final readable page when moving to the chapter end action", async () => {
    const onIndexChange = vi.fn();
    const { getByLabelText } = render(ComicReader, {
      props: {
        images,
        initialIndex: images.length - 1,
        title: "Comic",
        nextChapterLabel: "Chapter Two",
        onClose: vi.fn(),
        onIndexChange: onIndexChange as never,
        onNextChapter: vi.fn(),
      },
    });

    await fireEvent.click(getByLabelText("Next page"));

    expect(onIndexChange).toHaveBeenCalledWith(images.length - 1);
  });

  it("shows a close action when there is no next chapter", async () => {
    const onClose = vi.fn();
    const { getAllByText, getByLabelText, getByText } = render(ComicReader, {
      props: {
        images,
        initialIndex: images.length - 1,
        title: "Comic",
        onClose,
      },
    });

    await fireEvent.click(getByLabelText("Next page"));

    expect(getAllByText("No next chapter").length).toBeGreaterThan(0);
    await fireEvent.click(getByText("Close reader"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("preloads nearby paged images in the document head", async () => {
    render(ComicReader, {
      props: {
        images: makeImages(6),
        initialIndex: 2,
        title: "Comic",
        onClose: vi.fn(),
      },
    });

    await tick();

    const hrefs = Array.from(
      document.head.querySelectorAll<HTMLLinkElement>('link[rel="preload"][as="image"]'),
    ).map((link) => link.getAttribute("href"));

    expect(hrefs).toEqual([
      "/api/assets/images/image-1/full",
      "/api/assets/images/image-2/full",
      "/api/assets/images/image-4/full",
      "/api/assets/images/image-5/full",
    ]);
  });

  it("decode-warms the current spread and nearby pages for seamless page turns", async () => {
    const decoded: string[] = [];
    const OriginalImage = globalThis.Image;
    class DecodeWarmImage {
      decoding = "";
      loading = "";
      onerror: (() => void) | null = null;
      #src = "";

      get src() {
        return this.#src;
      }

      set src(value: string) {
        this.#src = value;
      }

      decode() {
        decoded.push(this.#src);
        return Promise.resolve();
      }
    }
    vi.stubGlobal("Image", DecodeWarmImage);

    try {
      render(ComicReader, {
        props: {
          images: makeImages(6),
          initialIndex: 2,
          title: "Comic",
          onClose: vi.fn(),
        },
      });

      await tick();
      await Promise.resolve();

      expect(decoded).toEqual([
        "/api/assets/images/image-3/full",
        "/api/assets/images/image-1/full",
        "/api/assets/images/image-2/full",
        "/api/assets/images/image-4/full",
        "/api/assets/images/image-5/full",
      ]);
    } finally {
      vi.stubGlobal("Image", OriginalImage);
    }
  });

  it("reports the nearest page while scrolling in webtoon mode", async () => {
    const onIndexChange = vi.fn();
    const { container, getByLabelText } = render(ComicReader, {
      props: {
        images,
        initialIndex: 0,
        title: "Comic",
        onClose: vi.fn(),
        onIndexChange: onIndexChange as never,
      },
    });

    await fireEvent.click(getByLabelText("Webtoon reader"));
    const root = readerRoot(container);
    const stage = root.querySelector(".reader-stage") as HTMLElement;
    const pages = Array.from(root.querySelectorAll("[data-comic-page-index]")) as HTMLElement[];
    expect(pages).toHaveLength(3);
    Object.defineProperty(stage, "scrollTop", { value: 1_300, configurable: true });
    Object.defineProperty(stage, "clientHeight", { value: 800, configurable: true });
    pages.forEach((page, index) => {
      Object.defineProperty(page, "offsetTop", { value: index * 1_200, configurable: true });
    });

    await fireEvent.scroll(stage);

    expect(onIndexChange).toHaveBeenCalledWith(1);
  });

  it("tracks horizontal paged wipe gestures with adjacent preview and advances page on release", async () => {
    const onIndexChange = vi.fn();
    const { container } = render(ComicReader, {
      props: {
        images,
        initialIndex: 0,
        title: "Comic",
        onClose: vi.fn(),
        onIndexChange: onIndexChange as never,
      },
    });

    const root = readerRoot(container);
    const stage = root.querySelector(".reader-stage-paged") as HTMLElement;
    vi.spyOn(stage, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 400,
      height: 800,
    } as DOMRect);

    await fireEvent(stage, readerPointerEvent("pointerdown", 300, 400, "touch", 11));
    await fireEvent(stage, readerPointerEvent("pointermove", 190, 404, "touch", 11));
    await tick();

    const activePane = root.querySelector("[data-comic-wipe-active]") as HTMLElement;
    const adjacentPane = root.querySelector("[data-comic-wipe-adjacent]") as HTMLElement;
    expect(activePane.style.transform).toBe("translate3d(-110px, 0px, 0)");
    expect(adjacentPane).toBeInTheDocument();
    // Stride = 400 + 16 = 416; adjacent sits at 416 - 110 = 306px
    expect(adjacentPane.style.transform).toBe("translate3d(306px, 0, 0)");

    await fireEvent(stage, readerPointerEvent("pointerup", 190, 404, "touch", 11));
    await tick();

    expect(onIndexChange).toHaveBeenCalledWith(1);
    expect(root.querySelector("[data-comic-wipe-outgoing]")).toBeInTheDocument();
  });

  it("respects right-to-left direction and boundary resistance during comic wipes", async () => {
    const onIndexChange = vi.fn();
    const { container } = render(ComicReader, {
      props: {
        images,
        initialIndex: 0,
        readingDirection: PAGE_READING_DIRECTION.rightToLeft,
        title: "Manga",
        onClose: vi.fn(),
        onIndexChange: onIndexChange as never,
      },
    });

    const root = readerRoot(container);
    const stage = root.querySelector(".reader-stage-paged") as HTMLElement;
    vi.spyOn(stage, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 400,
      height: 800,
    } as DOMRect);

    // At page 0 in RTL, dragging left goes backward (no previous page) -> rubber-band
    await fireEvent(stage, readerPointerEvent("pointerdown", 250, 400, "touch", 12));
    await fireEvent(stage, readerPointerEvent("pointermove", 150, 400, "touch", 12));
    await tick();
    expect((root.querySelector("[data-comic-wipe-active]") as HTMLElement).style.transform).toBe(
      "translate3d(-28px, 0px, 0)",
    );
    await fireEvent(stage, readerPointerEvent("pointerup", 150, 400, "touch", 12));
    expect(onIndexChange).not.toHaveBeenCalled();

    // Dragging right in RTL advances to page 1
    await fireEvent(stage, readerPointerEvent("pointerdown", 100, 400, "touch", 13));
    await fireEvent(stage, readerPointerEvent("pointermove", 220, 400, "touch", 13));
    await tick();
    expect((root.querySelector("[data-comic-wipe-active]") as HTMLElement).style.transform).toBe(
      "translate3d(120px, 0px, 0)",
    );
    await fireEvent(stage, readerPointerEvent("pointerup", 220, 400, "touch", 13));
    expect(onIndexChange).toHaveBeenCalledWith(1);
  });

  it("supports downward dismiss wipe and ignores cancelled wipes in comic reader", async () => {
    const onClose = vi.fn();
    const { container } = render(ComicReader, {
      props: {
        images,
        initialIndex: 0,
        title: "Comic",
        onClose,
      },
    });

    const root = readerRoot(container);
    const stage = root.querySelector(".reader-stage-paged") as HTMLElement;
    vi.spyOn(stage, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 400,
      height: 800,
    } as DOMRect);

    // Cancelled vertical drag must not dismiss
    await fireEvent(stage, readerPointerEvent("pointerdown", 200, 200, "touch", 14));
    await fireEvent(stage, readerPointerEvent("pointermove", 200, 320, "touch", 14));
    await tick();
    expect((root.querySelector("[data-comic-wipe-active]") as HTMLElement).style.transform).toContain(
      "translate3d(0px, 120px, 0) scale(",
    );
    await fireEvent(stage, readerPointerEvent("pointercancel", 200, 320, "touch", 14));
    expect(onClose).not.toHaveBeenCalled();

    // Committed downward drag dismisses
    await fireEvent(stage, readerPointerEvent("pointerdown", 200, 200, "touch", 15));
    await fireEvent(stage, readerPointerEvent("pointermove", 200, 320, "touch", 15));
    await fireEvent(stage, readerPointerEvent("pointerup", 200, 320, "touch", 15));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("commits a forward wipe on the chapter-end page by calling onNextChapter without self-sliding", async () => {
    let resolveNext!: () => void;
    const onNextChapter = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveNext = resolve;
        }),
    );

    const { container } = render(ComicReader, {
      props: {
        images,
        initialIndex: images.length,
        title: "Comic",
        nextChapterLabel: "Chapter Two",
        onClose: vi.fn(),
        onNextChapter,
      },
    });

    const root = readerRoot(container);
    const stage = root.querySelector(".reader-stage-paged") as HTMLElement;
    vi.spyOn(stage, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 400,
      height: 800,
    } as DOMRect);

    await fireEvent(stage, readerPointerEvent("pointerdown", 300, 400, "touch", 16));
    await fireEvent(stage, readerPointerEvent("pointermove", 180, 400, "touch", 16));
    await fireEvent(stage, readerPointerEvent("pointerup", 180, 400, "touch", 16));
    await tick();

    expect(onNextChapter).toHaveBeenCalledTimes(1);
    expect(root.querySelector("[data-comic-wipe-outgoing]")).toBeNull();
    expect((root.querySelector("[data-comic-wipe-active]") as HTMLElement).style.transform).toBe("");

    resolveNext();
    await Promise.resolve();
    await tick();

    expect(root.querySelector('img[alt="Page 1"]')).toBeInTheDocument();
  });
});

function readerPointerEvent(
  type: string,
  clientX: number,
  clientY: number,
  pointerType: string,
  pointerId: number,
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
  });
  Object.defineProperty(event, "pointerId", { value: pointerId });
  Object.defineProperty(event, "pointerType", { value: pointerType });
  return event;
}

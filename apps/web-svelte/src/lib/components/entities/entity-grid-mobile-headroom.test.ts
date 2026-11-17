import { describe, expect, it } from "vitest";
import { EntityGridMobileHeadroomController } from "./entity-grid-mobile-headroom.svelte";

function setupScrollHost() {
  const host = document.createElement("div");
  host.style.overflowY = "auto";
  const anchor = document.createElement("div");
  host.appendChild(anchor);
  document.body.appendChild(host);

  let scrollTop = 0;
  Object.defineProperty(host, "scrollTop", {
    configurable: true,
    get: () => scrollTop,
    set: (value: number) => {
      scrollTop = value;
    },
  });

  const scrollTo = (nextTop: number) => {
    scrollTop = nextTop;
    host.dispatchEvent(new Event("scroll"));
  };

  return { host, anchor, scrollTo, cleanup: () => host.remove() };
}

describe("EntityGridMobileHeadroomController", () => {
  it("hides on downward scroll past the sticky threshold and reveals on upward scroll", () => {
    const { anchor, scrollTo, cleanup } = setupScrollHost();
    const headroom = new EntityGridMobileHeadroomController(
      () => true,
      () => false,
    );
    const disconnect = headroom.connect(anchor);

    expect(headroom.hidden).toBe(false);

    // Small downward move near top keeps rail visible.
    scrollTo(40);
    expect(headroom.hidden).toBe(false);

    // Downward scroll past sticky threshold hides rail.
    scrollTo(120);
    expect(headroom.hidden).toBe(true);

    // Tiny upward jitter under 8px keeps rail hidden.
    scrollTo(116);
    expect(headroom.hidden).toBe(true);

    // Intentional upward scroll (>= 8px) reveals rail.
    scrollTo(100);
    expect(headroom.hidden).toBe(false);

    disconnect();
    cleanup();
  });

  it("stays visible when pinned open or disabled", () => {
    const { anchor, scrollTo, cleanup } = setupScrollHost();
    let pinned = false;
    let enabled = true;
    const headroom = new EntityGridMobileHeadroomController(
      () => enabled,
      () => pinned,
    );
    const disconnect = headroom.connect(anchor);

    scrollTo(140);
    expect(headroom.hidden).toBe(true);

    pinned = true;
    headroom.sync();
    expect(headroom.hidden).toBe(false);

    scrollTo(220);
    expect(headroom.hidden).toBe(false);

    pinned = false;
    enabled = false;
    scrollTo(300);
    expect(headroom.hidden).toBe(false);

    disconnect();
    cleanup();
  });
});

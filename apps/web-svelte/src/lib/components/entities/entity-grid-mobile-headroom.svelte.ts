import { findEntityGridScrollAncestor } from "./entity-grid-viewport.svelte";

const TOP_REVEAL_Y = 24;
const STICKY_HIDE_MIN_Y = 72;
const HIDE_DOWN_DELTA = 12;
const SHOW_UP_DELTA = 8;

/**
 * Tracks directional scroll headroom for the mobile grid toolbar rail.
 *
 * The rail remains visible at the top of the scroll container and whenever an
 * interactive overlay (search expansion, filter sheet, or popover) is open.
 * Scrolling down past the sticky threshold hides the rail behind the header,
 * and scrolling back up reveals it again.
 */
export class EntityGridMobileHeadroomController {
  /** Whether the mobile rail is currently tucked away on downward scroll. */
  hidden = $state(false);

  #lastY = 0;
  #direction: "up" | "down" | null = null;
  #travel = 0;
  #isEnabled: () => boolean;
  #isPinnedOpen: () => boolean;

  constructor(
    isEnabled: () => boolean,
    isPinnedOpen: () => boolean,
  ) {
    this.#isEnabled = isEnabled;
    this.#isPinnedOpen = isPinnedOpen;
  }

  /** Reveals the rail immediately whenever an interaction pins it open or disables headroom. */
  sync(): void {
    if (!this.#isEnabled() || this.#isPinnedOpen()) {
      this.hidden = false;
      this.#direction = null;
      this.#travel = 0;
    }
  }

  /** Connects a scroll listener to the grid's scroll ancestor (or window) and returns cleanup. */
  connect(anchorEl: Element | null): () => void {
    if (!anchorEl) return () => undefined;
    const ancestor = findEntityGridScrollAncestor(anchorEl);
    const target: EventTarget = ancestor ?? window;

    const readY = (): number =>
      ancestor ? ancestor.scrollTop : window.scrollY;

    this.#lastY = readY();
    this.#direction = null;
    this.#travel = 0;
    this.sync();

    const onScroll = () => {
      if (!this.#isEnabled() || this.#isPinnedOpen()) {
        this.hidden = false;
        this.#lastY = readY();
        this.#direction = null;
        this.#travel = 0;
        return;
      }

      const y = Math.max(0, readY());
      const delta = y - this.#lastY;
      this.#lastY = y;

      if (y <= TOP_REVEAL_Y) {
        this.hidden = false;
        this.#direction = null;
        this.#travel = 0;
        return;
      }

      if (delta === 0) return;

      const nextDirection = delta > 0 ? "down" : "up";
      if (nextDirection !== this.#direction) {
        this.#direction = nextDirection;
        this.#travel = 0;
      }
      this.#travel += Math.abs(delta);

      if (nextDirection === "down" && y > STICKY_HIDE_MIN_Y && this.#travel >= HIDE_DOWN_DELTA) {
        this.hidden = true;
      } else if (nextDirection === "up" && this.#travel >= SHOW_UP_DELTA) {
        this.hidden = false;
      }
    };

    target.addEventListener("scroll", onScroll, { passive: true });
    return () => target.removeEventListener("scroll", onScroll);
  }
}

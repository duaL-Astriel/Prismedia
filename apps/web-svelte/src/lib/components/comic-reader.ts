export type ComicPageMode = "single" | "double";
export type ComicTapZone = "previous" | "controls" | "next";

export const COMIC_FIT_MODE = {
  screen: "screen",
  width: "width",
  height: "height",
} as const;

export type ComicFitMode = (typeof COMIC_FIT_MODE)[keyof typeof COMIC_FIT_MODE];

export const COMIC_FIT_STORAGE_KEY = "prismedia:comic-reader:fit-mode";
export const COMIC_MOBILE_FIT_MEDIA_QUERY = "(max-width: 639px)";

/** Type guard for supported comic reader fit modes. */
export function isComicFitMode(value: unknown): value is ComicFitMode {
  return (
    value === COMIC_FIT_MODE.screen
    || value === COMIC_FIT_MODE.width
    || value === COMIC_FIT_MODE.height
  );
}

/**
 * Resolves the device-aware default fit mode when no saved preference exists:
 * mobile portrait screens default to fit-to-width for legible dialogue, while
 * wider viewports default to fit-to-screen.
 */
export function defaultComicFitMode(isMobile?: boolean): ComicFitMode {
  if (typeof isMobile === "boolean") {
    return isMobile ? COMIC_FIT_MODE.width : COMIC_FIT_MODE.screen;
  }
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    return window.matchMedia(COMIC_MOBILE_FIT_MEDIA_QUERY).matches
      ? COMIC_FIT_MODE.width
      : COMIC_FIT_MODE.screen;
  }
  return COMIC_FIT_MODE.screen;
}

/** Reads the per-device comic reader fit preference from localStorage, if valid. */
export function readComicFitPreference(): ComicFitMode | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    const raw = window.localStorage.getItem(COMIC_FIT_STORAGE_KEY);
    return isComicFitMode(raw) ? raw : null;
  } catch {
    return null;
  }
}

/** Persists the user's selected comic reader fit mode for this device. */
export function writeComicFitPreference(mode: ComicFitMode): void {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(COMIC_FIT_STORAGE_KEY, mode);
  } catch {
    // Private mode or disabled storage — fit preference falls back to session state.
  }
}

/** Resolves the initial fit mode from an explicit override, saved preference, or device default. */
export function resolveInitialComicFitMode(explicit?: ComicFitMode | null): ComicFitMode {
  if (isComicFitMode(explicit)) return explicit;
  return readComicFitPreference() ?? defaultComicFitMode();
}

export interface ComicReaderOptions {
  pageMode: ComicPageMode;
  firstPageIsCover: boolean;
  /** Manifest ordinals that must occupy a spread alone, such as scanned double pages. */
  singlePageIndexes?: readonly number[];
}

function clampIndex(index: number, total: number) {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(total - 1, index));
}

export function comicSpreadForIndex(
  index: number,
  total: number,
  options: ComicReaderOptions,
): number[] {
  if (total <= 0) return [];
  const current = clampIndex(index, total);
  if (options.pageMode === "single") return [current];
  const singlePages = new Set(options.singlePageIndexes ?? []);
  let cursor = 0;
  while (cursor < total) {
    const next = cursor + 1;
    const standsAlone =
      (options.firstPageIsCover && cursor === 0)
      || singlePages.has(cursor)
      || next >= total
      || singlePages.has(next);
    const spread = standsAlone ? [cursor] : [cursor, next];
    if (spread.includes(current)) return spread;
    cursor += spread.length;
  }
  return [current];
}

export function nextComicIndex(
  index: number,
  total: number,
  options: ComicReaderOptions,
): number {
  if (total <= 0) return 0;
  if (options.pageMode === "single") return clampIndex(index + 1, total);
  const spread = comicSpreadForIndex(index, total, options);
  const next = (spread.at(-1) ?? index) + 1;
  return clampIndex(next, total);
}

export function previousComicIndex(
  index: number,
  total: number,
  options: ComicReaderOptions,
): number {
  if (total <= 0) return 0;
  if (options.pageMode === "single") return clampIndex(index - 1, total);
  const spread = comicSpreadForIndex(index, total, options);
  const previous = (spread[0] ?? index) - 1;
  if (options.firstPageIsCover && previous <= 0) return 0;
  if (!options.firstPageIsCover) return previous % 2 === 0 ? clampIndex(previous, total) : clampIndex(previous - 1, total);
  return previous % 2 === 1 ? clampIndex(previous, total) : clampIndex(previous - 1, total);
}

export function comicTapZone(x: number, width: number): ComicTapZone {
  if (width <= 0) return "controls";
  const ratio = x / width;
  if (ratio < 1 / 3) return "previous";
  if (ratio > 2 / 3) return "next";
  return "controls";
}

export function comicPreloadIndexes(
  index: number,
  total: number,
  options: ComicReaderOptions,
  radius = 2,
): number[] {
  const visible = comicSpreadForIndex(index, total, options);
  if (visible.length === 0) return [];

  const visibleSet = new Set(visible);
  const start = clampIndex(Math.min(...visible) - radius, total);
  const end = clampIndex(Math.max(...visible) + radius, total);
  const indexes: number[] = [];

  for (let i = start; i <= end; i += 1) {
    if (!visibleSet.has(i)) indexes.push(i);
  }

  return indexes;
}

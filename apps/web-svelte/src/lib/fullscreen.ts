/**
 * Cross-browser fullscreen helpers. Mobile Safari often ignores
 * `Element.requestFullscreen()` on wrapper divs; iOS uses
 * `HTMLVideoElement.webkitEnterFullscreen()` instead.
 */

type FullscreenElement = Element & {
  webkitRequestFullscreen?: () => Promise<void> | void;
  mozRequestFullScreen?: () => Promise<void> | void;
  msRequestFullscreen?: () => Promise<void> | void;
};

type VideoWithWebKit = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void;
};

function requestFullscreenOn(el: Element): Promise<void> {
  const anyEl = el as FullscreenElement;
  const result =
    el.requestFullscreen?.() ??
    (anyEl.webkitRequestFullscreen
      ? Promise.resolve(anyEl.webkitRequestFullscreen())
      : undefined) ??
    (anyEl.mozRequestFullScreen
      ? Promise.resolve(anyEl.mozRequestFullScreen())
      : undefined) ??
    (anyEl.msRequestFullscreen
      ? Promise.resolve(anyEl.msRequestFullscreen())
      : undefined);

  return result ?? Promise.reject(new Error("Fullscreen API not available"));
}

export function isDocumentFullscreen(): boolean {
  if (typeof document === "undefined") return false;
  const doc = document as Document & { webkitFullscreenElement?: Element | null };
  return Boolean(document.fullscreenElement ?? doc.webkitFullscreenElement);
}

export function exitDocumentFullscreen(): void {
  if (typeof document === "undefined") return;
  const doc = document as Document & {
    webkitExitFullscreen?: () => Promise<void> | void;
    msExitFullscreen?: () => Promise<void> | void;
  };
  void (
    document.exitFullscreen?.() ??
    doc.webkitExitFullscreen?.() ??
    doc.msExitFullscreen?.()
  );
}

export function isMediaFullscreen(video?: HTMLVideoElement | null): boolean {
  if (isDocumentFullscreen()) return true;
  const videoWebKit = video as
    | (HTMLVideoElement & { webkitDisplayingFullscreen?: boolean })
    | null
    | undefined;
  return Boolean(videoWebKit?.webkitDisplayingFullscreen);
}

export function exitMediaFullscreen(video?: HTMLVideoElement | null): void {
  exitDocumentFullscreen();
  const videoWebKit = video as
    | (HTMLVideoElement & {
        webkitExitFullscreen?: () => void;
        webkitDisplayingFullscreen?: boolean;
      })
    | null
    | undefined;
  if (videoWebKit?.webkitDisplayingFullscreen && videoWebKit.webkitExitFullscreen) {
    try {
      videoWebKit.webkitExitFullscreen();
    } catch {
      /* noop */
    }
  }
}

/** Enter fullscreen: try the container (keeps custom controls on desktop), then the video element, then WebKit native video fullscreen (iOS). */
export async function enterMediaFullscreen(
  container: Element,
  video: HTMLVideoElement | null,
): Promise<boolean> {
  const videoWebKit = video as VideoWithWebKit | null;

  try {
    await requestFullscreenOn(container);
    return true;
  } catch {
    /* try the video element next */
  }

  if (video) {
    try {
      await requestFullscreenOn(video);
      return true;
    } catch {
      /* fall through to WebKit native video fullscreen */
    }
  }

  try {
    if (videoWebKit?.webkitEnterFullscreen) {
      videoWebKit.webkitEnterFullscreen();
      return true;
    }
  } catch {
    /* noop — e.g. no loaded media */
  }

  return false;
}

export {
  evaluateFullscreenChange,
  evaluateOrientationDecision,
  getDeviceOrientation,
  isTouchViewport,
  subscribeOrientationChange,
  type DeviceOrientation,
  type OrientationDecisionParams,
  type OrientationDecisionResult,
  type OrientationFullscreenAction,
  type OrientationFullscreenState,
} from "$lib/player/orientation-fullscreen";

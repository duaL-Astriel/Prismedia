/**
 * Remembers the viewer's preference for automatically entering fullscreen
 * when rotating a mobile device to landscape. Stored in localStorage per device.
 * Defaults to true.
 */

const STORAGE_KEY = "prismedia.player.autoFullscreenOnLandscape";

/** Reads the saved auto-fullscreen preference, defaulting to true when unset or unavailable. */
export function readAutoFullscreenPreference(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return true;
    return raw === "true";
  } catch {
    return true;
  }
}

/** Persists the viewer's auto-fullscreen preference for this device. */
export function writeAutoFullscreenPreference(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(enabled));
  } catch {
    // Private mode / storage disabled — preference won't be remembered.
  }
}

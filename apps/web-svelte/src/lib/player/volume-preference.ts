/**
 * Player volume and mute preference persistence module.
 *
 * Persists user volume and mute choices to localStorage so playback volume
 * is preserved across media changes, page reloads, and player transitions
 * between video and audio playback.
 */

export const VOLUME_STORAGE_KEY = "prismedia:player:volume";
export const MUTED_STORAGE_KEY = "prismedia:player:muted";
export const VOLUME_CHANGE_EVENT = "prismedia:player:volume-change";

export const DEFAULT_VOLUME = 1;
export const DEFAULT_MUTED = false;

export interface PlayerVolumePreference {
  /** Playback volume clamped to [0, 1]. */
  volume: number;
  /** Whether playback is explicitly muted. */
  muted: boolean;
  /** The last known volume value strictly greater than 0, used when unmuting. */
  lastNonZeroVolume: number;
}

let inMemoryLastNonZeroVolume = DEFAULT_VOLUME;
let inMemoryVolume = DEFAULT_VOLUME;
let inMemoryMuted = DEFAULT_MUTED;

function getStorage(): Storage | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // Storage access restricted (private mode or sandbox).
  }
  return null;
}

/**
 * Clamps any numeric volume to the safe range [0, 1].
 * Returns {@link DEFAULT_VOLUME} for non-finite or NaN inputs.
 */
export function clampVolume(value: number): number {
  if (!Number.isFinite(value) || Number.isNaN(value)) {
    return DEFAULT_VOLUME;
  }
  return Math.max(0, Math.min(1, value));
}

/**
 * Checks whether client storage has a recorded volume preference.
 */
export function hasStoredVolumePreference(): boolean {
  const storage = getStorage();
  if (!storage) return false;
  try {
    return storage.getItem(VOLUME_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

/**
 * Reads the current volume preference from client storage, falling back to safe defaults
 * if storage is corrupt, missing, or throws.
 */
export function readVolumePreference(): PlayerVolumePreference {
  const storage = getStorage();
  let volume = inMemoryVolume;
  let muted = inMemoryMuted;

  if (storage) {
    try {
      const rawVolume = storage.getItem(VOLUME_STORAGE_KEY);
      if (rawVolume !== null) {
        const parsed = Number(rawVolume);
        if (Number.isFinite(parsed) && !Number.isNaN(parsed)) {
          volume = clampVolume(parsed);
          if (volume > 0) {
            inMemoryLastNonZeroVolume = volume;
          }
        } else {
          volume = DEFAULT_VOLUME;
        }
      }

      const rawMuted = storage.getItem(MUTED_STORAGE_KEY);
      if (rawMuted !== null) {
        if (rawMuted === "true") {
          muted = true;
        } else if (rawMuted === "false") {
          muted = false;
        } else {
          muted = DEFAULT_MUTED;
        }
      }
    } catch {
      // Storage failure — use fallback in-memory state.
    }
  }

  inMemoryVolume = volume;
  inMemoryMuted = muted;

  return {
    volume,
    muted,
    lastNonZeroVolume: inMemoryLastNonZeroVolume,
  };
}

/**
 * Persists a volume value to storage and updates lastNonZeroVolume if positive.
 */
export function writeVolume(volume: number): void {
  const clamped = clampVolume(volume);
  inMemoryVolume = clamped;
  if (clamped > 0) {
    inMemoryLastNonZeroVolume = clamped;
  }

  const storage = getStorage();
  if (storage) {
    try {
      storage.setItem(VOLUME_STORAGE_KEY, String(clamped));
    } catch {
      // Storage quota or write restriction.
    }
  }

  dispatchVolumeChange();
}

/**
 * Persists a muted state to storage.
 */
export function writeMuted(muted: boolean): void {
  const boolMuted = Boolean(muted);
  inMemoryMuted = boolMuted;

  const storage = getStorage();
  if (storage) {
    try {
      storage.setItem(MUTED_STORAGE_KEY, String(boolMuted));
    } catch {
      // Storage quota or write restriction.
    }
  }

  dispatchVolumeChange();
}

/**
 * Persists both volume and muted states together.
 */
export function writeVolumePreference(prefs: { volume?: number; muted?: boolean }): void {
  if (prefs.volume !== undefined) {
    const clamped = clampVolume(prefs.volume);
    inMemoryVolume = clamped;
    if (clamped > 0) {
      inMemoryLastNonZeroVolume = clamped;
    }
  }

  if (prefs.muted !== undefined) {
    inMemoryMuted = Boolean(prefs.muted);
  }

  const storage = getStorage();
  if (storage) {
    try {
      if (prefs.volume !== undefined) {
        storage.setItem(VOLUME_STORAGE_KEY, String(inMemoryVolume));
      }
      if (prefs.muted !== undefined) {
        storage.setItem(MUTED_STORAGE_KEY, String(inMemoryMuted));
      }
    } catch {
      // Storage write error.
    }
  }

  dispatchVolumeChange();
}

/**
 * Resolves the volume to restore upon unmuting.
 * Returns the current volume if positive, otherwise the last non-zero volume.
 */
export function resolveUnmutedVolume(currentVolume?: number): number {
  if (currentVolume !== undefined && Number.isFinite(currentVolume) && currentVolume > 0) {
    return clampVolume(currentVolume);
  }
  return inMemoryLastNonZeroVolume > 0 ? inMemoryLastNonZeroVolume : DEFAULT_VOLUME;
}

/**
 * Whether playback should look muted: explicitly muted, or volume at 0.
 * Mute and volume are stored separately; this only drives the UI affordance.
 */
export function isEffectivelyMuted(muted: boolean, volume: number): boolean {
  return muted || volume === 0;
}

/**
 * Computes the state after pressing the mute button. Pressing while effectively
 * muted (including volume 0) unmutes and restores the last non-zero volume.
 */
export function resolveMuteToggle(
  muted: boolean,
  volume: number,
): { muted: boolean; volume: number } {
  if (isEffectivelyMuted(muted, volume)) {
    return { muted: false, volume: resolveUnmutedVolume(volume) };
  }
  return { muted: true, volume };
}

/**
 * Returns the currently tracked last non-zero volume level.
 */
export function getLastNonZeroVolume(): number {
  return inMemoryLastNonZeroVolume;
}

/**
 * Sets the tracked last non-zero volume level.
 */
export function setLastNonZeroVolume(volume: number): void {
  const clamped = clampVolume(volume);
  if (clamped > 0) {
    inMemoryLastNonZeroVolume = clamped;
  }
}

function dispatchVolumeChange(): void {
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(
        new CustomEvent(VOLUME_CHANGE_EVENT, {
          detail: {
            volume: inMemoryVolume,
            muted: inMemoryMuted,
            lastNonZeroVolume: inMemoryLastNonZeroVolume,
          },
        }),
      );
    } catch {
      // Event dispatch error.
    }
  }
}

/**
 * Registers a listener for volume and mute preference changes across players or tabs.
 * Returns an unregister function.
 */
export function onVolumePreferenceChange(
  callback: (pref: PlayerVolumePreference) => void,
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handler = () => callback(readVolumePreference());

  const storageHandler = (event: StorageEvent) => {
    if (event.key === VOLUME_STORAGE_KEY || event.key === MUTED_STORAGE_KEY) {
      handler();
    }
  };

  try {
    window.addEventListener(VOLUME_CHANGE_EVENT, handler);
    window.addEventListener("storage", storageHandler);
  } catch {
    return () => {};
  }

  return () => {
    try {
      window.removeEventListener(VOLUME_CHANGE_EVENT, handler);
      window.removeEventListener("storage", storageHandler);
    } catch {
      // Cleanup failure safe.
    }
  };
}

/**
 * Resets in-memory tracking state (primarily for test isolation).
 */
export function resetVolumePreferenceForTesting(): void {
  inMemoryVolume = DEFAULT_VOLUME;
  inMemoryMuted = DEFAULT_MUTED;
  inMemoryLastNonZeroVolume = DEFAULT_VOLUME;
}

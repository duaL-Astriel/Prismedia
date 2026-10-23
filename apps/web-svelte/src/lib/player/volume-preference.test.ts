import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clampVolume,
  DEFAULT_MUTED,
  DEFAULT_VOLUME,
  getLastNonZeroVolume,
  hasStoredVolumePreference,
  MUTED_STORAGE_KEY,
  onVolumePreferenceChange,
  readVolumePreference,
  resetVolumePreferenceForTesting,
  resolveUnmutedVolume,
  setLastNonZeroVolume,
  VOLUME_STORAGE_KEY,
  writeMuted,
  writeVolume,
  writeVolumePreference,
} from "./volume-preference";

describe("volume-preference", () => {
  beforeEach(() => {
    resetVolumePreferenceForTesting();
    window.localStorage?.clear();
  });

  afterEach(() => {
    resetVolumePreferenceForTesting();
    window.localStorage?.clear();
    vi.restoreAllMocks();
  });

  describe("clamping", () => {
    it("clamps values below 0 to 0", () => {
      expect(clampVolume(-0.01)).toBe(0);
      expect(clampVolume(-1)).toBe(0);
      expect(clampVolume(-100)).toBe(0);
    });

    it("clamps values above 1 to 1", () => {
      expect(clampVolume(1.01)).toBe(1);
      expect(clampVolume(2)).toBe(1);
      expect(clampVolume(100)).toBe(1);
    });

    it("preserves valid volume values within [0, 1]", () => {
      expect(clampVolume(0)).toBe(0);
      expect(clampVolume(0.25)).toBe(0.25);
      expect(clampVolume(0.5)).toBe(0.5);
      expect(clampVolume(0.85)).toBe(0.85);
      expect(clampVolume(1)).toBe(1);
    });

    it("falls back to DEFAULT_VOLUME for non-finite and NaN values", () => {
      expect(clampVolume(Number.NaN)).toBe(DEFAULT_VOLUME);
      expect(clampVolume(Number.POSITIVE_INFINITY)).toBe(DEFAULT_VOLUME);
      expect(clampVolume(Number.NEGATIVE_INFINITY)).toBe(DEFAULT_VOLUME);
    });

    it("clamps persisted values when written to storage", () => {
      writeVolume(-0.5);
      expect(window.localStorage.getItem(VOLUME_STORAGE_KEY)).toBe("0");

      writeVolume(1.8);
      expect(window.localStorage.getItem(VOLUME_STORAGE_KEY)).toBe("1");
    });
  });

  describe("mute vs volume 0 and lastNonZeroVolume tracking", () => {
    it("distinguishes volume 0 from muted state", () => {
      writeVolume(0);
      const pref = readVolumePreference();
      expect(pref.volume).toBe(0);
      expect(pref.muted).toBe(false);
    });

    it("does not overwrite volume in storage when muting", () => {
      writeVolume(0.65);
      writeMuted(true);

      const pref = readVolumePreference();
      expect(pref.muted).toBe(true);
      expect(pref.volume).toBe(0.65);
      expect(window.localStorage.getItem(VOLUME_STORAGE_KEY)).toBe("0.65");
      expect(window.localStorage.getItem(MUTED_STORAGE_KEY)).toBe("true");
    });

    it("tracks last non-zero volume when volume is reduced to 0", () => {
      writeVolume(0.7);
      expect(getLastNonZeroVolume()).toBe(0.7);

      writeVolume(0);
      expect(getLastNonZeroVolume()).toBe(0.7);
      const pref = readVolumePreference();
      expect(pref.volume).toBe(0);
      expect(pref.lastNonZeroVolume).toBe(0.7);
    });

    it("safely restores last non-zero volume on unmuting from volume 0", () => {
      writeVolume(0.4);
      writeVolume(0);
      expect(resolveUnmutedVolume(0)).toBe(0.4);
    });

    it("restores current volume on unmuting when volume > 0", () => {
      writeVolume(0.75);
      writeMuted(true);
      expect(resolveUnmutedVolume(0.75)).toBe(0.75);
    });

    it("falls back to DEFAULT_VOLUME if no positive volume was ever recorded", () => {
      resetVolumePreferenceForTesting();
      setLastNonZeroVolume(0);
      expect(resolveUnmutedVolume(0)).toBe(DEFAULT_VOLUME);
    });
  });

  describe("persistence round-trip", () => {
    it("round-trips volume and muted values through writeVolumePreference and readVolumePreference", () => {
      writeVolumePreference({ volume: 0.35, muted: true });

      const pref = readVolumePreference();
      expect(pref.volume).toBe(0.35);
      expect(pref.muted).toBe(true);
      expect(pref.lastNonZeroVolume).toBe(0.35);
    });

    it("correctly indicates when storage has volume preference", () => {
      expect(hasStoredVolumePreference()).toBe(false);
      writeVolume(0.5);
      expect(hasStoredVolumePreference()).toBe(true);
    });

    it("notifies listeners on preference change", () => {
      const listener = vi.fn();
      const unsubscribe = onVolumePreferenceChange(listener);

      writeVolume(0.42);
      expect(listener).toHaveBeenCalled();
      const lastCallPref = listener.mock.calls.at(-1)?.[0];
      expect(lastCallPref?.volume).toBe(0.42);

      unsubscribe();
      writeVolume(0.88);
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe("corrupt and missing storage handling", () => {
    it("returns safe defaults when localStorage keys are missing", () => {
      const pref = readVolumePreference();
      expect(pref.volume).toBe(DEFAULT_VOLUME);
      expect(pref.muted).toBe(DEFAULT_MUTED);
      expect(pref.lastNonZeroVolume).toBe(DEFAULT_VOLUME);
    });

    it("recovers safely from corrupt volume strings in storage", () => {
      window.localStorage.setItem(VOLUME_STORAGE_KEY, "corrupt_data");
      const pref = readVolumePreference();
      expect(pref.volume).toBe(DEFAULT_VOLUME);

      window.localStorage.setItem(VOLUME_STORAGE_KEY, "NaN");
      expect(readVolumePreference().volume).toBe(DEFAULT_VOLUME);

      window.localStorage.setItem(VOLUME_STORAGE_KEY, "{}");
      expect(readVolumePreference().volume).toBe(DEFAULT_VOLUME);
    });

    it("clamps out-of-bounds volume strings found in storage", () => {
      window.localStorage.setItem(VOLUME_STORAGE_KEY, "-2.5");
      expect(readVolumePreference().volume).toBe(0);

      window.localStorage.setItem(VOLUME_STORAGE_KEY, "99.9");
      expect(readVolumePreference().volume).toBe(1);
    });

    it("recovers safely from corrupt muted strings in storage", () => {
      window.localStorage.setItem(MUTED_STORAGE_KEY, "invalid");
      expect(readVolumePreference().muted).toBe(DEFAULT_MUTED);

      window.localStorage.setItem(MUTED_STORAGE_KEY, "1");
      expect(readVolumePreference().muted).toBe(DEFAULT_MUTED);

      window.localStorage.setItem(MUTED_STORAGE_KEY, "null");
      expect(readVolumePreference().muted).toBe(DEFAULT_MUTED);
    });

    it("handles localStorage read exceptions without throwing", () => {
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("SecurityError: Access denied");
      });

      expect(() => readVolumePreference()).not.toThrow();
      const pref = readVolumePreference();
      expect(pref.volume).toBe(DEFAULT_VOLUME);
      expect(pref.muted).toBe(DEFAULT_MUTED);
    });

    it("handles localStorage write exceptions without throwing", () => {
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });

      expect(() => writeVolume(0.5)).not.toThrow();
      expect(() => writeMuted(true)).not.toThrow();
      expect(() => writeVolumePreference({ volume: 0.2, muted: false })).not.toThrow();
    });
  });
});

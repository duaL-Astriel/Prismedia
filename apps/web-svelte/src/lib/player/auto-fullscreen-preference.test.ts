import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  readAutoFullscreenPreference,
  writeAutoFullscreenPreference,
} from "./auto-fullscreen-preference";

describe("auto-fullscreen-preference", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("defaults to true when unset", () => {
    expect(readAutoFullscreenPreference()).toBe(true);
  });

  it("persists false when disabled", () => {
    writeAutoFullscreenPreference(false);
    expect(readAutoFullscreenPreference()).toBe(false);
  });

  it("persists true when enabled", () => {
    writeAutoFullscreenPreference(false);
    expect(readAutoFullscreenPreference()).toBe(false);
    writeAutoFullscreenPreference(true);
    expect(readAutoFullscreenPreference()).toBe(true);
  });

  it("stores the preference under the prismedia:player:auto-fullscreen-landscape key", () => {
    writeAutoFullscreenPreference(false);
    expect(localStorage.getItem("prismedia:player:auto-fullscreen-landscape")).toBe("false");
  });

  it("reads a value saved under the namespaced key", () => {
    localStorage.setItem("prismedia:player:auto-fullscreen-landscape", "false");
    expect(readAutoFullscreenPreference()).toBe(false);
  });
});

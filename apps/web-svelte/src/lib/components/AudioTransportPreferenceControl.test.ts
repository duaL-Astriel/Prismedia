import { render } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import AudioTransportPreferenceControl from "./AudioTransportPreferenceControl.svelte";

function renderControl(muted: boolean, volume: number) {
  return render(AudioTransportPreferenceControl, {
    accentColor: "#fff",
    muted,
    playbackRate: 1,
    supportsPlaybackRate: false,
    volume,
    onMute: () => {},
    onPlaybackRate: () => {},
    onVolume: () => {},
  });
}

describe("AudioTransportPreferenceControl mute button", () => {
  it("shows the muted state at volume 0", () => {
    const { getByRole } = renderControl(false, 0);
    const button = getByRole("button", { name: "Unmute" });
    expect(button.getAttribute("aria-pressed")).toBe("true");
  });

  it("shows the muted state when muted", () => {
    const { getByRole } = renderControl(true, 0.8);
    expect(getByRole("button", { name: "Unmute" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("shows the unmuted state with audible volume", () => {
    const { getByRole } = renderControl(false, 0.8);
    expect(getByRole("button", { name: "Mute" }).getAttribute("aria-pressed")).toBe("false");
  });
});

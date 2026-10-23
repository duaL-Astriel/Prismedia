<script lang="ts">
  import { Button, Slider } from "@prismedia/ui-svelte";
  import { Volume1, Volume2, VolumeX } from "@lucide/svelte";
  import { isEffectivelyMuted } from "$lib/player/volume-preference";
  import {
    formatAudioPlaybackRate,
    nextAudioPlaybackRate,
  } from "$lib/player/audio-playback-rate";

  interface Props {
    accentColor: string;
    muted: boolean;
    playbackRate: number;
    supportsPlaybackRate: boolean;
    volume: number;
    onMute: () => void;
    onPlaybackRate: (rate: number) => void;
    onVolume: (volume: number) => void;
  }

  let {
    accentColor,
    muted,
    playbackRate,
    supportsPlaybackRate,
    volume,
    onMute,
    onPlaybackRate,
    onVolume,
  }: Props = $props();

  const displayMuted = $derived(isEffectivelyMuted(muted, volume));
  const VolumeIcon = $derived(displayMuted ? VolumeX : volume < 0.5 ? Volume1 : Volume2);
</script>

<div class="group/vol flex min-w-0 items-center gap-1">
  {#if supportsPlaybackRate}
    <Button variant="ghost" size="icon-sm"
      type="button"
      onclick={() => onPlaybackRate(nextAudioPlaybackRate(playbackRate))}
      title={`Playback speed: ${formatAudioPlaybackRate(playbackRate)}`}
      aria-label={`Playback speed: ${formatAudioPlaybackRate(playbackRate)}`}
      class="min-w-9 font-mono text-xs tabular-nums"
    >
      {formatAudioPlaybackRate(playbackRate)}
    </Button>
  {:else}
    <Button variant="ghost" size="icon-sm" type="button" onclick={onMute} aria-label={displayMuted ? "Unmute" : "Mute"} aria-pressed={displayMuted}>
      <VolumeIcon class="h-3 w-3" />
    </Button>
    <div class="w-16">
      <Slider type="single" min={0} max={1} step={0.01} value={displayMuted ? 0 : volume} onValueChange={onVolume} thumbLabel="Volume" />
    </div>
  {/if}
</div>

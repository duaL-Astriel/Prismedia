<script lang="ts">
  import type { ComponentProps } from "svelte";
  import { provideNsfw } from "$lib/nsfw/store.svelte";
  import { provideSession } from "$lib/stores/session.svelte";
  import ImageLightboxDetails from "./ImageLightboxDetails.svelte";

  let props: ComponentProps<typeof ImageLightboxDetails> = $props();

  provideNsfw(() => ({ initialMode: "show", allowed: true }));
  provideSession({ user: null, needsSetup: false });
</script>

<ImageLightboxDetails {...props} />

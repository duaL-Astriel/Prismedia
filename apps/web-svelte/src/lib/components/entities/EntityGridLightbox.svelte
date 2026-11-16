<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { fetchEntity } from "$lib/api/entities";
  import { updateEntityRating } from "$lib/api/entity-mutations";
  import {
    lightboxEntityFromCard,
    type UniversalLightboxEntity,
  } from "$lib/components/universal-lightbox-media";
  import { EntityViewingSession } from "$lib/entities/entity-viewing-session";
  import {
    applyRatingToHydratedEntities,
    isLightboxableCard,
    lightboxEntityFromFullEntity,
    selectLightboxCardsToHydrate,
  } from "./entity-grid-lightbox";
  import type { GridLightboxController } from "./entity-grid-lightbox-controller.svelte";

  interface Props {
    controller: GridLightboxController;
    sharedKey?: string;
    onRatingUpdated?: (entityId: string, rating: number | null) => void;
  }

  let { controller, sharedKey, onRatingUpdated }: Props = $props();

  let hydratedLightboxEntities = $state<Record<string, UniversalLightboxEntity>>({});
  const lightboxHydrationInFlight = new Set<string>();
  let hydrationSession = 0;
  let UniversalLightboxLazy = $state<typeof import("$lib/components/UniversalLightbox.svelte").default | null>(null);
  let ImageLightboxDetailsLazy = $state<typeof import("$lib/components/ImageLightboxDetails.svelte").default | null>(null);
  let lightboxComponentLoad: Promise<void> | null = null;

  const viewingSession = new EntityViewingSession();

  const lightboxEntities = $derived.by((): UniversalLightboxEntity[] =>
    controller.cards.map(
      (card) => hydratedLightboxEntities[card.entity.id] ?? lightboxEntityFromCard(card),
    ),
  );

  const activeLightboxEntityId = $derived(lightboxEntities[controller.index]?.id ?? null);

  $effect(() => {
    if (controller.cards.length === 0) {
      hydrationSession += 1;
      lightboxHydrationInFlight.clear();
      untrack(() => {
        if (Object.keys(hydratedLightboxEntities).length > 0) {
          hydratedLightboxEntities = {};
        }
      });
      return;
    }
    void ensureLightboxComponents();
  });

  $effect(() => {
    const cards = controller.cards;
    const index = controller.index;
    const toHydrate = untrack(() =>
      selectLightboxCardsToHydrate(cards, index, hydratedLightboxEntities, lightboxHydrationInFlight),
    );
    for (const card of toHydrate) {
      void hydrateLightboxEntity(card);
    }
  });

  $effect(() => {
    if (lightboxEntities.length > 0 && activeLightboxEntityId) {
      viewingSession.open(
        activeLightboxEntityId,
        typeof document === "undefined" ? true : !document.hidden,
      );
    } else {
      viewingSession.close();
    }
  });

  onMount(() => () => {
    viewingSession.close();
  });

  function handleVisibilityChange() {
    if (typeof document === "undefined") return;
    if (document.hidden || lightboxEntities.length === 0) {
      viewingSession.pause();
    } else {
      viewingSession.resume();
    }
  }

  async function ensureLightboxComponents() {
    if (UniversalLightboxLazy && ImageLightboxDetailsLazy) return;
    lightboxComponentLoad ??= Promise.all([
      import("$lib/components/UniversalLightbox.svelte"),
      import("$lib/components/ImageLightboxDetails.svelte"),
    ]).then(([lightbox, details]) => {
      UniversalLightboxLazy = lightbox.default;
      ImageLightboxDetailsLazy = details.default;
    });

    await lightboxComponentLoad;
  }

  async function hydrateLightboxEntity(card: (typeof controller.cards)[number]) {
    const entityId = card.entity.id;
    if (lightboxHydrationInFlight.has(entityId) || !isLightboxableCard(card)) return;

    const session = hydrationSession;
    lightboxHydrationInFlight.add(entityId);
    try {
      const entity = lightboxEntityFromFullEntity(await fetchEntity(entityId));
      if (session !== hydrationSession || controller.cards.length === 0) return;
      if (!controller.cards.some((candidate) => candidate.entity.id === entityId)) return;
      hydratedLightboxEntities = {
        ...hydratedLightboxEntities,
        [entityId]: entity,
      };
    } catch {
      if (session !== hydrationSession || controller.cards.length === 0) return;
      const currentCard = controller.cards.find((candidate) => candidate.entity.id === entityId);
      if (!currentCard) return;
      // Cache the card-derived entity payload so the lightbox stays usable offline and $effect does not retry infinitely.
      hydratedLightboxEntities = {
        ...hydratedLightboxEntities,
        [entityId]: lightboxEntityFromCard(currentCard),
      };
    } finally {
      if (session === hydrationSession) {
        lightboxHydrationInFlight.delete(entityId);
      }
    }
  }

  function syncRatingState(entityId: string, rating: number | null) {
    controller.applyRating(entityId, rating);
    hydratedLightboxEntities = applyRatingToHydratedEntities(
      hydratedLightboxEntities,
      entityId,
      rating,
    );
    onRatingUpdated?.(entityId, rating);
  }

  async function handleRatingChange(entityId: string, rating: number | null) {
    syncRatingState(entityId, rating);
    await updateEntityRating(entityId, rating);
  }

  function handleClose() {
    viewingSession.close();
    hydrationSession += 1;
    lightboxHydrationInFlight.clear();
    hydratedLightboxEntities = {};
    controller.close();
  }
</script>

<svelte:document onvisibilitychange={handleVisibilityChange} />

{#if lightboxEntities.length > 0 && UniversalLightboxLazy && ImageLightboxDetailsLazy}
  <UniversalLightboxLazy
    entities={lightboxEntities}
    initialIndex={controller.index}
    onClose={handleClose}
    onIndexChange={(index: number) => controller.setIndex(index)}
    onRatingChange={(entityId: string, rating: number | null) => void handleRatingChange(entityId, rating)}
    {sharedKey}
  >
    {#snippet detailsContent(entity: UniversalLightboxEntity)}
      <ImageLightboxDetailsLazy {entity} onRatingChange={syncRatingState} />
    {/snippet}
  </UniversalLightboxLazy>
{/if}

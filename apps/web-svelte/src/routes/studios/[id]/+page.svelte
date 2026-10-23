<script lang="ts">
  import { page } from "$app/state";
  import { CheckCircle, Film, Image as ImageIcon } from "@lucide/svelte";
  import { Button } from "@prismedia/ui-svelte";
  import EntityDetailPageState from "$lib/components/entities/EntityDetailPageState.svelte";
  import EntityDetailHeroDates from "$lib/components/entities/EntityDetailHeroDates.svelte";
  import EntityGridSection from "$lib/components/entities/EntityGridSection.svelte";
  import { useEntityDetailPage } from "$lib/components/entities/entity-detail-page-controller.svelte";
  import { fetchEntities, fetchEntity, type EntityCardFull } from "$lib/api/entities";
  import { setEntityCover } from "$lib/api/entity-mutations";
  import { RELATIONSHIP_CODE } from "$lib/api/generated/codes";
  import { entityCardToDetailCard, REFERENCE_STANDALONE_METADATA_SECTION_IDS, type EntityDetailCardFull } from "$lib/entities/entity-detail";
  import { entityCardToThumbnailCard } from "$lib/entities/entity-grid";
  import { resolveEntityHref } from "$lib/entities/entity-routes";
  import type { EntityThumbnailCard } from "$lib/entities/entity-thumbnail";
  import EntityDetail, {
    type EntityDetailActionButton,
  } from "$lib/components/entities/EntityDetail.svelte";
  import EntityGrid from "$lib/components/entities/EntityGrid.svelte";
  import { useIdentifyDetailAction } from "$lib/components/identify/use-identify-detail-action.svelte";
  let relatedCards = $state<EntityThumbnailCard[]>([]);
  let settingCoverEntityId = $state<string | null>(null);
  let settingCoverSuccessId = $state<string | null>(null);

  async function handleSetCover(itemEntityId: string) {
    if (!studio || settingCoverEntityId) return;
    settingCoverEntityId = itemEntityId;
    try {
      await setEntityCover(studio.id, itemEntityId);
      settingCoverSuccessId = itemEntityId;
      await detail.reload();
    } catch (err) {
      console.error("Failed to set studio cover:", err);
    } finally {
      settingCoverEntityId = null;
    }
  }

  const detail = useEntityDetailPage<EntityCardFull>({
    loadKey: () => page.params.id ?? "",
    load: async ({ signal }) => {
      const id = page.params.id ?? "";
      const nextStudio = await fetchEntity(id, { signal });
      try {
        const response = await fetchEntities(
          { referencedBy: id, relationshipCode: RELATIONSHIP_CODE.studio, limit: 1000 },
          { signal },
        );
        relatedCards = response.items.map((item) =>
          entityCardToThumbnailCard(item, resolveEntityHref(item.kind, item.id)),
        );
      } catch (error) {
        if (signal.aborted) throw error;
        relatedCards = [];
      }
      return nextStudio;
    },
    breadcrumbs: (studio) => [
      { label: "Studios", href: "/studios" },
      { label: studio.title },
    ],
  });

  const studio = $derived(detail.entity);

  const card = $derived.by((): EntityDetailCardFull | null => {
    if (!studio) return null;
    return entityCardToDetailCard(studio);
  });

  const identifyAction = useIdentifyDetailAction(() => studio);
  const heroActions = $derived.by((): EntityDetailActionButton[] => identifyAction.action ? [identifyAction.action] : []);

  const dates = $derived(card?.dates ?? []);

</script>

<svelte:head>
  <title>{studio?.title ?? "Studio"} · Prismedia</title>
</svelte:head>

<div class="detail-page">
  <EntityDetailPageState
    loadState={detail.loadState}
    errorMessage={detail.errorMessage}
    fallbackError="Failed to load studio."
    onRetry={detail.retry}
  >
    {#if card && studio}
      <EntityDetail
        {card}
        standaloneMetadataSectionIds={REFERENCE_STANDALONE_METADATA_SECTION_IDS}
        sections={[{ id: "tags", label: "Tags", editable: false }]}
        onRatingChange={detail.changeRating}
        onFavoriteToggle={detail.toggleFavorite}
        onOrganizedToggle={detail.toggleOrganized}
        onMetadataSave={detail.saveMetadata}
        ratingBusy={detail.ratingBusy}
        posterSize="large"
        actionButtons={heroActions}
      >
        {#snippet heroMeta()}
          <EntityDetailHeroDates {dates} />
          {#if relatedCards.length > 0}
            {#if dates.length > 0}<span class="meta-sep"></span>{/if}
            <span class="meta-item">{relatedCards.length} {relatedCards.length === 1 ? "title" : "titles"}</span>
          {/if}
        {/snippet}
      </EntityDetail>

      {#if relatedCards.length > 0}
        <EntityGridSection
          title="Content"
          count={relatedCards.length}
          icon={Film}
          prefsKey={`studio-${studio.id}-content-section`}
        >
          <EntityGrid
            cards={relatedCards}
            prefsKey={`studio-${studio.id}-content`}
            emptyTitle="No content"
            emptyMessage="No content linked to this studio."
          >
            {#snippet cardAction(card)}
              <Button
                variant="outline"
                size="xs"
                type="button"
                disabled={settingCoverEntityId === card.entity.id}
                title={`Set as cover for ${studio.title}`}
                aria-label={`Set as cover for ${studio.title}`}
                onclick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void handleSetCover(card.entity.id);
                }}
              >
                {#if settingCoverSuccessId === card.entity.id}
                  <CheckCircle class="h-3 w-3" />
                  <span>Cover set</span>
                {:else}
                  <ImageIcon class="h-3 w-3" />
                  <span>Set as cover for {studio.title}</span>
                {/if}
              </Button>
            {/snippet}
          </EntityGrid>
        </EntityGridSection>
      {/if}
    {/if}
  </EntityDetailPageState>
</div>

<style>
  .detail-page { display: grid; gap: 1.25rem; padding: 0; max-width: none; margin: 0; }

  :global(.meta-item) { white-space: nowrap; font-size: 0.82rem; }
  :global(.meta-sep) { display: inline-block; width: 3px; height: 3px; margin: 0 0.5rem; background: var(--color-text-muted, #8a93a6); opacity: 0.5; }

</style>

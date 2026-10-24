<script lang="ts">
  import { page } from "$app/state";
  import { CheckCircle, Film, GitMerge, Image as ImageIcon, Loader2, Plus, Tag as TagIcon, X } from "@lucide/svelte";
  import { Badge, Button, Dialog } from "@prismedia/ui-svelte";
  import EntityDetailPageState from "$lib/components/entities/EntityDetailPageState.svelte";
  import EntityGridSection from "$lib/components/entities/EntityGridSection.svelte";
  import { useEntityDetailPage } from "$lib/components/entities/entity-detail-page-controller.svelte";
  import { fetchEntities, fetchEntity, type EntityCardFull } from "$lib/api/entities";
  import { setEntityCover } from "$lib/api/entity-mutations";
  import { RELATIONSHIP_CODE } from "$lib/api/generated/codes";
  import { getTagPolicyCapability } from "$lib/api/capabilities";
  import { entityCardToDetailCard, REFERENCE_STANDALONE_METADATA_SECTION_IDS, type EntityDetailCardFull } from "$lib/entities/entity-detail";
  import { entityCardToThumbnailCard } from "$lib/entities/entity-grid";
  import { resolveEntityHref } from "$lib/entities/entity-routes";
  import type { EntityThumbnailCard } from "$lib/entities/entity-thumbnail";
  import type { EntityDetailActionButton } from "$lib/components/entities/entity-detail-types";
  import EntityDetail from "$lib/components/entities/EntityDetail.svelte";
  import EntityGrid from "$lib/components/entities/EntityGrid.svelte";
  import MetadataCard from "$lib/components/MetadataCard.svelte";
  import NameInputDialog from "$lib/components/entities/NameInputDialog.svelte";
  import EntityPicker, { type EntityPickerItem } from "$lib/components/forms/EntityPicker.svelte";
  import { searchTags } from "$lib/entities/entity-picker-search";
  import { addTagAlias, removeTagAlias, mergeTag } from "$lib/api/taxonomy";

  let relatedCards = $state<EntityThumbnailCard[]>([]);
  let settingCoverEntityId = $state<string | null>(null);
  let settingCoverSuccessId = $state<string | null>(null);

  async function handleSetCover(itemEntityId: string) {
    if (!tag || settingCoverEntityId) return;
    settingCoverEntityId = itemEntityId;
    try {
      await setEntityCover(tag.id, itemEntityId);
      settingCoverSuccessId = itemEntityId;
      await detail.reload();
    } catch (err) {
      console.error("Failed to set tag cover:", err);
    } finally {
      settingCoverEntityId = null;
    }
  }

  let addAliasOpen = $state(false);
  let mergeDialogOpen = $state(false);
  let selectedMergeSource = $state<EntityPickerItem[]>([]);
  let mergeBusy = $state(false);
  let mergeError = $state<string | null>(null);

  const detail = useEntityDetailPage<EntityCardFull>({
    loadKey: () => page.params.id ?? "",
    load: async ({ signal }) => {
      const id = page.params.id ?? "";
      const nextTag = await fetchEntity(id, { signal });
      try {
        const response = await fetchEntities(
          { referencedBy: id, relationshipCode: RELATIONSHIP_CODE.tags, limit: 1000 },
          { signal },
        );
        relatedCards = response.items.map((item) =>
          entityCardToThumbnailCard(item, resolveEntityHref(item.kind, item.id)),
        );
      } catch (error) {
        if (signal.aborted) throw error;
        relatedCards = [];
      }
      return nextTag;
    },
    breadcrumbs: (tag) => [
      { label: "Tags", href: "/tags" },
      { label: tag.title },
    ],
  });

  const tag = $derived(detail.entity);

  const card = $derived.by((): EntityDetailCardFull | null => {
    if (!tag) return null;
    return entityCardToDetailCard(tag);
  });

  const tagPolicy = $derived(tag ? getTagPolicyCapability(tag.capabilities) : undefined);
  const aliases = $derived((tagPolicy?.aliases ?? []).filter(Boolean));

  const heroActions = $derived.by((): EntityDetailActionButton[] => [
    {
      id: "add-alias",
      label: "Add Alias",
      icon: Plus,
      onClick: () => {
        addAliasOpen = true;
      },
    },
    {
      id: "merge-tag",
      label: "Merge Tag",
      icon: GitMerge,
      onClick: () => {
        selectedMergeSource = [];
        mergeError = null;
        mergeBusy = false;
        mergeDialogOpen = true;
      },
    },
  ]);

  async function searchMergeCandidates(query: string): Promise<EntityPickerItem[]> {
    const items = await searchTags(query);
    return items.filter((item) => item.id !== tag?.id);
  }

  async function handleAddAlias(alias: string) {
    if (!tag) return;
    await addTagAlias(tag.id, alias);
    await detail.retry();
  }

  async function handleRemoveAlias(alias: string) {
    if (!tag) return;
    try {
      await removeTagAlias(tag.id, alias);
      await detail.retry();
    } catch (e) {
      console.error("Failed to remove alias:", e);
    }
  }

  async function handleConfirmMerge() {
    if (!tag || selectedMergeSource.length === 0 || mergeBusy) return;
    const sourceId = selectedMergeSource[0].id;
    mergeBusy = true;
    mergeError = null;
    try {
      await mergeTag(tag.id, sourceId);
      mergeDialogOpen = false;
      await detail.retry();
    } catch (err) {
      mergeError = err instanceof Error ? err.message : String(err);
      mergeBusy = false;
    }
  }
</script>

<svelte:head>
  <title>{tag?.title ?? "Tag"} · Prismedia</title>
</svelte:head>

<div class="detail-page">
  <EntityDetailPageState
    loadState={detail.loadState}
    errorMessage={detail.errorMessage}
    fallbackError="Failed to load tag."
    onRetry={detail.retry}
  >
    {#if card && tag}
      <EntityDetail
        {card}
        standaloneMetadataSectionIds={REFERENCE_STANDALONE_METADATA_SECTION_IDS}
        sections={[{ id: "tags", label: "Tags", editable: false }]}
        actionButtons={heroActions}
        onRatingChange={detail.changeRating}
        onFavoriteToggle={detail.toggleFavorite}
        onOrganizedToggle={detail.toggleOrganized}
        onMetadataSave={detail.saveMetadata}
        ratingBusy={detail.ratingBusy}
        posterSize="large"
      >
        {#snippet heroMeta()}
          {#if relatedCards.length > 0}
            <span class="meta-item">{relatedCards.length} {relatedCards.length === 1 ? "item" : "items"}</span>
          {/if}
          {#if tagPolicy?.ignoreAutoTag}
            {#if relatedCards.length > 0}<span class="meta-sep"></span>{/if}
            <span class="meta-item is-muted">Auto-tag ignored</span>
          {/if}
        {/snippet}

        {#snippet afterBody()}
          <div class="aliases-section">
            <MetadataCard title="Aliases" icon={TagIcon}>
              {#if aliases.length > 0}
                <div class="flex flex-wrap items-center gap-2 pt-1">
                  {#each aliases as alias (alias)}
                    <Badge variant="outline" class="flex items-center gap-1.5 py-1 px-2.5 text-xs">
                      <span>{alias}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        class="h-4 w-4 p-0 text-text-muted hover:text-error-400"
                        aria-label={`Remove alias ${alias}`}
                        onclick={() => handleRemoveAlias(alias)}
                      >
                        <X class="h-3 w-3" />
                      </Button>
                    </Badge>
                  {/each}
                </div>
              {:else}
                <p class="text-body-sm text-text-muted italic py-1">No aliases defined.</p>
              {/if}
            </MetadataCard>
          </div>
        {/snippet}
      </EntityDetail>

      {#if relatedCards.length > 0}
        <EntityGridSection
          title="Tagged Content"
          count={relatedCards.length}
          icon={Film}
          prefsKey={`tag-${tag.id}-content-section`}
        >
          <EntityGrid
            cards={relatedCards}
            prefsKey={`tag-${tag.id}-content`}
            emptyTitle="No content"
            emptyMessage="No content tagged with this tag."
          >
            {#snippet cardAction(card)}
              <Button
                variant="outline"
                size="xs"
                type="button"
                disabled={settingCoverEntityId === card.entity.id}
                title={`Set as cover for ${tag.title}`}
                aria-label={`Set as cover for ${tag.title}`}
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
                  <span>Set as cover for {tag.title}</span>
                {/if}
              </Button>
            {/snippet}
          </EntityGrid>
        </EntityGridSection>
      {/if}

      <NameInputDialog
        open={addAliasOpen}
        title="Add Tag Alias"
        placeholder="Alias"
        confirmLabel="Add"
        onConfirm={handleAddAlias}
        onClose={() => {
          addAliasOpen = false;
        }}
      />

      <Dialog
        open={mergeDialogOpen}
        onClose={() => {
          if (!mergeBusy) mergeDialogOpen = false;
        }}
        ariaLabel="Merge Tag"
        dismissible={!mergeBusy}
        class="w-[min(92vw,28rem)]"
      >
        <div class="flex flex-col gap-4 p-5">
          <div class="flex items-start justify-between gap-4">
            <div>
              <h2 class="font-heading text-base font-semibold tracking-wide text-text-primary">Merge Tag</h2>
              <p class="text-body-xs text-text-muted mt-1">
                Merge another tag into <strong>{tag.title}</strong>. Media linked to that tag will be reassigned here, its title and aliases will become aliases of this tag, and the source tag will be deleted.
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onclick={() => {
                mergeDialogOpen = false;
              }}
              disabled={mergeBusy}
              class="shrink-0"
              aria-label="Cancel"
            >
              <X class="h-4 w-4" />
            </Button>
          </div>

          <EntityPicker
            label="Source Tag"
            mode="single"
            values={selectedMergeSource}
            onChange={(items) => (selectedMergeSource = items)}
            onSearch={searchMergeCandidates}
            placeholder="Search for tag to merge..."
            addNewLabel="tag"
            disabled={mergeBusy}
          />

          {#if mergeError}
            <p class="text-body-sm text-error-400">{mergeError}</p>
          {/if}

          <div class="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              size="md"
              onclick={() => {
                mergeDialogOpen = false;
              }}
              disabled={mergeBusy}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="md"
              onclick={handleConfirmMerge}
              disabled={selectedMergeSource.length === 0 || mergeBusy}
            >
              {#if mergeBusy}
                <Loader2 class="h-4 w-4 animate-spin mr-1.5" />
              {/if}
              Merge Tag
            </Button>
          </div>
        </div>
      </Dialog>
    {/if}
  </EntityDetailPageState>
</div>

<style>
  .detail-page { display: grid; gap: 1.25rem; padding: 0; max-width: none; margin: 0; }
  .aliases-section { margin-top: 0.5rem; }

  :global(.meta-item) { white-space: nowrap; font-size: 0.82rem; }
  :global(.meta-item.is-muted) { color: var(--color-text-muted, #8a93a6); opacity: 0.7; font-style: italic; }
  :global(.meta-sep) { display: inline-block; width: 3px; height: 3px; margin: 0 0.5rem; background: var(--color-text-muted, #8a93a6); opacity: 0.5; }
</style>

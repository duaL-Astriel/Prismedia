<script lang="ts">
  import { BookCopy } from "@lucide/svelte";
  import EntityIndexPage from "$lib/components/entities/EntityIndexPage.svelte";
  import { resolveComicBrowseHref } from "$lib/entities/comic-browse-route";
  import { ENTITY_KIND } from "$lib/entities/entity-codes";
</script>

<EntityIndexPage
  kind={ENTITY_KIND.comicSeries}
  title="Comics"
  icon={BookCopy}
  prefsKey="comics"
  resolveHref={resolveComicBrowseHref}
  emptyTitle="No comics"
  emptyMessage="No serialized comics in your library yet. Add comic archives or loose page folders to a book-enabled library root and scan to get started."
  errorMessage="Failed to load comics."
/>

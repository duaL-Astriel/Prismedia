<script lang="ts">
  import { Feather } from "@lucide/svelte";
  import { buildHrefWithFrom } from "$lib/back-navigation";
  import EntityIndexPage from "$lib/components/entities/EntityIndexPage.svelte";
  import { ENTITY_KIND } from "$lib/entities/entity-codes";
  import { AUTHOR_CREDIT_ROLES } from "$lib/entities/entity-grid";
  import { resolveEntityHref } from "$lib/entities/entity-routes";
</script>

<EntityIndexPage
  kind={ENTITY_KIND.person}
  title="Authors"
  icon={Feather}
  prefsKey="browse-authors"
  lockedServerQuery={{ creditRole: AUTHOR_CREDIT_ROLES.join(",") }}
  lockPersonRoleFilters
  resolveHref={(item) => {
    const href = resolveEntityHref(item.kind, item.id);
    return href ? buildHrefWithFrom(href, "/browse/authors") : undefined;
  }}
  emptyTitle="No authors"
  emptyMessage="No credited authors in your library yet. They will appear as you tag books or comics with writer, creator, or narrator credits."
  errorMessage="Failed to load authors."
/>

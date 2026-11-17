<script lang="ts">
  import { Palette } from "@lucide/svelte";
  import { buildHrefWithFrom } from "$lib/back-navigation";
  import EntityIndexPage from "$lib/components/entities/EntityIndexPage.svelte";
  import { ENTITY_KIND } from "$lib/entities/entity-codes";
  import { ARTIST_CREDIT_ROLES } from "$lib/entities/entity-grid";
  import { resolveEntityHref } from "$lib/entities/entity-routes";
</script>

<EntityIndexPage
  kind={ENTITY_KIND.person}
  title="Artists"
  icon={Palette}
  prefsKey="browse-artists"
  lockedServerQuery={{ creditRole: ARTIST_CREDIT_ROLES.join(",") }}
  lockPersonRoleFilters
  resolveHref={(item) => {
    const href = resolveEntityHref(item.kind, item.id);
    return href ? buildHrefWithFrom(href, "/browse/artists") : undefined;
  }}
  emptyTitle="No artists"
  emptyMessage="No credited artists in your library yet. They will appear as you tag media with artist, creator, or composer credits."
  errorMessage="Failed to load artists."
/>

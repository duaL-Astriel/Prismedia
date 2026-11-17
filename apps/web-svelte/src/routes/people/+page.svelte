<script lang="ts">
  import { Users } from "@lucide/svelte";
  import EntityIndexPage from "$lib/components/entities/EntityIndexPage.svelte";
  import { ENTITY_KIND } from "$lib/entities/entity-codes";
  import { EXCLUDED_PEOPLE_CREDIT_ROLES } from "$lib/entities/entity-grid";
</script>

<EntityIndexPage
  kind={ENTITY_KIND.person}
  title="People"
  itemNoun="person"
  icon={Users}
  prefsKey="people"
  defaultServerQuery={{ excludeCreditRole: EXCLUDED_PEOPLE_CREDIT_ROLES.join(",") }}
  emptyTitle="No people"
  emptyMessage="No actors, cast, or crew in your library yet. They will appear as you tag media with credits, or enable Include artists & authors in Filters."
  errorMessage="Failed to load people."
/>

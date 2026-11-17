import { CAPABILITY_KIND, CREDIT_ROLE, type CreditRoleCode } from "$lib/api/generated/codes";
import type { ListEntitiesParams } from "$lib/api/generated/model";

/** Credit roles grouped under the Browse -> Artists view. */
export const ARTIST_CREDIT_ROLES = [
  CREDIT_ROLE.artist,
  CREDIT_ROLE.creator,
  CREDIT_ROLE.composer,
] as const satisfies readonly CreditRoleCode[];

/** Credit roles grouped under the Browse -> Authors view. */
export const AUTHOR_CREDIT_ROLES = [
  CREDIT_ROLE.writer,
  CREDIT_ROLE.creator,
  CREDIT_ROLE.narrator,
] as const satisfies readonly CreditRoleCode[];

/** Credit roles excluded by default from Browse -> People so it focuses on actors, cast, and crew. */
export const EXCLUDED_PEOPLE_CREDIT_ROLES = [
  CREDIT_ROLE.artist,
  CREDIT_ROLE.writer,
  CREDIT_ROLE.creator,
  CREDIT_ROLE.narrator,
  CREDIT_ROLE.composer,
] as const satisfies readonly CreditRoleCode[];

/** One server-resolved person credit-role filter choice shown by the shared entity grid. */
export interface EntityGridPersonRoleFilterDefinition {
  id: string;
  code: CreditRoleCode | "include-all";
  label: string;
}

function personRoleFilterDefinition(
  code: CreditRoleCode | "include-all",
  label: string,
): EntityGridPersonRoleFilterDefinition {
  return { id: `person-role:${code}`, code, label };
}

/** Specific credit-role filters offered on the Browse -> People view. */
export const PERSON_ROLE_FILTER_DEFS = [
  personRoleFilterDefinition(CREDIT_ROLE.actor, "Actors"),
  personRoleFilterDefinition(CREDIT_ROLE.director, "Directors"),
  personRoleFilterDefinition(CREDIT_ROLE.producer, "Producers"),
] as const;

/** Opt-in toggle that includes credited artists and authors alongside actors/cast/crew on People. */
export const PERSON_INCLUDE_ALL_ROLES_FILTER_DEF = personRoleFilterDefinition(
  "include-all",
  "Include artists & authors",
);

const PERSON_ROLE_FILTER_BY_ID = new Map<string, EntityGridPersonRoleFilterDefinition>(
  [...PERSON_ROLE_FILTER_DEFS, PERSON_INCLUDE_ALL_ROLES_FILTER_DEF].map((definition) => [
    definition.id,
    definition,
  ]),
);

/** Returns the canonical credit-role filter definition for a persisted grid filter ID. */
export function personRoleFilterDefinitionFromId(
  id: string,
): EntityGridPersonRoleFilterDefinition | undefined {
  return PERSON_ROLE_FILTER_BY_ID.get(id);
}

/** Resolves a persisted person credit-role filter ID into an option entry for chips and presets. */
export function personRoleFilterOptionFromId(id: string) {
  const definition = PERSON_ROLE_FILTER_BY_ID.get(id);
  if (!definition) return undefined;
  return {
    id,
    count: 0,
    label: definition.label,
    capabilityKind: CAPABILITY_KIND.classification,
    value: definition.code,
  };
}

/** Applies any selected person credit-role filter IDs to the outgoing list query. */
export function applyPersonRoleFiltersToServerQuery(
  filterIds: readonly string[],
  server: Pick<ListEntitiesParams, "creditRole" | "excludeCreditRole">,
): void {
  const roles: string[] = [];
  let includeAll = false;
  for (const id of filterIds) {
    const definition = PERSON_ROLE_FILTER_BY_ID.get(id);
    if (!definition) continue;
    if (definition.code === PERSON_INCLUDE_ALL_ROLES_FILTER_DEF.code) includeAll = true;
    else if (!roles.includes(definition.code)) roles.push(definition.code);
  }
  if (roles.length > 0) {
    server.creditRole = roles.join(",");
    server.excludeCreditRole = "";
  } else if (includeAll) {
    server.excludeCreditRole = "";
  }
}

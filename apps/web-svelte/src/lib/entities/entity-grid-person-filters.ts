import { CREDIT_ROLE, type CreditRoleCode } from "$lib/api/generated/codes";

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

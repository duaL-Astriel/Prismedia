import {
  createPerson,
  createStudio,
  createTag,
  deletePerson,
  deleteStudio,
  deleteTag,
} from "$lib/api/generated/prismedia";
import type { EntityCard, EntityCreateRequest } from "$lib/api/generated/model";
import { requestInit, unwrapGenerated, type RequestOptions } from "$lib/api/generated-response";
import { fetchApi } from "$lib/api/orval-fetch";
import {
  ENTITY_KIND,
  ENTITY_KINDS_SUPPORTING_MANUAL_MANAGEMENT,
  type ManuallyManageableEntityKindCode,
} from "$lib/entities/entity-codes";

export type ManageableTaxonomyKind = ManuallyManageableEntityKindCode;

/** Whether a kind code is a user-manageable taxonomy kind (tag, person, studio). */
export function isManageableTaxonomyKind(kind: string): kind is ManageableTaxonomyKind {
  return (ENTITY_KINDS_SUPPORTING_MANUAL_MANAGEMENT as readonly string[]).includes(kind);
}

type GeneratedResponse = { data: unknown; status: number };
type CreateFn = (request: EntityCreateRequest, options?: RequestInit) => Promise<GeneratedResponse>;
type DeleteFn = (id: string, options?: RequestInit) => Promise<GeneratedResponse>;

const creators: Record<ManageableTaxonomyKind, CreateFn> = {
  [ENTITY_KIND.tag]: createTag,
  [ENTITY_KIND.person]: createPerson,
  [ENTITY_KIND.studio]: createStudio,
};

const deleters: Record<ManageableTaxonomyKind, DeleteFn> = {
  [ENTITY_KIND.tag]: deleteTag,
  [ENTITY_KIND.person]: deletePerson,
  [ENTITY_KIND.studio]: deleteStudio,
};

/** Creates a taxonomy entity of the given kind and returns its new identifier. */
export async function createTaxonomyEntity(
  kind: ManageableTaxonomyKind,
  request: EntityCreateRequest,
  options?: RequestOptions,
): Promise<{ id: string }> {
  const response = await creators[kind](request, requestInit(options));
  return unwrapGenerated<{ id: string }>(response, "Failed to create entity", [201]);
}

/** Deletes a taxonomy entity of the given kind by identifier. */
export async function deleteTaxonomyEntity(
  kind: ManageableTaxonomyKind,
  id: string,
  options?: RequestOptions,
): Promise<void> {
  const response = await deleters[kind](id, requestInit(options));
  unwrapGenerated<void>(response, "Failed to delete entity", [204]);
}

/** Adds an alias to a tag. */
export async function addTagAlias(
  tagId: string,
  alias: string,
  options?: RequestOptions,
): Promise<EntityCard> {
  return fetchApi<EntityCard>(`/api/tags/${encodeURIComponent(tagId)}/aliases`, {
    method: "POST",
    body: JSON.stringify({ alias }),
    ...requestInit(options),
  });
}

/** Removes an alias from a tag. */
export async function removeTagAlias(
  tagId: string,
  alias: string,
  options?: RequestOptions,
): Promise<EntityCard> {
  return fetchApi<EntityCard>(`/api/tags/${encodeURIComponent(tagId)}/aliases/${encodeURIComponent(alias)}`, {
    method: "DELETE",
    ...requestInit(options),
  });
}

/** Merges a source tag into the canonical tag. */
export async function mergeTag(
  canonicalTagId: string,
  sourceTagId: string,
  options?: RequestOptions,
): Promise<EntityCard> {
  return fetchApi<EntityCard>(`/api/tags/${encodeURIComponent(canonicalTagId)}/merge`, {
    method: "POST",
    body: JSON.stringify({ sourceTagId }),
    ...requestInit(options),
  });
}

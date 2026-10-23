import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchApi: vi.fn(),
}));

vi.mock("$lib/api/orval-fetch", () => ({
  fetchApi: mocks.fetchApi,
}));

import { addTagAlias, removeTagAlias, mergeTag } from "$lib/api/taxonomy";

describe("taxonomy tag alias and merge API", () => {
  beforeEach(() => {
    mocks.fetchApi.mockReset();
  });

  it("calls POST /api/tags/{id}/aliases with alias payload", async () => {
    mocks.fetchApi.mockResolvedValue({ id: "tag-1" });
    const result = await addTagAlias("tag-1", "alias-one");

    expect(mocks.fetchApi).toHaveBeenCalledWith(
      "/api/tags/tag-1/aliases",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ alias: "alias-one" }),
      }),
    );
    expect(result).toEqual({ id: "tag-1" });
  });

  it("calls DELETE /api/tags/{id}/aliases/{alias}", async () => {
    mocks.fetchApi.mockResolvedValue({ id: "tag-1" });
    const result = await removeTagAlias("tag-1", "alias-one");

    expect(mocks.fetchApi).toHaveBeenCalledWith(
      "/api/tags/tag-1/aliases/alias-one",
      expect.objectContaining({
        method: "DELETE",
      }),
    );
    expect(result).toEqual({ id: "tag-1" });
  });

  it("calls POST /api/tags/{id}/merge with sourceTagId payload", async () => {
    mocks.fetchApi.mockResolvedValue({ id: "canonical-tag" });
    const result = await mergeTag("canonical-tag", "source-tag");

    expect(mocks.fetchApi).toHaveBeenCalledWith(
      "/api/tags/canonical-tag/merge",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ sourceTagId: "source-tag" }),
      }),
    );
    expect(result).toEqual({ id: "canonical-tag" });
  });
});

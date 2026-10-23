import { afterEach, describe, expect, it, vi } from "vitest";
import { addTagAlias, removeTagAlias, mergeTag } from "$lib/api/taxonomy";

function stubFetch(body: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function lastCall(fetchMock: ReturnType<typeof stubFetch>) {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  return fetchMock.mock.calls[0] as unknown as [string, RequestInit];
}

describe("taxonomy tag alias and merge API", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("calls POST /api/tags/{id}/aliases with alias payload", async () => {
    const fetchMock = stubFetch({ id: "tag-1" });
    const result = await addTagAlias("tag-1", "alias-one");

    const [url, init] = lastCall(fetchMock);
    expect(url).toBe("/api/tags/tag-1/aliases");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ alias: "alias-one" });
    expect(result.id).toBe("tag-1");
  });

  it("calls DELETE /api/tags/{id}/aliases/{alias}", async () => {
    const fetchMock = stubFetch({ id: "tag-1" });
    const result = await removeTagAlias("tag-1", "alias-one");

    const [url, init] = lastCall(fetchMock);
    expect(url).toBe("/api/tags/tag-1/aliases/alias-one");
    expect(init.method).toBe("DELETE");
    expect(result.id).toBe("tag-1");
  });

  it("calls POST /api/tags/{id}/merge with sourceTagId payload", async () => {
    const fetchMock = stubFetch({ id: "canonical-tag" });
    const result = await mergeTag("canonical-tag", "source-tag");

    const [url, init] = lastCall(fetchMock);
    expect(url).toBe("/api/tags/canonical-tag/merge");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ sourceTagId: "source-tag" });
    expect(result.id).toBe("canonical-tag");
  });
});

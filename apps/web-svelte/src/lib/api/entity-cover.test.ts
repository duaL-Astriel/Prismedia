import { afterEach, describe, expect, it, vi } from "vitest";
import { setEntityCover } from "$lib/api/entity-mutations";

describe("setEntityCover", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("posts to /entities/{targetEntityId}/cover with itemEntityId", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      id: "target-1",
      title: "Target Gallery",
      kind: "gallery",
      capabilities: [],
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await setEntityCover("target-1", "item-2");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/entities/target-1/cover");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("content-type")).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({ itemEntityId: "item-2" });
    expect(result.id).toBe("target-1");
  });
});

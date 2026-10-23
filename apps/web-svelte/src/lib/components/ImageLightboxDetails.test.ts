import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import ImageLightboxDetailsHarness from "./ImageLightboxDetails.test-harness.svelte";
import type { UniversalLightboxEntity } from "./universal-lightbox-media";
import type { EntityCardFull } from "$lib/api/entities";

const mocks = vi.hoisted(() => ({
  fetchEntity: vi.fn(),
  setEntityCover: vi.fn(),
}));

vi.mock("$lib/api/entities", () => ({
  fetchEntity: mocks.fetchEntity,
}));

vi.mock("$lib/api/entity-mutations", () => ({
  setEntityCover: mocks.setEntityCover,
  updateEntityFlags: vi.fn(),
  updateEntityMetadata: vi.fn(),
  updateEntityRating: vi.fn(),
}));

const testImage: UniversalLightboxEntity = {
  id: "image-1",
  kind: "image",
  title: "Sunset over Mountains",
  capabilities: [],
  coverUrl: "/assets/images/image-1/cover.jpg",
};

const fullImageCard: EntityCardFull = {
  id: "image-1",
  kind: "image",
  title: "Sunset over Mountains",
  parentEntityId: "gallery-1",
  sortOrder: null,
  capabilities: [],
  childrenByKind: [],
  relationships: [],
};

describe("ImageLightboxDetails", () => {
  it("shows 'Set as gallery cover' and executes setEntityCover on click", async () => {
    mocks.fetchEntity.mockResolvedValue(fullImageCard);
    mocks.setEntityCover.mockResolvedValue({ id: "gallery-1" });
    const onCoverChange = vi.fn();

    render(ImageLightboxDetailsHarness, {
      props: {
        entity: testImage,
        galleryId: "gallery-1",
        onCoverChange,
      },
    });

    const setCoverButton = await screen.findByRole("button", { name: /set as gallery cover/i });
    expect(setCoverButton).toBeInTheDocument();

    await fireEvent.click(setCoverButton);

    await waitFor(() => {
      expect(mocks.setEntityCover).toHaveBeenCalledWith("gallery-1", "image-1");
      expect(onCoverChange).toHaveBeenCalled();
    });

    expect(await screen.findByRole("button", { name: /gallery cover set/i })).toBeInTheDocument();
  });
});

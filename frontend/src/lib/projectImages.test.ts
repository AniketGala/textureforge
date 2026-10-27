import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { indexedDB as fakeIndexedDB } from "fake-indexeddb";
import { deleteProjectImage, getProjectImage, imageStorageError, saveProjectImage } from "./projectImages";

let counter = 0;

beforeEach(() => {
  vi.stubGlobal("indexedDB", fakeIndexedDB);
  counter += 1;
});

afterEach(() => vi.unstubAllGlobals());

describe("local project image storage", () => {
  it("stores and restores original PNG, JPEG, and WebP blobs by project ID", async () => {
    const cases = [
      ["image/png", "source.png"],
      ["image/jpeg", "source.jpg"],
      ["image/webp", "source.webp"]
    ] as const;

    for (const [mimeType, fileName] of cases) {
      const id = `${counter}-${mimeType}`;
      const original = new Blob([`original-${fileName}`], { type: mimeType });
      await saveProjectImage(id, original, fileName);
      const restored = await getProjectImage(id);
      expect(restored?.fileName).toBe(fileName);
      expect(restored?.mimeType).toBe(mimeType);
      expect(await restored?.blob.text()).toBe(`original-${fileName}`);
    }
  });

  it("keeps large image data as a Blob without converting it to a string", async () => {
    const id = `${counter}-large`;
    const largeSource = new Blob([new Uint8Array(8 * 1024 * 1024)], { type: "image/png" });
    await saveProjectImage(id, largeSource, "large.png");
    const restored = await getProjectImage(id);
    expect(restored?.blob.size).toBe(8 * 1024 * 1024);
    expect(restored?.blob.type).toBe("image/png");
  });

  it("keeps different projects separate and replaces only the selected project's source", async () => {
    const firstId = `${counter}-first`;
    const secondId = `${counter}-second`;
    await saveProjectImage(firstId, new Blob(["first image"], { type: "image/png" }), "first.png");
    await saveProjectImage(secondId, new Blob(["second image"], { type: "image/webp" }), "second.webp");
    await saveProjectImage(firstId, new Blob(["updated source"], { type: "image/jpeg" }), "updated.jpg");

    expect(await (await getProjectImage(firstId))?.blob.text()).toBe("updated source");
    expect(await (await getProjectImage(secondId))?.blob.text()).toBe("second image");
  });

  it("returns missing for an image not stored in this browser", async () => {
    expect(await getProjectImage(`${counter}-missing`)).toBeUndefined();
  });

  it("removes the source blob with the project and explains quota failures", async () => {
    const id = `${counter}-delete`;
    await saveProjectImage(id, new Blob(["source"], { type: "image/png" }), "source.png");
    await deleteProjectImage(id);
    expect(await getProjectImage(id)).toBeUndefined();

    const error = imageStorageError(new DOMException("Storage full", "QuotaExceededError"));
    expect(error.message).toContain("out of local storage space");
  });

  it("surfaces an IndexedDB quota error as a recoverable save failure", async () => {
    const quotaFactory = {
      open: () => {
        const request: { error: DOMException; onerror?: () => void } = {
          error: new DOMException("Storage full", "QuotaExceededError")
        };
        queueMicrotask(() => request.onerror?.());
        return request;
      }
    } as unknown as IDBFactory;
    vi.stubGlobal("indexedDB", quotaFactory);
    await expect(saveProjectImage(`${counter}-quota`, new Blob(["image"]), "image.png"))
      .rejects.toThrow("out of local storage space");
  });

  it("rejects an empty source instead of claiming it was stored", async () => {
    await expect(saveProjectImage(`${counter}-empty`, new Blob(), "empty.png")).rejects.toThrow("source image is empty");
  });
});

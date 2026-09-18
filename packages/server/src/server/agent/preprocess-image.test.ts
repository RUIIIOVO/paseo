import { describe, expect, test } from "vitest";
import { preprocessImage, preprocessImages, MAX_IMAGE_DIMENSION } from "./preprocess-image.js";

// 1x1 red PNG (well under 2000x2000)
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

describe("preprocessImage", () => {
  test("returns small image unchanged", async () => {
    const image = { data: TINY_PNG_BASE64, mimeType: "image/png" };
    const result = await preprocessImage(image);
    expect(result.data).toBe(TINY_PNG_BASE64);
    expect(result.mimeType).toBe("image/png");
  });

  test("resizes image exceeding 2000px", async () => {
    let sharpModule: typeof import("sharp");
    try {
      sharpModule = (await import("sharp")).default;
    } catch {
      return;
    }

    const oversized = await sharpModule({
      create: {
        width: 3000,
        height: 2500,
        channels: 3,
        background: { r: 128, g: 128, b: 128 },
      },
    })
      .png()
      .toBuffer();

    const image = {
      data: oversized.toString("base64"),
      mimeType: "image/png",
    };

    const result = await preprocessImage(image);

    expect(result.mimeType).toBe("image/jpeg");
    expect(result.data).not.toBe(image.data);

    const resultBuffer = Buffer.from(result.data, "base64");
    const metadata = await sharpModule(resultBuffer).metadata();
    expect(metadata.width).toBeLessThanOrEqual(MAX_IMAGE_DIMENSION);
    expect(metadata.height).toBeLessThanOrEqual(MAX_IMAGE_DIMENSION);
  });

  test("preserves aspect ratio when resizing", async () => {
    let sharpModule: typeof import("sharp");
    try {
      sharpModule = (await import("sharp")).default;
    } catch {
      return;
    }

    const wide = await sharpModule({
      create: {
        width: 4000,
        height: 1000,
        channels: 3,
        background: { r: 64, g: 64, b: 64 },
      },
    })
      .png()
      .toBuffer();

    const image = { data: wide.toString("base64"), mimeType: "image/png" };
    const result = await preprocessImage(image);

    const resultBuffer = Buffer.from(result.data, "base64");
    const metadata = await sharpModule(resultBuffer).metadata();

    expect(metadata.width).toBe(MAX_IMAGE_DIMENSION);
    expect(metadata.height).toBeLessThanOrEqual(MAX_IMAGE_DIMENSION);
    expect(metadata.height).toBeGreaterThan(0);
  });

  test("handles corrupt base64 gracefully", async () => {
    const image = { data: "not-valid-base64!!!", mimeType: "image/png" };
    const result = await preprocessImage(image);
    expect(result).toBe(image);
  });
});

describe("preprocessImages", () => {
  test("returns undefined for undefined input", async () => {
    const result = await preprocessImages(undefined);
    expect(result).toBeUndefined();
  });

  test("returns empty array for empty input", async () => {
    const result = await preprocessImages([]);
    expect(result).toEqual([]);
  });

  test("processes multiple images", async () => {
    const images = [
      { data: TINY_PNG_BASE64, mimeType: "image/png" },
      { data: TINY_PNG_BASE64, mimeType: "image/jpeg" },
    ];
    const result = await preprocessImages(images);
    expect(result).toHaveLength(2);
    expect(result![0].data).toBe(TINY_PNG_BASE64);
    expect(result![1].data).toBe(TINY_PNG_BASE64);
  });
});

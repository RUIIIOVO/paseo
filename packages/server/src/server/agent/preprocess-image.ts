/**
 * Preprocess images before sending them to agent providers.
 *
 * Anthropic, OpenAI, and other agent providers enforce limits on image dimensions
 * (e.g. Anthropic allows max 1568px for many-image requests or 2000px overall).
 * Sending an image with dimensions > 2000px permanently breaks the conversation with:
 * "At least one of the image dimensions exceed max allowed size: 2000 pixels"
 *
 * By resizing oversized images here in the daemon (where sharp is available via
 * the hoisted agent SDK dependency), we avoid poisoning the session history.
 */
import type { Logger } from "pino";

export const MAX_IMAGE_DIMENSION = 2000;
export const JPEG_QUALITY = 85;

export interface ImageAttachment {
  data: string;
  mimeType: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sharpModule: any | null | undefined;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getSharp(): Promise<any | null> {
  if (sharpModule !== undefined) {
    return sharpModule;
  }
  try {
    const moduleName = "sharp";
    const imported = await import(moduleName);
    sharpModule = imported.default || imported;
  } catch {
    sharpModule = null;
  }
  return sharpModule;
}

/**
 * Resize an image if either dimension exceeds MAX_IMAGE_DIMENSION (2000px).
 * Returns the original attachment unchanged if no resize is needed or if
 * sharp is unavailable.
 */
export async function preprocessImage(
  image: ImageAttachment,
  logger?: Logger,
): Promise<ImageAttachment> {
  const sharp = await getSharp();
  if (!sharp) {
    logger?.debug("sharp unavailable, skipping image preprocessing");
    return image;
  }

  try {
    const inputBuffer = Buffer.from(image.data, "base64");
    const metadata = await sharp(inputBuffer).metadata();
    const { width, height } = metadata;

    if (!width || !height || (width <= MAX_IMAGE_DIMENSION && height <= MAX_IMAGE_DIMENSION)) {
      return image;
    }

    logger?.info(
      { originalWidth: width, originalHeight: height, maxDimension: MAX_IMAGE_DIMENSION },
      "Resizing oversized image before sending to agent",
    );

    const resized = await sharp(inputBuffer)
      .resize(MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer();

    return {
      data: resized.toString("base64"),
      mimeType: "image/jpeg",
    };
  } catch (error) {
    logger?.warn({ error }, "Failed to preprocess image, sending original");
    return image;
  }
}

/**
 * Preprocess an array of image attachments, resizing any that exceed the
 * 2000x2000 pixel limit.
 */
export async function preprocessImages(
  images: Array<ImageAttachment> | undefined,
  logger?: Logger,
): Promise<Array<ImageAttachment> | undefined> {
  if (!images || images.length === 0) {
    return images;
  }
  return await Promise.all(images.map((img) => preprocessImage(img, logger)));
}

import { createHash } from "node:crypto";
import sharp from "sharp";

export async function createSafeImagingThumbnail(bytes: Uint8Array) {
  const rendered = await sharp(Buffer.from(bytes), { failOn: "error", limitInputPixels: 100_000_000 })
    .rotate()
    .resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 80, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  return { data: rendered.data, width: rendered.info.width, height: rendered.info.height, sha256: createHash("sha256").update(rendered.data).digest("hex") };
}

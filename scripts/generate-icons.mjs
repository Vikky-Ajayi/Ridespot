import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const source = path.join(rootDir, "public", "assets", "logo-primary.png");
const outputDir = path.join(rootDir, "public", "icons");

const targets = [
  { file: "icon-64.png", size: 64 },
  { file: "icon-192.png", size: 192 },
  { file: "icon-512.png", size: 512 },
  { file: "apple-touch-icon.png", size: 180 }
];

const sourceMetadata = await sharp(source).metadata();
const markCropSize = Math.min(sourceMetadata.width ?? 32, sourceMetadata.height ?? 32);
const markSource = await sharp(source)
  .extract({
    left: 0,
    top: 0,
    width: markCropSize,
    height: markCropSize
  })
  .trim()
  .png()
  .toBuffer();

await Promise.all(
  targets.map(async ({ file, size }) => {
    const canvas = {
      r: 9,
      g: 9,
      b: 9,
      alpha: 1
    };

    const overlay = await sharp(markSource)
      .resize(Math.round(size * 0.58), Math.round(size * 0.58), {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toBuffer();

    await sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: canvas
      }
    })
      .composite([{ input: overlay, gravity: "center" }])
      .png()
      .toFile(path.join(outputDir, file));
  })
);

console.log("RideSpot icons generated.");

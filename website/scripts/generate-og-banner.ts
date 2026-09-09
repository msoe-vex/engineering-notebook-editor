import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

async function generate() {
  const publicDir = path.resolve(process.cwd(), "public");
  const svgPath = path.join(publicDir, "og-banner.svg");
  const pngPath = path.join(publicDir, "og-banner.png");

  if (!fs.existsSync(svgPath)) {
    console.error(`Error: ${svgPath} not found.`);
    process.exit(1);
  }

  console.log("Rendering og-banner.svg to og-banner.png (1200x630)...");
  await sharp(svgPath)
    .resize(1200, 630)
    .png({ quality: 95 })
    .toFile(pngPath);

  console.log(`Successfully generated ${pngPath}`);
}

generate().catch((err) => {
  console.error("Failed to generate banner PNG:", err);
  process.exit(1);
});


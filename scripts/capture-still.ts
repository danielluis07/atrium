/**
 * Recaptures the non-WebGL Scene fallback from the live overview camera.
 *
 * Run the development server, then:
 *   bun run scene:capture-still [http://localhost:3000]
 */
import { unlink } from "node:fs/promises";
import { join } from "node:path";

import sharp from "sharp";

import { launch, openScene } from "@/scripts/perf/scene-page";

const base = process.argv[2] ?? "http://localhost:3000";
const output = join(process.cwd(), "public", "scene", "still.avif");
const capture = join(process.cwd(), "public", "scene", "still-capture.png");

const browser = await launch();

try {
  const page = await openScene(browser, base, { query: "?scene=target" });

  // The committed image contains only Scene pixels. The real header remains
  // above it in the DOM, and labels are absent while the pointer is off a House.
  await page.addStyleTag({
    content: `
      html { scrollbar-width: none; }
      html::-webkit-scrollbar { display: none; }
      [data-slot="site-header"], [data-slot="depth-readout"], nextjs-portal {
        visibility: hidden !important;
      }
    `,
  });
  await page.mouse.move(100, 850);
  await page.waitForTimeout(1_000);
  const frame = await page.locator("canvas").boundingBox();
  if (frame?.width !== 1600 || frame.height !== 900) {
    throw new Error(`expected a 1600x900 Scene canvas, got ${frame?.width ?? 0}x${frame?.height ?? 0}`);
  }
  await page.locator("canvas").screenshot({ path: capture });

  await sharp(capture).avif({ quality: 82, effort: 6, chromaSubsampling: "4:4:4" }).toFile(output);
  console.log(`wrote ${output}`);
} finally {
  await browser.close();
  await unlink(capture).catch(() => undefined);
}

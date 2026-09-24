import type { Page } from "@playwright/test";

/**
 * The home page, forced onto the still: the e2e suite stays off the live
 * Scene so it runs the same with or without a GPU. `scene.e2e.ts` is the one
 * place that mounts the Canvas.
 */
export const HOME = "/?scene=still";

/**
 * The home page on the still without a query string. The header's Depth
 * anchors are `/#…`, and following one from a URL with a query is a
 * navigation that doesn't scroll to the Depth, so tests that follow them ask
 * for the still the way a visitor does: with reduced motion.
 */
export async function openHomeOnStill(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
}

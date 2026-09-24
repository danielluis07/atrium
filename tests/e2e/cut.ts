import type { Page } from "@playwright/test";

/** Where the Section Cut's parts are on screen, in viewport pixels. */
export const cutLayout = (page: Page) =>
  page.evaluate(() => {
    const rect = (slot: string) => document.querySelector(`[data-slot="${slot}"]`)!.getBoundingClientRect().toJSON();
    return {
      paper: rect("paper"),
      line: rect("section-line"),
      hatch: rect("section-hatch"),
      stage: rect("scene-stage"),
      baseline: document.querySelector("header")!.getBoundingClientRect().bottom,
      width: document.documentElement.clientWidth,
    };
  });

/** Scrolls so the section line sits `offset` pixels below (+) or above (−) the header's baseline. */
export async function lineAtBaseline(page: Page, offset: number) {
  const { line, baseline } = await cutLayout(page);
  await page.evaluate((y) => window.scrollBy(0, y), line.top - baseline - offset);
}

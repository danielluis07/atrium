import { expect, test, type Page } from "@playwright/test";

import { SNOW_GAP, STILL } from "@/lib/scene/cut";

import { cutLayout as layout, lineAtBaseline } from "./cut";
import { HOME } from "./paths";

const header = (page: Page) => page.getByRole("banner");
const sectionLine = (page: Page) => page.locator('[data-slot="section-line"]');

/** The paper and ink colours, as the page computes them. */
const colours = (page: Page) =>
  page.evaluate(() => {
    const body = getComputedStyle(document.body);
    return { paper: body.backgroundColor, ink: body.color };
  });

test("the section line and its hatch run across the paper's top edge, at the stage's foot at rest", async ({
  page,
}) => {
  await page.goto(HOME);
  const { paper, line, hatch, stage, width } = await layout(page);
  expect(line.top).toBe(paper.top);
  expect(Math.abs(line.top - stage.bottom)).toBeLessThan(1);
  expect(line.width).toBe(width);

  // an ink hairline, with the hatch band right under it
  const { ink } = await colours(page);
  await expect(sectionLine(page)).toHaveCSS("border-top-width", "1px");
  await expect(sectionLine(page)).toHaveCSS("border-top-color", ink);
  expect(Math.abs(hatch.top - (line.top + 1))).toBeLessThan(1);
  expect(hatch.width).toBe(width);
  expect(hatch.height).toBeGreaterThanOrEqual(8);
  expect(hatch.height).toBeLessThanOrEqual(16);
  await expect(page.locator("#snow-strata line")).toHaveCount(4);
});

test("over the still, the stage holds until the line meets the still's snow line, then rides up with it", async ({
  page,
}) => {
  await page.goto(HOME);
  /** The stage's top, and the snow the line leaves showing under the still's snow line. */
  const measure = async () => {
    const { stage, line } = await layout(page);
    // the still covers the stage from its foot
    const rendered = Math.max(stage.height, stage.width / STILL.aspect);
    return { stageTop: stage.top, snow: line.top - (stage.bottom - (1 - STILL.snowLine) * rendered) };
  };

  const rest = await measure();
  expect(rest.stageTop).toBe(0);
  expect(rest.snow).toBeGreaterThan(SNOW_GAP);

  // the line rises over the foot of the still while the stage holds
  await page.evaluate((y) => window.scrollBy(0, y), Math.floor((rest.snow - SNOW_GAP) / 2));
  const rising = await measure();
  expect(rising.stageTop).toBe(0);
  expect(rising.snow).toBeGreaterThan(SNOW_GAP);

  // past the snow line, the still goes up with the line, which stays just under it
  for (const further of [rest.snow, 120]) {
    await page.evaluate((y) => window.scrollBy(0, y), further);
    const riding = await measure();
    expect(riding.stageTop).toBeLessThan(0);
    expect(Math.abs(riding.snow - SNOW_GAP)).toBeLessThan(1.5);
  }
});

test("the header is paper-coloured over the Scene and cuts to ink when the line crosses its baseline", async ({
  page,
}) => {
  await page.goto(HOME);
  const { paper, ink } = await colours(page);
  const expectOverScene = async () => {
    await expect(header(page)).toHaveAttribute("data-surface", "scene");
    await expect(header(page)).toHaveCSS("color", paper);
    await expect(header(page)).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  };
  const expectOnPaper = async () => {
    await expect(header(page)).toHaveAttribute("data-surface", "paper");
    await expect(header(page)).toHaveCSS("color", ink);
    await expect(header(page)).toHaveCSS("background-color", paper);
  };

  await expectOverScene();
  await lineAtBaseline(page, 4);
  await expectOverScene();
  await lineAtBaseline(page, -4);
  await expectOnPaper();
  // and back up
  await lineAtBaseline(page, 4);
  await expectOverScene();
});

test("the header is ink on a page without a Scene", async ({ page }) => {
  await page.goto("/projects/lyngen");
  const { paper, ink } = await colours(page);
  await expect(header(page)).not.toHaveAttribute("data-surface", "scene");
  await expect(header(page)).toHaveCSS("color", ink);
  await expect(header(page)).toHaveCSS("background-color", paper);
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("the header stays ink, since nothing can tell it where the line is", async ({ page }) => {
    await page.goto(HOME);
    const { paper, ink } = await colours(page);
    await expect(header(page)).toHaveCSS("color", ink);
    await expect(header(page)).toHaveCSS("background-color", paper);
    await expect(sectionLine(page)).toBeAttached();
  });
});

import { expect, test, type Page } from "@playwright/test";

import { HOME } from "./paths";

// headless Chromium renders WebGL on SwiftShader, which it only offers when asked
test.use({ launchOptions: { args: ["--enable-unsafe-swiftshader"] } });

const stage = (page: Page) => page.locator('[data-slot="scene-stage"]');
const liveScene = (page: Page) => page.locator('[data-slot="live-scene"]');

test("with ?scene=still the stage shows only the still", async ({ page }) => {
  await page.goto(HOME);
  await expect(liveScene(page)).toHaveAttribute("data-scene-path", "still");
  await expect(stage(page).getByRole("img", { name: /Four concrete houses/ })).toBeVisible();
  await expect(stage(page).locator("canvas")).toHaveCount(0);
});

test.describe("the Lean Scene", () => {
  test.skip(({ isMobile }) => isMobile, "desktop only");
  // a software renderer takes a while over the first frame; fewer pixels help it
  test.setTimeout(120_000);
  test.use({ viewport: { width: 640, height: 400 } });

  test("mounts its Canvas without errors or third-party requests, and renders only while seen", async ({
    page,
    baseURL,
  }) => {
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push(e.message));
    const origins = new Set<string>();
    page.on("request", (r) => {
      if (/^https?:/.test(r.url())) origins.add(new URL(r.url()).origin);
    });

    await page.goto("/?scene=lean");
    const scene = liveScene(page);
    await expect(scene).toHaveAttribute("data-scene-path", "lean");
    await expect(stage(page).locator("canvas")).toHaveCount(1, { timeout: 30_000 });
    await expect(scene).toHaveAttribute("data-scene-ready", "true", { timeout: 100_000 });
    await expect(scene).toHaveCSS("opacity", "1");
    await expect(scene).toHaveAttribute("data-rendering", "true");

    // below grade, the stage is off screen
    await page.locator("#contact").scrollIntoViewIfNeeded();
    await expect(scene).toHaveAttribute("data-rendering", "false");
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(scene).toHaveAttribute("data-rendering", "true");

    // the tab is hidden
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(scene).toHaveAttribute("data-rendering", "false");

    expect(errors).toEqual([]);
    expect([...origins]).toEqual([new URL(baseURL!).origin]);
  });
});

import { expect, test, type Page } from "@playwright/test";

import { HOME, openHomeOnStill } from "./paths";

// headless Chromium renders WebGL on SwiftShader, which it only offers when asked
test.use({ launchOptions: { args: ["--enable-unsafe-swiftshader"] } });
// one at a time, like `scene.e2e.ts`: a live Scene on the CPU starves the page beside it
test.describe.configure({ mode: "default" });

const threshold = (page: Page) => page.locator('[data-slot="threshold"]');
const header = (page: Page) => page.locator('[data-slot="site-header"]');
const raised = (page: Page) => page.evaluate(() => document.documentElement.getAttribute("data-threshold"));

test.describe("on the still path", () => {
  test("?scene=still never shows the Threshold", async ({ page }) => {
    await page.goto(HOME);
    await expect(page.locator('[data-slot="live-scene"]')).toHaveAttribute("data-scene-path", "still");
    await expect(threshold(page)).toBeHidden();
    expect(await raised(page)).toBeNull();
    await expect(header(page)).toBeVisible();
  });

  test("reduced motion never shows the Threshold", async ({ page }) => {
    await openHomeOnStill(page);
    await expect(threshold(page)).toBeHidden();
    expect(await raised(page)).toBeNull();
  });
});

test.describe("on the live path", () => {
  test.setTimeout(120_000);

  test("shows the Mark, the line and the load over the sky, with the header hidden", async ({ page, isMobile }) => {
    await page.goto(isMobile ? "/?scene=mobile" : "/?scene=lean");
    await expect(threshold(page)).toBeVisible();
    await expect(threshold(page)).toContainText("atrium");
    await expect(threshold(page)).toContainText("A Atrium é um estúdio de arquitetura em Tromsø, na Noruega");
    // the stage's own ground is the zenith sky
    const sky = await page
      .locator('[data-slot="scene-stage"]')
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    await expect(threshold(page)).toHaveCSS("background-color", sky);
    const bar = threshold(page).getByRole("progressbar", { name: "Carregando a Cena" });
    await expect(bar).toHaveText(/Carregando a cena · \d+%/i);
    await expect(header(page)).toBeHidden();
  });

  test("fills with the downloads and clears on the Scene's first frame", async ({ page, isMobile }) => {
    test.skip(isMobile, "the mobile Scene's first frame is too slow on SwiftShader");
    await page.setViewportSize({ width: 640, height: 400 });
    await page.goto("/?scene=lean");
    const bar = threshold(page).getByRole("progressbar");
    await expect(bar).not.toHaveAttribute("aria-valuenow", "0", { timeout: 30_000 });
    await expect(page.locator('[data-slot="live-scene"]')).toHaveAttribute("data-scene-ready", "true", {
      timeout: 100_000,
    });
    await expect(threshold(page)).toBeHidden();
    expect(await raised(page)).toBeNull();
    await expect(header(page)).toBeVisible();
  });

  test("scrolling clears it at once and is never held, and it shows once per visit", async ({ page, isMobile }) => {
    await page.goto(isMobile ? "/?scene=mobile" : "/?scene=lean");
    await expect(threshold(page)).toBeVisible();
    await page.evaluate(() => window.scrollBy(0, 200));
    await expect(threshold(page)).toBeHidden();
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await expect(header(page)).toBeVisible();

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.reload();
    await expect(page.locator('[data-slot="live-scene"]')).toHaveAttribute("data-scene-path", /lean|mobile/);
    await expect(threshold(page)).toBeHidden();
    expect(await raised(page)).toBeNull();
  });

  test("the wheel scrolls the page through it", async ({ page, isMobile }) => {
    test.skip(isMobile, "no wheel on a phone");
    await page.goto("/?scene=lean");
    await expect(threshold(page)).toBeVisible();
    await page.mouse.move(200, 200);
    await page.mouse.wheel(0, 300);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await expect(threshold(page)).toBeHidden();
  });

  test("works with sessionStorage unavailable", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "sessionStorage", {
        get() {
          throw new DOMException("The operation is insecure.", "SecurityError");
        },
      });
    });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/?scene=lean");
    await expect(threshold(page)).toBeVisible();
    expect(errors).toEqual([]);
  });
});

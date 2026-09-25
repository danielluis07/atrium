import { expect, test, type Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";

import { getPlacement, getProject, getSceneLayout } from "@/content";
import { fromHouseFrame } from "@/lib/house/cameras";
import { overviewFov } from "@/lib/scene/camera";
import { toThree } from "@/lib/scene/frame";

import { lineAtBaseline } from "./cut";
import { expectReachableByTab } from "./keyboard";
import { HOME } from "./paths";

// headless Chromium renders WebGL on SwiftShader, which it only offers when asked
test.use({ launchOptions: { args: ["--enable-unsafe-swiftshader"] } });
// one at a time: a live Scene rendering on the CPU starves the page beside it, whose GPU
// classification then runs past its timeout and falls back to Lean
test.describe.configure({ mode: "default" });

const stage = (page: Page) => page.locator('[data-slot="scene-stage"]');
const liveScene = (page: Page) => page.locator('[data-slot="live-scene"]');

test("with ?scene=still the stage shows only the still", async ({ page }) => {
  await page.goto(HOME);
  await expect(liveScene(page)).toHaveAttribute("data-scene-path", "still");
  await expect(stage(page).getByRole("img", { name: /Four concrete houses/ })).toBeVisible();
  await expect(stage(page).locator("canvas")).toHaveCount(0);
});

/**
 * Makes SwiftShader report a discrete NVIDIA part, so the page would take the
 * Target Scene unless something else rules it out.
 */
async function pretendDiscreteGpu(page: Page) {
  await page.addInitScript(() => {
    const RENDERER = 0x1f01;
    const UNMASKED_RENDERER = 0x9246;
    const name = "ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Direct3D11 vs_5_0 ps_5_0, D3D11)";
    for (const proto of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
      const getParameter = proto.getParameter;
      proto.getParameter = function (this: WebGLRenderingContext, p: number) {
        return p === RENDERER || p === UNMASKED_RENDERER ? name : getParameter.call(this, p);
      };
    }
  });
}

async function expectOnlyTheStill(page: Page) {
  await expect(liveScene(page)).toHaveAttribute("data-scene-path", "still");
  await expect(stage(page).getByRole("img", { name: /Four concrete houses/ })).toBeVisible();
  await expect(stage(page).locator("canvas")).toHaveCount(0);
}

test.describe("on a discrete GPU", () => {
  test.skip(({ isMobile }) => isMobile, "desktop only");
  test.use({ viewport: { width: 640, height: 400 } });
  test.beforeEach(({ page }) => pretendDiscreteGpu(page));

  test("the Target Scene is classified from self-hosted benchmarks, with no third-party request", async ({
    page,
    baseURL,
  }) => {
    const requests: string[] = [];
    page.on("request", (r) => requests.push(r.url()));

    await page.goto("/");
    await expect(liveScene(page)).toHaveAttribute("data-scene-path", "target");
    await expect(liveScene(page)).toHaveAttribute("data-scene-rung", "1");
    await expect(stage(page).locator("canvas")).toHaveCount(1, { timeout: 30_000 });

    const origins = new Set(requests.filter((u) => /^https?:/.test(u)).map((u) => new URL(u).origin));
    expect([...origins]).toEqual([new URL(baseURL!).origin]);
    expect(requests.some((u) => new URL(u).pathname.startsWith("/detect-gpu/"))).toBe(true);
  });

  test("reduced motion still gets the still", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expectOnlyTheStill(page);
  });

  test("no WebGL gets the still", async ({ page }) => {
    await page.addInitScript(() => {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        if (/webgl/.test(type)) return null;
        return getContext.call(this, type as "2d", ...(rest as []));
      } as typeof getContext;
    });
    await page.goto("/");
    await expectOnlyTheStill(page);
  });
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

    // the paper rising over the stage: the Scene renders until it covers it, and below grade
    await lineAtBaseline(page, 20);
    await expect(scene).toHaveAttribute("data-rendering", "true");
    await lineAtBaseline(page, 0);
    await expect(scene).toHaveAttribute("data-rendering", "false");
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

  test("the keyboard and assistive tech reach, move between and select the four Projects", async ({ page }) => {
    // every step waits on frames from the software renderer
    test.setTimeout(240_000);
    const slow = expect.configure({ timeout: 30_000 });
    await page.goto("/?scene=lean");
    await expect(liveScene(page)).toHaveAttribute("data-scene-ready", "true", { timeout: 100_000 });

    const scene = page.getByRole("listbox", { name: "Projects in the Scene" });
    const options = scene.getByRole("option");
    await slow(options).toHaveText(["Lyngen House", "Senja House", "Kvaløya House", "Reine House"]);
    await slow(scene.getByRole("option", { selected: true })).toHaveCount(0);
    const status = stage(page).getByRole("status");
    await slow(status).toHaveText("");

    // the option the listbox points assistive tech at
    const activeOption = () =>
      scene.evaluate((el) => document.getElementById(el.getAttribute("aria-activedescendant")!)?.textContent);
    await expectReachableByTab(page, scene);
    await slow.poll(activeOption).toBe("Lyngen House");
    await page.keyboard.press("ArrowDown");
    await slow.poll(activeOption).toBe("Senja House");
    await page.keyboard.press("End");
    await page.keyboard.press("ArrowDown");
    await slow.poll(activeOption).toBe("Lyngen House");
    await page.keyboard.press("ArrowUp");
    await slow.poll(activeOption).toBe("Reine House");

    // Enter opens the Panel, and focus moves into it
    const panel = page.locator('[data-slot="project-panel"]');
    await page.keyboard.press("Enter");
    await slow(panel).toBeVisible();
    await slow(panel.getByRole("heading", { name: "Reine House" })).toBeVisible();
    await slow.poll(() => panel.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    await slow(scene.getByRole("option", { name: "Reine House", selected: true })).toHaveCount(1);
    // the listbox holds only its options
    await slow(scene.getByRole("dialog")).toHaveCount(0);
    await slow(status).toHaveText("Reine House is open.");

    // Esc closes it and hands focus back to the Scene, on the same House
    await page.keyboard.press("Escape");
    await slow(panel).toBeHidden();
    await slow(scene).toBeFocused();
    await slow(scene.getByRole("option", { selected: true })).toHaveCount(0);
    await slow(status).toHaveText("");
    await slow.poll(activeOption).toBe("Reine House");

    // Space selects too
    await page.keyboard.press("Home");
    await page.keyboard.press(" ");
    await slow(panel.getByRole("heading", { name: "Lyngen House" })).toBeVisible();
    await slow(status).toHaveText("Lyngen House is open.");
  });

  test("the wheel over the Scene scrolls the page and never zooms", async ({ page }) => {
    await page.goto("/?scene=lean");
    // the Canvas takes the pointer from when it mounts, before its first frame fades in
    await expect(stage(page).locator("canvas")).toHaveCount(1, { timeout: 30_000 });

    // whether anything on the page took the wheel for itself
    await page.evaluate(() => {
      const w = window as unknown as { wheels: boolean[] };
      w.wheels = [];
      window.addEventListener("wheel", (e) => w.wheels.push(e.defaultPrevented));
    });
    const box = (await stage(page).boundingBox())!;
    const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
    expect(await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.tagName, [x, y])).toBe("CANVAS");

    await page.mouse.move(x, y);
    await page.mouse.wheel(0, 300);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    const wheels = await page.evaluate(() => (window as unknown as { wheels: boolean[] }).wheels);
    expect(wheels.length).toBeGreaterThan(0);
    expect(wheels).not.toContain(true);
  });
});

/**
 * Where a House stands on the stage from the overview at rest, CSS pixels:
 * the point its hero camera looks at, projected. The mobile Scene's calm
 * drift moves it by a few pixels at most.
 */
function houseOnStage(slug: string, stage: { width: number; height: number }): [number, number] {
  const { overview } = getSceneLayout();
  const camera = new PerspectiveCamera(overviewFov(stage.width / stage.height), stage.width / stage.height, 0.5, 4000);
  camera.position.set(...toThree(overview.position));
  camera.lookAt(...toThree(overview.lookAt));
  camera.updateMatrixWorld();
  const house = fromHouseFrame(getProject(slug)!.camera.lookAt, getPlacement(slug));
  const p = new Vector3(...toThree(house)).project(camera);
  return [((p.x + 1) / 2) * stage.width, ((1 - p.y) / 2) * stage.height];
}

/**
 * A finger dragged `distance` pixels up from `from`, as raw touches: Chromium
 * turns them into a scroll unless the page takes them for itself.
 */
async function swipeUp(page: Page, [x, y]: [number, number], distance: number) {
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", at: number) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y: at }] });
  await touch("touchStart", y);
  for (let at = y - 10; at >= y - distance; at -= 10) await touch("touchMove", at);
  await touch("touchEnd", y - distance);
}

test.describe("the mobile Scene", () => {
  test.skip(({ isMobile }) => !isMobile, "mobile only");
  // a software renderer takes a while over the first frame
  test.setTimeout(240_000);

  test("tapping a House opens the Project Panel as a bottom sheet, and swipes scroll the page", async ({ page }) => {
    const slow = expect.configure({ timeout: 30_000 });
    await page.goto("/?scene=mobile");
    const scene = liveScene(page);
    await expect(scene).toHaveAttribute("data-scene-path", "mobile");
    await expect(scene).toHaveAttribute("data-scene-ready", "true", { timeout: 200_000 });

    const canvas = stage(page).locator("canvas");
    const box = (await canvas.boundingBox())!;
    const [x, y] = houseOnStage("senja", box);
    await page.touchscreen.tap(box.x + x, box.y + y);

    const panel = page.locator('[data-slot="project-panel"]');
    await slow(panel.getByRole("heading", { name: "Senja House" })).toBeVisible();
    await expect(panel).toHaveAttribute("data-side", "bottom");
    const sheet = (await panel.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(sheet.y + sheet.height).toBeCloseTo(viewport.height, 0);
    expect(sheet.width).toBeCloseTo(viewport.width, 0);
    // no orbit: the Scene offers no grab
    await expect(scene).not.toHaveClass(/cursor-grab/);

    // a swipe up over the Scene, above the sheet, scrolls the page, and scrolling closes the Panel
    const from: [number, number] = [box.x + box.width / 2, box.y + box.height * 0.35];
    expect(await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.tagName, from)).toBe("CANVAS");
    await swipeUp(page, from, 200);
    await slow.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
    await slow(panel).toBeHidden();
  });
});

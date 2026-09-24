import { expect, test, type Page } from "@playwright/test";

import { expectReachableByTab } from "./keyboard";
import { HOME, openHomeOnStill } from "./paths";

const projects = [
  { name: "Lyngen House", slug: "lyngen", data: ["Lyngen, Troms", "+40 m", "2021", "290 m²"] },
  { name: "Senja House", slug: "senja", data: ["Senja, Troms", "+25 m", "2018", "220 m²"] },
  { name: "Kvaløya House", slug: "kvaloya", data: ["Kvaløya, Troms", "+15 m", "2023", "160 m²"] },
  { name: "Reine House", slug: "reine", data: ["Reine, Nordland", "+12 m", "2025", "235 m²"] },
];

const depths = [
  { label: "Projects", id: "projects", readout: "▽ −1.00" },
  { label: "Studio", id: "studio", readout: "▽ −2.00" },
  { label: "Approach", id: "approach", readout: "▽ −3.00" },
  { label: "Contact", id: "contact", readout: "▽ −4.00" },
];

const statement =
  "Atrium designs houses for the far north, where the sun stays low for half the year and the ground is snow.";

const indexRows = (page: Page) => page.locator("#projects").getByRole("listitem");
const readout = (page: Page) => page.locator('[data-slot="depth-readout"]');

test("the Project Index lists every Project in order, each linking to its page", async ({ page }) => {
  await page.goto(HOME);
  const rows = indexRows(page);
  await expect(rows).toHaveCount(projects.length);

  for (const [i, { name, slug, data }] of projects.entries()) {
    const link = rows.nth(i).getByRole("link");
    await expect(link).toHaveAttribute("href", `/projects/${slug}`);
    await expect(link).toContainText(name);
    for (const value of data) await expect(link).toContainText(value);
  }
});

test("each Depth is labelled in the margin rail", async ({ page }) => {
  await page.goto(HOME);
  for (const { label, id, readout } of depths) {
    await expect(page.locator(`#${id}`).getByRole("heading", { level: 2 })).toHaveText(
      `${readout} · ${label}`,
    );
  }
});

test("the Studio, Approach and Contact Depths carry their content", async ({ page }) => {
  await page.goto(HOME);
  const studio = page.locator("#studio");
  await expect(studio.getByText(statement)).toBeVisible();
  for (const [label, value] of [
    ["Founded", "2014"],
    ["Based", "Tromsø, Norway"],
    ["Projects", "4"],
  ]) {
    await expect(studio.locator("dt", { hasText: label }).locator("+ dd")).toHaveText(value);
  }

  const approach = page.locator("#approach").getByRole("listitem");
  await expect(approach).toHaveCount(3);
  for (const [i, label] of ["01 Site", "02 Light", "03 Material"].entries()) {
    await expect(approach.nth(i)).toContainText(label);
    await expect(approach.nth(i).getByRole("heading", { level: 3 })).toBeVisible();
    await expect(approach.nth(i).getByRole("img")).toBeVisible();
  }

  await expect(page.locator("#contact").getByRole("link", { name: "studio@atrium.example" })).toHaveAttribute(
    "href",
    "mailto:studio@atrium.example",
  );
});

test("the home description is the Studio statement", async ({ page }) => {
  await page.goto(HOME);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", statement);
  await expect(page.locator('meta[property="og:description"]')).toHaveAttribute("content", statement);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /opengraph-image/);
});

test.describe("desktop", () => {
  test.skip(({ isMobile }) => isMobile, "desktop only");

  test("header anchors scroll to each Depth and the readout follows", async ({ page }) => {
    await openHomeOnStill(page);
    await expect(readout(page)).toHaveText("±0.00");
    const nav = page.getByRole("banner").getByRole("navigation", { name: "Site" });

    // Down the section, then back up to the first Depth.
    for (const depth of [...depths, depths[0]]) {
      await nav.getByRole("link", { name: depth.label }).click();
      await expectAtDepth(page, depth);
    }

    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(readout(page)).toHaveText("±0.00");
  });

  test("the header and the Index are keyboard reachable", async ({ page }) => {
    await page.goto(HOME);
    const nav = page.getByRole("banner").getByRole("navigation", { name: "Site" });
    for (const { label } of depths) {
      await expectReachableByTab(page, nav.getByRole("link", { name: label }));
    }
    for (const { name } of projects) {
      await expectReachableByTab(page, indexRows(page).getByRole("link", { name }));
    }
  });

  test("a row shows its thumbnail on hover", async ({ page }) => {
    await page.goto(HOME);
    const row = indexRows(page).nth(1);
    const thumbnail = row.locator('[data-slot="index-thumbnail"]');
    await row.scrollIntoViewIfNeeded();
    await expect(thumbnail).toHaveCSS("opacity", "0");
    await row.hover();
    await expect(thumbnail).toHaveCSS("opacity", "1");
    await expect(thumbnail.locator("img")).toHaveJSProperty("complete", true);
  });

  test("a row sets its data in columns beside the name", async ({ page }) => {
    await page.goto(HOME);
    const link = indexRows(page).first().getByRole("link");
    const name = await link.getByText("Lyngen House").boundingBox();
    const year = await link.getByText("2021").boundingBox();
    expect(Math.abs(name!.y + name!.height / 2 - (year!.y + year!.height / 2))).toBeLessThan(12);
  });
});

test.describe("mobile", () => {
  test.skip(({ isMobile }) => !isMobile, "mobile only");

  test("a row stacks the name over one line of data, with no thumbnail", async ({ page }) => {
    await page.goto(HOME);
    const row = indexRows(page).first();
    await expect(row.locator('[data-slot="index-thumbnail"]')).toBeHidden();
    const name = await row.getByText("Lyngen House").boundingBox();
    const location = await row.getByText("Lyngen, Troms").boundingBox();
    const area = await row.getByText("290 m²").boundingBox();
    expect(location!.y).toBeGreaterThan(name!.y + name!.height - 1);
    expect(Math.abs(area!.y - location!.y)).toBeLessThan(2);
  });

  test("the menu's links scroll to each Depth and the readout follows", async ({ page }) => {
    await openHomeOnStill(page);
    await expect(readout(page)).toHaveText("±0.00");
    const banner = page.getByRole("banner");
    for (const depth of depths) {
      await banner.getByRole("button", { name: "Menu" }).click();
      await page.getByRole("dialog").getByRole("link", { name: depth.label }).click();
      await expect(page.getByRole("dialog")).toBeHidden();
      await expectAtDepth(page, depth);
    }
  });

  test("the menu and the Index are keyboard reachable", async ({ page }) => {
    await page.goto(HOME);
    await expectReachableByTab(page, page.getByRole("banner").getByRole("button", { name: "Menu" }));
    for (const { name } of projects) {
      await expectReachableByTab(page, indexRows(page).getByRole("link", { name }));
    }
  });
});

/** The Depth's top sits at the header's baseline and the readout names it. */
async function expectAtDepth(page: Page, { id, readout: mark }: (typeof depths)[number]) {
  await expect(page).toHaveURL(new RegExp(`#${id}$`));
  await expect(async () => {
    const [top, baseline] = await page.evaluate((id) => {
      const header = document.querySelector("header")!.getBoundingClientRect().bottom;
      return [document.getElementById(id)!.getBoundingClientRect().top, header];
    }, id);
    expect(Math.abs(top - baseline)).toBeLessThan(2);
  }).toPass();
  await expect(readout(page)).toHaveText(mark);
}

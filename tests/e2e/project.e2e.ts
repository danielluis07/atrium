import { expect, test, type Page } from "@playwright/test";

import { getProject } from "@/content";

const projects = [
  { name: "Lyngen House", slug: "lyngen", data: ["Lyngen, Troms", "+40 m", "2021", "290 m²"] },
  { name: "Senja House", slug: "senja", data: ["Senja, Troms", "+25 m", "2018", "220 m²"] },
  { name: "Kvaløya House", slug: "kvaloya", data: ["Kvaløya, Troms", "+15 m", "2023", "160 m²"] },
  { name: "Reine House", slug: "reine", data: ["Reine, Nordland", "+12 m", "2025", "235 m²"] },
];

const labels = ["Location", "Elevation", "Year", "Area"];

/** Copy still being drafted is read from Content, so the tests follow it. */
const copy = (slug: string) => getProject(slug)!;

const titleBlock = (page: Page) => page.locator('[data-slot="title-block"]');

for (const [i, { name, slug, data }] of projects.entries()) {
  test(`the ${name} page opens on its title block and hero image`, async ({ page }) => {
    await page.goto(`/projects/${slug}`);
    const block = titleBlock(page);
    await expect(block.getByRole("heading", { level: 1 })).toHaveText(name);
    await expect(block).toContainText(copy(slug).lede);
    await expect(block).toContainText(`Project 0${i + 1} / 04`);
    for (const [j, label] of labels.entries()) {
      await expect(block.locator("dt", { hasText: label }).locator("+ dd")).toHaveText(data[j]);
    }

    const hero = page.locator('[data-slot="hero"]').getByRole("img");
    await expect(hero).toHaveAttribute("alt", copy(slug).images.hero.alt);
    await expect(hero).toHaveJSProperty("complete", true);
    expect(await hero.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  });

  test(`the ${name} page has the Site, Light and Material write-up with its images`, async ({ page }) => {
    await page.goto(`/projects/${slug}`);
    for (const [part, count] of [
      ["01 Site", 1],
      ["02 Light", 2],
      ["03 Material", 1],
    ] as const) {
      const section = page.getByRole("region", { name: part });
      await expect(section).toBeVisible();
      await expect(section.getByRole("img")).toHaveCount(count);
    }
  });

  test(`the ${name} page has its massing plan and section`, async ({ page }) => {
    await page.goto(`/projects/${slug}`);
    const drawings = page.getByRole("region", { name: "04 Drawings" });
    for (const [label, caption] of [
      [`Massing plan of ${name}, cut at the entrance Level`, "Plan at ±0.00"],
      [`Section through ${name}, marking each Level`, "Section A–A"],
    ]) {
      const figure = drawings.getByRole("figure", { name: caption });
      const drawing = figure.getByRole("img", { name: label });
      await expect(drawing).toBeVisible();
      await expect(drawing.locator('svg [data-part="volume"]').first()).toBeAttached();
    }
    await expect(drawings.locator('svg [data-part="level"]')).toHaveCount(copy(slug).house.levels.length);
  });
}

test("the next-Project row follows the Project order and wraps from the last to the first", async ({ page }) => {
  for (const [i, { slug }] of projects.entries()) {
    const next = projects[(i + 1) % projects.length];
    await page.goto(`/projects/${slug}`);
    const link = page.getByRole("navigation", { name: "Next project" }).getByRole("link");
    await expect(link).toHaveAccessibleName(new RegExp(`Next project:\\s*${next.name}`, "i"));
    await expect(link).toHaveAttribute("href", `/projects/${next.slug}`);
  }

  await page.getByRole("navigation", { name: "Next project" }).getByRole("link").click();
  await expect(page).toHaveURL(/\/projects\/lyngen$/);
  await expect(titleBlock(page).getByRole("heading", { level: 1 })).toHaveText("Lyngen House");
});

test("each Project page sets its title, description and OG image", async ({ page, request }) => {
  for (const { name, slug } of projects) {
    const { lede, images } = copy(slug);
    await page.goto(`/projects/${slug}`);
    await expect(page).toHaveTitle(`${name} — Atrium`);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", lede);
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", `${name} — Atrium`);
    await expect(page.locator('meta[property="og:description"]')).toHaveAttribute("content", lede);
    await expect(page.locator('meta[property="og:image:alt"]')).toHaveAttribute("content", images.hero.alt);

    const og = await page.locator('meta[property="og:image"]').getAttribute("content");
    const { pathname, search } = new URL(og!);
    expect(pathname).toBe(`/projects/${slug}/opengraph-image/hero`);
    const image = await request.get(pathname + search);
    expect(image.status()).toBe(200);
    expect(image.headers()["content-type"]).toBe("image/jpeg");
  }
});

test("an unknown Project slug returns the styled 404", async ({ page }) => {
  const response = await page.goto("/projects/nowhere");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("main").getByText("▽ −∞")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Nothing is built here." })).toBeVisible();
});

const depths = [
  { label: "Projects", id: "projects", readout: "▽ −1.00" },
  { label: "Studio", id: "studio", readout: "▽ −2.00" },
  { label: "Approach", id: "approach", readout: "▽ −3.00" },
  { label: "Contact", id: "contact", readout: "▽ −4.00" },
];

test.describe("desktop", () => {
  test.skip(({ isMobile }) => isMobile, "desktop only");

  for (const depth of depths) {
    test(`the header's ${depth.label} link lands on that home Depth`, async ({ page }) => {
      await page.goto("/projects/senja");
      await page.getByRole("banner").getByRole("navigation", { name: "Site" }).getByRole("link", { name: depth.label }).click();
      await expectOnHomeDepth(page, depth);
    });
  }
});

test.describe("mobile", () => {
  test.skip(({ isMobile }) => !isMobile, "mobile only");

  test("the menu's links land on the home Depths", async ({ page }) => {
    for (const depth of depths) {
      await page.goto("/projects/senja");
      await page.getByRole("banner").getByRole("button", { name: "Menu" }).click();
      await page.getByRole("dialog").getByRole("link", { name: depth.label }).click();
      await expectOnHomeDepth(page, depth);
    }
  });
});

async function expectOnHomeDepth(page: Page, { id, readout }: (typeof depths)[number]) {
  await expect(page).toHaveURL(new RegExp(`/#${id}$`));
  await expect(async () => {
    const [top, baseline] = await page.evaluate((id) => {
      const header = document.querySelector("header")!.getBoundingClientRect().bottom;
      return [document.getElementById(id)!.getBoundingClientRect().top, header];
    }, id);
    expect(Math.abs(top - baseline)).toBeLessThan(2);
  }).toPass();
  await expect(page.locator('[data-slot="depth-readout"]')).toHaveText(readout);
}

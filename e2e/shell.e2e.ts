import { expect, test } from "@playwright/test";

import { expectReachableByTab } from "./keyboard";

const pages = [
  { name: "home", path: "/" },
  { name: "404", path: "/nothing-here" },
];

for (const { name, path } of pages) {
  test(`the ${name} page has the header and footer`, async ({ page }) => {
    await page.goto(path);

    await expect(page.getByRole("banner").getByRole("link", { name: "atrium", exact: true })).toBeVisible();

    const footer = page.getByRole("contentinfo");
    await expect(footer.getByRole("link", { name: "atrium", exact: true })).toBeVisible();
    await expect(footer.getByText("Tromsø, Norway")).toBeVisible();
    await expect(
      footer.getByRole("link", { name: "studio@atrium.example" }),
    ).toHaveAttribute("href", "mailto:studio@atrium.example");
    await expect(footer.getByText("Atrium is a fictional studio.")).toBeVisible();
  });
}

test("an unknown route returns the styled 404", async ({ page }) => {
  const response = await page.goto("/nothing-here");
  expect(response?.status()).toBe(404);

  await expect(page.getByText("▽ −∞")).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: "Nothing is built here." }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /See the Projects/ })).toHaveAttribute(
    "href",
    "/#projects",
  );
});

test("the 404 link is keyboard reachable", async ({ page }) => {
  await page.goto("/nothing-here");
  const link = page.getByRole("link", { name: /See the Projects/ });
  await expectReachableByTab(page, link);
});

test.describe("desktop header", () => {
  test.skip(({ isMobile }) => isMobile, "desktop only");

  test("links to each Depth and is keyboard reachable", async ({ page }) => {
    await page.goto("/nothing-here");
    const nav = page.getByRole("banner").getByRole("navigation", { name: "Site" });

    for (const [label, id] of [
      ["Projects", "projects"],
      ["Studio", "studio"],
      ["Approach", "approach"],
      ["Contact", "contact"],
    ]) {
      const link = nav.getByRole("link", { name: label });
      await expect(link).toHaveAttribute("href", `/#${id}`);
      await expectReachableByTab(page, link);
    }
  });
});

test.describe("mobile header", () => {
  test.skip(({ isMobile }) => !isMobile, "mobile only");

  test("the links open in a Sheet", async ({ page }) => {
    await page.goto("/");
    const banner = page.getByRole("banner");
    await expect(banner.getByRole("link", { name: "Projects" })).toBeHidden();

    await banner.getByRole("button", { name: "Menu" }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    for (const label of ["Projects", "Studio", "Approach", "Contact"]) {
      await expect(sheet.getByRole("link", { name: label })).toBeVisible();
    }

    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
  });
});

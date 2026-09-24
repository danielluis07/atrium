import type { Locator, Page } from "@playwright/test";

/** Tabs from the top of the page until the target has focus. */
export async function expectReachableByTab(page: Page, target: Locator, maxPresses = 20) {
  await page.locator("body").focus();
  for (let i = 0; i < maxPresses; i++) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((el) => el === document.activeElement)) return;
  }
  throw new Error(`target was not reached by Tab within ${maxPresses} presses`);
}

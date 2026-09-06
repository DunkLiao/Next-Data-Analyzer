import { expect, test, type Page } from "@playwright/test";

async function checkLayout(page: Page) {
  const overflow = await page.evaluate(() => {
    const selectors = ".topbar button, .tabs button, .dataset-info .chip, .toolbar, .chart, .report-actions .btn";
    return [...document.querySelectorAll<HTMLElement>(selectors)]
      .filter((el) => el.getClientRects().length)
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        return rect.left < -1 || rect.right > innerWidth + 1 || el.scrollWidth > el.clientWidth + 1;
      }).map((el) => el.id || el.textContent);
  });
  expect(overflow).toEqual([]);
  expect(await page.locator("main").evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
}

async function checkSurfaceRadii(page: Page) {
  const oversized = await page.evaluate(() => {
    const selectors = ".card, .data-table, .chart, .scroll-y, .welcome-card, .modal";
    return [...document.querySelectorAll<HTMLElement>(selectors)]
      .filter((el) => el.getClientRects().length)
      .map((el) => {
        const style = getComputedStyle(el);
        const radii = [
          style.borderTopLeftRadius,
          style.borderTopRightRadius,
          style.borderBottomRightRadius,
          style.borderBottomLeftRadius,
        ].map((value) => Number.parseFloat(value));
        return { selector: el.id || el.className || el.tagName, radius: Math.max(...radii) };
      })
      .filter(({ radius }) => radius > 8);
  });
  expect(oversized).toEqual([]);
}

for (const sample of ["utf8", "big5"]) {
  test(`${sample}: sample, tabs, charts and layout`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    await expect(page.locator("#modal")).toBeHidden();
    await expect(page.locator("#welcome")).toBeVisible();
    await checkSurfaceRadii(page);
    await page.screenshot({ path: testInfo.outputPath("home.png") });
    await page.locator(`#btn-sample-${sample}`).click();
    await expect(page.locator("body")).not.toHaveClass(/busy/);
    await expect(page.locator("#dataset-info")).toContainText(`sample-${sample === "utf8" ? "utf8" : "big5"}.csv`);
    await expect(page.locator("#dataset-info")).toContainText(sample === "utf8" ? "UTF-8" : "Big5");
    await expect(page.locator("#welcome")).toBeHidden();
    for (const tab of ["overview", "missing", "dist", "corr", "report"]) {
      await page.locator(`[data-tab="${tab}"]`).click();
      const panel = page.locator(`#tab-${tab}`);
      await expect(panel).toBeVisible();
      await expect(page.locator(".tab-panel:visible")).toHaveCount(1);
      if (["missing", "dist", "corr"].includes(tab)) {
        await expect.poll(() => panel.locator("canvas").count()).toBeGreaterThan(0);
        for (const canvas of await panel.locator("canvas").all()) {
          await expect.poll(() => canvas.evaluate((el) => {
            const surface = el as HTMLCanvasElement;
            const pixels = surface.getContext("2d")!.getImageData(0, 0, surface.width, surface.height).data;
            return pixels.some((value, i) => i % 4 === 3 && value > 0);
          })).toBe(true);
        }
      }
      if (tab === "report") {
        await expect(page.locator("#btn-export-html")).toBeVisible();
        await expect(page.locator("#btn-export-csv")).toBeVisible();
      }
      await checkLayout(page);
      await checkSurfaceRadii(page);
      await page.screenshot({ path: testInfo.outputPath(`${tab}.png`) });
    }
    await page.locator("#btn-settings").click();
    await expect(page.locator("#modal")).toBeVisible();
    await checkSurfaceRadii(page);
    await page.locator("#modal-cancel").click();
    await expect(page.locator("#modal")).toBeHidden();
    expect(errors).toEqual([]);
  });
}

import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.route("**/tile.openstreetmap.org/**", (r) => r.abort());
});
test("full registry, search, dated card, ensemble, temporal filtering and share state", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./");
  await expect(page.locator(".results-header")).toContainText("7");
  await expect(page.locator(".results-header")).toContainText("016");
  await page.getByLabel("Поиск по названию или адресу").fill("Назаровская");
  await expect(page.locator(".result-card")).toHaveCount(1);
  await page.locator(".result-card").click();
  await expect(page.locator(".detail-panel")).toContainText("1895");
  await expect(page.locator(".detail-panel")).toContainText("771410378510015");
  await expect(page.locator(".detail-panel")).toContainText(
    "Обсерватория Московского университета",
  );
  await expect(page).toHaveURL(/object=2949468/);
  await page.reload();
  await expect(page.locator(".detail-panel")).toContainText("771410378510015");
  await page.getByLabel("Закрыть карточку").click();
  await page.getByRole("button", { name: "1900–1917", exact: true }).click();
  await expect(page.locator(".result-card")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Сбросить фильтры", exact: true })
    .click();
  await expect(page.locator(".result-card")).toHaveCount(40);
  await page.getByRole("button", { name: "О данных", exact: true }).click();
  await expect(page.locator("dialog")).toBeVisible();
  await expect(page.locator("dialog")).toContainText("7");
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog")).not.toBeVisible();
  await expect(page.locator(".map-wrap")).toHaveAttribute(
    "data-map-ready",
    "true",
    { timeout: 30000 },
  );
  await expect
    .poll(
      async () =>
        Number(
          await page.locator(".map-wrap").getAttribute("data-rendered-objects"),
        ),
      { timeout: 30000 },
    )
    .toBeGreaterThan(0);
  expect(errors).toEqual([]);
  await page.screenshot({ path: "/tmp/moscow-desktop.png", fullPage: true });
});
test("mobile filters and details remain usable without overflowing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  await page.locator(".mobile-filter-button").click();
  await page.getByLabel("Поиск по названию или адресу").fill("Назаровская");
  await expect(page.locator(".result-card")).toHaveCount(1);
  await page.locator(".result-card").click();
  await expect(page.locator(".detail-panel")).toContainText("771410378510015");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "/tmp/moscow-mobile.png", fullPage: true });
  await page.getByLabel("Закрыть карточку").click();
  await expect(page.locator(".timeline")).toBeVisible();
});
test("quarter selection and URL restoration", async ({ page }) => {
  await page.goto("./");
  await expect(page.locator(".result-card")).toHaveCount(40);
  await page
    .getByLabel("Район", { exact: true })
    .selectOption("Пресненский район");
  await page
    .locator("summary")
    .filter({ hasText: "Ансамбли и кварталы" })
    .click();
  const select = page.getByLabel("Учётный квартал", { exact: true });
  const value = await select.locator("option").nth(1).getAttribute("value");
  await select.selectOption(value!);
  await expect(page).toHaveURL(/quarter=/);
  await page.reload();
  await expect(select).toHaveValue(value!);
  await expect(page.locator(".result-card").first()).toBeVisible();
});
test("optional agent tools validate inputs and update the visible search", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const tools = new Map();
    Object.defineProperty(document, "modelContext", {
      value: {
        registerTool: (t: any, o: any) => {
          tools.set(t.name, t);
          o.signal.addEventListener("abort", () => tools.delete(t.name));
        },
      },
    });
    (window as any).__tools = tools;
  });
  await page.goto("./");
  await expect(page.locator(".result-card")).toHaveCount(40);
  const r = await page.evaluate(() => {
    const tools = (window as any).__tools;
    return tools.get("set_heritage_search").execute({ query: "Назаровская" });
  });
  expect(r.total).toBe(1);
  await expect(page.getByLabel("Поиск по названию или адресу")).toHaveValue(
    "Назаровская",
  );
  expect(
    await page.evaluate(() => {
      try {
        (window as any).__tools
          .get("open_heritage_object")
          .execute({ id: "nonexistent" });
        return false;
      } catch {
        return true;
      }
    }),
  ).toBe(true);
  const results = await page.evaluate(() =>
    (window as any).__tools.get("read_heritage_results").execute({}),
  );
  expect(results.total).toBe(1);
});

test("open ensemble clears restrictive search and shows every member", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByLabel("Поиск по названию или адресу").fill("Назаровская");
  await expect(page.locator(".result-card")).toHaveCount(1);
  await page.locator(".result-card").click();
  await page.getByRole("button", { name: "Показать участников" }).click();
  await expect(page).toHaveURL(/ensemble=/);
  await expect(page.locator(".result-card")).toHaveCount(8);
  await expect(page.getByLabel("Поиск по названию или адресу")).toHaveValue("");
});

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

test("shared year axis follows epochs, keyboard handles and URL", async ({
  page,
}) => {
  await page.goto("./");
  await expect(page.locator(".result-card")).toHaveCount(40);
  const start = page.getByRole("slider", { name: "Начало периода" });
  const end = page.getByRole("slider", { name: "Конец периода" });
  await page.getByRole("button", { name: "XIX век", exact: true }).click();
  await expect(start).toHaveValue("1800");
  await expect(end).toHaveValue("1899");
  await start.focus();
  await page.keyboard.press("ArrowRight");
  await end.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(start).toHaveValue("1801");
  await expect(end).toHaveValue("1898");
  await expect(page).toHaveURL(/from=1801&to=1898/);
  await page.reload();
  await expect(start).toHaveValue("1801");
  await expect(end).toHaveValue("1898");
  await expect(page.locator(".year-histogram rect").first()).toBeAttached();
  await page.screenshot({ path: "/tmp/moscow-range-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "1900–1917", exact: true }).click();
  await expect(start).toHaveValue("1900");
  await expect(end).toHaveValue("1917");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "/tmp/moscow-range-mobile.png" });
  const track = (await page.locator(".dual-range-track").boundingBox())!;
  const handleX = (year: number) =>
    track.x + ((year - 1000) / 1026) * track.width;
  await page.mouse.move(handleX(1900), track.y + 4 - 7);
  await page.mouse.down();
  await page.mouse.move(handleX(1800), track.y + 4 - 7, { steps: 8 });
  await page.mouse.up();
  expect(Number(await start.inputValue())).toBeLessThan(1850);
  await page.mouse.move(handleX(1917), track.y + 4 + 7);
  await page.mouse.down();
  await page.mouse.move(handleX(2000), track.y + 4 + 7, { steps: 8 });
  await page.mouse.up();
  expect(Number(await end.inputValue())).toBeGreaterThan(1950);
});

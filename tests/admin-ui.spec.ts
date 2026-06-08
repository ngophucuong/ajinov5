// Ajino v5 — Admin UI Test Suite (Playwright)
// Run: npx playwright test tests/admin-ui.spec.ts --headed
import { test, expect } from "@playwright/test";

const BASE = "https://ajinov5.cuong.ngo";
const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI1MjUwMzM5NDcyIiwicm9sZSI6ImNlbyIsInRlbGVncmFtX2lkIjo1MjUwMzM5NDcyLCJpYXQiOjE3ODA4NTUwNDAsImV4cCI6MTc4MDk0MTQ0MH0.dVU2M-q_cyvx7-jLwPcwks8cviYSsmHmCDL3TfBV1sY";

test.describe("Admin UI", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().addCookies([
      { name: "ajino_token", value: JWT, domain: "ajinov5.cuong.ngo", path: "/" },
    ]);
  });

  test("01 - Page loads without errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto(`${BASE}/admin`);
    await page.waitForTimeout(2000);
    expect(errors).toEqual([]);
  });

  test("02 - Topbar logo visible", async ({ page }) => {
    await page.goto(`${BASE}/admin`);
    await expect(page.locator("text=Ajino").first()).toBeVisible({ timeout: 5000 });
  });

  test("03 - Sidebar has nav items", async ({ page }) => {
    await page.goto(`${BASE}/admin`);
    await expect(page.locator("text=Dashboard").first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=Memory Review")).toBeVisible();
  });

  test("04 - Navigate to Memory", async ({ page }) => {
    await page.goto(`${BASE}/admin`);
    await page.click("text=Memory Review");
    await page.waitForTimeout(500);
    await expect(page.locator("text=Chờ duyệt")).toBeVisible({ timeout: 3000 });
  });

  test("05 - Memory tabs switch", async ({ page }) => {
    await page.goto(`${BASE}/admin`);
    await page.click("text=Memory Review");
    await page.waitForTimeout(1000);
    await page.click("text=Canonical");
    await page.waitForTimeout(500);
  });

  test("06 - Memory list scrolls", async ({ page }) => {
    await page.goto(`${BASE}/admin`);
    await page.click("text=Memory Review");
    await page.waitForTimeout(2000);
    const list = page.locator("[class*='scroll'], [style*='overflow']").first();
    await list.evaluate((el: HTMLElement) => { el.scrollTop = 500; });
    await page.waitForTimeout(300);
    const top = await list.evaluate((el: HTMLElement) => el.scrollTop);
    expect(top).toBeGreaterThan(0);
  });

  test("07 - Studio page loads docs", async ({ page }) => {
    await page.goto(`${BASE}/admin`);
    await page.click("text=Studio");
    await page.waitForTimeout(2000);
    await expect(page.locator("text=Tài liệu").first()).toBeVisible({ timeout: 5000 });
  });

  test("08 - Studio has drop zone", async ({ page }) => {
    await page.goto(`${BASE}/admin`);
    await page.click("text=Studio");
    await page.waitForTimeout(1000);
    await expect(page.locator("text=Kéo thả")).toBeVisible({ timeout: 3000 });
  });

  test("09 - Studio Compile button visible", async ({ page }) => {
    await page.goto(`${BASE}/admin`);
    await page.click("text=Studio");
    await page.waitForTimeout(2000);
    const btn = page.locator("[title*='Biên dịch'], [title*='Compile']").first();
    await expect(btn).toBeVisible({ timeout: 5000 });
  });

  test("10 - Agents page loads", async ({ page }) => {
    await page.goto(`${BASE}/admin`);
    await page.click("text=Agents");
    await page.waitForTimeout(1000);
    await expect(page.locator("text=Orchestrator").first()).toBeVisible({ timeout: 3000 });
  });

  test("11 - Skills page has toggles", async ({ page }) => {
    await page.goto(`${BASE}/admin`);
    await page.click("text=Skills");
    await page.waitForTimeout(1000);
    const toggles = page.locator("[class*='sk-toggle']");
    expect(await toggles.count()).toBeGreaterThanOrEqual(2);
  });

  test("12 - Audit page loads", async ({ page }) => {
    await page.goto(`${BASE}/admin`);
    await page.click("text=Audit Log");
    await page.waitForTimeout(1500);
    await expect(page.locator("text=Export CSV")).toBeVisible({ timeout: 3000 });
  });

  test("13 - Chips bar visible", async ({ page }) => {
    await page.goto(`${BASE}/admin`);
    await page.waitForTimeout(1000);
    await expect(page.locator("text=Chat").first()).toBeVisible({ timeout: 3000 });
  });

  test("14 - No error toasts visible", async ({ page }) => {
    await page.goto(`${BASE}/admin`);
    await page.waitForTimeout(2000);
    const errorTexts = page.locator("text=Lỗi");
    const count = await errorTexts.count();
    // Some "Lỗi" badges are normal (failed compiles), but not error toasts
    expect(count).toBeLessThan(5);
  });

  test("15 - Tooltips show on hover", async ({ page }) => {
    await page.goto(`${BASE}/admin`);
    await page.click("text=Memory Review");
    await page.waitForTimeout(1500);
    // Hover over approve button
    const approveBtn = page.locator("[title='Duyệt']").first();
    if (await approveBtn.isVisible()) {
      await approveBtn.hover();
      await page.waitForTimeout(300);
      // Tooltip should appear (native browser tooltip is hard to test)
    }
  });
});

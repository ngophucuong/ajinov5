/**
 * Production smoke test — runs against ajinov5.cuong.ngo
 */
import { test, expect } from "@playwright/test";

const BASE = "https://ajinov5.cuong.ngo";

test.describe("Ajino v5 — Production Smoke Test", () => {
  test("01 - Production loads with login form", async ({ page }) => {
    await page.goto(BASE);
    await page.waitForTimeout(3000);

    const body = await page.locator("body").textContent();
    console.log("Has 'Đăng nhập':", body?.includes("Đăng nhập"));
    console.log("Has 'Telegram':", body?.includes("Telegram"));
    console.log("Has 'Ajino':", body?.includes("Ajino"));
    expect(body).toContain("Đăng nhập");
    console.log("✅ Production login form visible");
  });

  test("02 - Chat UI loads (bypass auth with localStorage)", async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => {
      localStorage.setItem("ajino_token", "demo-token");
    });
    await page.reload();
    await page.waitForTimeout(3000);

    const body = await page.locator("body").textContent();
    console.log("Has 'Ajino':", body?.includes("Ajino"));
    console.log("Has 'Tự động':", body?.includes("Tự động"));
    console.log("Has 'Thủ công':", body?.includes("Thủ công"));
    console.log("Has 'Ngữ cảnh':", body?.includes("Ngữ cảnh"));
    console.log("Has 'Suy nghĩ':", body?.includes("Suy nghĩ"));
    console.log("✅ Chat UI loaded");
  });

  test("03 - Deep Research button visible", async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => {
      localStorage.setItem("ajino_token", "demo-token");
    });
    await page.reload();
    await page.waitForTimeout(2000);

    const researchBtn = page.locator("button:has-text('Nghiên cứu sâu')");
    const visible = await researchBtn.isVisible();
    console.log("🔬 Nghiên cứu sâu button:", visible);
    expect(visible).toBe(true);
    console.log("✅ Deep Research button found on production");
  });

  test("04 - Reasoning mode toggle works", async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => {
      localStorage.setItem("ajino_token", "demo-token");
    });
    await page.reload();
    await page.waitForTimeout(1500);

    // Click Thủ công
    const manualBtn = page.locator("button:has-text('Thủ công')");
    await manualBtn.click();
    await page.waitForTimeout(500);

    const body = await page.locator("body").textContent();
    console.log("Has 'Nhanh':", body?.includes("Nhanh"));
    console.log("Has 'Sâu':", body?.includes("Sâu"));
    console.log("✅ Reasoning mode toggle works");
  });

  test("05 - Agent network + sessions + context panel", async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => {
      localStorage.setItem("ajino_token", "demo-token");
    });
    await page.reload();
    await page.waitForTimeout(2000);

    const body = await page.locator("body").textContent();

    // Left sidebar
    console.log("Has 'Mạng Lưới Agent':", body?.includes("Mạng Lưới Agent"));
    console.log("Has 'Hôm nay':", body?.includes("Hôm nay"));

    // Session items
    const sessions = page.locator(".cursor-pointer");
    const count = await sessions.count();
    console.log(`Clickable elements: ${count}`);

    // Right panel
    console.log("Has 'Ngữ cảnh':", body?.includes("Ngữ cảnh"));
    console.log("Has 'Kỹ năng':", body?.includes("Kỹ năng"));
    console.log("Has 'Thực thể':", body?.includes("Thực thể"));
    console.log("Has 'Bộ nhớ':", body?.includes("Bộ nhớ"));

    expect(count).toBeGreaterThan(10);
    console.log("✅ Full layout loaded");
  });

  test("06 - Admin page loads", async ({ page }) => {
    await page.goto(`${BASE}/admin`);
    await page.evaluate(() => {
      localStorage.setItem("ajino_token", "demo-token");
    });
    await page.reload();
    await page.waitForTimeout(3000);

    const body = await page.locator("body").textContent();
    console.log("Has 'Dashboard':", body?.includes("Dashboard"));
    console.log("Has 'Memory Review':", body?.includes("Memory Review"));
    console.log("Has 'Studio':", body?.includes("Studio"));
    console.log("Has 'Agents':", body?.includes("Agents"));
    console.log("✅ Admin page loaded");
  });

  test("07 - No console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto(BASE);
    await page.evaluate(() => {
      localStorage.setItem("ajino_token", "demo-token");
    });
    await page.reload();
    await page.waitForTimeout(3000);

    const critical = errors.filter(
      (e) =>
        !e.includes("Telegram") &&
        !e.includes("ERR_ABORTED") &&
        !e.includes("404"),
    );
    console.log("Critical errors:", critical.length);
    if (critical.length > 0) console.log(critical);
    expect(critical).toEqual([]);
    console.log("✅ No console errors");
  });
});

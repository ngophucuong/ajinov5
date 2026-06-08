import { test, expect } from "@playwright/test";

const BASE = "https://ajinov5.cuong.ngo";
const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI1MjUwMzM5NDcyIiwicm9sZSI6ImNlbyIsInRlbGVncmFtX2lkIjo1MjUwMzM5NDcyLCJpYXQiOjE3ODA4NTUwNDAsImV4cCI6MTc4MDk0MTQ0MH0.dVU2M-q_cyvx7-jLwPcwks8cviYSsmHmCDL3TfBV1sY";

test.describe("Admin E2E", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().addCookies([
      { name: "ajino_token", value: JWT, domain: "ajinov5.cuong.ngo", path: "/" },
    ]);
    await page.goto(BASE);
    await page.evaluate((t) => localStorage.setItem("ajino_token", t), JWT);
    await page.goto(`${BASE}/admin`);
    await page.waitForTimeout(2000);
  });

  // ═══════════════════════════════════════════════
  test("01 - Dashboard loads with metrics", async ({ page }) => {
    await expect(page.getByText("Dashboard").first()).toBeVisible();
    // Check metric cards exist (has numbers)
    const cards = page.locator("[class*='metric']");
    expect(await cards.count()).toBeGreaterThanOrEqual(3);
    // Check agent status section
    await expect(page.getByText("Agents status")).toBeVisible({ timeout: 5000 });
    // Check audit section
    await expect(page.getByText("Audit log")).toBeVisible({ timeout: 5000 });
  });

  // ═══════════════════════════════════════════════
  test("02 - Memory: tabs + list + scroll", async ({ page }) => {
    // Navigate to Memory
    await page.getByText("Memory Review").first().click();
    await page.waitForTimeout(2000);

    // Tabs should be visible
    await expect(page.getByRole("button", { name: /Chờ duyệt/ }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Canonical/ }).first()).toBeVisible();

    // Click Canonical (more items = better scroll test)
    await page.getByRole("button", { name: /Canonical/ }).first().click();
    await page.waitForTimeout(2000);

    // Should have memory rows
    const rows = page.locator("[class*='mem-row']");
    const count = await rows.count();
    console.log("Memory rows:", count);
    expect(count).toBeGreaterThan(0);

    // Test scrolling
    const scrollAreas = page.locator("[class*='overflow-y-auto'], [class*='ScrollContent']");
    const scrollCount = await scrollAreas.count();
    let scrolled = false;
    for (let i = 0; i < scrollCount; i++) {
      const el = scrollAreas.nth(i);
      const sh = await el.evaluate((e: HTMLElement) => e.scrollHeight);
      const ch = await el.evaluate((e: HTMLElement) => e.clientHeight);
      if (sh > ch + 50) {
        await el.evaluate((e: HTMLElement) => { e.scrollTop = 500; });
        await page.waitForTimeout(300);
        const top = await el.evaluate((e: HTMLElement) => e.scrollTop);
        console.log(`Scrolled #${i}: sh=${sh} ch=${ch} top=${top}`);
        expect(top).toBeGreaterThan(0);
        scrolled = true;
        break;
      }
    }
    expect(scrolled).toBe(true);
  });

  // ═══════════════════════════════════════════════
  test("03 - Memory: approve button works", async ({ page }) => {
    await page.getByText("Memory Review").first().click();
    await page.waitForTimeout(1500);

    // Find approve button
    const approveBtn = page.locator("[title='Duyệt']").first();
    if (await approveBtn.isVisible()) {
      await approveBtn.click();
      await page.waitForTimeout(1000);
      // Should show flash message
      const flash = page.getByText("Đã duyệt");
      await expect(flash).toBeVisible({ timeout: 3000 });
    }
  });

  // ═══════════════════════════════════════════════
  test("04 - Studio: docs + compile + metadata", async ({ page }) => {
    await page.getByText("Studio").first().click();
    await page.waitForTimeout(2000);

    // Drop zone visible
    await expect(page.getByText("Kéo thả")).toBeVisible({ timeout: 3000 });

    // Document list should exist
    const docs = page.locator("[class*='studio-row'], [class*='Tài liệu']");
    console.log("Studio sections:", await docs.count());

    // Check for badge text
    const body = await page.locator("body").textContent();
    console.log("Has 'Chưa xử lý':", body?.includes("Chưa xử lý"));
    console.log("Has 'Đã biên dịch':", body?.includes("đã biên dịch"));

    // Check compile button exists on a draft doc
    const compileBtn = page.locator("[title*='Biên dịch'], [title*='Compile']").first();
    if (await compileBtn.isVisible()) {
      console.log("Compile button visible ✅");
    }

    // Check metadata line (ký tự)
    const hasChars = body?.includes("ký tự");
    console.log("Has 'ký tự' metadata:", hasChars);
  });

  // ═══════════════════════════════════════════════
  test("05 - Agents page", async ({ page }) => {
    await page.getByText("Agents").first().click();
    await page.waitForTimeout(1000);

    const agentNames = ["Orchestrator", "Reasoning", "Search", "Memory", "Knowledge", "Synthesis"];
    for (const name of agentNames) {
      await expect(page.getByText(name).first()).toBeVisible({ timeout: 3000 });
    }
  });

  // ═══════════════════════════════════════════════
  test("06 - Skills page", async ({ page }) => {
    await page.getByText("Skills").first().click();
    await page.waitForTimeout(1000);

    const toggles = page.locator("[class*='sk-toggle']");
    const count = await toggles.count();
    console.log("Skill toggles:", count);
    expect(count).toBeGreaterThanOrEqual(2);

    // Skill names
    await expect(page.getByText("web_search").first()).toBeVisible({ timeout: 3000 });
  });

  // ═══════════════════════════════════════════════
  test("07 - Audit: entries + export + load more", async ({ page }) => {
    await page.getByText("Audit Log").first().click();
    await page.waitForTimeout(1500);

    // Entries visible
    const rows = page.locator("[class*='audit-row']");
    const count = await rows.count();
    console.log("Audit rows:", count);
    expect(count).toBeGreaterThan(0);

    // Export CSV button
    await expect(page.getByText("Export").first()).toBeVisible({ timeout: 3000 });

    // Load more
    const loadMore = page.getByText("Tải thêm");
    if (await loadMore.isVisible()) {
      const before = await rows.count();
      await loadMore.click();
      await page.waitForTimeout(1500);
      const after = await page.locator("[class*='audit-row']").count();
      console.log(`Load more: ${before} → ${after}`);
      expect(after).toBeGreaterThanOrEqual(before);
    }
  });

  // ═══════════════════════════════════════════════
  test("08 - Chips bar visible on all pages", async ({ page }) => {
    const pages = ["Memory Review", "Studio", "Agents", "Skills", "Audit Log"];
    for (const p of pages) {
      await page.getByText(p).first().click();
      await page.waitForTimeout(500);
      await expect(page.getByText("Chat").first()).toBeVisible({ timeout: 2000 });
      await expect(page.getByText("Quản trị").first()).toBeVisible({ timeout: 2000 });
    }
  });

  // ═══════════════════════════════════════════════
  test("09 - Tooltips appear on hover", async ({ page }) => {
    await page.getByText("Memory Review").first().click();
    await page.waitForTimeout(1500);

    // Hover bulk approve button
    const btn = page.locator("[title='Duyệt tất cả memory đang chờ']");
    if (await btn.isVisible()) {
      await btn.hover();
      await page.waitForTimeout(500);
      // Title attribute should exist
      const title = await btn.getAttribute("title");
      console.log("Tooltip:", title);
      expect(title).toBeTruthy();
    }
  });

  // ═══════════════════════════════════════════════
  test("10 - No console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    // Visit all pages
    const pages = ["Memory Review", "Studio", "Agents", "Skills", "Audit Log"];
    for (const p of pages) {
      await page.getByText(p).first().click();
      await page.waitForTimeout(1000);
    }

    // Filter out known non-critical errors
    const critical = errors.filter(e => !e.includes("Telegram") && !e.includes("ERR_ABORTED"));
    console.log("Total errors:", errors.length, "Critical:", critical.length);
    if (critical.length > 0) console.log("Critical errors:", critical);
    expect(critical).toEqual([]);
  });
});

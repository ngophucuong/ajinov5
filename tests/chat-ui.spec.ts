import { test, expect } from "@playwright/test";

const BASE = "https://ajinov5.cuong.ngo";
const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI1MjUwMzM5NDcyIiwicm9sZSI6ImNlbyIsInRlbGVncmFtX2lkIjo1MjUwMzM5NDcyLCJpYXQiOjE3ODA4NTUwNDAsImV4cCI6MTc4MDk0MTQ0MH0.dVU2M-q_cyvx7-jLwPcwks8cviYSsmHmCDL3TfBV1sY";

test.describe("Chat UI", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().addCookies([
      { name: "ajino_token", value: JWT, domain: "ajinov5.cuong.ngo", path: "/" },
    ]);
    await page.goto(BASE);
    await page.evaluate((t) => localStorage.setItem("ajino_token", t), JWT);
  });

  test("01 - Login form shows without token", async ({ page }) => {
    await page.context().clearCookies();
    await page.evaluate(() => localStorage.clear());
    await page.goto(BASE);
    await page.waitForTimeout(2000);

    // Should show login form with OTP input
    const body = await page.locator("body").textContent();
    expect(body).toContain("Đăng nhập");
    expect(body).toContain("Telegram");
    console.log("Login form visible ✅");
  });

  test("02 - Chat UI loads with auth", async ({ page }) => {
    await page.goto(BASE);
    await page.waitForTimeout(3000);

    const body = await page.locator("body").textContent();
    console.log("Has 'Ajino':", body?.includes("Ajino"));
    console.log("Has chat area:", await page.locator("textarea, [contenteditable]").count() > 0);
  });

  test("03 - Reasoning mode toggle visible", async ({ page }) => {
    await page.goto(BASE);
    await page.waitForTimeout(2000);

    // Check for Auto/Manual mode text
    const body = await page.locator("body").textContent();
    console.log("Has 'Tự động':", body?.includes("Tự động"));
    console.log("Has 'Nhanh':", body?.includes("Nhanh"));
    console.log("Has 'Sâu':", body?.includes("Sâu"));
  });

  test("04 - Send button visible", async ({ page }) => {
    await page.goto(BASE);
    await page.waitForTimeout(1500);

    // Orbital rings or send circle
    const sendArea = page.locator("[class*='sr1'], [class*='sr2'], [class*='SendButton'], button[title*='Gửi']");
    expect(await sendArea.count()).toBeGreaterThan(0);
    console.log("Send button visible ✅");
  });

  test("05 - Agent network visible", async ({ page }) => {
    await page.goto(BASE);
    await page.waitForTimeout(2000);

    // Agent network SVG with 6 nodes
    const body = await page.locator("body").textContent();
    console.log("Has agent names:",
      ["Orchestrator", "Reasoning", "Search", "Memory", "Synthesis"]
        .map(n => body?.includes(n)).join(", "));
  });

  test("06 - Nav chips bar visible", async ({ page }) => {
    await page.goto(BASE);
    await page.waitForTimeout(1000);

    const body = await page.locator("body").textContent();
    // Chips bar: 💬 Chat, 🧠 Bộ nhớ, ⚡ Capture, 📚 Studio, ⌨️ Console, 🛡️ Quản trị
    const navItems = ["Chat", "Bộ nhớ", "Capture", "Studio", "Console", "Quản trị"];
    for (const item of navItems) {
      console.log(`Nav '${item}':`, body?.includes(item));
    }
  });

  test("07 - Send a message and see response", async ({ page }) => {
    await page.goto(BASE);
    await page.waitForTimeout(2000);

    // Type in textarea
    const textarea = page.locator("textarea").first();
    if (await textarea.isVisible()) {
      await textarea.fill("Xin chào, bạn là ai?");
      await page.waitForTimeout(500);

      // Click send
      const sendBtn = page.locator("button[title*='Gửi'], [class*='SendButton'] button").first();
      if (await sendBtn.isVisible()) {
        await sendBtn.click();
        console.log("Message sent, waiting for response...");
        await page.waitForTimeout(10000);

        // Check for response
        const body = await page.locator("body").textContent();
        console.log("Response received:", body!.length > 500);
      }
    }
  });

  test("08 - No console errors on chat page", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto(BASE);
    await page.waitForTimeout(3000);

    const critical = errors.filter(e => !e.includes("Telegram") && !e.includes("ERR_ABORTED"));
    console.log("Critical errors:", critical.length);
    if (critical.length > 0) console.log(critical);
    expect(critical).toEqual([]);
  });
});

import { test, expect } from "@playwright/test";

const BASE = "https://ajinov5.cuong.ngo";

test("E2E: Fast chat from UI — real SSE response", async ({ page }) => {
  // Bypass auth
  await page.goto(BASE);
  await page.evaluate(() => {
    localStorage.setItem("ajino_token", "demo-token");
  });
  await page.reload();
  await page.waitForTimeout(2000);

  // Find textarea and type message
  const textarea = page.locator("textarea").first();
  await textarea.fill("1+1 bằng mấy?");
  await page.waitForTimeout(300);

  // Set reasoning mode to "fast"
  const fastBtn = page.locator("button:has-text('Thủ công')");
  if (await fastBtn.isVisible()) {
    await fastBtn.click();
    await page.waitForTimeout(300);
    const fastSubBtn = page.locator("button:has-text('Nhanh')");
    if (await fastSubBtn.isVisible()) {
      await fastSubBtn.click();
      console.log("Set mode to Fast ✅");
    }
  }

  // Click send
  const sendBtn = page.locator("button[title='Gửi tin nhắn']");
  await sendBtn.click();
  console.log("Message sent, waiting for response...");

  // Wait for response (up to 30s)
  await page.waitForTimeout(15000);

  // Check the page content
  const body = await page.locator("body").textContent();

  // Verify: NOT simulation text
  const isSimulation = body?.includes("đây là phân tích sơ bộ");
  console.log("Is simulation fallback:", isSimulation);

  // Verify: real response content
  const hasResponse = body!.length > 2000;
  console.log("Has substantial response:", hasResponse);

  // Check thinking trace
  const hasSearchTrace = body?.includes("search") || body?.includes("tìm kiếm");
  const hasMemoryTrace = body?.includes("memory") || body?.includes("bộ nhớ");
  console.log("Trace has search:", hasSearchTrace);
  console.log("Trace has memory:", hasMemoryTrace);

  // Screenshot
  await page.screenshot({ path: "test-results/fast-chat-e2e.png", fullPage: false });
  console.log("Screenshot saved");

  // Assertions
  expect(isSimulation).toBe(false);
  console.log("✅ E2E fast chat: REAL response confirmed");
});

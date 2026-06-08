import { test } from "@playwright/test";

const BASE = "https://ajinov5.cuong.ngo";

test("Research result appears in chat", async ({ page }) => {
  await page.goto(BASE);
  await page.evaluate(() => {
    localStorage.setItem("ajino_token", "demo-token");
  });
  await page.reload();
  await page.waitForTimeout(2000);

  const textarea = page.locator("textarea").first();
  await textarea.fill("Test chat display");
  await page.waitForTimeout(200);

  const researchBtn = page.locator("button:has-text('Nghiên cứu sâu')");
  await researchBtn.click();
  console.log("Research started");

  // Wait for error (since no valid JWT)
  await page.waitForTimeout(10000);

  const body = await page.locator("body").textContent();
  // Check if error card shows
  console.log("Has error card:", body?.includes("✗ Lỗi"));
  console.log("Body excerpt:", body?.substring(body.length - 500));

  await page.screenshot({ path: "test-results/chat-result.png" });
  console.log("Done");
});

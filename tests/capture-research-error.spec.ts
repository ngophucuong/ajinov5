/**
 * Quick error test — captures the exact error from Deep Research
 */
import { test } from "@playwright/test";

const BASE = "https://ajinov5.cuong.ngo";

test("Capture Deep Research error for Cloudflare debug", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto(BASE);
  await page.evaluate(() => {
    localStorage.setItem("ajino_token", "demo-token");
  });
  await page.reload();
  await page.waitForTimeout(2000);

  // Type topic
  const textarea = page.locator("textarea").first();
  await textarea.fill("Phân tích thị trường logistics Q3/2026");
  await page.waitForTimeout(300);

  // Click research button
  const researchBtn = page.locator("button:has-text('Nghiên cứu sâu')");
  await researchBtn.click();
  console.log("Research button clicked");

  // Wait for error to appear
  await page.waitForTimeout(15000);

  const body = await page.locator("body").textContent();
  console.log("=== PAGE CONTENT (error area) ===");
  console.log(body?.substring(0, 3000));

  // Capture screenshot
  await page.screenshot({ path: "test-results/research-error.png", fullPage: false });
  console.log("Screenshot saved to test-results/research-error.png");
  console.log("=== Console errors ===");
  console.log(errors);

  // Keep browser open for user to see
  await page.waitForTimeout(60000);
});

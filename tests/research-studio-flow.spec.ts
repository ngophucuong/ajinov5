/**
 * Deep Research → Studio flow test
 */
import { test, expect } from "@playwright/test";

const BASE = "https://ajinov5.cuong.ngo";

test.describe("Deep Research → Studio E2E", () => {
  test("Research completes then Studio shows document", async ({ page }) => {
    // Bypass auth
    await page.goto(BASE);
    await page.evaluate(() => {
      localStorage.setItem("ajino_token", "demo-token");
    });
    await page.reload();
    await page.waitForTimeout(2000);

    console.log("1. Chat UI loaded");

    // Type a research topic
    const textarea = page.locator("textarea").first();
    await textarea.fill("Test Studio Integration");
    await page.waitForTimeout(300);

    // Click Deep Research button
    const researchBtn = page.locator("button:has-text('Nghiên cứu sâu')");
    await researchBtn.click();
    console.log("2. Research started");

    // Wait for research to complete (simulation takes ~8s)
    await page.waitForTimeout(12000);

    const body = await page.locator("body").textContent();
    console.log("Has 'Hoàn thành':", body?.includes("Hoàn thành"));
    console.log("Has 'Xem trong Studio':", body?.includes("Xem trong Studio"));

    // Click "Xem trong Studio"
    const studioBtn = page.locator("button:has-text('Xem trong Studio')");
    if (await studioBtn.isVisible()) {
      await studioBtn.click();
      console.log("3. Clicked 'Xem trong Studio'");
    } else {
      console.log("3. FAILED: 'Xem trong Studio' button not visible!");
    }

    await page.waitForTimeout(3000);

    // Check Studio page
    const studioBody = await page.locator("body").textContent();
    console.log("URL:", page.url());
    console.log("Has 'Studio':", studioBody?.includes("Studio"));
    console.log("Has 'Nghiên cứu':", studioBody?.includes("Nghiên cứu"));
    console.log("Has 'Tài liệu':", studioBody?.includes("Tài liệu"));
    console.log("Has 'Upload':", studioBody?.includes("Upload"));

    // Check for document list
    const docItems = page.locator("text=Nghiên cứu");
    const count = await docItems.count();
    console.log(`Documents with 'Nghiên cứu': ${count}`);

    // Take screenshot for debugging
    await page.screenshot({ path: "test-results/studio-debug.png", fullPage: true });
    console.log("Screenshot saved to test-results/studio-debug.png");
  });
});

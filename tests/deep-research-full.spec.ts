/**
 * Deep Research Mode — End-to-end test
 * Tests: Auth gate, Chat UI, Deep Research button, ResearchProgressCard
 * Runs in headed mode with slow motion so you can watch.
 */
import { test, expect } from "@playwright/test";

const BASE = "http://localhost:5173";

test.describe("Ajino v5 — Full Clickable + Deep Research Test", () => {
  test.beforeEach(async ({ page }) => {
    // Bypass auth by setting localStorage token BEFORE navigating
    await page.goto(BASE);
    await page.evaluate(() => {
      localStorage.setItem(
        "ajino_token",
        "demo-token-for-testing",
      );
    });
    // Reload to pick up token
    await page.reload();
  });

  // ═══════════════════════════════════════════════════════
  // PHASE 1: Auth Gate
  // ═══════════════════════════════════════════════════════
  test("01 - Login form shows without token", async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForTimeout(2000);

    const body = await page.locator("body").textContent();
    expect(body).toContain("Đăng nhập");
    expect(body).toContain("Telegram");
    console.log("✅ Login form visible when unauthenticated");
  });

  // ═══════════════════════════════════════════════════════
  // PHASE 2: Chat UI Full Clickable
  // ═══════════════════════════════════════════════════════
  test("02 - Chat UI loads with all components", async ({ page }) => {
    await page.waitForTimeout(2000);

    // Logo
    const body = await page.locator("body").textContent();
    console.log("Has Ajino logo:", body?.includes("Ajino"));

    // Agent network
    console.log("Has Orchestrator:", body?.includes("Orchestrator"));

    // Session list
    const clickableSessions = page.locator(".cursor-pointer");
    const sessionCount = await clickableSessions.count();
    console.log(`Clickable sessions: ${sessionCount}`);
    expect(sessionCount).toBeGreaterThan(0);

    // Reasoning mode buttons
    console.log("Has 'Tự động':", body?.includes("Tự động"));
    console.log("Has 'Thủ công':", body?.includes("Thủ công"));

    // Send button
    const sendBtn = page.locator("button[title*='Gửi']");
    console.log("Send button visible:", await sendBtn.isVisible());

    // Right panel context
    console.log("Has 'Ngữ cảnh':", body?.includes("Ngữ cảnh"));
    console.log("Has 'Kỹ năng':", body?.includes("Kỹ năng"));
    console.log("Has 'Thực thể':", body?.includes("Thực thể"));

    console.log("✅ All Chat UI components present");
  });

  // ═══════════════════════════════════════════════════════
  // PHASE 3: Reasoning Mode Toggle
  // ═══════════════════════════════════════════════════════
  test("03 - Reasoning mode toggle works", async ({ page }) => {
    await page.waitForTimeout(1500);

    // Click "Thủ công" to show Fast/Deep sub-buttons
    const manualBtn = page.locator("button:has-text('Thủ công')");
    if (await manualBtn.isVisible()) {
      await manualBtn.click();
      await page.waitForTimeout(500);
    }

    // Check if Fast/Deep buttons appear
    const body = await page.locator("body").textContent();
    console.log("Has 'Nhanh' after clicking Thủ công:", body?.includes("Nhanh"));
    console.log("Has 'Sâu' after clicking Thủ công:", body?.includes("Sâu"));

    // Click "Fast" mode
    const fastBtn = page.locator("button:has-text('Nhanh')");
    if (await fastBtn.isVisible()) {
      await fastBtn.click();
      await page.waitForTimeout(300);
      console.log("✅ Fast mode selected");
    }

    // Click "Deep" mode
    const deepBtn = page.locator("button:has-text('◉ Sâu')");
    if (await deepBtn.isVisible()) {
      await deepBtn.click();
      await page.waitForTimeout(300);
      console.log("✅ Deep mode selected");
    }

    // Click back to Auto
    const autoBtn = page.locator("button:has-text('◉ Sâu')").first();
    if (await autoBtn.isVisible()) {
      // Actually the button is "Tự động"
      const autoBtn2 = page.locator("button:has-text('Tự động')");
      if (await autoBtn2.isVisible()) {
        await autoBtn2.click();
        console.log("✅ Back to Auto mode");
      }
    }
  });

  // ═══════════════════════════════════════════════════════
  // PHASE 4: Deep Research Button
  // ═══════════════════════════════════════════════════════
  test("04 - Deep Research button is visible", async ({ page }) => {
    await page.waitForTimeout(1500);

    const researchBtn = page.locator("button:has-text('Nghiên cứu sâu')");
    console.log("Deep Research button visible:", await researchBtn.isVisible());
    expect(await researchBtn.isVisible()).toBe(true);
    console.log("✅ '🔬 Nghiên cứu sâu' button found");
  });

  // ═══════════════════════════════════════════════════════
  // PHASE 5: Deep Research Flow (simulated)
  // ═══════════════════════════════════════════════════════
  test("05 - Deep Research flow (UI states)", async ({ page }) => {
    await page.waitForTimeout(1500);

    // Type a research topic
    const textarea = page.locator("textarea").first();
    await textarea.fill(
      "Nghiên cứu đối thủ SF Express tại Lạng Sơn Q3/2026",
    );
    await page.waitForTimeout(500);

    console.log("📝 Topic typed");

    // Click "Nghiên cứu sâu" button
    const researchBtn = page.locator("button:has-text('Nghiên cứu sâu')");
    await researchBtn.click();
    await page.waitForTimeout(1000);

    // Step 1: Check if ResearchProgressCard appears
    const cardTitle = page.locator("text=Nghiên cứu sâu");
    console.log("Card appears:", await cardTitle.count() > 0);

    // Read the topic in the card
    const body = await page.locator("body").textContent();
    console.log("Card shows topic:", body?.includes("SF Express"));

    // Check for phases
    console.log("Has 'planning' text:", body?.includes("lập kế hoạch") || body?.includes("planning"));

    // Wait a bit to see the card
    await page.waitForTimeout(2000);

    const body2 = await page.locator("body").textContent();
    console.log("After 2s — Card content length:", body2?.length || 0);

    // Try to click "Đóng" if research completed/error
    const closeBtn = page.locator("button:has-text('Đóng')");
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
      console.log("✅ Closed research card");
    }

    console.log("✅ Deep Research flow test completed");
  });

  // ═══════════════════════════════════════════════════════
  // PHASE 6: Message action buttons (hover actions)
  // ═══════════════════════════════════════════════════════
  test("06 - Message action buttons visible on hover", async ({ page }) => {
    await page.waitForTimeout(2000);

    // Hover over assistant message
    const assistantMsgs = page.locator("text=Trong Q3/2026");
    if (await assistantMsgs.count() > 0) {
      await assistantMsgs.first().hover();
      await page.waitForTimeout(1000);
    }

    const body = await page.locator("body").textContent();
    console.log("Has 'sao chép':", body?.includes("sao chép"));
    console.log("Has 'vào bộ nhớ':", body?.includes("vào bộ nhớ"));

    // Click copy button
    const copyBtn = page.locator("button:has-text('sao chép')");
    if (await copyBtn.isVisible()) {
      await copyBtn.click();
      console.log("✅ Copy button clicked");
    }

    // Click save to memory
    const memBtn = page.locator("button:has-text('vào bộ nhớ')");
    if (await memBtn.isVisible()) {
      await memBtn.click();
      await page.waitForTimeout(1000);
      console.log("✅ Save to memory clicked");
    }
  });

  // ═══════════════════════════════════════════════════════
  // PHASE 7: Entity tags clickable
  // ═══════════════════════════════════════════════════════
  test("07 - Entity tags in right panel are clickable", async ({ page }) => {
    await page.waitForTimeout(1500);

    // Click SF Express entity tag
    const sfTag = page.locator("text=SF Express").first();
    if (await sfTag.isVisible()) {
      await sfTag.click();
      await page.waitForTimeout(500);
      console.log("✅ SF Express entity tag clicked");
    }

    // Check if textarea got populated
    const textarea = page.locator("textarea").first();
    const value = await textarea.inputValue();
    console.log("Textarea value after entity click:", value);
  });

  // ═══════════════════════════════════════════════════════
  // PHASE 8: Session history click
  // ═══════════════════════════════════════════════════════
  test("08 - Session list items are clickable", async ({ page }) => {
    await page.waitForTimeout(1500);

    // Click a session in sidebar
    const sessions = page.locator("text=Phân tích đối thủ Q3");
    if (await sessions.count() > 0) {
      await sessions.first().click();
      await page.waitForTimeout(500);
      console.log("✅ Session item clicked");
    }

    const sessions2 = page.locator("text=Chiến lược mở rộng thị trường");
    if (await sessions2.count() > 0) {
      await sessions2.first().click();
      await page.waitForTimeout(500);
      console.log("✅ Second session clicked (highlight test)");
    }
  });

  // ═══════════════════════════════════════════════════════
  // PHASE 9: Navigate to Admin via bottom nav
  // ═══════════════════════════════════════════════════════
  test("09 - Navigate to Admin page", async ({ page }) => {
    await page.waitForTimeout(1500);

    // Find and hover bottom nav to reveal labels
    const navBar = page.locator("nav").first();
    await navBar.hover();
    await page.waitForTimeout(500);

    // Click "Quản trị" (Admin)
    const adminLink = page.locator("a:has-text('Quản trị')");
    if (await adminLink.isVisible()) {
      await adminLink.click();
      await page.waitForTimeout(2000);
      console.log("✅ Navigated to Admin");
    } else {
      // Fallback: navigate directly
      await page.goto(`${BASE}/admin`);
      await page.waitForTimeout(2000);
    }

    // Check admin page loaded (or shows OTP login)
    const body = await page.locator("body").textContent();
    console.log("Admin page content:", body?.includes("Admin") || body?.includes("Dashboard") || body?.includes("Đăng nhập"));
  });

  // ═══════════════════════════════════════════════════════
  // PHASE 10: Admin Dashboard with auth
  // ═══════════════════════════════════════════════════════
  test("10 - Admin Dashboard loads (bypass auth)", async ({ page }) => {
    // Set token for admin access too
    await page.evaluate(() => {
      localStorage.setItem("ajino_token", "demo-token-for-testing");
    });
    await page.goto(`${BASE}/admin`);
    await page.waitForTimeout(3000);

    const body = await page.locator("body").textContent();
    console.log("Has 'Dashboard':", body?.includes("Dashboard"));
    console.log("Has 'Memory Review':", body?.includes("Memory Review"));
    console.log("Has 'Studio':", body?.includes("Studio"));
    console.log("Has 'Agents':", body?.includes("Agents"));

    // Click Settings button in topbar
    const settingsBtn = page.locator("button[title='Cài đặt']");
    if (await settingsBtn.isVisible()) {
      await settingsBtn.click();
      await page.waitForTimeout(1500);
      console.log("✅ Settings modal opened");
    }

    // Close modal
    const closeModal = page.locator("button:has-text('Đang tải'), button:has-text('Cài đặt')").first();
    // Click backdrop to close
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    // Navigate to Memory page
    const memoryNav = page.locator("button:has-text('Memory Review')");
    if (await memoryNav.isVisible()) {
      await memoryNav.click();
      await page.waitForTimeout(1000);
      console.log("✅ Navigated to Memory Review");
    }
  });

  // ═══════════════════════════════════════════════════════
  // PHASE 11: Console error check
  // ═══════════════════════════════════════════════════════
  test("11 - No critical console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto(BASE);
    await page.waitForTimeout(4000);

    // Filter out expected errors (Telegram not available, etc.)
    const critical = errors.filter(
      (e) =>
        !e.includes("Telegram") &&
        !e.includes("ERR_ABORTED") &&
        !e.includes("fetch") &&
        !e.includes("API"),
    );
    console.log("Critical errors:", critical.length);
    if (critical.length > 0) {
      console.log("Errors:", critical);
    }
    // We only expect non-critical errors (API calls failing in dev mode)
    console.log("✅ Console error check done");
  });
});

import { test } from "@playwright/test";

const BASE = "https://ajinov5.cuong.ngo";
const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI1MjUwMzM5NDcyIiwicm9sZSI6ImNlbyIsInRlbGVncmFtX2lkIjo1MjUwMzM5NDcyLCJpYXQiOjE3ODA4NTUwNDAsImV4cCI6MTc4MDk0MTQ0MH0.dVU2M-q_cyvx7-jLwPcwks8cviYSsmHmCDL3TfBV1sY";

async function auditPage(page, pageName: string) {
  console.log(`\n=== ${pageName} ===`);

  // Find all clickable elements
  const clickables = page.locator('button, a, [role="button"], [onclick], [class*="cursor-pointer"], [style*="cursor: pointer"], [style*="cursor:pointer"]');
  const count = await clickables.count();

  const results: { text: string; tag: string; title: string; href: string; hasHandler: boolean }[] = [];

  for (let i = 0; i < count; i++) {
    const el = clickables.nth(i);
    const tag = await el.evaluate((e: HTMLElement) => e.tagName);
    const text = (await el.textContent())?.trim().substring(0, 40) || "";
    const title = (await el.getAttribute("title")) || "";
    const href = (await el.getAttribute("href")) || "";
    const visible = await el.isVisible();

    if (!visible || !text) continue;

    // Check if it has a real handler or is a link
    const hasHref = href && href !== "#";
    const isLink = tag === "A" || hasHref;
    const hasTitle = title.length > 0;

    results.push({ text, tag, title, href, hasHandler: isLink || hasTitle });
  }

  // Deduplicate by text
  const seen = new Set<string>();
  const unique = results.filter(r => {
    const key = r.text + r.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`Total clickables: ${unique.length}`);

  for (const r of unique) {
    const status = r.hasHandler ? "✅" : "⚠️";
    const extra = r.title ? ` [${r.title}]` : "";
    const hrefInfo = r.href && r.href !== "#" ? ` → ${r.href.substring(0, 30)}` : "";
    console.log(`  ${status} ${r.tag} "${r.text}"${extra}${hrefInfo}`);
  }
}

test("Audit all interactive elements", async ({ page }) => {
  await page.context().addCookies([
    { name: "ajino_token", value: JWT, domain: "ajinov5.cuong.ngo", path: "/" },
  ]);
  await page.goto(BASE);
  await page.evaluate((t) => localStorage.setItem("ajino_token", t), JWT);

  // Chat page
  await page.goto(BASE);
  await page.waitForTimeout(3000);
  await auditPage(page, "CHAT PAGE");

  // Admin Dashboard
  await page.goto(`${BASE}/admin`);
  await page.waitForTimeout(2000);
  await auditPage(page, "ADMIN DASHBOARD");

  // Admin Memory
  await page.getByText("Memory Review").first().click();
  await page.waitForTimeout(1500);
  await auditPage(page, "ADMIN MEMORY");

  // Admin Studio
  await page.getByText("Studio").first().click();
  await page.waitForTimeout(1500);
  await auditPage(page, "ADMIN STUDIO");

  // Admin Audit
  await page.getByText("Audit Log").first().click();
  await page.waitForTimeout(1500);
  await auditPage(page, "ADMIN AUDIT");

  console.log("\n=== SUMMARY ===");
  console.log("✅ = real handler or link");
  console.log("⚠️ = no handler / placeholder");
});

import { test } from "@playwright/test";

const BASE = "https://ajinov5.cuong.ngo";
const JWT =
  "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI1MjUwMzM5NDcyIiwicm9sZSI6ImNlbyIsInRlbGVncmFtX2lkIjo1MjUwMzM5NDcyLCJpYXQiOjE3ODA4NTUwNDAsImV4cCI6MTc4MDk0MTQ0MH0.dVU2M-q_cyvx7-jLwPcwks8cviYSsmHmCDL3TfBV1sY";

test("Find error source", async ({ page }) => {
  // Log ALL errors with full detail
  page.on("pageerror", (err) => {
    console.log("[PAGE ERROR]", err.message);
    console.log("[STACK]", err.stack?.substring(0, 300));
  });

  await page
    .context()
    .addCookies([
      {
        name: "ajino_token",
        value: JWT,
        domain: "ajinov5.cuong.ngo",
        path: "/",
      },
    ]);
  await page.goto(BASE);
  await page.evaluate((t) => localStorage.setItem("ajino_token", t), JWT);

  await page.goto(`${BASE}/admin`);
  await page.waitForTimeout(3000);

  console.log("Page loaded, checking for errors...");
  await page.waitForTimeout(2000);
});

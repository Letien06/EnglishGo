import { expect, test } from "@playwright/test";

test("protected app routes redirect anonymous users to login", async ({ page }) => {
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login\?from=%2Faccount/);
});

test("login page renders on a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await expect(page.locator("body")).toBeVisible();
});

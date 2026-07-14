import { expect, test } from "@playwright/test";

test("anonymous visitors see the public TOEIC landing page", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Luyện TOEIC hiệu quả/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Bắt đầu luyện tập/i })).toBeVisible();
});

test("protected app routes redirect anonymous users to login", async ({ page }) => {
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login\?from=%2Faccount/);
});

test("login page renders on a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await expect(page.locator("body")).toBeVisible();
});

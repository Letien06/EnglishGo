import { expect, test } from "@playwright/test";

test("unknown URLs show a recoverable not-found page", async ({ page }) => {
  await page.goto("/this-route-does-not-exist");

  await expect(page.getByRole("heading", { name: /không tìm thấy trang này/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /về trang chủ/i })).toBeVisible();
});

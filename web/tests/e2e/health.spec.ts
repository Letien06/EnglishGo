import { expect, test } from "@playwright/test";

test("health endpoint returns the standard API envelope", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBe(true);
  await expect(response.json()).resolves.toMatchObject({
    success: true,
    data: { status: "up" },
    error: null,
  });
});

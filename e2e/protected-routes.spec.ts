import { expect, test } from "@playwright/test";

test.describe("Percorsi HR senza sessione", () => {
  test("recap operativo reindirizza al login", async ({ page }) => {
    await page.goto("/hr-recap");
    await page.waitForURL(/\/login/, { timeout: 25_000 });
    expect(page.url()).toMatch(/\/login/);
  });

  test("onboarding candidati reindirizza al login", async ({ page }) => {
    await page.goto("/recruiting/onboarding");
    await page.waitForURL(/\/login/, { timeout: 25_000 });
    expect(page.url()).toMatch(/\/login/);
  });
});

import { expect, test } from "@playwright/test";

test.describe("Accesso", () => {
  test("pagina login mostra hero e modale credenziali", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "NEXA HR" })).toBeVisible();
    await page.getByRole("button", { name: "LOGIN" }).click();
    await expect(page.locator("#nexa-login-title")).toBeVisible();
    await expect(page.locator("#nexa-email")).toBeVisible();
    await expect(page.locator("#nexa-password")).toBeVisible();
    await expect(page.getByRole("button", { name: "ENTRA" })).toBeVisible();
  });
});

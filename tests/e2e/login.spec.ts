import { expect, test } from "@playwright/test";

test("login shell is accessible in Indonesian", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      browserErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    browserErrors.push(error.message);
  });
  await page.route("**/auth/v1/**", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ message: "not authenticated" }),
    });
  });
  await page.goto("/login/mahasiswa");
  await expect(page.locator("html")).toHaveAttribute("lang", "id");
  await expect(
    page.getByRole("textbox", { name: /email/i }),
    `Browser errors: ${browserErrors.join(" | ") || "none"}`,
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel(/^password$/i)).toBeVisible();
});

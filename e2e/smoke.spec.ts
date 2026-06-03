import { test, expect, type Page } from '@playwright/test';

/** Electron / preview builds use HashRouter (`base: './'`). */
const route = (path: string) => (path.startsWith('/') ? `/#${path}` : `/#/${path}`);

/** Welcome tour mounts after AppData loads — dismiss whenever it appears. */
async function dismissWelcomeTour(page: Page) {
  const backdrop = page.locator('.welcome-tour__backdrop');
  const skip = page.getByRole('button', { name: /^skip$/i });
  for (let i = 0; i < 8; i += 1) {
    if (!(await backdrop.isVisible().catch(() => false))) return;
    await skip.click();
    await page.waitForTimeout(250);
  }
}

test('register → add todo → reload persists', async ({ page }) => {
  const email = `smoke-${Date.now()}@cadence.test`;
  const password = 'smoke-test-password-8';
  const todoTitle = `Smoke todo ${Date.now()}`;

  await page.goto(route('/register'));
  await page.getByPlaceholder('e.g. Jane Doe').fill('Smoke Tester');
  await page.getByLabel('Email').fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.locator('input[type="password"]').nth(1).fill(password);
  await page.getByRole('button', { name: /create account/i }).click();

  await expect(page).not.toHaveURL(/\/register/);
  await dismissWelcomeTour(page);

  await page.goto(route('/todos'));
  await dismissWelcomeTour(page);

  await page.getByRole('button', { name: /add task/i }).first().click();
  await page.getByPlaceholder('Task title').fill(todoTitle);
  await page.getByRole('button', { name: /^add$/i }).click();

  await expect(page.getByText(todoTitle)).toBeVisible();

  await page.reload();
  await expect(page.getByText(todoTitle)).toBeVisible({ timeout: 15_000 });
});

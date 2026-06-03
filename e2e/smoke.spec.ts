import { test, expect } from '@playwright/test';

test('register → add todo → reload persists', async ({ page }) => {
  const email = `smoke-${Date.now()}@cadence.test`;
  const password = 'smoke-test-password-8';
  const todoTitle = `Smoke todo ${Date.now()}`;

  await page.goto('/register');
  await page.getByPlaceholder('e.g. Jane Doe').fill('Smoke Tester');
  await page.getByLabel('Email').fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.locator('input[type="password"]').nth(1).fill(password);
  await page.getByRole('button', { name: /create account/i }).click();

  await expect(page).not.toHaveURL(/\/register/);

  await page.goto('/todos');
  await page.getByRole('button', { name: /add task/i }).first().click();
  await page.getByPlaceholder('Task title').fill(todoTitle);
  await page.getByRole('button', { name: /^add$/i }).click();

  await expect(page.getByText(todoTitle)).toBeVisible();

  await page.reload();
  await expect(page.getByText(todoTitle)).toBeVisible({ timeout: 15_000 });
});

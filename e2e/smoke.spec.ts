import { test, expect } from '@playwright/test';
import { completeOnboarding, registerSmokeUser, route } from './helpers';

test('register → add todo → reload persists', async ({ page }) => {
  const todoTitle = `Smoke todo ${Date.now()}`;

  await registerSmokeUser(page);

  await page.goto(route('/todos'));
  await completeOnboarding(page);

  await page.getByRole('button', { name: /add task/i }).first().click();
  await page.getByPlaceholder('Task title').fill(todoTitle);
  await page.getByRole('button', { name: /^add$/i }).click();

  await expect(page.getByText(todoTitle)).toBeVisible();

  await page.reload();
  await completeOnboarding(page);
  await expect(page.getByText(todoTitle)).toBeVisible({ timeout: 15_000 });
});

test('register → team profile title survives reload', async ({ page }) => {
  const titleLine = `Role smoke ${Date.now()}`;

  await registerSmokeUser(page);

  await page.goto(route('/'));
  await completeOnboarding(page);

  const teamHref = await page.getByRole('link', { name: /my first team/i }).first().getAttribute('href');
  const teamPath = (teamHref ?? '').replace(/^#/, '');
  await page.goto(route(`${teamPath}/me`));

  await page.getByPlaceholder('Role / note').fill(titleLine);
  await page.getByRole('button', { name: /^save$/i }).click();
  await page.waitForTimeout(1200);

  await page.reload();
  await completeOnboarding(page);
  await expect(page.getByPlaceholder('Role / note')).toHaveValue(titleLine, { timeout: 15_000 });
});

test('register → team scratchpad survives reload', async ({ page }) => {
  const scratchLine = `Scratch smoke ${Date.now()}`;

  await registerSmokeUser(page);

  await page.goto(route('/'));
  await completeOnboarding(page);

  const teamHref = await page.getByRole('link', { name: /my first team/i }).first().getAttribute('href');
  const teamPath = (teamHref ?? '').replace(/^#/, '');
  await page.goto(route(`${teamPath}/me`));

  const scratchpad = page.locator('.md-editor__textarea').first();
  await expect(scratchpad).toBeVisible({ timeout: 15_000 });
  await scratchpad.fill(scratchLine);
  await expect(scratchpad).toHaveValue(scratchLine);
  await page.getByRole('button', { name: /save note/i }).click();
  await page.waitForTimeout(1200);

  await page.reload();
  await completeOnboarding(page);
  await expect(page.locator('.md-editor__textarea').first()).toHaveValue(scratchLine, { timeout: 15_000 });
});

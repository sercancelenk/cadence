import { test, expect } from '@playwright/test';
import { completeOnboarding, registerSmokeUser, route } from './helpers';

test('register → add todo → reload persists', async ({ page }) => {
  const todoTitle = `Smoke todo ${Date.now()}`;

  await registerSmokeUser(page);

  await page.goto(route('/todos'));
  await completeOnboarding(page);

  await page.getByRole('button', { name: /add task to/i }).first().click();
  const addForm = page.getByRole('form', { name: 'New task' });
  await addForm.getByPlaceholder('Task title').fill(todoTitle);
  await addForm.getByRole('button', { name: /^add task$/i }).first().click();

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
  await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible({ timeout: 15_000 });

  const profileCard = page.locator('.card').filter({ has: page.getByRole('heading', { name: 'Profile' }) });
  await profileCard.getByRole('button', { name: /^edit$/i }).click();

  const profileForm = page.locator('form.row').filter({ has: page.getByPlaceholder('Role / title') });
  const roleInput = profileForm.getByPlaceholder('Role / title');
  await roleInput.click();
  await roleInput.pressSequentially(titleLine, { delay: 20 });
  await expect(roleInput).toHaveValue(titleLine);
  await profileForm.getByRole('button', { name: /^save$/i }).click();

  // Collapsed summary reads `person.title` from AppData — proves the write landed in memory.
  await expect(profileForm).toBeHidden({ timeout: 5_000 });
  await expect(profileCard).toContainText(titleLine);
  // AppData debounces disk writes (~400ms); give it a beat before reload.
  await page.waitForTimeout(1200);

  await page.reload();
  await completeOnboarding(page);
  await expect(
    page.locator('.card').filter({ has: page.getByRole('heading', { name: 'Profile' }) }),
  ).toContainText(titleLine, { timeout: 15_000 });
});

test('register → team scratchpad survives reload', async ({ page }) => {
  const scratchLine = `Scratch smoke ${Date.now()}`;

  await registerSmokeUser(page);

  await page.goto(route('/'));
  await completeOnboarding(page);

  const teamHref = await page.getByRole('link', { name: /my first team/i }).first().getAttribute('href');
  const teamPath = (teamHref ?? '').replace(/^#/, '');
  await page.goto(route(`${teamPath}/me`));
  await expect(page.getByRole('heading', { name: 'Scratchpad' })).toBeVisible({ timeout: 15_000 });

  const scratchCard = page.locator('.person-scratchpad');
  await scratchCard.getByRole('button', { name: /^expand$/i }).click();

  const scratchpad = scratchCard.locator('.md-editor__textarea').first();
  await expect(scratchpad).toBeVisible({ timeout: 15_000 });
  await scratchpad.click();
  await scratchpad.pressSequentially(scratchLine, { delay: 15 });
  await expect(scratchpad).toHaveValue(scratchLine);

  // PersonWorkspace autosaves dirty scratchpad after 800ms; wait past that + AppData debounce.
  await page.waitForTimeout(2000);

  await page.reload();
  await completeOnboarding(page);
  await expect(page.locator('.person-scratchpad .md-editor__textarea').first()).toHaveValue(scratchLine, {
    timeout: 15_000,
  });
});

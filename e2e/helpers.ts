import { expect, type Page } from '@playwright/test';

/** Electron / preview builds use HashRouter (`base: './'`). */
export const route = (path: string) => (path.startsWith('/') ? `/#${path}` : `/#/${path}`);

/**
 * Walk through the welcome tour: profile preset, recovery codes (if shown),
 * remaining cards, then dismiss. Safe to call when no tour is visible.
 */
export async function completeOnboarding(page: Page) {
  const backdrop = page.locator('.welcome-tour__backdrop');

  for (let i = 0; i < 12; i += 1) {
    if (!(await backdrop.isVisible().catch(() => false))) return;

    const personal = page.getByRole('button', { name: /^Personal\b/ });
    if (await personal.isVisible().catch(() => false)) {
      await personal.click();
    }

    const recoveryCheckbox = page.getByRole('checkbox', { name: /saved these codes/i });
    if (await recoveryCheckbox.isVisible().catch(() => false)) {
      await recoveryCheckbox.check();
    }

    const getStarted = page.getByRole('button', { name: /get started/i });
    if ((await getStarted.isVisible().catch(() => false)) && (await getStarted.isEnabled())) {
      await getStarted.click();
      await page.waitForTimeout(200);
      continue;
    }

    const skip = page.getByRole('button', { name: /^skip$/i });
    if (await skip.isVisible().catch(() => false)) {
      await skip.click();
      await page.waitForTimeout(200);
      continue;
    }

    const next = page.getByRole('button', { name: /^(next|i saved them)/i });
    if ((await next.isVisible().catch(() => false)) && (await next.isEnabled())) {
      await next.click();
      await page.waitForTimeout(200);
      continue;
    }

    await page.waitForTimeout(250);
  }

  await expect(backdrop).toBeHidden({ timeout: 10_000 });
}

export async function waitForWorkspacePersist(page: Page, needle: string) {
  // AppData debounces saves (400 ms); poll workspace keys after that window.
  await page.waitForTimeout(600);
  await page.waitForFunction(
    (text) => {
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i)!;
        if (!key.includes('-data-')) continue;
        const raw = localStorage.getItem(key);
        if (raw?.includes(text)) return true;
      }
      return false;
    },
    needle,
    { timeout: 15_000 },
  );
}

/** Fill a React-controlled textarea via real key events (DOM setter tricks miss useState). */
export async function fillControlledTextarea(page: Page, locator: ReturnType<Page['locator']>, text: string) {
  await locator.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Backspace');
  await locator.pressSequentially(text, { delay: 10 });
}

export async function registerSmokeUser(page: Page, opts?: { name?: string; password?: string }) {
  const email = `smoke-${Date.now()}@cadence.test`;
  const password = opts?.password ?? 'smoke-test-password-8';
  const name = opts?.name ?? 'Smoke Tester';

  await page.goto(route('/register'));
  await expect(page.getByRole('heading', { name: /create account/i })).toBeVisible({ timeout: 30_000 });

  await page.getByPlaceholder('e.g. Jane Doe').fill(name);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.locator('input[type="password"]').nth(1).fill(password);
  await page.getByRole('button', { name: /create account/i }).click();

  await expect(page).not.toHaveURL(/\/register/, { timeout: 30_000 });
  await completeOnboarding(page);

  return { email, password, name };
}

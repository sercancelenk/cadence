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
  // AppData debounces saves (400 ms); poll after that window.
  // Match any localStorage value containing the needle — key naming has
  // changed across renames (`cadence-data-*`), and filtering too tightly
  // produced false negatives while the in-memory workspace was already correct.
  await page.waitForTimeout(600);
  await page.waitForFunction(
    (text) => {
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (!key) continue;
        const raw = localStorage.getItem(key);
        if (raw?.includes(text)) return true;
      }
      for (let i = 0; i < sessionStorage.length; i += 1) {
        const key = sessionStorage.key(i);
        if (!key) continue;
        const raw = sessionStorage.getItem(key);
        if (raw?.includes(text)) return true;
      }
      return false;
    },
    needle,
    { timeout: 15_000 },
  );
}

/** Fill a React-controlled textarea so parent onChange / dirty flags update. */
export async function fillControlledTextarea(page: Page, locator: ReturnType<Page['locator']>, text: string) {
  await locator.click();
  await locator.evaluate((el, value) => {
    if (!(el instanceof HTMLTextAreaElement)) {
      throw new Error('fillControlledTextarea expects an HTMLTextAreaElement');
    }
    const tracker = (
      el as HTMLTextAreaElement & { _valueTracker?: { setValue: (v: string) => void } }
    )._valueTracker;
    tracker?.setValue('');
    const proto = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
    proto?.set?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, text);
  void page;
}

/**
 * Type into a TipTap / ProseMirror surface so RichTextEditor onChange fires.
 * Prefer insertText over fill — TipTap's controlled sync is more reliable this way.
 */
export async function fillProseMirror(page: Page, locator: ReturnType<Page['locator']>, text: string) {
  await locator.click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await page.keyboard.insertText(text);
}

/**
 * Fill a React-controlled `<input>` so `onChange` fires and dirty flags update.
 * Resets React's value tracker first — otherwise React ignores the synthetic
 * `input` event when the DOM value already matches what it last wrote.
 */
export async function fillControlledInput(locator: ReturnType<Page['locator']>, text: string) {
  await locator.evaluate((el, value) => {
    if (!(el instanceof HTMLInputElement)) {
      throw new Error('fillControlledInput expects an HTMLInputElement');
    }
    const tracker = (
      el as HTMLInputElement & { _valueTracker?: { setValue: (v: string) => void } }
    )._valueTracker;
    tracker?.setValue('');
    const proto = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
    proto?.set?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, text);
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

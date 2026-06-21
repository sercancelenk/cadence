import { test, expect, type Page } from '@playwright/test';
import { completeOnboarding, registerSmokeUser, route } from './helpers';

/**
 * Visits every top-level menu / route and asserts the page mounts WITHOUT a
 * runtime crash: no uncaught exception, no React "Maximum update depth" loop,
 * and no route ErrorBoundary fallback ("Something went wrong"). This is the
 * regression guard for the kind of bug that slipped through on
 * /teams/:id/people ("Manage members") — an infinite render loop.
 */

type ErrorSink = { pageErrors: string[]; consoleErrors: string[] };

function attachErrorSink(page: Page): ErrorSink {
  const sink: ErrorSink = { pageErrors: [], consoleErrors: [] };
  page.on('pageerror', (err) => sink.pageErrors.push(String(err?.message ?? err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') sink.consoleErrors.push(msg.text());
  });
  return sink;
}

async function assertHealthy(page: Page, sink: ErrorSink, where: string) {
  // Route ErrorBoundary fallback must never be on screen.
  await expect(
    page.getByRole('heading', { name: /something went wrong/i }),
    `ErrorBoundary fallback rendered on ${where}`,
  ).toBeHidden();

  const loopError = [...sink.pageErrors, ...sink.consoleErrors].find((m) =>
    /maximum update depth exceeded/i.test(m),
  );
  expect(loopError, `Infinite render loop on ${where}: ${loopError ?? ''}`).toBeUndefined();

  expect(sink.pageErrors, `Uncaught exception on ${where}`).toEqual([]);
}

test('every menu / route mounts without a runtime crash', async ({ page }) => {
  test.setTimeout(180_000);
  const sink = attachErrorSink(page);

  await registerSmokeUser(page);

  await page.goto(route('/'));
  await completeOnboarding(page);
  await assertHealthy(page, sink, '/');

  const teamHref = await page
    .getByRole('link', { name: /my first team/i })
    .first()
    .getAttribute('href');
  const teamPath = (teamHref ?? '').replace(/^#/, '');
  expect(teamPath, 'could not resolve the default team path').toBeTruthy();

  const topLevel = [
    '/',
    '/todos',
    '/agenda',
    '/planning',
    '/notes',
    '/utilities/document',
    '/utilities/structured',
    '/analytics',
    '/analytics/activity',
    '/profile',
    '/guide',
    '/settings',
  ];

  for (const path of topLevel) {
    await page.goto(route(path));
    await completeOnboarding(page);
    await assertHealthy(page, sink, path);
  }

  // Team-scoped routes, including the one that crashed: "Manage members".
  const teamRoutes = [teamPath, `${teamPath}/me`, `${teamPath}/leader`, `${teamPath}/people`];
  for (const path of teamRoutes) {
    await page.goto(route(path));
    await completeOnboarding(page);
    await assertHealthy(page, sink, path);
  }

  // A specific person's workspace (PersonRoute). The default team ships with no
  // extra members, so add one first, then open its tile. `count()` returns
  // immediately (no auto-wait) so we never hang if the tile is missing.
  await page.goto(route(`${teamPath}/people`));
  await completeOnboarding(page);
  await page.getByPlaceholder('Name').fill('Routes Probe Person');
  await page.getByRole('button', { name: /^add$/i }).click();
  await expect(page.locator('.tile__link').first()).toBeVisible({ timeout: 10_000 });
  const personHref = await page.locator('.tile__link').first().getAttribute('href');
  if (personHref) {
    await page.goto(route(personHref.replace(/^#/, '')));
    await assertHealthy(page, sink, personHref);
  }
});

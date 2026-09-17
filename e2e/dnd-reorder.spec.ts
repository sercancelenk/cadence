import { test, expect } from '@playwright/test';
import { completeOnboarding, registerSmokeUser, route } from './helpers';

async function addTodo(page: import('@playwright/test').Page, title: string) {
  await page.getByRole('button', { name: /add task to/i }).first().click();
  const addForm = page.getByRole('form', { name: 'New task' });
  await addForm.getByPlaceholder('Task title').fill(title);
  await addForm.getByRole('button', { name: /^add task$/i }).first().click();
  await expect(page.getByText(title)).toBeVisible();
}

async function orderedTodoTitles(page: import('@playwright/test').Page, stamp: number) {
  const titles = await page.locator('.todos-row .todos-row__title').allTextContents();
  return titles.filter((t) => t.includes(`DnD-`) && t.includes(String(stamp)));
}

test('todos: drag handle reorders down and up under Manual sort', async ({ page }) => {
  await registerSmokeUser(page);
  await page.goto(route('/todos'));
  await completeOnboarding(page);

  const stamp = Date.now();
  const a = `DnD-A ${stamp}`;
  const b = `DnD-B ${stamp}`;
  await addTodo(page, a);
  await addTodo(page, b);
  // Newest prepended → [B, A]
  expect(await orderedTodoTitles(page, stamp)).toEqual([b, a]);

  const rowA = page.locator('.todos-row', { hasText: a });
  const rowB = page.locator('.todos-row', { hasText: b });

  // Move A UP onto B (top half) → [A, B]
  await rowA.locator('.todos-row__handle').dragTo(rowB, {
    targetPosition: { x: 40, y: 4 },
  });
  await expect.poll(() => orderedTodoTitles(page, stamp)).toEqual([a, b]);

  // Move A DOWN onto B (bottom half). Todo rows are tall — use the real
  // height so we don't land in the top half and no-op the classic "move down".
  const box = await rowB.boundingBox();
  if (!box) throw new Error('missing rowB box');
  await rowA.locator('.todos-row__handle').dragTo(rowB, {
    targetPosition: { x: 40, y: box.height - 4 },
  });
  await expect.poll(() => orderedTodoTitles(page, stamp)).toEqual([b, a]);
});

test('notes: drag handle reorders down and up (auto-switches to Manual)', async ({ page }) => {
  await registerSmokeUser(page);
  await page.goto(route('/notes'));
  await completeOnboarding(page);

  const stamp = Date.now();
  const a = `Note-A ${stamp}`;
  const b = `Note-B ${stamp}`;

  for (const title of [a, b]) {
    await page.getByRole('button', { name: /^new note$/i }).click();
    const editor = page.locator('.ProseMirror').first();
    await expect(editor).toBeVisible({ timeout: 10_000 });
    await editor.click();
    await page.keyboard.type(title);
    // The sidebar row carrying the typed title is the actual precondition for
    // the drag below. Waiting for it beats guessing at the editor debounce,
    // which is what a fixed timeout does — and gets slower and less reliable
    // at the same time on a loaded CI machine.
    await expect(page.locator('.notes-page__list-row', { hasText: title })).toBeVisible({
      timeout: 10_000,
    });
  }

  const rowA = page.locator('.notes-page__list-row', { hasText: a });
  const rowB = page.locator('.notes-page__list-row', { hasText: b });
  await expect(rowA).toBeVisible({ timeout: 10_000 });
  await expect(rowB).toBeVisible();

  const titles = () =>
    page
      .locator('.notes-page__list-title')
      .allTextContents()
      .then((all) => all.filter((t) => t.includes(String(stamp))).map((t) => t.trim()));

  const before = await titles();
  expect(before.length).toBe(2);

  // Drag whichever is second onto the first's bottom half → should swap.
  const second = before[1]!;
  const first = before[0]!;
  const rowSecond = page.locator('.notes-page__list-row', { hasText: second });
  const rowFirst = page.locator('.notes-page__list-row', { hasText: first });

  await rowSecond.locator('.notes-page__drag-handle').dragTo(rowFirst, {
    targetPosition: { x: 40, y: 4 },
  });
  await expect.poll(titles).toEqual([second, first]);

  // And back down onto the neighbour's bottom half. Measured, not assumed: a
  // hard-coded y lands in the top half as soon as the row grows (wrapped
  // title, larger font) and silently turns this into a no-op "move down" —
  // the exact bug the placement logic exists to fix.
  const firstRow = page.locator('.notes-page__list-row', { hasText: first });
  const firstBox = await firstRow.boundingBox();
  if (!firstBox) throw new Error('missing first note row box');
  await rowSecond.locator('.notes-page__drag-handle').dragTo(firstRow, {
    targetPosition: { x: 40, y: firstBox.height - 4 },
  });
  await expect.poll(titles).toEqual([first, second]);

  // Dragging under default sort must have flipped the dropdown to Manual.
  await expect(page.getByLabel(/sort notes by/i)).toHaveValue('manual');
});

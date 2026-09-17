/**
 * Note and todo rows participate in HTML5 drag-and-drop (the whole note row is
 * `draggable`; todo rows are the setDragImage source and the drop target).
 * `content-visibility: auto` turns on layout + paint containment, which in
 * Chromium/Electron silently breaks drag image generation and dragover
 * hit-testing — the grip looks live but drops do nothing.
 *
 * These tests pin that coupling so a future scroll-perf pass cannot reintroduce
 * the property on the DnD node itself. If you need off-screen skipping, put it
 * on an inner wrapper that is neither draggable nor a drop target.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function css(name: string): string {
  return readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8');
}

const notesCss = css('./notes.css');
const todosCss = css('./todos.css');

function ruleBody(sheet: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return sheet.match(new RegExp(`${escaped} \\{[^}]*\\}`))?.[0] ?? '';
}

describe('notes sidebar rows', () => {
  it('does not paint-contain the draggable row', () => {
    const rule = ruleBody(notesCss, '.notes-page__list-row');
    expect(rule).toContain('position: relative');
    expect(rule).not.toMatch(/content-visibility\s*:/);
  });

  it('keeps the drop indicator inside the row box for before and after', () => {
    const base = ruleBody(notesCss, '.notes-page__list-row--drop-target::after');
    expect(base).toContain('height: 2px');
    expect(notesCss).toMatch(/\.notes-page__list-row--drop-before::after/);
    expect(notesCss).toMatch(/\.notes-page__list-row--drop-after::after/);
    expect(base).not.toMatch(/bottom: -/);
  });
});

describe('todo rows', () => {
  it('does not paint-contain the drop-target row', () => {
    const rule = ruleBody(todosCss, '.todos-row');
    expect(rule.length).toBeGreaterThan(0);
    expect(rule).not.toMatch(/content-visibility\s*:/);
  });
});

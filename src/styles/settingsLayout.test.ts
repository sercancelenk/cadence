/**
 * Pins the layout couplings that made Settings unusable:
 * - outer <main> must not compete with the detail-body scroller
 * - mobile stacked grid must give the detail pane `minmax(0, 1fr)`
 * - `.page` padding must not stay at the reading-page 40/48 values
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function css(name: string): string {
  return readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8');
}

const sheet = css('./settings-structure.css');

describe('settings preferences shell layout', () => {
  it('makes main a non-scrolling flex column when the shell is mounted', () => {
    expect(sheet).toMatch(
      /\.main--scroll:has\(\.preferences-shell\)\s*\{[^}]*overflow:\s*hidden/s,
    );
    expect(sheet).toMatch(
      /\.main--scroll:has\(\.preferences-shell\)\s*\{[^}]*display:\s*flex/s,
    );
  });

  it('overrides reading-page padding on the fill-height shell', () => {
    const rule = sheet.match(/\.preferences-shell\.page\s*\{[^}]*\}/)?.[0] ?? '';
    expect(rule).toMatch(/padding:\s*12px 16px 16px/);
    expect(rule).not.toMatch(/40px/);
    expect(rule).toMatch(/overflow:\s*hidden/);
    expect(rule).toMatch(/flex:\s*1 1 0/);
  });

  it('keeps detail-body children from flex-shrinking (scroll vs clip)', () => {
    // Without flex-shrink: 0, open collapsible cards crush to ~2px inside the
    // flex scroller and overflow:hidden clips content with no vertical bar.
    expect(sheet).toMatch(
      /\.preferences-shell__detail-body\s*>\s*\*\s*\{[^}]*flex-shrink:\s*0/s,
    );
  });

  it('gives the mobile detail pane the remaining grid track', () => {
    expect(sheet).toMatch(
      /@media \(max-width: 860px\)[\s\S]*?grid-template-rows:\s*auto minmax\(0,\s*1fr\)/,
    );
  });

  it('uses a horizontal category chip row on narrow viewports', () => {
    expect(sheet).toMatch(
      /@media \(max-width: 860px\)[\s\S]*?\.preferences-shell__list\s*\{[^}]*flex-direction:\s*row/s,
    );
  });
});

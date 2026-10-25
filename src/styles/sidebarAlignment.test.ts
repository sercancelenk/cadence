import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const shell = readFileSync('src/styles/shell.css', 'utf8');
const rule = (selector: string) => {
  const at = shell.indexOf(`\n${selector} {`);
  return shell.slice(at, shell.indexOf('}', at));
};
const leftPadding = (block: string) => {
  const pad = block.match(/padding:\s*([^;]+);/)?.[1].trim().split(/\s+/) ?? [];
  // CSS shorthand: 1 value = all, 2 = vertical horizontal, 3 = top horizontal bottom, 4 = top right bottom left.
  const left = pad.length === 4 ? pad[3] : pad.length >= 2 ? pad[1] : pad[0];
  return left;
};

describe('sidebar alignment', () => {
  it('starts the logo row at the same left edge as the menu items', () => {
    expect(leftPadding(rule('.app-sidebar__brand'))).toBe(leftPadding(rule('.app-sidebar__link')));
  });
});

describe('AI mark on sidebar icons', () => {
  it('sits in the corner of the icon tile', () => {
    expect(rule('.app-sidebar__ai-mark')).toMatch(/position:\s*absolute/);
    expect(rule('.app-sidebar__ic')).toMatch(/position:\s*relative/);
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const TONES = ['amber', 'coral', 'orange', 'green', 'blue', 'pink', 'violet', 'teal', 'slate'];
const tokens = readFileSync('src/styles/tokens.css', 'utf8');
const shell = readFileSync('src/styles/shell.css', 'utf8');
const components = readFileSync('src/styles/components.css', 'utf8');
const home = readFileSync('src/styles/home.css', 'utf8');
const dark = tokens.slice(tokens.indexOf(':root {'), tokens.indexOf(":root[data-theme='light'] {"));
const light = tokens.slice(tokens.indexOf(":root[data-theme='light'] {"));

const channel = (v: number) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};
const read = (block: string, name: string) => block.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1];

describe('menu icon tones', () => {
  it.each(TONES)('%s is defined for both themes and stays visible against the sidebar (3:1)', (tone) => {
    const d = read(dark, `--tone-${tone}`);
    const l = read(light, `--tone-${tone}`);
    expect(d, `dark ${tone}`).toBeTruthy();
    expect(l, `light ${tone}`).toBeTruthy();
    expect(contrast(d!, '#141414')).toBeGreaterThanOrEqual(3);
    expect(contrast(l!, '#ffffff')).toBeGreaterThanOrEqual(3);
  });

  it('maps every tone once, for every place that shows one', () => {
    for (const tone of TONES) expect(components, tone).toContain(`[data-tone='${tone}'] {\n  --tone: var(--tone-${tone});`);
    expect(components).toMatch(/\[data-tone='ai'\]\s*\{[^}]*--tone:\s*var\(--ai-ic-b\)/);
  });

  it.each([
    ['sidebar', () => shell, '.app-sidebar__ic[data-tone]'],
    ['home tile', () => home, '.home-tile__ic[data-tone]'],
  ])('tints a soft tile behind the %s icon in its tone', (_name, css, selector) => {
    const rule = css().slice(css().indexOf(selector));
    expect(rule).toMatch(/color:\s*var\(--tone\)/);
    expect(rule).toMatch(/background:\s*color-mix\(in srgb, var\(--tone\)/);
  });
});

describe('AI mark colour', () => {
  const rgb = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    return { r: (n >> 16) & 255, b: n & 255 };
  };

  it.each([
    ['dark', dark, '#141414'],
    ['light', light, '#ffffff'],
  ])('is a cool colour, opposite the warm AI tile, and stays visible on the %s sidebar', (_name, block, bg) => {
    const mark = read(block, '--ai-mark');
    expect(mark).toBeTruthy();
    const { r, b } = rgb(mark!);
    expect(b).toBeGreaterThan(r + 40);
    expect(contrast(mark!, bg)).toBeGreaterThanOrEqual(3);
  });

  it('paints the sparkle in that one colour instead of the warm gradient, and is larger than before', () => {
    const rule = shell.slice(shell.indexOf('.app-sidebar__ai-mark .ui-ic'));
    expect(rule).toMatch(/width:\s*1[4-9]px/);
    const paint = shell.slice(shell.indexOf('.app-sidebar__ai-mark .ui-ic--ai'));
    expect(paint).toMatch(/stroke:\s*var\(--ai-mark\)/);
    expect(paint).toMatch(/fill:\s*var\(--ai-mark\)/);
  });
});

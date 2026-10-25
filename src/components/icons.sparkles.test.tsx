import { readFileSync } from 'node:fs';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { IcSparkles } from './icons';

describe('IcSparkles (the AI icon)', () => {
  afterEach(cleanup);

  it('draws its three sparkles with its own gradient, outlined and filled', () => {
    const { container } = render(<IcSparkles size={20} />);
    const svg = container.querySelector('svg')!;
    const gradient = svg.querySelector('linearGradient')!;
    expect(gradient.id).toBeTruthy();
    const paths = [...svg.querySelectorAll('path')];
    expect(paths).toHaveLength(3);
    for (const path of paths) {
      expect(path.getAttribute('stroke')).toBe(`url(#${gradient.id})`);
      expect(path.getAttribute('fill')).toBe(`url(#${gradient.id})`);
      expect(Number(path.getAttribute('fill-opacity'))).toBeGreaterThanOrEqual(0.3);
      expect(Number(path.getAttribute('fill-opacity'))).toBeLessThan(0.5);
    }
    expect(svg.getAttribute('width')).toBe('20');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('class')).toContain('ui-ic--ai');
  });

  it('gives every rendered icon a unique gradient id, so no row shares or loses a gradient', () => {
    const { container } = render(
      <>
        <IcSparkles />
        <IcSparkles />
        <IcSparkles />
      </>,
    );
    const ids = [...container.querySelectorAll('linearGradient')].map((g) => g.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids.every((id) => /^[A-Za-z0-9_-]+$/.test(id))).toBe(true);
  });

  it('takes its colours from three theme tokens', () => {
    const { container } = render(<IcSparkles />);
    const stops = [...container.querySelectorAll('stop')].map((s) => s.getAttribute('style') ?? '');
    expect(stops).toHaveLength(3);
    expect(stops[0]).toContain('--ai-ic-a');
    expect(stops[1]).toContain('--ai-ic-b');
    expect(stops[2]).toContain('--ai-ic-c');
  });

  it('keeps the className, size and stroke width props working', () => {
    const { container } = render(<IcSparkles className="x" strokeWidth={1.5} />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('class')).toContain('x');
    expect(container.querySelector('path')!.getAttribute('stroke-width')).toBe('1.5');
  });
});

describe('AI icon colour tokens', () => {
  const tokens = readFileSync('src/styles/tokens.css', 'utf8');
  const components = readFileSync('src/styles/components.css', 'utf8');

  it('defines all three colours for the dark base and for the light theme', () => {
    const dark = tokens.slice(tokens.indexOf(':root {'), tokens.indexOf(":root[data-theme='light'] {"));
    const light = tokens.slice(tokens.indexOf(":root[data-theme='light'] {"));
    for (const name of ['--ai-ic-a', '--ai-ic-b', '--ai-ic-c']) {
      expect(dark, name).toContain(`${name}:`);
      expect(light, name).toContain(`${name}:`);
    }
  });

  it('falls back to the text colour on a filled primary button, where a gradient would vanish', () => {
    expect(components).toMatch(/\.btn--primary\s+\.ui-ic--ai[^{]*\{[^}]*stroke:\s*currentColor/);
  });

  it('glows softly in the gradient colour, and drops the glow where it falls back to the text colour', () => {
    expect(components).toMatch(/\.ui-ic--ai\s*\{[^}]*filter:\s*drop-shadow\([^)]*var\(--ai-ic-b\)/);
    expect(components).toMatch(/\.btn--primary\s+\.ui-ic--ai\s*\{[^}]*filter:\s*none/);
  });

  it('uses warm colours in both themes: red always above blue, and the middle stop orange-ish', () => {
    const rgb = (block: string, name: string) => {
      const m = block.match(new RegExp(`${name}:\\s*#([0-9a-f]{6})`, 'i'));
      expect(m, name).toBeTruthy();
      const n = parseInt(m![1]!, 16);
      return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    };
    const dark = tokens.slice(tokens.indexOf(':root {'), tokens.indexOf(":root[data-theme='light'] {"));
    const light = tokens.slice(tokens.indexOf(":root[data-theme='light'] {"));
    for (const block of [dark, light]) {
      for (const name of ['--ai-ic-a', '--ai-ic-b', '--ai-ic-c']) {
        const c = rgb(block, name);
        expect(c.r, name).toBeGreaterThan(c.b);
      }
      const mid = rgb(block, '--ai-ic-b');
      expect(mid.g, 'orange: green well below red').toBeLessThan(mid.r - 60);
    }
  });
});

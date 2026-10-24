import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { IcFolderGradient } from './icons';

describe('IcFolderGradient', () => {
  afterEach(cleanup);

  it('fills the folder from its own gradient', () => {
    const { container } = render(<IcFolderGradient size={16} />);
    const svg = container.querySelector('svg')!;
    const gradient = svg.querySelector('linearGradient')!;
    expect(gradient.id).toBeTruthy();
    expect(svg.querySelector('path')!.getAttribute('fill')).toBe(`url(#${gradient.id})`);
    expect(svg.getAttribute('width')).toBe('16');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.hasAttribute('data-list-icon')).toBe(true);
  });

  it('gives every rendered icon a unique gradient id, so rows never share or lose a gradient', () => {
    const { container } = render(
      <>
        <IcFolderGradient />
        <IcFolderGradient />
        <IcFolderGradient />
      </>,
    );
    const ids = [...container.querySelectorAll('linearGradient')].map((g) => g.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids.every((id) => /^[A-Za-z0-9_-]+$/.test(id))).toBe(true);
  });

  it('takes its colours from theme tokens', () => {
    const { container } = render(<IcFolderGradient />);
    const stops = [...container.querySelectorAll('stop')].map((s) => s.getAttribute('style') ?? '');
    expect(stops[0]).toContain('--list-folder-top');
    expect(stops[stops.length - 1]).toContain('--list-folder-bottom');
    expect(container.querySelector('path')!.getAttribute('style')).toContain('--list-folder-edge');
  });
});

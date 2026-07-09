import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const initialize = vi.fn();
const render = vi.fn();

vi.mock('mermaid', () => ({
  default: {
    initialize: (...args: unknown[]) => initialize(...args),
    render: (...args: unknown[]) => render(...args),
  },
}));

describe('renderMermaidSvg', () => {
  beforeEach(() => {
    initialize.mockReset();
    render.mockReset();
    document.documentElement.removeAttribute('data-theme');
    document.body.innerHTML = '';
    vi.resetModules();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('returns Empty diagram for blank source without loading mermaid', async () => {
    const { renderMermaidSvg } = await import('./richTextMermaid');
    await expect(renderMermaidSvg('   ')).resolves.toEqual({ ok: false, error: 'Empty diagram' });
    expect(initialize).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
  });

  it('initializes once with strict security and dark theme by default', async () => {
    render.mockResolvedValue({ svg: '<svg data-ok="1"></svg>' });
    const { renderMermaidSvg } = await import('./richTextMermaid');
    const first = await renderMermaidSvg('flowchart LR\n  A-->B');
    expect(first).toEqual({ ok: true, svg: '<svg data-ok="1"></svg>' });
    expect(initialize).toHaveBeenCalledTimes(1);
    expect(initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'dark',
      }),
    );

    render.mockResolvedValue({ svg: '<svg data-ok="2"></svg>' });
    await renderMermaidSvg('flowchart LR\n  B-->C');
    expect(initialize).toHaveBeenCalledTimes(1);
  });

  it('uses neutral theme when data-theme=light', async () => {
    document.documentElement.setAttribute('data-theme', 'light');
    render.mockResolvedValue({ svg: '<svg></svg>' });
    const { renderMermaidSvg } = await import('./richTextMermaid');
    await renderMermaidSvg('flowchart LR\n  A-->B');
    expect(initialize).toHaveBeenCalledWith(
      expect.objectContaining({ theme: 'neutral' }),
    );
  });

  it('removes leftover temp DOM nodes after a successful render', async () => {
    render.mockImplementation(async (id: string) => {
      const el = document.createElement('div');
      el.id = `d${id}`;
      document.body.appendChild(el);
      return { svg: '<svg></svg>' };
    });
    const { renderMermaidSvg } = await import('./richTextMermaid');
    await renderMermaidSvg('flowchart LR\n  A-->B');
    expect(document.body.querySelector('[id^="dcadence-mermaid-"]')).toBeNull();
  });

  it('maps Error throws to ok:false and cleans temp nodes', async () => {
    render.mockImplementation(async (id: string) => {
      const el = document.createElement('div');
      el.id = `d${id}`;
      document.body.appendChild(el);
      throw new Error('Parse error on line 2');
    });
    const { renderMermaidSvg } = await import('./richTextMermaid');
    await expect(renderMermaidSvg('not a diagram')).resolves.toEqual({
      ok: false,
      error: 'Parse error on line 2',
    });
    expect(document.body.querySelector('[id^="dcadence-mermaid-"]')).toBeNull();
  });

  it('maps non-Error throws to a generic message', async () => {
    render.mockRejectedValue('boom');
    const { renderMermaidSvg } = await import('./richTextMermaid');
    await expect(renderMermaidSvg('x')).resolves.toEqual({
      ok: false,
      error: 'Invalid Mermaid diagram',
    });
  });
});

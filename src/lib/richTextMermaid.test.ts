import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const initialize = vi.fn();
const render = vi.fn();
const parse = vi.fn();

vi.mock('mermaid', () => ({
  default: {
    initialize: (...args: unknown[]) => initialize(...args),
    render: (...args: unknown[]) => render(...args),
    parse: (...args: unknown[]) => parse(...args),
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

describe('theme changes', () => {
  beforeEach(() => {
    initialize.mockReset();
    render.mockReset();
    document.documentElement.removeAttribute('data-theme');
    vi.resetModules();
  });

  it('initializes again when the app theme changed since the last drawing', async () => {
    render.mockResolvedValue({ svg: '<svg></svg>' });
    const { renderMermaidSvg } = await import('./richTextMermaid');
    await renderMermaidSvg('flowchart LR\n  A-->B');
    expect(initialize).toHaveBeenLastCalledWith(expect.objectContaining({ theme: 'dark' }));
    document.documentElement.setAttribute('data-theme', 'light');
    await renderMermaidSvg('flowchart LR\n  B-->C');
    expect(initialize).toHaveBeenCalledTimes(2);
    expect(initialize).toHaveBeenLastCalledWith(expect.objectContaining({ theme: 'neutral', securityLevel: 'strict' }));
    await renderMermaidSvg('flowchart LR\n  C-->D');
    expect(initialize).toHaveBeenCalledTimes(2);
  });
});

describe('validateMermaid', () => {
  beforeEach(() => {
    initialize.mockReset();
    parse.mockReset();
    vi.resetModules();
  });

  it('is ok when mermaid parses the source', async () => {
    parse.mockResolvedValue({ diagramType: 'flowchart-v2' });
    const { validateMermaid } = await import('./richTextMermaid');
    await expect(validateMermaid('flowchart TD\n  A-->B')).resolves.toEqual({ ok: true });
    expect(parse).toHaveBeenCalledWith('flowchart TD\n  A-->B');
  });

  it('returns the parser message when the syntax is wrong', async () => {
    parse.mockRejectedValue(new Error('Parse error on line 2'));
    const { validateMermaid } = await import('./richTextMermaid');
    await expect(validateMermaid('flowchart TD\n  A--')).resolves.toEqual({ ok: false, error: 'Parse error on line 2' });
  });

  it('rejects a blank source without loading mermaid', async () => {
    const { validateMermaid } = await import('./richTextMermaid');
    await expect(validateMermaid('  ')).resolves.toEqual({ ok: false, error: 'Empty diagram' });
    expect(parse).not.toHaveBeenCalled();
    expect(initialize).not.toHaveBeenCalled();
  });

  it('treats a parser that reports false as invalid', async () => {
    parse.mockResolvedValue(false);
    const { validateMermaid } = await import('./richTextMermaid');
    await expect(validateMermaid('flowchart TD\n  A-->B')).resolves.toMatchObject({ ok: false });
  });
});

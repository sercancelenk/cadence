import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { MergeView } from '@codemirror/merge';
import { openSearchPanel } from '@codemirror/search';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  observeStructuredTextHostResize,
  observeStructuredTextMergeHostResize,
  openStructuredTextSearch,
  jumpStructuredTextToQuery,
  jumpStructuredTextToPath,
} from './structuredTextEditorLayout';

vi.mock('@codemirror/search', () => ({
  openSearchPanel: vi.fn(),
}));

function mountView(doc = 'hello'): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  return new EditorView({
    state: EditorState.create({ doc }),
    parent,
  });
}

describe('observeStructuredTextHostResize', () => {
  let disconnect: ResizeObserverCallback | undefined;
  let observed: Element | undefined;

  beforeEach(() => {
    class MockResizeObserver {
      constructor(cb: ResizeObserverCallback) {
        disconnect = cb;
      }
      observe(el: Element) {
        observed = el;
      }
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('requests measure when the host resizes', () => {
    const host = document.createElement('div');
    const view = mountView();
    const requestMeasure = vi.spyOn(view, 'requestMeasure');
    const cleanup = observeStructuredTextHostResize(host, view);
    expect(observed).toBe(host);
    disconnect?.([], {} as ResizeObserver);
    expect(requestMeasure).toHaveBeenCalled();
    cleanup();
  });
});

describe('observeStructuredTextMergeHostResize', () => {
  let disconnect: ResizeObserverCallback | undefined;

  beforeEach(() => {
    class MockResizeObserver {
      constructor(cb: ResizeObserverCallback) {
        disconnect = cb;
      }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('requests measure on both merge sides', () => {
    const host = document.createElement('div');
    const a = mountView('left');
    const b = mountView('right');
    const merge = { a, b } as MergeView;
    const spyA = vi.spyOn(a, 'requestMeasure');
    const spyB = vi.spyOn(b, 'requestMeasure');
    observeStructuredTextMergeHostResize(host, merge);
    disconnect?.([], {} as ResizeObserver);
    expect(spyA).toHaveBeenCalled();
    expect(spyB).toHaveBeenCalled();
  });
});

describe('openStructuredTextSearch', () => {
  afterEach(() => {
    vi.mocked(openSearchPanel).mockClear();
    document.body.innerHTML = '';
  });

  it('opens search on a single editor view', () => {
    const view = mountView();
    const focus = vi.spyOn(view, 'focus');
    openStructuredTextSearch(view);
    expect(openSearchPanel).toHaveBeenCalledWith(view);
    expect(focus).toHaveBeenCalled();
  });

  it('targets the focused merge side when no single view is provided', () => {
    const a = mountView('a');
    const b = mountView('b');
    Object.defineProperty(b, 'hasFocus', { value: true });
    Object.defineProperty(a, 'hasFocus', { value: false });
    const focusB = vi.spyOn(b, 'focus');
    openStructuredTextSearch(null, { a, b } as MergeView);
    expect(openSearchPanel).toHaveBeenCalledWith(b);
    expect(focusB).toHaveBeenCalled();
  });

  it('falls back to side a when merge b is not focused', () => {
    const a = mountView('a');
    const b = mountView('b');
    Object.defineProperty(b, 'hasFocus', { value: false });
    Object.defineProperty(a, 'hasFocus', { value: false });
    openStructuredTextSearch(undefined, { a, b } as MergeView);
    expect(openSearchPanel).toHaveBeenCalledWith(a);
  });

  it('no-ops when neither view nor merge is provided', () => {
    openStructuredTextSearch(null, null);
    expect(openSearchPanel).not.toHaveBeenCalled();
  });
});

describe('jumpStructuredTextToPath', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('walks nested path segments in document order', () => {
    const view = mountView('{\n  "adres2": {\n    "ilce": "Maltepe"\n  }\n}\n');
    const ok = jumpStructuredTextToPath(view, '$.adres2.ilce');
    expect(ok).toBe(true);
    const selected = view.state.doc.sliceString(
      view.state.selection.main.from,
      view.state.selection.main.to,
    );
    expect(selected).toBe('"ilce"');
    view.destroy();
  });

  it('returns false when an intermediate segment is missing', () => {
    const view = mountView('{\n  "a": 1\n}\n');
    expect(jumpStructuredTextToPath(view, '$.missing.field')).toBe(false);
    view.destroy();
  });
});

describe('jumpStructuredTextToQuery', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('selects the first matching substring', () => {
    const view = mountView('{\n  "name": "cadence"\n}\n');
    const ok = jumpStructuredTextToQuery(view, '"name"');
    expect(ok).toBe(true);
    expect(view.state.selection.main.from).toBeGreaterThan(0);
    view.destroy();
  });

  it('returns false for empty query', () => {
    const view = mountView('hello');
    expect(jumpStructuredTextToQuery(view, '   ')).toBe(false);
    view.destroy();
  });

  it('returns false when query is not found', () => {
    const view = mountView('hello');
    expect(jumpStructuredTextToQuery(view, 'missing')).toBe(false);
    view.destroy();
  });
});

import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { describe, expect, it } from 'vitest';
import {
  commitLocalStructuredTextEdit,
  applyVisualStructuredTextDoc,
  replaceStructuredTextDoc,
  syncStructuredTextDocFromProp,
} from './structuredTextEditorSync';

function mountView(doc: string): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  return new EditorView({
    state: EditorState.create({ doc }),
    parent,
  });
}

describe('syncStructuredTextDocFromProp', () => {
  it('does not sync when props still echo the last emit while the user is typing', () => {
    const view = mountView('{"draft":true}\n');
    const lastEmitted = { current: '{\n}\n' as string | null };

    const updated = syncStructuredTextDocFromProp(view, '{\n}\n', lastEmitted);

    expect(updated).toBe(false);
    expect(view.state.doc.toString()).toBe('{"draft":true}\n');
  });

  it('applies external prop updates when editor still matches lastEmitted', () => {
    const view = mountView('{\n}\n');
    const lastEmitted = { current: '{\n}\n' as string | null };

    const updated = syncStructuredTextDocFromProp(view, '{"a":1}\n', lastEmitted);

    expect(updated).toBe(true);
    expect(view.state.doc.toString()).toBe('{"a":1}\n');
    expect(lastEmitted.current).toBe('{"a":1}\n');
  });

  it('keeps local edits while holdPropSync is active and parent is stale', () => {
    const view = mountView('local draft');
    const lastEmitted = { current: 'old' as string | null };
    const holdPropSync = { current: true };

    expect(syncStructuredTextDocFromProp(view, 'stale prop', lastEmitted, holdPropSync)).toBe(false);
    expect(holdPropSync.current).toBe(true);
    expect(view.state.doc.toString()).toBe('local draft');
  });

  it('updates lastEmitted when holdPropSync clears after parent catches up', () => {
    const view = mountView('aligned');
    const lastEmitted = { current: 'old' as string | null };
    const holdPropSync = { current: true };

    expect(syncStructuredTextDocFromProp(view, 'aligned', lastEmitted, holdPropSync)).toBe(false);
    expect(holdPropSync.current).toBe(false);
    expect(lastEmitted.current).toBe('aligned');
  });
});

describe('commitLocalStructuredTextEdit', () => {
  it('blocks prop sync until the parent value catches up', () => {
    const view = mountView('{\n}\n');
    const lastEmitted = { current: '{\n}\n' as string | null };
    const holdPropSync = { current: false };

    commitLocalStructuredTextEdit(view, 'name: cadence\n', lastEmitted, holdPropSync);

    expect(view.state.doc.toString()).toBe('name: cadence\n');
    expect(lastEmitted.current).toBe('name: cadence\n');
    expect(holdPropSync.current).toBe(true);

    expect(syncStructuredTextDocFromProp(view, '{\n}\n', lastEmitted, holdPropSync)).toBe(false);
    expect(holdPropSync.current).toBe(true);
    expect(view.state.doc.toString()).toBe('name: cadence\n');

    expect(syncStructuredTextDocFromProp(view, 'name: cadence\n', lastEmitted, holdPropSync)).toBe(
      false,
    );
    expect(holdPropSync.current).toBe(false);
  });
});

describe('applyVisualStructuredTextDoc', () => {
  it('replaces the document for display without updating lastEmitted', () => {
    const raw = '{\n  "z": 1,\n  "a": 2\n}\n';
    const aligned = '{\n  "a": 2,\n  "z": 1\n}\n';
    const view = mountView(raw);
    const lastEmitted = { current: raw as string | null };
    const holdPropSync = { current: false };

    applyVisualStructuredTextDoc(view, aligned, holdPropSync);

    expect(view.state.doc.toString()).toBe(aligned);
    expect(lastEmitted.current).toBe(raw);
    expect(holdPropSync.current).toBe(true);

    expect(syncStructuredTextDocFromProp(view, raw, lastEmitted, holdPropSync)).toBe(false);
    expect(holdPropSync.current).toBe(true);
    expect(view.state.doc.toString()).toBe(aligned);
    expect(lastEmitted.current).toBe(raw);
  });
});

describe('replaceStructuredTextDoc', () => {
  it('maps selection when the document shrinks instead of throwing', () => {
    const view = mountView('0123456789');
    view.dispatch({ selection: { anchor: 8, head: 8 } });

    expect(() => replaceStructuredTextDoc(view, 'ab')).not.toThrow();

    expect(view.state.doc.toString()).toBe('ab');
    expect(view.state.selection.main.head).toBeLessThanOrEqual(2);
  });

  it('is a no-op when the replacement text matches the current document', () => {
    const view = mountView('same');
    const before = view.state.toJSON();
    replaceStructuredTextDoc(view, 'same');
    expect(view.state.toJSON()).toEqual(before);
  });
});

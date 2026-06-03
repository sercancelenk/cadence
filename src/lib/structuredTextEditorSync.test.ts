import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { describe, expect, it } from 'vitest';
import {
  commitLocalStructuredTextEdit,
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

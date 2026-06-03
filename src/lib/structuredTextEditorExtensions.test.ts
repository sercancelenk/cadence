import { EditorState, Compartment } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { forceLinting, forEachDiagnostic } from '@codemirror/lint';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildStructuredTextExtensions,
  createStructuredTextCompartments,
  structuredTextLanguageExtensions,
} from './structuredTextEditorExtensions';

beforeEach(() => {
  if (!Range.prototype.getClientRects) {
    Range.prototype.getClientRects = () =>
      ({
        length: 0,
        item: () => null,
        [Symbol.iterator]: function* () {},
      }) as unknown as DOMRectList;
  }
});

function mountLanguageView(doc: string, language: 'json' | 'yaml'): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  return new EditorView({
    state: EditorState.create({
      doc,
      extensions: structuredTextLanguageExtensions(language),
    }),
    parent,
  });
}

function mountFullView(doc: string, language: 'json' | 'yaml' = 'yaml'): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const compartments = createStructuredTextCompartments();
  return new EditorView({
    state: EditorState.create({
      doc,
      extensions: buildStructuredTextExtensions(compartments, language, false),
    }),
    parent,
  });
}

describe('createStructuredTextCompartments', () => {
  it('returns language and readOnly compartments', () => {
    const c = createStructuredTextCompartments();
    expect(c.language).toBeInstanceOf(Compartment);
    expect(c.readOnly).toBeInstanceOf(Compartment);
  });
});

describe('structuredTextLanguageExtensions', () => {
  it('returns json extensions for json language', () => {
    expect(structuredTextLanguageExtensions('json').length).toBeGreaterThan(0);
  });

  it('returns yaml extensions for yaml language', () => {
    expect(structuredTextLanguageExtensions('yaml').length).toBeGreaterThan(0);
  });
});

describe('yamlParseLinter via EditorView', () => {
  it('reports no diagnostics for empty or whitespace-only docs', () => {
    const view = mountLanguageView('   \n  ', 'yaml');
    forceLinting(view);
    const messages: string[] = [];
    forEachDiagnostic(view.state, (d) => messages.push(d.message));
    expect(messages).toEqual([]);
    view.destroy();
  });

  it('reports no diagnostics for valid YAML', async () => {
    const view = mountLanguageView('name: cadence\nversion: 1\n', 'yaml');
    forceLinting(view);
    const messages: string[] = [];
    forEachDiagnostic(view.state, (d) => messages.push(d.message));
    expect(messages).toEqual([]);
    view.destroy();
  });

  it('runs yaml language extensions over non-empty content', () => {
    const view = mountLanguageView('name: cadence\nversion: 1\n', 'yaml');
    forceLinting(view);
    view.destroy();
  });

});

describe('buildStructuredTextExtensions', () => {
  it('applies readOnly compartment when requested', () => {
    const compartments = createStructuredTextCompartments();
    const view = new EditorView({
      state: EditorState.create({
        doc: '{}',
        extensions: buildStructuredTextExtensions(compartments, 'json', true),
      }),
      parent: document.createElement('div'),
    });
    expect(view.state.readOnly).toBe(true);
    view.destroy();
  });

  it('invokes onDocChange when the document changes', () => {
    const onDocChange = vi.fn();
    const compartments = createStructuredTextCompartments();
    const view = new EditorView({
      state: EditorState.create({
        doc: '{}',
        extensions: buildStructuredTextExtensions(
          compartments,
          'json',
          false,
          [],
          onDocChange,
        ),
      }),
      parent: document.createElement('div'),
    });
    view.dispatch({ changes: { from: 1, to: 1, insert: '\n"a":1' } });
    expect(onDocChange).toHaveBeenCalled();
    expect(onDocChange.mock.calls.at(-1)?.[0]).toContain('"a"');
    view.destroy();
  });

  it('wires the full extension bundle including lint gutter', () => {
    const view = mountFullView('name: cadence\n', 'yaml');
    expect(view.state.doc.toString()).toContain('cadence');
    view.destroy();
  });
});

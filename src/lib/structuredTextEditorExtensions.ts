import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection } from '@codemirror/view';
import { EditorState, Compartment, type Extension } from '@codemirror/state';
import { json, jsonParseLinter } from '@codemirror/lang-json';
import { yaml as yamlLang } from '@codemirror/lang-yaml';
import { linter, lintGutter } from '@codemirror/lint';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import {
  bracketMatching,
  codeFolding,
  foldGutter,
  foldKeymap,
  indentOnInput,
} from '@codemirror/language';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { parseDocument } from 'yaml';
import type { StructuredTextLanguage } from './structuredText';

export type StructuredTextCompartments = {
  language: Compartment;
  readOnly: Compartment;
};

export function createStructuredTextCompartments(): StructuredTextCompartments {
  return {
    language: new Compartment(),
    readOnly: new Compartment(),
  };
}

function yamlParseLinter() {
  return linter((view) => {
    const text = view.state.doc.toString();
    if (!text.trim()) return [];
    try {
      parseDocument(text, { strict: true });
      return [];
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid YAML';
      const linePos = (err as { linePos?: { line: number; col: number }[] }).linePos;
      if (linePos?.[0]) {
        try {
          const line = view.state.doc.line(linePos[0].line);
          const from = line.from + Math.max(0, linePos[0].col - 1);
          const to = Math.min(line.to, from + 1);
          return [{ from, to, severity: 'error' as const, message }];
        } catch {
          /* fall through */
        }
      }
      return [{ from: 0, to: Math.min(text.length, 1), severity: 'error' as const, message }];
    }
  });
}

export function structuredTextLanguageExtensions(language: StructuredTextLanguage): Extension[] {
  if (language === 'json') {
    return [json(), linter(jsonParseLinter())];
  }
  return [yamlLang(), yamlParseLinter()];
}

export const cadenceStructuredTextTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: 'var(--panel)',
      color: 'var(--text)',
      fontSize: '13px',
      height: '100%',
      flex: '1 1 auto',
      minHeight: 0,
    },
    '&.cm-focused': {
      outline: 'none',
    },
    '.cm-scroller': {
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
      lineHeight: '1.55',
      overflow: 'auto',
      height: '100%',
      maxHeight: '100%',
    },
    '.cm-content': {
      padding: '12px 0',
      caretColor: 'var(--accent)',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: 'var(--accent)',
    },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
      backgroundColor: 'color-mix(in srgb, var(--accent) 22%, transparent) !important',
    },
    '.cm-gutters': {
      backgroundColor: 'color-mix(in srgb, var(--panel) 92%, var(--bg))',
      color: 'var(--muted)',
      border: 'none',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'color-mix(in srgb, var(--accent) 10%, transparent)',
    },
    '.cm-activeLine': {
      backgroundColor: 'color-mix(in srgb, var(--accent) 8%, transparent)',
    },
    '.cm-diagnostic-error': {
      borderLeft: '3px solid #e5534b',
    },
    '.cm-foldGutter span': {
      cursor: 'pointer',
      color: 'var(--muted)',
      fontSize: '11px',
      padding: '0 2px',
    },
    '.cm-foldGutter span:hover': {
      color: 'var(--text)',
    },
    '.cm-foldPlaceholder': {
      backgroundColor: 'color-mix(in srgb, var(--accent) 12%, var(--panel))',
      border: '1px solid color-mix(in srgb, var(--accent) 24%, transparent)',
      color: 'var(--muted)',
      borderRadius: '4px',
      padding: '0 6px',
    },
    '.cm-panel.cm-search': {
      background: 'color-mix(in srgb, var(--panel) 94%, var(--bg))',
      borderBottom: '1px solid color-mix(in srgb, var(--accent) 18%, transparent)',
      padding: '6px 10px',
      gap: '6px',
    },
    '.cm-panel.cm-search input, .cm-panel.cm-search button': {
      font: 'inherit',
      fontSize: '12px',
      borderRadius: '6px',
      border: '1px solid var(--border)',
      background: 'var(--panel)',
      color: 'var(--text)',
      padding: '4px 8px',
    },
    '.cm-panel.cm-search label': {
      fontSize: '12px',
      color: 'var(--muted)',
    },
    '.cm-searchMatch': {
      backgroundColor: 'color-mix(in srgb, #ffb24a 35%, transparent)',
      outline: '1px solid color-mix(in srgb, #ffb24a 55%, transparent)',
    },
    '.cm-searchMatch-selected': {
      backgroundColor: 'color-mix(in srgb, var(--accent) 40%, transparent)',
      outline: '1px solid color-mix(in srgb, var(--accent) 60%, transparent)',
    },
    '.cm-selectionMatch': {
      backgroundColor: 'color-mix(in srgb, var(--accent) 18%, transparent)',
    },
  },
  { dark: false },
);

const structuredTextKeymap = keymap.of([
  ...closeBracketsKeymap,
  ...searchKeymap,
  ...historyKeymap,
  ...foldKeymap,
  ...defaultKeymap,
  indentWithTab,
]);

/** Bracket closing, smart indent, in-document search (⌘F / ⌘G). */
const structuredTextEditingExtensions: Extension[] = [
  search({ top: true }),
  highlightSelectionMatches(),
  closeBrackets(),
  bracketMatching(),
  indentOnInput(),
];

export function buildStructuredTextExtensions(
  compartments: StructuredTextCompartments,
  language: StructuredTextLanguage,
  readOnly: boolean,
  extra: Extension[] = [],
  onDocChange?: (text: string) => void,
): Extension[] {
  return [
    cadenceStructuredTextTheme,
    lineNumbers(),
    foldGutter(),
    codeFolding(),
    highlightActiveLine(),
    drawSelection(),
    lintGutter(),
    history(),
    structuredTextKeymap,
    ...structuredTextEditingExtensions,
    compartments.language.of(structuredTextLanguageExtensions(language)),
    compartments.readOnly.of(EditorState.readOnly.of(readOnly)),
    EditorView.lineWrapping,
    ...extra,
    ...(onDocChange
      ? [
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return;
            onDocChange(update.state.doc.toString());
          }),
        ]
      : []),
  ];
}

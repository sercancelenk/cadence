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
  HighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { parse as parseYaml } from 'yaml';
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

export type StructuredTextYamlDiagnostic = {
  from: number;
  to: number;
  severity: 'error';
  message: string;
};

/** Pure YAML lint helper — exported for unit tests and the CodeMirror linter. */
export function collectStructuredTextYamlDiagnostics(
  text: string,
  lineAt: (lineNumber: number) => { from: number; to: number },
): StructuredTextYamlDiagnostic[] {
  if (!text.trim()) return [];
  try {
    parseYaml(text, { strict: true });
    return [];
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid YAML';
    const linePos = (err as { linePos?: { line: number; col: number }[] }).linePos;
    if (linePos?.[0]) {
      try {
        const line = lineAt(linePos[0].line);
        const from = line.from + Math.max(0, linePos[0].col - 1);
        const to = Math.min(line.to, from + 1);
        return [{ from, to, severity: 'error', message }];
      } catch {
        /* fall through */
      }
    }
    return [{ from: 0, to: Math.min(text.length, 1), severity: 'error', message }];
  }
}

function yamlParseLinter() {
  return linter((view) => {
    const text = view.state.doc.toString();
    return collectStructuredTextYamlDiagnostics(text, (lineNumber) => view.state.doc.line(lineNumber));
  });
}

export function structuredTextLanguageExtensions(language: StructuredTextLanguage): Extension[] {
  if (language === 'json') {
    return [json(), linter(jsonParseLinter())];
  }
  return [yamlLang(), yamlParseLinter()];
}

/** Theme-aware token colours — CSS vars switch with `:root[data-theme]`. */
export const cadenceStructuredTextHighlightStyle = HighlightStyle.define([
  { tag: [t.propertyName, t.labelName, t.name], color: 'var(--cm-property)' },
  { tag: t.definition(t.propertyName), color: 'var(--cm-property)', fontWeight: '600' },
  { tag: [t.string, t.special(t.string)], color: 'var(--cm-string)' },
  { tag: [t.number, t.integer, t.float], color: 'var(--cm-number)' },
  { tag: t.bool, color: 'var(--cm-bool)' },
  { tag: [t.null, t.keyword], color: 'var(--cm-null)' },
  { tag: t.comment, color: 'var(--cm-comment)', fontStyle: 'italic' },
  { tag: [t.meta, t.processingInstruction], color: 'var(--cm-meta)' },
  { tag: [t.bracket, t.brace, t.paren, t.squareBracket], color: 'var(--cm-bracket)' },
  { tag: [t.punctuation, t.separator, t.operator, t.derefOperator], color: 'var(--cm-punctuation)' },
  { tag: [t.className, t.typeName], color: 'var(--cm-type)' },
  { tag: t.invalid, color: 'var(--cm-invalid)', textDecoration: 'underline wavy' },
]);

const structuredTextFoldGutter = foldGutter({
  openText: '▾',
  closedText: '▸',
  markerDOM: (open) => {
    const span = document.createElement('span');
    span.className = `cm-fold-marker${open ? ' cm-fold-marker--open' : ' cm-fold-marker--closed'}`;
    span.textContent = open ? '▾' : '▸';
    span.setAttribute('aria-hidden', 'true');
    return span;
  },
});

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
      color: 'var(--cm-fold)',
      fontSize: '11px',
      lineHeight: '1',
      padding: '0 3px',
      borderRadius: '3px',
      transition: 'color 120ms ease, background-color 120ms ease',
    },
    '.cm-foldGutter span:hover, .cm-fold-marker:hover': {
      color: 'var(--cm-fold-hover)',
      backgroundColor: 'color-mix(in srgb, var(--accent) 14%, transparent)',
    },
    '.cm-fold-marker': {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: '14px',
      fontSize: '10px',
      fontWeight: '700',
      color: 'var(--cm-fold)',
    },
    '.cm-fold-marker--open': {
      color: 'var(--accent)',
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
    syntaxHighlighting(cadenceStructuredTextHighlightStyle, { fallback: true }),
    lineNumbers(),
    structuredTextFoldGutter,
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

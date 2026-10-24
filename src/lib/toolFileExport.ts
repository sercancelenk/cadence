import type { UtilityDocumentTab, UtilityStructuredTab } from '../core/model';
import { exportFileName, exportFileStem, exportNoteContent } from './noteExport';
import { resolveRichTextContent } from './richTextImport';

/** What the Tools pages hand to the desktop app's "save to a file" dialog. */
export type ToolFilePayload = {
  suggestedName: string;
  /** Extension suggested first; also the format written for an unknown typed extension. */
  defaultExt: string;
  /** Extensions offered as dialog filters, default first. */
  extensions: string[];
  /** Text to write, keyed by the extension the user ends up choosing; `*` fits any. */
  variants: Record<string, string>;
};

/** A Document tab: every export format is prepared; the extension typed in the dialog picks one. */
export function documentTabFile(tab: Pick<UtilityDocumentTab, 'title' | 'body' | 'bodyFormat'>): ToolFilePayload {
  const doc = resolveRichTextContent(tab.body, tab.bodyFormat);
  return {
    suggestedName: exportFileName(tab.title, 'md'),
    defaultExt: 'md',
    extensions: ['md', 'txt', 'html'],
    variants: {
      md: exportNoteContent(doc, tab.title, 'md'),
      txt: exportNoteContent(doc, tab.title, 'txt'),
      html: exportNoteContent(doc, tab.title, 'html'),
    },
  };
}

/** A JSON / YAML tab: the buffer is written as is, whatever extension the user chooses. */
export function structuredTabFile(tab: Pick<UtilityStructuredTab, 'title' | 'content' | 'language'>): ToolFilePayload {
  const ext = tab.language;
  return {
    suggestedName: `${exportFileStem(tab.title)}.${ext}`,
    defaultExt: ext,
    extensions: ext === 'yaml' ? ['yaml', 'yml', 'txt'] : ['json', 'txt'],
    variants: { '*': tab.content },
  };
}

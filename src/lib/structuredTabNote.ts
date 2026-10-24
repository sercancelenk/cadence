import type { UtilityStructuredTab } from '../core/model';
import type { MoveToNoteFields } from '../core/actions';
import { richPayloadFromDoc, type RichTextDoc } from './richText';
import { richBodyFieldsFromPayload } from './richTextBody';

/**
 * Note fields for a JSON / YAML tab being moved to Notes: the buffer becomes one
 * code block labelled with the tab's language. The document is built directly,
 * not through markdown, so content that itself contains code fences survives
 * byte for byte. Diff panes are scratch and are not carried over.
 */
export function structuredTabNoteFields(
  tab: Pick<UtilityStructuredTab, 'title' | 'content' | 'language'>,
): MoveToNoteFields {
  const doc: RichTextDoc = {
    type: 'doc',
    content: [
      {
        type: 'codeBlock',
        attrs: { language: tab.language, collapsed: false },
        ...(tab.content ? { content: [{ type: 'text', text: tab.content }] } : {}),
      },
    ],
  };
  const fields = richBodyFieldsFromPayload(richPayloadFromDoc(doc));
  return {
    title: tab.title,
    body: fields.body,
    bodyFormat: fields.bodyFormat,
    bodyPlainText: fields.bodyPlainText,
  };
}

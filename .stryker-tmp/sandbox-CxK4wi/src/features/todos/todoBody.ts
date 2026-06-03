// @ts-nocheck
import {
  plainTextFromBodyFields,
  type RichTextBodyFields,
} from '../../lib/richTextBody';
import type { TodoItem } from '../../model';
import type { SchedulePatch } from '../../components/ui/SchedulePopover';

/**
 * Bridge from the popover's tri-state patch shape (`undefined` =
 * untouched, `null` = clear, string = set) to our action layer's
 * shape, which treats `undefined` as "clear" already.
 */
export function schedulePatchToTodoPatch(
  patch: SchedulePatch,
): Partial<Pick<TodoItem, 'dueAt' | 'remindAt' | 'remindRepeat'>> {
  const out: Partial<Pick<TodoItem, 'dueAt' | 'remindAt' | 'remindRepeat'>> = {};
  if (patch.dueAt !== undefined) out.dueAt = patch.dueAt ?? undefined;
  if (patch.remindAt !== undefined) out.remindAt = patch.remindAt ?? undefined;
  if (patch.remindRepeat !== undefined) out.remindRepeat = patch.remindRepeat ?? undefined;
  return out;
}

function stripTrailingSeparators(body: string): string {
  return body.replace(/(?:\s*\n)+\s*-{3,}\s*$/g, '').replace(/\s+$/g, '');
}

/** Plain-text surface for search, AI, and legacy cleanup. */
export function legacyBodyPlainText(
  item: Pick<TodoItem, 'body' | 'bodyFormat' | 'bodyPlainText'>,
): string {
  const plain = plainTextFromBodyFields(item);
  if (item.bodyFormat === 'prosemirror') return plain;
  return stripTrailingSeparators(plain);
}

export function itemToBodyFields(
  item: Pick<TodoItem, 'body' | 'bodyFormat' | 'bodyPlainText'>,
): RichTextBodyFields {
  return {
    body: item.body ?? '',
    bodyFormat: item.bodyFormat,
    bodyPlainText: item.bodyPlainText,
  };
}

export function todoHasBody(item: Pick<TodoItem, 'body' | 'bodyFormat' | 'bodyPlainText'>): boolean {
  return !!plainTextFromBodyFields(item).trim();
}

export function todoBodyPatchFromFields(
  fields: RichTextBodyFields,
): Partial<Pick<TodoItem, 'body' | 'bodyFormat' | 'bodyPlainText'>> {
  if (!plainTextFromBodyFields(fields).trim()) {
    return { body: '' };
  }
  return {
    body: fields.body,
    bodyFormat: fields.bodyFormat,
    bodyPlainText: fields.bodyPlainText,
  };
}

export type InlineAddDraft = {
  title: string;
  body: RichTextBodyFields;
};

export function emptyInlineAddDraft(): InlineAddDraft {
  return { title: '', body: { body: '', bodyFormat: undefined, bodyPlainText: undefined } };
}

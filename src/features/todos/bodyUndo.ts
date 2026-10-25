import type { RichTextBodyFormat } from '../../lib/richText';
import type { RichTextBodyFields } from '../../lib/richTextBody';

type BodyLike = { body?: string; bodyFormat?: RichTextBodyFormat; bodyPlainText?: string };

export type BodyRestore =
  | { ok: true; patch: { body: string; bodyFormat: RichTextBodyFormat; bodyPlainText: string } }
  | { ok: false; reason: 'missing' | 'changed' };

/**
 * The patch that puts a task's details back as they were before an AI change appended to them.
 * It refuses when the task has been edited since (its body is no longer what the AI change wrote),
 * so Undo can never throw away newer text.
 *
 * `updateTodoItem` clears a body field when it is patched with an empty value, which is how a body
 * that had no format flag (older data) goes back to having none.
 */
export function bodyRestorePatch(
  current: BodyLike | undefined,
  applied: RichTextBodyFields,
  previous: BodyLike,
): BodyRestore {
  if (!current) return { ok: false, reason: 'missing' };
  if ((current.body ?? '') !== (applied.body ?? '')) return { ok: false, reason: 'changed' };
  return {
    ok: true,
    patch: {
      body: previous.body ?? '',
      bodyFormat: (previous.bodyFormat ?? '') as RichTextBodyFormat,
      bodyPlainText: previous.bodyPlainText ?? '',
    },
  };
}

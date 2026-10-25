import type { AppData, Item } from '../../core/model';
import { plainTextFromBodyFields } from '../richTextBody';
import { clip, isBlankText } from './prompts/shared';

export type PrepEntry = {
  kind: 'task' | 'goal' | 'feedback' | 'note';
  title: string;
  status: string;
  due?: string;
  text?: string;
};
export type PersonContext = { weeks: number; entries: PrepEntry[]; total: number };

const MAX_ENTRIES = 40;
const MAX_TITLE = 120;
const MAX_TEXT = 300;
const DAY = 86_400_000;

const time = (iso: string | undefined): number => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : NaN;
};
const day = (iso: string | undefined): string | undefined => {
  const t = time(iso);
  if (!Number.isFinite(t)) return undefined;
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function isOpen(it: Item): boolean {
  if (it.kind === 'task') return !it.done;
  if (it.kind === 'goal') return it.goalStatus !== 'completed' && it.goalStatus !== 'cancelled' && !it.done;
  return false;
}

function statusOf(it: Item): string {
  if (it.kind === 'feedback') return it.feedbackKind ?? 'feedback';
  if (it.kind === 'goal') return it.goalStatus ?? (it.done ? 'completed' : 'active');
  return isOpen(it) ? 'open' : 'done';
}

/**
 * What a 1:1 with one person can be prepared from: their open tasks and goals, and anything they
 * touched in the last `weeks`. Never carries the person's name, and leaves documents out.
 */
export function collectPersonContext(data: AppData, personId: string, { now, weeks }: { now: Date; weeks: number }): PersonContext {
  const since = now.getTime() - weeks * 7 * DAY;
  const mine = (data.items ?? []).filter((it) => it.personId === personId && it.kind !== 'document');

  const picked = mine
    .map((it) => {
      const seen = Math.max(time(it.updatedAt) || 0, time(it.createdAt) || 0);
      return { it, open: isOpen(it), seen, recent: seen >= since };
    })
    .filter((x) => x.open || x.recent)
    .map((x) => ({ ...x, title: clip(x.it.title.replace(/\s+/g, ' ').trim(), MAX_TITLE) }))
    .filter((x) => !isBlankText(x.title))
    .sort((a, b) => Number(b.open) - Number(a.open) || b.seen - a.seen);

  return {
    weeks,
    total: picked.length,
    entries: picked.slice(0, MAX_ENTRIES).map(({ it, title }) => {
      const text = clip(plainTextFromBodyFields(it).replace(/\s+/g, ' ').trim(), MAX_TEXT);
      return {
        kind: it.kind as PrepEntry['kind'],
        title,
        status: statusOf(it),
        ...(day(it.dueAt) ? { due: day(it.dueAt) } : {}),
        ...(isBlankText(text) ? {} : { text }),
      };
    }),
  };
}

/** The entries as plain lines for the prompt. */
export function describePersonContext(c: PersonContext): string {
  const lines = c.entries.map(
    (e) => `- ${e.kind}, ${e.status}${e.due ? `, due ${e.due}` : ''}: ${e.title}${e.text ? ` — ${e.text}` : ''}`,
  );
  return [
    `Last ${c.weeks} weeks (open tasks and goals are included whatever their age)`,
    ...(lines.length ? lines : ['- (nothing)']),
    ...(c.total > c.entries.length ? [`- … and ${c.total - c.entries.length} more`] : []),
  ].join('\n');
}

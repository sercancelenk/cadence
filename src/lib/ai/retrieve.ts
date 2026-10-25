import type { AppData } from '../../core/model';
import type { AISettings } from '../../model';
import { PATH_NOTES, PATH_TODOS } from '../routes';
import { plainTextFromBodyFields } from '../richTextBody';
import type { DataClass } from './types';
import { cosine, embedTexts } from './embeddings';
import { clip } from './prompts/shared';

export type Source = {
  /** The number the answer cites, starting at 1. */
  n: number;
  kind: 'note' | 'task' | 'person';
  id: string;
  title: string;
  snippet: string;
  score: number;
  href?: string;
};

const DEFAULT_LIMIT = 8;
const MAX_SNIPPET = 600;
const MAX_DOC_CHARS = 20_000;
const MAX_QUERY_TOKENS = 12;
const TOTAL_CHAR_BUDGET = 4_000_000;
const OVER_BUDGET_DOC_CHARS = 1_500;
const TITLE_WEIGHT = 3;
const K = 1.2;

/** Lowercase, accents and Turkish dotted/dotless i removed; `map[i]` is the source index of char i. */
function fold(text: string): { folded: string; map: number[] } {
  let folded = '';
  const map: number[] = [];
  let index = 0;
  for (const ch of text) {
    const f = foldChar(ch);
    for (let k = 0; k < f.length; k += 1) map.push(index);
    folded += f;
    index += ch.length;
  }
  return { folded, map };
}

const foldChar = (ch: string): string =>
  // Plain ASCII needs no accent handling; most text is.
  ch.charCodeAt(0) < 128 ? ch.toLowerCase() : ch.normalize('NFKD').replace(/\p{M}/gu, '').replace(/ı/g, 'i').toLowerCase();

/** The folded text only (no index map): the cheap path for scoring, which never needs positions. */
function foldedText(text: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\u0000-\u007f]*$/.test(text)) return text.toLowerCase();
  let out = '';
  for (const ch of text) out += foldChar(ch);
  return out;
}

const tokens = (folded: string): string[] => folded.split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= 2);

/** Each distinct word with how often it occurs. */
function counts(list: readonly string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of list) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}

type Doc = { source: Omit<Source, 'n' | 'score' | 'snippet'>; title: string; text: string };

function documents(data: AppData, includePeople: boolean): Doc[] {
  const docs: Doc[] = [];
  for (const n of data.notes ?? []) {
    if (n.locked || n.archived) continue;
    docs.push({
      source: { kind: 'note', id: n.id, title: n.title || 'Untitled note', href: `${PATH_NOTES}?id=${encodeURIComponent(n.id)}` },
      title: n.title,
      text: plainTextFromBodyFields(n),
    });
  }
  for (const t of data.todoItems ?? []) {
    if (t.archived) continue;
    docs.push({
      source: { kind: 'task', id: t.id, title: t.title || 'Untitled task', href: `${PATH_TODOS}?focus=${encodeURIComponent(t.id)}` },
      title: t.title,
      text: plainTextFromBodyFields(t),
    });
  }
  if (includePeople) {
    const people = new Map((data.people ?? []).map((p) => [p.id, p]));
    for (const it of data.items ?? []) {
      const person = people.get(it.personId);
      docs.push({
        source: {
          kind: 'person',
          id: it.id,
          title: it.title || 'Untitled',
          ...(person ? { href: `/teams/${encodeURIComponent(person.teamId)}/people/${encodeURIComponent(person.id)}` } : {}),
        },
        title: it.title,
        text: plainTextFromBodyFields(it),
      });
    }
  }
  return docs;
}

/** How many document words are the query word, or share its stem (one starts with the other, 4+ letters). */
function termCount(words: ReadonlyMap<string, number>, q: string): number {
  let c = words.get(q) ?? 0;
  if (q.length >= 4) {
    for (const [t, n] of words) {
      if (t === q) continue;
      if (t.startsWith(q) || (t.length >= 4 && q.startsWith(t))) c += n;
    }
  }
  return c;
}

function snippetAround(text: string, queryTokens: readonly string[]): string {
  const { folded, map } = fold(text);
  let at = -1;
  for (const q of queryTokens) {
    const i = folded.indexOf(q);
    if (i !== -1 && (at === -1 || i < at)) at = i;
  }
  const from = at === -1 ? 0 : Math.max(0, (map[at] ?? 0) - 120);
  const piece = text.slice(from, from + MAX_SNIPPET).replace(/\s+/g, ' ').trim();
  return clip(piece, MAX_SNIPPET);
}

/**
 * Keyword retrieval over the user's own notes and tasks (and, only when asked, people records).
 * Locked and archived items are never read. Runs on this computer; nothing is sent.
 */
export function retrieve(data: AppData, query: string, opts: { includePeople?: boolean; limit?: number }): Source[] {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const queryTokens = [...new Set(tokens(foldedText(query)))].slice(0, MAX_QUERY_TOKENS);
  if (queryTokens.length === 0) return [];

  // Past a total budget, later documents are read only at their start, so a very large workspace
  // costs a bounded amount of work; ordinary workspaces never reach it.
  let budget = TOTAL_CHAR_BUDGET;
  const docs = documents(data, opts.includePeople === true).map((d) => {
    const text = d.text.slice(0, budget > 0 ? MAX_DOC_CHARS : OVER_BUDGET_DOC_CHARS);
    budget -= text.length;
    const titleWords = counts(tokens(foldedText(d.title)));
    const bodyWords = counts(tokens(foldedText(text)));
    // Each query word is counted once per document and reused for both the idf and the score.
    const title = queryTokens.map((q) => termCount(titleWords, q));
    const body = queryTokens.map((q) => termCount(bodyWords, q));
    return { d, text, title, body };
  });
  const N = docs.length;
  const idf = queryTokens.map((_, qi) => {
    const df = docs.reduce((n, x) => n + (x.title[qi]! + x.body[qi]! > 0 ? 1 : 0), 0);
    return Math.log(1 + (N - df + 0.5) / (df + 0.5));
  });

  const scored = docs
    .map((x, order) => {
      let score = 0;
      queryTokens.forEach((_, qi) => {
        const tf = x.body[qi]! + TITLE_WEIGHT * x.title[qi]!;
        if (tf > 0) score += idf[qi]! * ((tf * (K + 1)) / (tf + K));
      });
      return { x, score, order };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, limit);

  return scored.map((s, i) => ({
    ...s.x.d.source,
    n: i + 1,
    score: s.score,
    snippet: snippetAround(s.x.text || s.x.d.title, queryTokens),
  }));
}

/**
 * Re-orders keyword candidates by meaning, only when the connection has an embedding model set.
 * Any failure keeps the keyword order: search by meaning never blocks an answer.
 */
export async function rerankWithEmbeddings(args: {
  settings: AISettings;
  query: string;
  sources: Source[];
  limit: number;
  dataClass: DataClass;
  signal?: AbortSignal;
}): Promise<Source[]> {
  const { settings, query, sources, limit } = args;
  const keep = () => sources.slice(0, limit).map((s, i) => ({ ...s, n: i + 1 }));
  if (!settings.embeddingModel?.trim() || sources.length <= 1) return keep();
  try {
    const vectors = await embedTexts({
      settings,
      texts: [query, ...sources.map((s) => `${s.title}\n${s.snippet}`)],
      dataClass: args.dataClass,
      signal: args.signal,
    });
    const [q, ...rest] = vectors;
    if (!q || rest.length !== sources.length) return keep();
    return sources
      .map((s, index) => ({ s, index, sim: cosine(q, rest[index] ?? []) }))
      .sort((a, b) => b.sim - a.sim || a.index - b.index)
      .slice(0, limit)
      .map((x, i) => ({ ...x.s, n: i + 1 }));
  } catch {
    return keep();
  }
}

/** Which `[n]` an answer cites, and which of those are not among the sources. */
export function checkCitations(answer: string, sources: readonly Source[]): { cited: number[]; unknown: number[] } {
  const known = new Set(sources.map((s) => s.n));
  const cited = new Set<number>();
  const unknown = new Set<number>();
  for (const m of answer.matchAll(/\[(\d{1,3})\]/g)) {
    const n = Number(m[1]);
    (known.has(n) ? cited : unknown).add(n);
  }
  return { cited: [...cited].sort((a, b) => a - b), unknown: [...unknown].sort((a, b) => a - b) };
}

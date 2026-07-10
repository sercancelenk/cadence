/**
 * Plain-text find / replace primitives for the Markdown (`<textarea>`) editor.
 *
 * Pure and allocation-light: matches are non-overlapping, left-to-right, and
 * case sensitivity is opt-in. Kept dependency-free and separately tested so
 * the editor integration stays a thin controller over these helpers.
 */

export interface TextMatch {
  /** Inclusive start offset in the source string. */
  start: number;
  /** Exclusive end offset in the source string. */
  end: number;
}

/**
 * All non-overlapping occurrences of `query` in `text`, left to right.
 * Empty query yields no matches.
 */
export function findTextMatches(text: string, query: string, caseSensitive: boolean): TextMatch[] {
  if (!query) return [];
  const hay = caseSensitive ? text : text.toLowerCase();
  const needle = caseSensitive ? query : query.toLowerCase();
  const matches: TextMatch[] = [];
  const step = Math.max(needle.length, 1);
  let from = 0;
  while (from <= hay.length) {
    const idx = hay.indexOf(needle, from);
    if (idx === -1) break;
    matches.push({ start: idx, end: idx + needle.length });
    from = idx + step;
  }
  return matches;
}

/**
 * Index (0-based) of the match that starts exactly at `caret`, or the first
 * match at/after `caret`, else -1. Used to keep the "N of M" counter and the
 * next/prev cursor aligned with the textarea selection.
 */
export function matchIndexAtOrAfter(matches: TextMatch[], caret: number): number {
  for (let i = 0; i < matches.length; i += 1) {
    if (matches[i]!.start >= caret) return i;
  }
  return -1;
}

/**
 * Replace every non-overlapping occurrence of `query` with `replacement`.
 * Returns the original string unchanged when there are no matches (so callers
 * can skip a no-op persist).
 */
export function replaceAllText(
  text: string,
  query: string,
  replacement: string,
  caseSensitive: boolean,
): string {
  const matches = findTextMatches(text, query, caseSensitive);
  if (matches.length === 0) return text;
  let out = '';
  let last = 0;
  for (const m of matches) {
    out += text.slice(last, m.start) + replacement;
    last = m.end;
  }
  out += text.slice(last);
  return out;
}

/**
 * Replace a single occurrence at the given `[start, end)` span. The caller is
 * responsible for having located a real match; this is a pure splice.
 */
export function replaceRange(text: string, start: number, end: number, replacement: string): string {
  return text.slice(0, start) + replacement + text.slice(end);
}

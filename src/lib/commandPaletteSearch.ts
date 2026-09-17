/**
 * Pure matching helpers behind the ⌘K palette.
 *
 * Kept out of the component so the ranking rules can be tested without a DOM,
 * and so the component file stays about rendering.
 */

export type SearchableCommand = {
  group: string;
  label: string;
  hint?: string;
  searchText?: string;
};

/** Most rows the palette renders at once. */
export const COMMAND_PALETTE_RESULT_LIMIT = 50;

/**
 * Case-fold for matching, with the dotted/dotless I collapsed onto plain `i`.
 *
 * `String.prototype.toLowerCase` is locale-independent, and for `İ` (U+0130)
 * the Unicode default mapping is `i` + COMBINING DOT ABOVE — two code points.
 * So `'İstanbul'.toLowerCase().includes('istanbul')` is *false*, and a Turkish
 * user searching their own notes gets nothing back. `ı` (U+0131) has the
 * mirror problem: it never folds onto the `i` that `I` lowercases to, so
 * "IŞIK" and "ışık" fail to match each other.
 *
 * Substituting before lowercasing (rather than stripping the combining mark
 * afterwards) keeps this a 1:1 code point mapping, so the folded string is
 * always the same length as the input. `buildSnippet` depends on that: it
 * finds the index in the folded text and slices the original.
 */
export function foldForSearch(text: string): string {
  return text.replace(/[\u0130\u0131]/g, 'i').toLowerCase();
}

/**
 * Split the query on whitespace; every token must appear somewhere in a row's
 * haystack. That way "alice rollout" finds a note containing both words even
 * when paragraphs apart, and stray spaces never return zero.
 */
export function tokenizeQuery(query: string): string[] {
  return foldForSearch(query.trim())
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

/**
 * Rows whose combined text contains every token, capped at
 * `COMMAND_PALETTE_RESULT_LIMIT`.
 *
 * Stops as soon as the cap is reached: with thousands of notes, the tail of
 * the list can never reach the screen, so building the haystack for it is
 * wasted work on every keystroke.
 */
export function matchCommands<T extends SearchableCommand>(
  commands: readonly T[],
  tokens: readonly string[],
  limit = COMMAND_PALETTE_RESULT_LIMIT,
): T[] {
  if (tokens.length === 0) return commands.slice(0, limit);
  const matches: T[] = [];
  for (const c of commands) {
    const hay = foldForSearch(`${c.label} ${c.group} ${c.hint ?? ''} ${c.searchText ?? ''}`);
    if (tokens.every((t) => hay.includes(t))) {
      matches.push(c);
      if (matches.length === limit) break;
    }
  }
  return matches;
}

/**
 * The row an Enter keypress should run.
 *
 * The palette renders its result list from a deferred copy of the query so
 * typing stays responsive on large workspaces. That means in the render right
 * after a keystroke, the visible list still describes the *previous* query —
 * and running the highlighted row there executes whatever the old query had
 * selected. Type "settings", press Enter quickly enough, and the palette
 * creates a note instead.
 *
 * So when the two queries disagree, the match is redone against what is
 * actually in the input. The cursor belongs to the stale list and a query
 * change always resets it, so the top row is what the settled render would
 * have offered. Enter then does the same thing whether or not React had time
 * to catch up, which is the only way the palette can be trusted at speed.
 */
export function submittedCommand<T extends SearchableCommand>(
  commands: readonly T[],
  {
    query,
    deferredQuery,
    filtered,
    cursor,
  }: { query: string; deferredQuery: string; filtered: readonly T[]; cursor: number },
): T | undefined {
  if (query === deferredQuery) return filtered[cursor];
  return matchCommands(commands, tokenizeQuery(query))[0];
}

/** True when the query is already visible in the row itself. */
export function labelMatchesTokens(
  command: SearchableCommand,
  tokens: readonly string[],
): boolean {
  if (tokens.length === 0) return false;
  const hay = foldForSearch(`${command.label} ${command.hint ?? ''}`);
  return tokens.some((t) => hay.includes(t));
}

/**
 * A short, single-line excerpt around the first matching token. Multi-line
 * bodies get flattened so the snippet renders on one row; we keep ~60 chars of
 * context on each side and mark sliced ends with an ellipsis.
 */
export function buildSnippet(body: string, tokens: readonly string[]): string | null {
  const flat = body.replace(/\s+/g, ' ').trim();
  if (!flat) return null;
  // Same length as `flat` (see `foldForSearch`), so an index found here is a
  // valid index into the original text.
  const lower = foldForSearch(flat);
  let bestIdx = -1;
  let bestLen = 0;
  for (const t of tokens) {
    const i = lower.indexOf(t);
    // Prefer the leftmost hit, but bias towards longer tokens on a tie — gives
    // more meaningful context than a 1-char "a".
    if (i !== -1 && (bestIdx === -1 || i < bestIdx || (i === bestIdx && t.length > bestLen))) {
      bestIdx = i;
      bestLen = t.length;
    }
  }
  if (bestIdx === -1) return null;
  const CONTEXT = 60;
  const start = Math.max(0, bestIdx - CONTEXT);
  const end = Math.min(flat.length, bestIdx + bestLen + CONTEXT);
  const prefix = start > 0 ? '… ' : '';
  const suffix = end < flat.length ? ' …' : '';
  return `${prefix}${flat.slice(start, end)}${suffix}`;
}

export function groupBy<T, K extends string>(items: readonly T[], key: (item: T) => K): [K, T[]][] {
  const map = new Map<K, T[]>();
  for (const it of items) {
    const k = key(it);
    const bucket = map.get(k);
    if (bucket) bucket.push(it);
    else map.set(k, [it]);
  }
  return Array.from(map.entries());
}

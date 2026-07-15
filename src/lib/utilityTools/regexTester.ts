export const MAX_REGEX_PATTERN_LEN = 500;
/** Live tester input cap — keeps catastrophic backtracking bounded on the UI thread. */
export const MAX_REGEX_INPUT_LEN = 25_000;
export const MAX_REGEX_MATCHES = 500;

/** Documented JS RegExp flags shown in the Tools UI. */
export const REGEX_FLAG_OPTIONS = [
  {
    id: 'g',
    name: 'Global',
    tip: 'Find all matches (not only the first). The tester always enables this when enumerating.',
  },
  {
    id: 'i',
    name: 'Ignore case',
    tip: 'Case-insensitive matching — Hello matches hello.',
  },
  {
    id: 'm',
    name: 'Multiline',
    tip: '^ and $ match the start/end of each line, not only the whole string.',
  },
  {
    id: 's',
    name: 'DotAll',
    tip: 'The dot (.) also matches newline characters.',
  },
  {
    id: 'u',
    name: 'Unicode',
    tip: 'Treat the pattern as Unicode — enables \\p{…} and proper surrogate pairs.',
  },
  {
    id: 'y',
    name: 'Sticky',
    tip: 'Match only from lastIndex (advanced). Rarely needed in this tester.',
  },
  {
    id: 'd',
    name: 'Indices',
    tip: 'Expose match indices on the result (advanced / debugging).',
  },
] as const;

export type RegexFlagId = (typeof REGEX_FLAG_OPTIONS)[number]['id'];

/** Common preset combinations for the quick dropdown. */
export const REGEX_FLAG_PRESETS: Array<{ value: string; label: string }> = [
  { value: 'g', label: 'g — Global' },
  { value: 'gi', label: 'gi — Global + ignore case' },
  { value: 'gim', label: 'gim — Global + ignore case + multiline' },
  { value: 'gs', label: 'gs — Global + DotAll' },
  { value: 'gis', label: 'gis — Global + ignore case + DotAll' },
  { value: 'iu', label: 'iu — Ignore case + Unicode' },
  { value: 'custom', label: 'Custom…' },
];

export type RegexMatchHit = { index: number; text: string; groups: string[] };

export type RegexTestResult =
  | {
      ok: true;
      flags: string;
      matches: RegexMatchHit[];
      truncated: boolean;
    }
  | { ok: false; error: string };

const ALLOWED_FLAGS = new Set(['g', 'i', 'm', 's', 'u', 'y', 'd']);

export function normalizeRegexFlags(raw: string): { ok: true; flags: string } | { ok: false; error: string } {
  const seen = new Set<string>();
  for (const ch of raw) {
    if (!ALLOWED_FLAGS.has(ch)) {
      return { ok: false, error: `Unsupported flag "${ch}". Allowed: g i m s u y d.` };
    }
    if (seen.has(ch)) return { ok: false, error: `Duplicate flag "${ch}".` };
    seen.add(ch);
  }
  // Always use global for enumeration; preserve user intent via returned flags string.
  if (!seen.has('g')) seen.add('g');
  return { ok: true, flags: [...seen].sort().join('') };
}

/**
 * Heuristic guard against classic nested-quantifier ReDoS shapes such as (a+)+ or (a*)*.
 * Not exhaustive — pairs with the input length cap below.
 */
export function looksCatastrophicRegex(pattern: string): boolean {
  // Nested quantifiers on a group: (…+)+, (…*)*, (…?)*, (…{n,})+ etc.
  if (/\((?:[^()\\]|\\.)*[+*](?:[^()\\]|\\.)*\)[+*{]/.test(pattern)) return true;
  if (/\((?:[^()\\]|\\.)*\?[+*]/.test(pattern)) return true;
  // Nested quantifiers on a character class: [a-z]+)+
  if (/\[[^\]]*\][+*][+*{]/.test(pattern)) return true;
  return false;
}

/**
 * Test a pattern against input with length caps and a nested-quantifier guard
 * (mitigates casual ReDoS / UI lock on the renderer thread).
 */
export function testRegex(pattern: string, input: string, flagsRaw = ''): RegexTestResult {
  if (pattern.length > MAX_REGEX_PATTERN_LEN) {
    return { ok: false, error: `Pattern exceeds ${MAX_REGEX_PATTERN_LEN} characters.` };
  }
  if (input.length > MAX_REGEX_INPUT_LEN) {
    return {
      ok: false,
      error: `Input exceeds ${MAX_REGEX_INPUT_LEN.toLocaleString()} characters (tester cap).`,
    };
  }
  if (looksCatastrophicRegex(pattern)) {
    return {
      ok: false,
      error:
        'Pattern looks like nested quantifiers that can freeze the UI (ReDoS). Simplify the expression.',
    };
  }
  const flags = normalizeRegexFlags(flagsRaw);
  if (!flags.ok) return flags;

  let re: RegExp;
  try {
    re = new RegExp(pattern, flags.flags);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Invalid regular expression.' };
  }

  const matches: RegexMatchHit[] = [];
  let truncated = false;
  let m: RegExpExecArray | null;
  let guard = 0;
  const started = Date.now();
  const budgetMs = 250;
  while ((m = re.exec(input)) !== null) {
    if (Date.now() - started > budgetMs) {
      return {
        ok: false,
        error: 'Regex timed out after 250ms — simplify the pattern or shorten the input.',
      };
    }
    matches.push({
      index: m.index,
      text: m[0] ?? '',
      groups: m.slice(1).map((g) => g ?? ''),
    });
    if (m[0] === '') {
      // Zero-width: advance to avoid infinite loop
      re.lastIndex = m.index + 1;
    }
    guard += 1;
    if (matches.length >= MAX_REGEX_MATCHES || guard > MAX_REGEX_MATCHES + 5) {
      truncated = true;
      break;
    }
  }

  return { ok: true, flags: flags.flags, matches, truncated };
}

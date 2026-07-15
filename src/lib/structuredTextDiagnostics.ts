/**
 * Structural diagnostics for invalid JSON — used by CodeMirror lint + status.
 * Heuristics run only after JSON.parse fails; they never rewrite the document.
 */

export type StructuredTextDiagnostic = {
  from: number;
  to: number;
  severity: 'error';
  message: string;
  /** 0-based line. */
  line: number;
};

function lineColAt(text: string, index: number): { line: number; col: number } {
  let line = 0;
  let lastNl = -1;
  const limit = Math.min(Math.max(0, index), text.length);
  for (let i = 0; i < limit; i++) {
    if (text[i] === '\n') {
      line++;
      lastNl = i;
    }
  }
  return { line, col: limit - lastNl - 1 };
}

function rangeForIndex(
  text: string,
  index: number,
  lineAt: (lineNumber: number) => { from: number; to: number },
): { from: number; to: number; line: number } {
  const { line, col } = lineColAt(text, index);
  try {
    const row = lineAt(line + 1); // CodeMirror lines are 1-based in doc.line()
    const from = Math.min(row.to, row.from + Math.max(0, col));
    const to = Math.min(row.to, Math.max(from + 1, from));
    return { from, to, line };
  } catch {
    const from = Math.min(index, Math.max(0, text.length - 1));
    return { from, to: Math.min(text.length, from + 1), line };
  }
}

/** Map JSON.parse error message → character index when possible. */
export function jsonErrorPosition(message: string, source: string): number | undefined {
  const posMatch = message.match(/position\s+(\d+)/i);
  if (posMatch) {
    const pos = Number(posMatch[1]);
    if (Number.isFinite(pos) && pos >= 0) return Math.min(pos, source.length);
  }
  const lineMatch = message.match(/line\s+(\d+)/i);
  if (lineMatch) {
    const line1 = Number(lineMatch[1]);
    if (!Number.isFinite(line1) || line1 < 1) return undefined;
    let line = 1;
    for (let i = 0; i < source.length; i++) {
      if (line === line1) return i;
      if (source[i] === '\n') line++;
    }
  }
  return undefined;
}

function pushUnique(
  out: StructuredTextDiagnostic[],
  issue: StructuredTextDiagnostic,
): void {
  if (out.some((d) => d.line === issue.line && d.message === issue.message)) return;
  out.push(issue);
}

/**
 * Scan invalid JSON for common structural problems beyond the first parse error.
 * Safe for lint only — never used to mutate the document.
 */
export function scanJsonStructuralIssues(text: string): Array<{ index: number; message: string }> {
  const issues: Array<{ index: number; message: string }> = [];
  const stack: Array<{ ch: '{' | '['; index: number }> = [];
  let inString = false;
  let escape = false;
  let stringStart = -1;
  /** After a complete value, the next non-space token must be `,` `}` or `]`. */
  let needCommaOrClose = false;

  const isValueStart = (ch: string) =>
    ch === '"' || ch === '{' || ch === '[' || ch === '-' || (ch >= '0' && ch <= '9') || ch === 't' || ch === 'f' || ch === 'n';

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;

    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
        needCommaOrClose = true;
      } else if (ch === '\n') {
        issues.push({
          index: stringStart >= 0 ? stringStart : i,
          message: 'Unclosed string (line break inside quotes)',
        });
        inString = false;
        needCommaOrClose = false;
      }
      continue;
    }

    if (ch === '"') {
      if (needCommaOrClose) {
        issues.push({ index: i, message: 'Expected comma between values' });
        needCommaOrClose = false;
      }
      inString = true;
      stringStart = i;
      continue;
    }

    if (/\s/.test(ch)) continue;

    if (needCommaOrClose) {
      if (ch === ',' ) {
        needCommaOrClose = false;
        continue;
      }
      if (ch === '}' || ch === ']') {
        needCommaOrClose = false;
        // fall through to bracket handling
      } else if (isValueStart(ch) || ch === ':') {
        if (ch !== ':') {
          issues.push({ index: i, message: 'Expected comma between values' });
        }
        needCommaOrClose = false;
        // fall through
      } else {
        needCommaOrClose = false;
      }
    }

    if (ch === '{' || ch === '[') {
      stack.push({ ch, index: i });
      continue;
    }

    if (ch === '}' || ch === ']') {
      const open = stack.pop();
      if (!open) {
        issues.push({ index: i, message: `Unexpected closing ${ch}` });
        continue;
      }
      const expected = open.ch === '{' ? '}' : ']';
      if (ch !== expected) {
        issues.push({
          index: i,
          message: `Mismatched bracket: expected ${expected} to close ${open.ch}`,
        });
      }
      needCommaOrClose = true;
      continue;
    }

    if (ch === ':') {
      needCommaOrClose = false;
      continue;
    }

    if (ch === ',') {
      needCommaOrClose = false;
      continue;
    }

    // literals / numbers — mark value end roughly at token end
    if (isValueStart(ch)) {
      // skip token
      if (ch === 't' && text.slice(i, i + 4) === 'true') {
        i += 3;
        needCommaOrClose = true;
      } else if (ch === 'f' && text.slice(i, i + 5) === 'false') {
        i += 4;
        needCommaOrClose = true;
      } else if (ch === 'n' && text.slice(i, i + 4) === 'null') {
        i += 3;
        needCommaOrClose = true;
      } else if (ch === '-' || (ch >= '0' && ch <= '9')) {
        while (i + 1 < text.length && /[0-9.eE+-]/.test(text[i + 1]!)) i++;
        needCommaOrClose = true;
      }
    }
  }

  if (inString) {
    issues.push({
      index: stringStart >= 0 ? stringStart : text.length,
      message: 'Unclosed string',
    });
  }

  while (stack.length) {
    const open = stack.pop()!;
    issues.push({
      index: open.index,
      message: `Unclosed ${open.ch === '{' ? 'object' : 'array'}`,
    });
  }

  return issues;
}

export function collectStructuredTextJsonDiagnostics(
  text: string,
  lineAt: (lineNumber: number) => { from: number; to: number },
): StructuredTextDiagnostic[] {
  if (!text.trim()) return [];

  try {
    JSON.parse(text);
    return [];
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid JSON';
    const out: StructuredTextDiagnostic[] = [];
    const pos = jsonErrorPosition(message, text) ?? 0;
    const primary = rangeForIndex(text, pos, lineAt);
    pushUnique(out, {
      from: primary.from,
      to: primary.to,
      severity: 'error',
      message,
      line: primary.line,
    });

    for (const issue of scanJsonStructuralIssues(text)) {
      const loc = rangeForIndex(text, issue.index, lineAt);
      pushUnique(out, {
        from: loc.from,
        to: loc.to,
        severity: 'error',
        message: issue.message,
        line: loc.line,
      });
    }

    // Stable order by position.
    out.sort((a, b) => a.from - b.from || a.message.localeCompare(b.message));
    return out;
  }
}

export function summarizeJsonDiagnostics(diagnostics: StructuredTextDiagnostic[]): string {
  if (diagnostics.length === 0) return 'Invalid JSON';
  if (diagnostics.length === 1) {
    const d = diagnostics[0]!;
    return `Line ${d.line + 1}: ${d.message}`;
  }
  const first = diagnostics[0]!;
  return `${diagnostics.length} issues — first at line ${first.line + 1}: ${first.message}`;
}

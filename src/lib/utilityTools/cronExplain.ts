export type CronExplainResult = { ok: true; summary: string; parts: string[] } | { ok: false; error: string };

const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function describeField(
  value: string,
  kind: 'minute' | 'hour' | 'dom' | 'month' | 'dow',
): string {
  const v = value.trim();
  if (v === '*') {
    if (kind === 'minute') return 'every minute';
    if (kind === 'hour') return 'every hour';
    if (kind === 'dom') return 'every day of the month';
    if (kind === 'month') return 'every month';
    return 'every day of the week';
  }
  if (v.startsWith('*/')) {
    const step = v.slice(2);
    if (kind === 'minute') return `every ${step} minutes`;
    if (kind === 'hour') return `every ${step} hours`;
    if (kind === 'dom') return `every ${step} days of the month`;
    if (kind === 'month') return `every ${step} months`;
    return `every ${step} days of the week`;
  }
  if (v.includes(',')) {
    const bits = v.split(',').map((b) => describeField(b, kind).replace(/^at /, '').replace(/^on /, ''));
    return bits.join(', ');
  }
  if (v.includes('-')) {
    const [a, b] = v.split('-');
    if (kind === 'dow') {
      const da = DOW[normalizeDow(Number(a))] ?? a;
      const db = DOW[normalizeDow(Number(b))] ?? b;
      return `${da}–${db}`;
    }
    if (kind === 'month') {
      const ma = MON[Number(a) - 1] ?? a;
      const mb = MON[Number(b) - 1] ?? b;
      return `${ma}–${mb}`;
    }
    return `${a}–${b}`;
  }
  if (kind === 'minute') return `at minute ${v}`;
  if (kind === 'hour') return `at hour ${v}`;
  if (kind === 'dom') return `on day-of-month ${v}`;
  if (kind === 'month') return `in ${MON[Number(v) - 1] ?? `month ${v}`}`;
  return `on ${DOW[normalizeDow(Number(v))] ?? `weekday ${v}`}`;
}

/** Sunday may be 0 or 7 in classic cron. */
function normalizeDow(n: number): number {
  return n === 7 ? 0 : n;
}

function isValidCronToken(tok: string, min: number, max: number): boolean {
  if (tok === '*') return true;
  if (/^\*\/\d+$/.test(tok)) {
    const step = Number(tok.slice(2));
    return Number.isInteger(step) && step >= 1 && step <= max;
  }
  if (tok.includes(',')) return tok.split(',').every((p) => isValidCronToken(p, min, max));
  if (tok.includes('-')) {
    const [a, b] = tok.split('-').map(Number);
    return (
      Number.isInteger(a) &&
      Number.isInteger(b) &&
      a! >= min &&
      b! <= max &&
      a! <= b!
    );
  }
  const n = Number(tok);
  return Number.isInteger(n) && n >= min && n <= max;
}

/**
 * Explain a classic 5-field cron (minute hour dom month dow).
 * Not a full Quartz/6-field parser — fails loud on unsupported shapes.
 */
export function explainCron(expression: string): CronExplainResult {
  const trimmed = expression.trim().replace(/\s+/g, ' ');
  if (!trimmed) return { ok: false, error: 'Enter a 5-field cron expression (e.g. 0 0 * * *).' };
  const parts = trimmed.split(' ');
  if (parts.length !== 5) {
    return { ok: false, error: 'Expected exactly 5 fields: minute hour day-of-month month day-of-week.' };
  }
  const [minute, hour, dom, month, dow] = parts as [string, string, string, string, string];
  if (!isValidCronToken(minute, 0, 59)) return { ok: false, error: 'Invalid minute field (0–59).' };
  if (!isValidCronToken(hour, 0, 23)) return { ok: false, error: 'Invalid hour field (0–23).' };
  if (!isValidCronToken(dom, 1, 31)) return { ok: false, error: 'Invalid day-of-month field (1–31).' };
  if (!isValidCronToken(month, 1, 12)) return { ok: false, error: 'Invalid month field (1–12).' };
  if (!isValidCronToken(dow, 0, 7)) return { ok: false, error: 'Invalid day-of-week field (0–7, Sunday=0 or 7).' };

  // Special-case common “every day at midnight”
  if (minute === '0' && hour === '0' && dom === '*' && month === '*' && (dow === '*' || dow === '0-6')) {
    return {
      ok: true,
      summary: 'Every day at midnight (00:00).',
      parts: ['at minute 0', 'at hour 0', 'every day of the month', 'every month', 'every day of the week'],
    };
  }

  const described = [
    describeField(minute, 'minute'),
    describeField(hour, 'hour'),
    describeField(dom, 'dom'),
    describeField(month, 'month'),
    describeField(dow, 'dow'),
  ];

  // Friendly composition for */N * * * *
  let summary: string;
  if (minute.startsWith('*/') && hour === '*' && dom === '*' && month === '*' && dow === '*') {
    summary = `Every ${minute.slice(2)} minutes.`;
  } else if (minute === '0' && hour.startsWith('*/') && dom === '*' && month === '*' && dow === '*') {
    summary = `Every ${hour.slice(2)} hours, on the hour.`;
  } else if (dom !== '*' && dow !== '*') {
    summary = `Runs ${described.join('; ')}. Note: classic Vixie cron treats day-of-month and day-of-week as OR when both are restricted.`;
  } else {
    summary = `Runs ${described.join('; ')}.`;
  }

  return { ok: true, summary, parts: described };
}

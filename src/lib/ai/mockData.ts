/**
 * Mock data from a JSON sample. The model proposes records; this checks every one against the
 * shape of the sample (same keys, same kinds of values) before anything is offered, so a made-up
 * record can never carry an unexpected field into the user's workspace.
 */

const MAX_SAMPLE_CHARS = 8_000;
const MAX_EXAMPLES = 5;
export const MAX_MOCK_RECORDS = 50;

type Rec = Record<string, unknown>;

export function parseSampleRecords(text: string): { ok: true; records: Rec[] } | { ok: false; error: string } {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: 'This tab is empty. Paste a JSON sample first.' };
  if (trimmed.length > MAX_SAMPLE_CHARS) return { ok: false, error: `The sample is too large (over ${MAX_SAMPLE_CHARS.toLocaleString('en-US')} characters). Use a smaller example.` };
  let value: unknown;
  try {
    value = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: 'The JSON on this tab is not valid. Fix it first.' };
  }
  const list = Array.isArray(value) ? value : [value];
  const records = list.filter((v): v is Rec => !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v as Rec).length > 0);
  if (records.length === 0 || records.length !== list.length) {
    return { ok: false, error: 'Use an object, or a list of objects, as the sample.' };
  }
  return { ok: true, records: records.slice(0, MAX_EXAMPLES) };
}

type Kind = 'string' | 'number' | 'boolean' | 'null' | 'array' | 'object';
const kindOf = (v: unknown): Kind =>
  v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v === 'object' ? 'object' : (typeof v as 'string' | 'number' | 'boolean');

type Shape = { kind: Kind; fields?: Map<string, { shape: Shape; required: boolean }> };

function shapeOf(values: unknown[]): Shape {
  const kinds = new Set(values.map(kindOf));
  // A null among other values (or on its own) means "may be empty"; the others decide the kind.
  const real = [...kinds].filter((k) => k !== 'null');
  const kind: Kind = real.length === 1 ? real[0] : kinds.has('null') && real.length === 0 ? 'null' : real[0] ?? 'null';
  if (kind !== 'object') return { kind: kinds.has('null') && real.length === 0 ? 'null' : kind };
  const objects = values.filter((v): v is Rec => kindOf(v) === 'object');
  const keys = new Set(objects.flatMap((o) => Object.keys(o)));
  const fields = new Map<string, { shape: Shape; required: boolean }>();
  for (const key of keys) {
    const present = objects.filter((o) => Object.hasOwn(o, key));
    fields.set(key, { shape: shapeOf(present.map((o) => o[key])), required: present.length === objects.length });
  }
  return { kind: 'object', fields };
}

function matches(shape: Shape, value: unknown): boolean {
  const kind = kindOf(value);
  if (shape.kind === 'null') return kind !== 'object' && kind !== 'array';
  if (kind === 'null') return true; // the sample always has a value here; null is a fair "unknown"
  if (shape.kind !== kind) return false;
  if (shape.kind !== 'object') return true;
  const obj = value as Rec;
  for (const key of Object.keys(obj)) if (!shape.fields?.has(key)) return false;
  for (const [key, field] of shape.fields ?? []) {
    if (!Object.hasOwn(obj, key)) {
      if (field.required) return false;
      continue;
    }
    if (!matches(field.shape, obj[key])) return false;
  }
  return true;
}

export function validateMockRecords(sample: Rec[], candidates: unknown[]): { records: Rec[]; dropped: number } {
  const shape = shapeOf(sample);
  const records: Rec[] = [];
  let dropped = 0;
  for (const c of candidates) {
    if (kindOf(c) === 'object' && matches(shape, c)) {
      if (records.length < MAX_MOCK_RECORDS) records.push(c as Rec);
    } else {
      dropped += 1;
    }
  }
  return { records, dropped };
}

export type JsonCodeLang = 'typescript' | 'java' | 'go';

export type JsonToCodeResult = { ok: true; code: string } | { ok: false; error: string };

/** @deprecated Prefer JsonToCodeResult — kept for existing imports. */
export type JsonToTsResult = JsonToCodeResult;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function sanitizeIdent(key: string): string {
  const cleaned = key.replace(/[^A-Za-z0-9_]/g, '_');
  if (/^[A-Za-z_]/.test(cleaned)) return cleaned;
  return `_${cleaned}`;
}

function pascal(name: string): string {
  const s = sanitizeIdent(name);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function camel(name: string): string {
  const s = sanitizeIdent(name);
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function uniqueName(base: string, existing: Set<string>): string {
  let name = base || 'Root';
  if (!existing.has(name)) return name;
  let i = 2;
  while (existing.has(`${base}${i}`)) i += 1;
  return `${base}${i}`;
}

type StructDef = { name: string; fields: Array<{ key: string; type: string }> };

export const MAX_JSON_TYPE_DEPTH = 48;
export const MAX_JSON_TYPE_NODES = 2_000;

class JsonToCodeLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JsonToCodeLimitError';
  }
}

function collectStructs(
  value: unknown,
  name: string,
  structs: Map<string, StructDef>,
  depth: number,
  budget: { nodes: number },
): string {
  budget.nodes += 1;
  if (budget.nodes > MAX_JSON_TYPE_NODES) {
    throw new JsonToCodeLimitError(
      `JSON is too large to infer types (max ${MAX_JSON_TYPE_NODES.toLocaleString()} nodes).`,
    );
  }
  if (depth > MAX_JSON_TYPE_DEPTH) {
    throw new JsonToCodeLimitError(
      `JSON nesting exceeds ${MAX_JSON_TYPE_DEPTH} levels — flatten or simplify the sample.`,
    );
  }
  if (value === null) return 'null';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (Array.isArray(value)) {
    if (value.length === 0) return 'unknown[]';
    const inner = [
      ...new Set(value.map((item) => collectStructs(item, `${name}Item`, structs, depth + 1, budget))),
    ];
    if (inner.length === 1) return `${inner[0]}[]`;
    return `(${inner.join(' | ')})[]`;
  }
  if (isPlainObject(value)) {
    const typeName =
      depth === 0 ? sanitizeIdent(name) || 'Root' : pascal(name);
    const unique = uniqueName(typeName, new Set(structs.keys()));
    const fields: StructDef['fields'] = [];
    for (const [k, v] of Object.entries(value)) {
      fields.push({
        key: k,
        type: collectStructs(v, sanitizeIdent(k), structs, depth + 1, budget),
      });
    }
    structs.set(unique, { name: unique, fields });
    return unique;
  }
  return 'unknown';
}

function tsType(t: string): string {
  return t;
}

function emitTypescript(structs: Map<string, StructDef>, rootAlias?: string): string {
  const parts: string[] = [];
  for (const s of structs.values()) {
    const lines = s.fields.map((f) => {
      const prop = /^[A-Za-z_][A-Za-z0-9_]*$/.test(f.key) ? f.key : JSON.stringify(f.key);
      return `  ${prop}: ${tsType(f.type)};`;
    });
    parts.push(`export interface ${s.name} {\n${lines.join('\n')}\n}\n`);
  }
  if (rootAlias) parts.push(rootAlias);
  return parts.join('\n').trim() + '\n';
}

function javaPrimitive(t: string): string {
  if (t === 'string') return 'String';
  if (t === 'number') return 'Number';
  if (t === 'boolean') return 'Boolean';
  if (t === 'null' || t === 'unknown') return 'Object';
  if (t.endsWith('[]')) return `List<${javaPrimitive(t.slice(0, -2))}>`;
  if (t.includes('|')) return 'Object';
  return t;
}

function emitJava(structs: Map<string, StructDef>, root: string): string {
  const parts: string[] = [
    '// Generated from JSON sample — adjust package / nullability as needed.',
    'import java.util.List;',
    '',
  ];
  for (const s of structs.values()) {
    const lines = s.fields.map((f) => {
      const field = camel(f.key);
      return `    public ${javaPrimitive(f.type)} ${field};`;
    });
    parts.push(`public class ${s.name} {\n${lines.join('\n')}\n}\n`);
  }
  if (structs.size === 0) {
    parts.push(`public class ${root} {}\n`);
  }
  return parts.join('\n').trim() + '\n';
}

function goType(t: string): string {
  if (t === 'string') return 'string';
  if (t === 'number') return 'float64';
  if (t === 'boolean') return 'bool';
  if (t === 'null' || t === 'unknown') return 'any';
  if (t.endsWith('[]')) return `[]${goType(t.slice(0, -2))}`;
  if (t.includes('|')) return 'any';
  return t;
}

function emitGo(structs: Map<string, StructDef>, root: string): string {
  const parts: string[] = ['// Generated from JSON sample.', ''];
  for (const s of structs.values()) {
    const lines = s.fields.map((f) => {
      const field = pascal(f.key);
      const tag = JSON.stringify(f.key);
      return `\t${field} ${goType(f.type)} \`json:${tag}\``;
    });
    parts.push(`type ${s.name} struct {\n${lines.join('\n')}\n}\n`);
  }
  if (structs.size === 0) {
    parts.push(`type ${root} struct {}\n`);
  }
  return parts.join('\n').trim() + '\n';
}

function parseJson(jsonText: string): { ok: true; value: unknown } | { ok: false; error: string } {
  const trimmed = jsonText.trim();
  if (!trimmed) return { ok: false, error: 'Paste JSON to generate types.' };
  try {
    return { ok: true, value: JSON.parse(trimmed) as unknown };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Invalid JSON.' };
  }
}

/** Infer language types/structs from a JSON sample. */
export function jsonToCode(
  jsonText: string,
  lang: JsonCodeLang,
  rootName = 'Root',
): JsonToCodeResult {
  const parsed = parseJson(jsonText);
  if (!parsed.ok) return parsed;
  const root = sanitizeIdent(rootName) || 'Root';
  const structs = new Map<string, StructDef>();
  const value = parsed.value;
  const budget = { nodes: 0 };

  try {
    if (Array.isArray(value)) {
      const itemType = collectStructs(value, root, structs, 0, budget);
      if (lang === 'typescript') {
        return { ok: true, code: emitTypescript(structs, `export type ${root} = ${itemType};\n`) };
      }
      if (lang === 'java') {
        const body = emitJava(structs, root);
        const note = `// Root JSON was an array — use List<${javaPrimitive(itemType.replace(/\[\]$/, ''))}> as the top-level type.\n`;
        return { ok: true, code: note + body };
      }
      const body = emitGo(structs, root);
      const note = `// Root JSON was an array — use []${goType(itemType.replace(/\[\]$/, ''))} as the top-level type.\n`;
      return { ok: true, code: note + body };
    }

    if (!isPlainObject(value)) {
      const t = collectStructs(value, root, structs, 0, budget);
      if (lang === 'typescript') {
        return { ok: true, code: `export type ${root} = ${t};\n` };
      }
      if (lang === 'java') {
        return { ok: true, code: `// Top-level JSON value type: ${javaPrimitive(t)}\n` };
      }
      return { ok: true, code: `// Top-level JSON value type: ${goType(t)}\n` };
    }

    collectStructs(value, root, structs, 0, budget);
    if (lang === 'typescript') return { ok: true, code: emitTypescript(structs) };
    if (lang === 'java') return { ok: true, code: emitJava(structs, root) };
    return { ok: true, code: emitGo(structs, root) };
  } catch (err) {
    if (err instanceof JsonToCodeLimitError) return { ok: false, error: err.message };
    return { ok: false, error: err instanceof Error ? err.message : 'Could not infer types.' };
  }
}

/** Infer TypeScript interfaces from a JSON string. */
export function jsonToTypescript(jsonText: string, rootName = 'Root'): JsonToCodeResult {
  return jsonToCode(jsonText, 'typescript', rootName);
}

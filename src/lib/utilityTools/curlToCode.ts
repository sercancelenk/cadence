export type CurlCodeTarget =
  | 'fetch'
  | 'axios'
  | 'python'
  | 'java'
  | 'spring'
  | 'go';

export type CurlToCodeResult =
  | { ok: true; code: string; method: string; url: string }
  | { ok: false; error: string };

type ParsedCurl = {
  method: string;
  url: string;
  headers: Array<{ name: string; value: string }>;
  body: string | null;
  compressed: boolean;
};

/** Tokenize a curl command respecting single/double quotes and escapes. */
function tokenizeCurl(input: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  const s = input.replace(/\\\r?\n/g, ' ');
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i]!)) i += 1;
    if (i >= s.length) break;
    const ch = s[i]!;
    if (ch === "'" || ch === '"') {
      const quote = ch;
      i += 1;
      let buf = '';
      while (i < s.length && s[i] !== quote) {
        if (s[i] === '\\' && quote === '"' && i + 1 < s.length) {
          buf += s[i + 1];
          i += 2;
          continue;
        }
        buf += s[i];
        i += 1;
      }
      if (i < s.length) i += 1;
      tokens.push(buf);
      continue;
    }
    let buf = '';
    while (i < s.length && !/\s/.test(s[i]!)) {
      buf += s[i];
      i += 1;
    }
    tokens.push(buf);
  }
  return tokens;
}

function parseCurl(raw: string): { ok: true; parsed: ParsedCurl } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: 'Paste a curl command.' };
  const tokens = tokenizeCurl(trimmed);
  if (tokens.length === 0 || tokens[0] !== 'curl') {
    return { ok: false, error: 'Command must start with curl.' };
  }

  let method = 'GET';
  let methodExplicit = false;
  let url = '';
  const headers: Array<{ name: string; value: string }> = [];
  let body: string | null = null;
  let compressed = false;

  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i]!;
    const next = () => tokens[++i];

    if (t === '-X' || t === '--request') {
      const m = next();
      if (!m) return { ok: false, error: 'Missing method after -X/--request.' };
      method = m.toUpperCase();
      methodExplicit = true;
      continue;
    }
    if (t === '-H' || t === '--header') {
      const h = next();
      if (!h) return { ok: false, error: 'Missing header after -H/--header.' };
      const colon = h.indexOf(':');
      if (colon < 0) return { ok: false, error: `Header must be Name: Value — got "${h}".` };
      headers.push({ name: h.slice(0, colon).trim(), value: h.slice(colon + 1).trim() });
      continue;
    }
    if (
      t === '-d' ||
      t === '--data' ||
      t === '--data-raw' ||
      t === '--data-binary' ||
      t === '--data-urlencode'
    ) {
      const d = next();
      if (d === undefined) return { ok: false, error: `Missing body after ${t}.` };
      body = d;
      // Match curl: -d implies POST only when -X/--request was not set.
      if (!methodExplicit && method === 'GET') method = 'POST';
      continue;
    }
    if (t === '--compressed') {
      compressed = true;
      continue;
    }
    if (t === '-A' || t === '--user-agent') {
      const ua = next();
      if (ua) headers.push({ name: 'User-Agent', value: ua });
      continue;
    }
    if (t.startsWith('-') && t !== '-') {
      const knownWithArg = new Set([
        '-u',
        '--user',
        '-e',
        '--referer',
        '-b',
        '--cookie',
        '-o',
        '--output',
        '-w',
        '--write-out',
        '--connect-timeout',
        '--max-time',
      ]);
      if (knownWithArg.has(t) || t.startsWith('--')) {
        const peek = tokens[i + 1];
        if (peek && !peek.startsWith('-')) i += 1;
      }
      continue;
    }
    if (!url && (t.startsWith('http://') || t.startsWith('https://') || t.includes('://'))) {
      url = t;
      continue;
    }
    if (!url && !t.startsWith('-')) {
      url = t;
    }
  }

  if (!url) return { ok: false, error: 'Could not find a URL in the curl command.' };
  return { ok: true, parsed: { method, url, headers, body, compressed } };
}

function jsString(s: string): string {
  return JSON.stringify(s);
}

function javaString(s: string): string {
  return JSON.stringify(s);
}

function goString(s: string): string {
  return JSON.stringify(s);
}

function emitFetch(p: ParsedCurl): string {
  const lines: string[] = [];
  const opts: string[] = [`method: ${jsString(p.method)}`];
  if (p.headers.length) {
    const entries = p.headers.map((h) => `    ${jsString(h.name)}: ${jsString(h.value)}`).join(',\n');
    opts.push(`headers: {\n${entries}\n  }`);
  }
  if (p.body != null) opts.push(`body: ${jsString(p.body)}`);
  lines.push(`const response = await fetch(${jsString(p.url)}, {`);
  lines.push(`  ${opts.join(',\n  ')}`);
  lines.push(`});`);
  lines.push(`const data = await response.json();`);
  return lines.join('\n');
}

function emitAxios(p: ParsedCurl): string {
  const lines: string[] = [`import axios from 'axios';`, ``];
  const cfg: string[] = [`method: ${jsString(p.method.toLowerCase())}`, `url: ${jsString(p.url)}`];
  if (p.headers.length) {
    const entries = p.headers.map((h) => `    ${jsString(h.name)}: ${jsString(h.value)}`).join(',\n');
    cfg.push(`headers: {\n${entries}\n  }`);
  }
  if (p.body != null) {
    try {
      JSON.parse(p.body);
      cfg.push(`data: ${p.body}`);
    } catch {
      cfg.push(`data: ${jsString(p.body)}`);
    }
  }
  lines.push(`const { data } = await axios({`);
  lines.push(`  ${cfg.join(',\n  ')}`);
  lines.push(`});`);
  return lines.join('\n');
}

function emitPython(p: ParsedCurl): string {
  const lines: string[] = [`import requests`, ``];
  lines.push(`url = ${jsString(p.url)}`);
  if (p.headers.length) {
    lines.push(`headers = {`);
    for (const h of p.headers) lines.push(`    ${jsString(h.name)}: ${jsString(h.value)},`);
    lines.push(`}`);
  } else {
    lines.push(`headers = {}`);
  }
  if (p.body != null) {
    let isJson = false;
    try {
      JSON.parse(p.body);
      isJson = true;
    } catch {
      isJson = false;
    }
    if (isJson) {
      // Embed as a JSON string + json.loads so true/false/null stay valid Python.
      lines.push(`import json`);
      lines.push(`payload = json.loads(${jsString(p.body)})`);
      lines.push(
        `response = requests.request(${jsString(p.method)}, url, headers=headers, json=payload)`,
      );
    } else {
      lines.push(`payload = ${jsString(p.body)}`);
      lines.push(
        `response = requests.request(${jsString(p.method)}, url, headers=headers, data=payload)`,
      );
    }
  } else {
    lines.push(`response = requests.request(${jsString(p.method)}, url, headers=headers)`);
  }
  lines.push(`print(response.text)`);
  return lines.join('\n');
}

const HTTP_METHODS = new Set([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
  'TRACE',
]);

function safeHttpMethod(method: string): string {
  const m = method.toUpperCase();
  return HTTP_METHODS.has(m) ? m : 'GET';
}

function emitJavaHttpClient(p: ParsedCurl): string {
  const lines: string[] = [
    'import java.net.URI;',
    'import java.net.http.HttpClient;',
    'import java.net.http.HttpRequest;',
    'import java.net.http.HttpResponse;',
    'import java.time.Duration;',
    '',
    'HttpClient client = HttpClient.newBuilder()',
    '    .connectTimeout(Duration.ofSeconds(20))',
    '    .build();',
    '',
    'HttpRequest.Builder builder = HttpRequest.newBuilder()',
    `    .uri(URI.create(${javaString(p.url)}))`,
    '    .timeout(Duration.ofSeconds(30));',
  ];
  for (const h of p.headers) {
    lines.push(`builder.header(${javaString(h.name)}, ${javaString(h.value)});`);
  }
  if (p.body != null) {
    lines.push(
      `builder.method(${javaString(p.method)}, HttpRequest.BodyPublishers.ofString(${javaString(p.body)}));`,
    );
  } else {
    lines.push(`builder.method(${javaString(p.method)}, HttpRequest.BodyPublishers.noBody());`);
  }
  lines.push('');
  lines.push(
    'HttpResponse<String> response = client.send(builder.build(), HttpResponse.BodyHandlers.ofString());',
  );
  lines.push('System.out.println(response.statusCode());');
  lines.push('System.out.println(response.body());');
  return lines.join('\n');
}

function emitSpringRestClient(p: ParsedCurl): string {
  const method = safeHttpMethod(p.method);
  const lines: string[] = [
    '// Spring Framework 6.1+ RestClient sketch',
    'import org.springframework.http.MediaType;',
    'import org.springframework.web.client.RestClient;',
    '',
    'RestClient client = RestClient.create();',
    '',
    `var spec = client.method(org.springframework.http.HttpMethod.${method})`,
    `    .uri(${javaString(p.url)});`,
  ];
  for (const h of p.headers) {
    lines.push(`spec = spec.header(${javaString(h.name)}, ${javaString(h.value)});`);
  }
  if (p.body != null) {
    let isJson = false;
    try {
      JSON.parse(p.body);
      isJson = true;
    } catch {
      isJson = false;
    }
    if (isJson) {
      lines.push(`spec = spec.contentType(MediaType.APPLICATION_JSON).body(${javaString(p.body)});`);
    } else {
      lines.push(`spec = spec.body(${javaString(p.body)});`);
    }
  }
  lines.push('String body = spec.retrieve().body(String.class);');
  lines.push('System.out.println(body);');
  return lines.join('\n');
}

function emitGoNetHttp(p: ParsedCurl): string {
  const lines: string[] = [
    'package main',
    '',
    'import (',
    '\t"fmt"',
    '\t"io"',
    '\t"net/http"',
    '\t"strings"',
    ')',
    '',
    'func main() {',
  ];
  if (p.body != null) {
    lines.push(`\tbody := strings.NewReader(${goString(p.body)})`);
    lines.push(`\treq, err := http.NewRequest(${goString(p.method)}, ${goString(p.url)}, body)`);
  } else {
    lines.push(`\treq, err := http.NewRequest(${goString(p.method)}, ${goString(p.url)}, nil)`);
  }
  lines.push('\tif err != nil {');
  lines.push('\t\tpanic(err)');
  lines.push('\t}');
  for (const h of p.headers) {
    lines.push(`\treq.Header.Set(${goString(h.name)}, ${goString(h.value)})`);
  }
  lines.push('\tres, err := http.DefaultClient.Do(req)');
  lines.push('\tif err != nil {');
  lines.push('\t\tpanic(err)');
  lines.push('\t}');
  lines.push('\tdefer res.Body.Close()');
  lines.push('\tb, _ := io.ReadAll(res.Body)');
  lines.push('\tfmt.Println(res.StatusCode)');
  lines.push('\tfmt.Println(string(b))');
  lines.push('}');
  return lines.join('\n');
}

/**
 * Convert a common curl command into client snippets.
 * Supported: -X, -H, -d/--data*, URL, -A, --compressed (ignored in output).
 */
export function curlToCode(curl: string, target: CurlCodeTarget): CurlToCodeResult {
  const parsed = parseCurl(curl);
  if (!parsed.ok) return parsed;
  const { method, url } = parsed.parsed;
  void parsed.parsed.compressed;
  let code: string;
  switch (target) {
    case 'fetch':
      code = emitFetch(parsed.parsed);
      break;
    case 'axios':
      code = emitAxios(parsed.parsed);
      break;
    case 'python':
      code = emitPython(parsed.parsed);
      break;
    case 'java':
      code = emitJavaHttpClient(parsed.parsed);
      break;
    case 'spring':
      code = emitSpringRestClient(parsed.parsed);
      break;
    case 'go':
      code = emitGoNetHttp(parsed.parsed);
      break;
    default: {
      const _exhaustive: never = target;
      return { ok: false, error: `Unsupported target: ${String(_exhaustive)}` };
    }
  }
  return { ok: true, code, method, url };
}

import { describe, expect, it } from 'vitest';
import { explainCron } from './cronExplain';
import { curlToCode } from './curlToCode';
import { jsonToCode, jsonToTypescript } from './jsonToTs';
import { normalizeRegexFlags, testRegex, MAX_REGEX_PATTERN_LEN } from './regexTester';
import { decodeBase64Utf8, encodeBase64Utf8 } from './base64';
import { decodeJwt } from './jwtDecode';
import { convertAllCases, toKebabCase, toPascalCase } from './stringCase';
import { parseEpochInput, isoToEpochMs } from './epochConvert';

describe('cronExplain coverage', () => {
  it('explains ranges, lists, and weekdays', () => {
    expect(explainCron('0 9 * * 1-5').ok).toBe(true);
    expect(explainCron('0 12 1,15 * *').ok).toBe(true);
    expect(explainCron('30 8 1 1-3 *').ok).toBe(true);
    const dow = explainCron('0 0 * * 0');
    expect(dow.ok).toBe(true);
    if (dow.ok) expect(dow.parts.some((p) => /Sunday/i.test(p))).toBe(true);
  });

  it('explains hourly steps and DOM+DOW OR note', () => {
    const r = explainCron('0 */2 * * *');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.summary).toMatch(/2 hours/i);
    const both = explainCron('0 0 1 * 1');
    expect(both.ok).toBe(true);
    if (both.ok) expect(both.summary).toMatch(/OR/i);
  });

  it('explains step fields for month and dow', () => {
    expect(explainCron('0 0 */2 * *').ok).toBe(true);
    expect(explainCron('0 0 * */2 *').ok).toBe(true);
    expect(explainCron('0 0 * * */2').ok).toBe(true);
  });

  it('rejects out-of-range fields', () => {
    expect(explainCron('60 0 * * *').ok).toBe(false);
    expect(explainCron('0 24 * * *').ok).toBe(false);
    expect(explainCron('0 0 32 * *').ok).toBe(false);
    expect(explainCron('0 0 * 13 *').ok).toBe(false);
    expect(explainCron('0 0 * * 8').ok).toBe(false);
    expect(explainCron('').ok).toBe(false);
  });
});

describe('jsonToTypescript coverage', () => {
  it('handles nested objects and mixed arrays', () => {
    const r = jsonToCode(
      JSON.stringify({
        user: { id: 1, meta: { active: true } },
        scores: [1, 'x'],
        empty: [],
        maybe: null,
      }),
      'typescript',
      'Payload',
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.code).toContain('Payload');
      expect(r.code).toContain('null');
      expect(r.code).toContain('unknown[]');
    }
  });

  it('handles root arrays and primitives', () => {
    const arr = jsonToCode('[{"id":1}]', 'go', 'ItemList');
    expect(arr.ok).toBe(true);
    if (arr.ok) expect(arr.code).toMatch(/array|\[\]/i);
    const arrJava = jsonToCode('[{"id":1}]', 'java', 'ItemList');
    expect(arrJava.ok).toBe(true);
    if (arrJava.ok) expect(arrJava.code).toMatch(/List</);
    const arrTs = jsonToCode('[{"id":1}]', 'typescript', 'ItemList');
    expect(arrTs.ok).toBe(true);
    const prim = jsonToTypescript('"hi"', 'Greeting');
    expect(prim.ok).toBe(true);
    if (prim.ok) expect(prim.code).toContain('string');
    expect(jsonToCode('42', 'java').ok).toBe(true);
    expect(jsonToCode('true', 'go').ok).toBe(true);
    expect(jsonToTypescript('').ok).toBe(false);
  });

  it('quotes weird keys and emits empty object classes', () => {
    const r = jsonToTypescript('{"weird-key":1}');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.code).toContain('"weird-key"');
    expect(jsonToCode('{}', 'java', 'Empty').ok).toBe(true);
    expect(jsonToCode('{}', 'go', 'Empty').ok).toBe(true);
  });

  it('covers union arrays, null roots, and numeric key sanitizing', () => {
    const mixed = jsonToCode('{"vals":[1,true,null]}', 'typescript');
    expect(mixed.ok).toBe(true);
    if (mixed.ok) expect(mixed.code).toMatch(/\|/);
    expect(jsonToCode('null', 'java').ok).toBe(true);
    expect(jsonToCode('null', 'go').ok).toBe(true);
    const keyed = jsonToCode('{"1bad":{"x":1},"dup":{"x":1},"dup":{"y":2}}'.replace(
      '"dup":{"x":1},"dup":{"y":2}',
      '"dup":{"x":1},"dup2":{"x":1}',
    ), 'go', '9Root');
    expect(keyed.ok).toBe(true);
  });

  it('rejects oversized node graphs', () => {
    const huge = JSON.stringify(
      Object.fromEntries(Array.from({ length: 2_100 }, (_, i) => [`k${i}`, i])),
    );
    const r = jsonToCode(huge, 'typescript');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/too large|nodes/i);
  });
});

describe('curlToCode coverage', () => {
  it('parses quoted headers and user-agent', () => {
    const r = curlToCode(
      `curl "https://example.com/a" -H "Accept: application/json" -A "CadenceBot/1.0" --compressed`,
      'fetch',
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.method).toBe('GET');
      expect(r.code).toContain('Accept');
      expect(r.code).toContain('User-Agent');
    }
  });

  it('defaults -d to POST and emits non-json body', () => {
    const r = curlToCode(`curl https://example.com --data-raw 'plain'`, 'axios');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.method).toBe('POST');
      expect(r.code).toContain('axios');
    }
    const py = curlToCode(`curl https://example.com -d 'plain'`, 'python');
    expect(py.ok).toBe(true);
    if (py.ok) expect(py.code).toContain('data=payload');
  });

  it('emits Go without body and Spring with JSON body', () => {
    const go = curlToCode(`curl https://example.com`, 'go');
    expect(go.ok).toBe(true);
    if (go.ok) expect(go.code).toContain('nil');
    const spring = curlToCode(
      `curl -X POST https://example.com -H 'Content-Type: application/json' -d '{"a":1}'`,
      'spring',
    );
    expect(spring.ok).toBe(true);
    if (spring.ok) {
      expect(spring.code).toContain('APPLICATION_JSON');
      expect(spring.code).toContain('HttpMethod.POST');
    }
    expect(curlToCode(`curl -X PUT https://example.com -d 'plain'`, 'spring').ok).toBe(true);
  });

  it('rejects bad commands', () => {
    expect(curlToCode('wget https://x', 'fetch').ok).toBe(false);
    expect(curlToCode('curl -X', 'fetch').ok).toBe(false);
    expect(curlToCode('curl -H', 'fetch').ok).toBe(false);
    expect(curlToCode('curl -H "NoColon"', 'fetch').ok).toBe(false);
    expect(curlToCode('curl -d', 'fetch').ok).toBe(false);
    expect(curlToCode('', 'fetch').ok).toBe(false);
  });

  it('skips known args and resolves relative URLs', () => {
    const r = curlToCode(
      `curl -u user:pass --max-time 5 -o out.txt example.com/api`,
      'fetch',
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.url).toContain('example.com/api');
    const goBody = curlToCode(
      `curl -X POST https://example.com -d '{"a":true}' -H 'X-Test: 1'`,
      'go',
    );
    expect(goBody.ok).toBe(true);
    if (goBody.ok) expect(goBody.code).toContain('NewReader');
  });
});

describe('regexTester extras', () => {
  it('normalizes flags and caps pattern length', () => {
    expect(normalizeRegexFlags('gi').ok).toBe(true);
    expect(normalizeRegexFlags('gg').ok).toBe(false);
    expect(testRegex('a'.repeat(MAX_REGEX_PATTERN_LEN + 1), 'a').ok).toBe(false);
    expect(testRegex('a', 'x'.repeat(25_001)).ok).toBe(false);
    const zero = testRegex('(?=x)', 'xxx', 'g');
    expect(zero.ok).toBe(true);
  });

  it('truncates when match count hits the cap', () => {
    const r = testRegex('a', 'a'.repeat(600), 'g');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.truncated).toBe(true);
      expect(r.matches.length).toBeLessThanOrEqual(500);
    }
  });
});

describe('misc encode/case/epoch edges', () => {
  it('handles empty base64 and jwt header failures', () => {
    expect(decodeBase64Utf8('')).toEqual({ ok: true, text: '' });
    expect(encodeBase64Utf8('').length).toBeGreaterThanOrEqual(0);
    expect(decodeJwt('a.b.c').ok).toBe(false);
  });

  it('covers remaining case helpers', () => {
    expect(toKebabCase('FooBar')).toBe('foo-bar');
    expect(toPascalCase('foo_bar')).toBe('FooBar');
    expect(convertAllCases('').camel).toBe('');
  });

  it('rejects bad epoch / iso', () => {
    expect(parseEpochInput('not-a-number').ok).toBe(false);
    expect(parseEpochInput('').ok).toBe(false);
    expect(isoToEpochMs('nope').ok).toBe(false);
    expect(isoToEpochMs('').ok).toBe(false);
  });
});

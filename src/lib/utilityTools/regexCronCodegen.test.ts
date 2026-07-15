import { describe, expect, it } from 'vitest';
import { explainCron } from './cronExplain';
import { curlToCode } from './curlToCode';
import { jsonToCode, jsonToTypescript } from './jsonToTs';
import { testRegex } from './regexTester';

describe('regexTester', () => {
  it('finds matches with groups', () => {
    const r = testRegex(String.raw`(\w+)=(\d+)`, 'a=1 b=2', 'g');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.matches).toHaveLength(2);
      expect(r.matches[0]?.groups).toEqual(['a', '1']);
    }
  });
  it('rejects bad flags / patterns', () => {
    expect(testRegex('(', 'x').ok).toBe(false);
    expect(testRegex('a', 'x', 'z').ok).toBe(false);
  });
  it('rejects nested-quantifier ReDoS shapes', () => {
    const r = testRegex('(a+)+$', 'aaaaaaaaaaaaaaaaaaaaaaaab');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/ReDoS|nested/i);
  });
});

describe('cronExplain', () => {
  it('explains midnight daily', () => {
    const r = explainCron('0 0 * * *');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.summary.toLowerCase()).toMatch(/midnight|00:00/);
  });
  it('explains step minutes', () => {
    const r = explainCron('*/15 * * * *');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.summary).toMatch(/15 minutes/i);
  });
  it('maps DOW 7 to Sunday', () => {
    const r = explainCron('0 0 * * 7');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.parts.some((p) => /Sunday/i.test(p))).toBe(true);
  });
  it('rejects bad field counts', () => {
    expect(explainCron('* * *').ok).toBe(false);
  });
});

describe('jsonToTypescript', () => {
  it('builds an interface for an object', () => {
    const r = jsonToTypescript('{"id":1,"name":"Ada","tags":["a"]}');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.code).toContain('export interface Root');
      expect(r.code).toContain('id: number');
      expect(r.code).toContain('name: string');
      expect(r.code).toContain('tags: string[]');
    }
  });
  it('rejects invalid JSON', () => {
    expect(jsonToTypescript('{').ok).toBe(false);
  });
  it('rejects deeply nested JSON without crashing', () => {
    let nested = '"leaf"';
    for (let i = 0; i < 60; i++) nested = `{"a":${nested}}`;
    const r = jsonToCode(nested, 'typescript');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/nesting|levels/i);
  });
  it('emits Java classes and Go structs', () => {
    const sample = '{"id":1,"name":"Ada","tags":["a"]}';
    const java = jsonToCode(sample, 'java', 'User');
    expect(java.ok).toBe(true);
    if (java.ok) {
      expect(java.code).toContain('public class User');
      expect(java.code).toContain('List<String>');
    }
    const go = jsonToCode(sample, 'go', 'User');
    expect(go.ok).toBe(true);
    if (go.ok) {
      expect(go.code).toContain('type User struct');
      expect(go.code).toContain('`json:"id"`');
    }
  });
});

describe('curlToCode', () => {
  const sample = `curl -X POST 'https://api.example.com/v1' -H 'Content-Type: application/json' -d '{"a":1}'`;

  it('emits fetch', () => {
    const r = curlToCode(sample, 'fetch');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.method).toBe('POST');
      expect(r.code).toContain('fetch(');
      expect(r.code).toContain('https://api.example.com/v1');
    }
  });
  it('emits axios, python, java, spring, and go', () => {
    expect(curlToCode(sample, 'axios').ok).toBe(true);
    const py = curlToCode(sample, 'python');
    expect(py.ok).toBe(true);
    if (py.ok) expect(py.code).toContain('import requests');
    const java = curlToCode(sample, 'java');
    expect(java.ok).toBe(true);
    if (java.ok) expect(java.code).toContain('HttpClient');
    const spring = curlToCode(sample, 'spring');
    expect(spring.ok).toBe(true);
    if (spring.ok) expect(spring.code).toContain('RestClient');
    const go = curlToCode(sample, 'go');
    expect(go.ok).toBe(true);
    if (go.ok) expect(go.code).toContain('http.NewRequest');
  });
  it('embeds JSON bodies safely for Python (true/false/null)', () => {
    const r = curlToCode(
      `curl -X POST 'https://api.example.com' -H 'Content-Type: application/json' -d '{"ok":true,"n":null}'`,
      'python',
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.code).toContain('json.loads');
      expect(r.code).not.toMatch(/payload = \{/);
    }
  });
  it('does not overwrite an explicit -X GET when -d is present', () => {
    const r = curlToCode(`curl -X GET 'https://api.example.com' -d 'x=1'`, 'fetch');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.method).toBe('GET');
  });
  it('allowlists Spring HttpMethod (rejects injection)', () => {
    const r = curlToCode(`curl -X 'GET);evil(' 'https://api.example.com'`, 'spring');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.code).toContain('HttpMethod.GET');
      expect(r.code).not.toContain('evil');
    }
  });
  it('fails loud without url', () => {
    expect(curlToCode('curl -X GET', 'fetch').ok).toBe(false);
  });
});

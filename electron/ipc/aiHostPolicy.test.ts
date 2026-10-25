import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { parseAllowedHosts, isAiHostAllowed, requireAiHost, parseAiPolicyFlags, resolveAiSubFlag, guardAiGatewayRequest } = require('./aiHostPolicy.cjs');

describe('parseAllowedHosts', () => {
  it('lower-cases and trims valid entries and drops the rest', () => {
    expect(
      parseAllowedHosts([' API.OpenAI.com ', '*.corp.example.com', '', 42, null, 'bad host', 'http://x.com', 'a/b', '*.', '*']),
    ).toEqual(['api.openai.com', '*.corp.example.com']);
  });
  it('is undefined only when the key is absent', () => {
    expect(parseAllowedHosts(undefined)).toBeUndefined();
    expect(parseAllowedHosts(null)).toBeUndefined();
  });
  it('a present but unusable value yields an empty list, never "no restriction"', () => {
    expect(parseAllowedHosts('api.openai.com')).toEqual([]);
    expect(parseAllowedHosts({ host: 'api.openai.com' })).toEqual([]);
    expect(parseAllowedHosts([])).toEqual([]);
    expect(parseAllowedHosts([123])).toEqual([]);
    expect(parseAllowedHosts(['https://api.openai.com', 'api.openai.com:443', 'api.openai.com/', 'api.openai.com.'])).toEqual([]);
  });
  it('caps the number of entries', () => {
    const many = Array.from({ length: 150 }, (_, i) => `h${i}.example.com`);
    expect(parseAllowedHosts(many)).toHaveLength(100);
  });
});

describe('isAiHostAllowed', () => {
  it('allows everything without a list, and nothing with an empty one', () => {
    expect(isAiHostAllowed('anything.com', undefined)).toBe(true);
    expect(isAiHostAllowed('anything.com', [])).toBe(false);
  });
  it('matches exact hosts case-insensitively and never by substring', () => {
    const list = ['api.openai.com'];
    expect(isAiHostAllowed('API.OPENAI.COM', list)).toBe(true);
    expect(isAiHostAllowed('api.openai.com.evil.com', list)).toBe(false);
    expect(isAiHostAllowed('evilapi.openai.com', list)).toBe(false);
    expect(isAiHostAllowed('openai.com', list)).toBe(false);
  });
  it('matches *.suffix on a dot boundary only, and not the bare domain', () => {
    const list = ['*.corp.example.com'];
    expect(isAiHostAllowed('ai.corp.example.com', list)).toBe(true);
    expect(isAiHostAllowed('a.b.corp.example.com', list)).toBe(true);
    expect(isAiHostAllowed('corp.example.com', list)).toBe(false);
    expect(isAiHostAllowed('evilcorp.example.com', list)).toBe(false);
    expect(isAiHostAllowed('ai.corp.example.com.evil.com', list)).toBe(false);
  });
});

describe('requireAiHost', () => {
  it('passes when there is no list', () => {
    expect(requireAiHost('https://x.com/v1', undefined)).toBeNull();
  });
  it('blocks everything, with a pointer to the policy key, when the list is empty', () => {
    const blocked = requireAiHost('https://api.openai.com/v1', []);
    expect(blocked).toMatchObject({ ok: false, reason: 'policy-disabled' });
    expect(blocked.error).toContain('features.aiAllowedHosts');
  });
  it('ignores the port when matching', () => {
    expect(requireAiHost('http://localhost:11434/v1', ['localhost'])).toBeNull();
    expect(requireAiHost('https://api.openai.com:8443/v1', ['api.openai.com'])).toBeNull();
  });
  it('passes for an allowed host and blocks others with a readable message', () => {
    const list = ['api.openai.com', 'localhost'];
    expect(requireAiHost('https://api.openai.com/v1', list)).toBeNull();
    expect(requireAiHost('http://localhost:11434/v1', list)).toBeNull();
    const blocked = requireAiHost('https://api.anthropic.com/v1', list);
    expect(blocked).toMatchObject({ ok: false, reason: 'policy-disabled' });
    expect(blocked.error).toContain('api.openai.com, localhost');
  });
  it('blocks an unparsable address when a list is set', () => {
    expect(requireAiHost('not a url', ['api.openai.com'])).toMatchObject({ ok: false });
    expect(requireAiHost(undefined, ['api.openai.com'])).toMatchObject({ ok: false });
  });
});

describe('parseAiPolicyFlags', () => {
  it('keeps booleans for aiPeople and aiFocusNote and nothing else', () => {
    expect(parseAiPolicyFlags({ aiPeople: false, aiFocusNote: true, other: 1 })).toEqual({ aiPeople: false, aiFocusNote: true });
    expect(parseAiPolicyFlags({ aiPeople: 'no', aiFocusNote: null })).toEqual({});
    expect(parseAiPolicyFlags(undefined)).toEqual({});
    expect(parseAiPolicyFlags('x')).toEqual({});
  });
});

describe('resolveAiSubFlag', () => {
  it('an explicit boolean wins; otherwise it follows the ai flag', () => {
    expect(resolveAiSubFlag(true, false)).toBe(true);
    expect(resolveAiSubFlag(false, true)).toBe(false);
    expect(resolveAiSubFlag(undefined, true)).toBe(true);
    expect(resolveAiSubFlag(undefined, false)).toBe(false);
  });
});

describe('guardAiGatewayRequest (used by the chat and the stream handler alike)', () => {
  const allowAll = () => true;
  const req = { baseUrl: 'https://api.openai.com/v1', dataClass: 'content' };

  it('lets an allowed request through', () => {
    expect(guardAiGatewayRequest(req, { isFeatureAllowed: allowAll, allowedHosts: undefined })).toBeNull();
  });

  it('blocks when AI is off, before looking at anything else', () => {
    const r = guardAiGatewayRequest({}, { isFeatureAllowed: (f: string) => f !== 'ai', allowedHosts: [] });
    expect(r).toMatchObject({ ok: false, reason: 'policy-disabled' });
  });

  it('blocks a host that is not on the organization list', () => {
    const r = guardAiGatewayRequest(req, { isFeatureAllowed: allowAll, allowedHosts: ['*.corp.example.com'] });
    expect(r).toMatchObject({ ok: false });
  });

  it('blocks people data when the people flag is off, and a missing data class always', () => {
    const noPeople = (f: string) => f !== 'aiPeople';
    expect(guardAiGatewayRequest({ ...req, dataClass: 'people' }, { isFeatureAllowed: noPeople, allowedHosts: undefined })).toMatchObject({ ok: false });
    expect(guardAiGatewayRequest({ baseUrl: req.baseUrl }, { isFeatureAllowed: allowAll, allowedHosts: undefined })).toMatchObject({ ok: false, reason: 'invalid-request' });
  });
});

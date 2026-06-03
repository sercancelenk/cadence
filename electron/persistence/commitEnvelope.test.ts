import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  COMMIT_MAGIC,
  wrapCommitEnvelope,
  isCommitEnvelope,
  unwrapStoredWorkspace,
} = require('./commitEnvelope.cjs');

describe('commitEnvelope', () => {
  const workspace = {
    version: 3,
    teams: [],
    people: [],
    items: [],
    todoGroups: [],
    todoItems: [],
  };

  it('wraps workspace with generation', () => {
    const env = wrapCommitEnvelope(4, workspace);
    expect(env.magic).toBe(COMMIT_MAGIC);
    expect(env.writeGeneration).toBe(4);
    expect(env.workspace).toBe(workspace);
    expect(typeof env.updatedAt).toBe('string');
  });

  it('unwraps envelope', () => {
    const env = wrapCommitEnvelope(9, workspace);
    const r = unwrapStoredWorkspace(env);
    expect(r.enveloped).toBe(true);
    expect(r.writeGeneration).toBe(9);
    expect(r.workspace).toEqual(workspace);
  });

  it('treats legacy AppData as non-enveloped', () => {
    const r = unwrapStoredWorkspace(workspace);
    expect(r.enveloped).toBe(false);
    expect(r.writeGeneration).toBeNull();
    expect(r.workspace).toEqual(workspace);
  });

  it('isCommitEnvelope rejects malformed objects', () => {
    expect(isCommitEnvelope(null)).toBe(false);
    expect(isCommitEnvelope({ magic: COMMIT_MAGIC })).toBe(false);
    expect(isCommitEnvelope(wrapCommitEnvelope(1, workspace))).toBe(true);
  });
});

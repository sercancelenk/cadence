import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * The support window (docs/COMPATIBILITY.md): data written by each supported earlier release must open in this
 * build with nothing lost. The fixtures are real data folders made by those releases' own code
 * (scripts/compat/make-fixture.mjs); the expectations were read back from that code when the fixture was made.
 */
const require = createRequire(import.meta.url);
const { loadMain } = require('../testing/mainHarness.cjs') as {
  loadMain: (mainPath: string, o?: { userDataDir?: string }) => Harness;
};

type Harness = {
  userDataDir: string;
  invoke: (channel: string, ...args: unknown[]) => Promise<any>;
  has: (channel: string) => boolean;
  pickOpen: (paths: string[] | null) => void;
  pickSave: (p: string | null) => void;
  dispose: () => void;
};
type Expected = {
  email: string;
  password: string;
  pin: string;
  userId: string;
  recoveryCodes: string[] | null;
  notes: { id: string; title: string; bodySha: string }[];
  todos: { id: string; text: string; done: boolean }[];
  teams: string[];
  images: Record<string, string>;
  history: Record<string, { id: string; title: string; bodySha: string }[]>;
  exportFolder?: string;
  snapshots: string[];
};

const MAIN = path.resolve(__dirname, '..', 'main.cjs');
const FIXTURES = path.resolve(__dirname, 'fixtures');
const sha = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex');
const labels = (JSON.parse(fs.readFileSync(path.resolve(__dirname, 'releases.json'), 'utf8')) as { supported: { label: string }[] }).supported.map(
  (s) => s.label,
);

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

function open(label: string) {
  const dir = path.join(FIXTURES, label);
  const expected = JSON.parse(fs.readFileSync(path.join(dir, 'expected.json'), 'utf8')) as Expected;
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), `cadence-compat-${label}-`));
  fs.cpSync(path.join(dir, 'userData'), userData, { recursive: true });
  const h = loadMain(MAIN, { userDataDir: userData });
  cleanups.push(() => {
    h.dispose();
    fs.rmSync(userData, { recursive: true, force: true });
  });
  return { h, expected, dir };
}

async function signIn(h: Harness, e: Expected) {
  const r = await h.invoke('account:login', { email: e.email, password: e.password });
  expect(r.ok, r.error).toBe(true);
}

async function snapshotOf(h: Harness) {
  const loaded = await h.invoke('data:load');
  const notes = (loaded.notes as { id: string; title: string; body?: string }[])
    .map((n) => ({ id: n.id, title: n.title, bodySha: sha(Buffer.from(n.body ?? '')) }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const todos = (loaded.todoItems as { id: string; text: string; done: boolean }[])
    .map((t) => ({ id: t.id, text: t.text, done: t.done }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const teams = (loaded.teams as { id: string }[]).map((t) => t.id).sort();
  const images: Record<string, string> = {};
  for (const id of ['attachment-compat-0001', 'attachment-compat-0002']) {
    const r = await h.invoke('attachment:read', { attachmentId: id });
    if (r.ok) images[id] = sha(Buffer.from(r.dataBase64, 'base64'));
  }
  const history: Expected['history'] = {};
  for (const noteId of ['note-compat-0001', 'note-compat-0002', 'note-compat-0003']) {
    const list = await h.invoke('noteHistory:list', { noteId });
    const revs: Expected['history'][string] = [];
    for (const meta of list.revisions as { id: string }[]) {
      const r = await h.invoke('noteHistory:read', { noteId, revisionId: meta.id });
      revs.push({ id: meta.id, title: r.revision.title, bodySha: sha(Buffer.from(r.revision.body ?? '')) });
    }
    history[noteId] = revs.sort((a, b) => a.id.localeCompare(b.id));
  }
  return { notes, todos, teams, images, history };
}

function wholeWorkspaceMatches(got: Awaited<ReturnType<typeof snapshotOf>>, e: Expected) {
  expect(got.notes).toEqual(e.notes);
  expect(got.todos).toEqual(e.todos);
  expect(got.teams).toEqual(e.teams);
  expect(got.images).toEqual(e.images);
  expect(got.history).toEqual(e.history);
}

describe('there is a fixture for every supported release', () => {
  it('lists at least the previous two releases and each has its data', () => {
    expect(labels.length).toBeGreaterThanOrEqual(2);
    for (const label of labels) {
      for (const file of ['expected.json', 'meta.json']) expect(fs.existsSync(path.join(FIXTURES, label, file)), `${label}/${file}`).toBe(true);
      expect(fs.existsSync(path.join(FIXTURES, label, 'userData'))).toBe(true);
    }
  });
});

describe.each(labels)('data written by release %s', (label) => {
  it('opens with every note, task, team, image and history revision it had', async () => {
    const { h, expected } = open(label);
    await signIn(h, expected);
    wholeWorkspaceMatches(await snapshotOf(h), expected);
  });

  it('still accepts its PIN', async () => {
    const { h, expected } = open(label);
    await signIn(h, expected);
    expect((await h.invoke('auth:verify', { pin: expected.pin })).ok).toBe(true);
    expect((await h.invoke('auth:verify', { pin: '0000' })).ok).toBe(false);
  });

  it('lists the snapshots it made, readable', async () => {
    const { h, expected } = open(label);
    await signIn(h, expected);
    const sources = await h.invoke('data:listSources');
    const names = (sources.backups as { name: string; decryptable: boolean; counts: unknown }[]).filter((b) => !b.name.includes('-shard-'));
    expect(names.length).toBeGreaterThanOrEqual(expected.snapshots.length);
    for (const b of names) expect(b.decryptable && b.counts, b.name).toBeTruthy();
  });

  it('keeps everything through a password change, and its old snapshots can still be restored afterwards', async () => {
    const { h, expected } = open(label);
    await signIn(h, expected);
    const changed = await h.invoke('account:changePassword', { oldPassword: expected.password, newPassword: 'compat-new-password-2' });
    expect(changed.ok, changed.error).toBe(true);
    wholeWorkspaceMatches(await snapshotOf(h), expected);

    const sources = await h.invoke('data:listSources');
    const oldest = (sources.backups as { name: string; path: string }[]).filter((b) => !b.name.includes('-shard-')).pop()!;
    const restored = await h.invoke('data:restoreFromSource', { filePath: oldest.path });
    expect(restored.ok, restored.error).toBe(true);
    const after = await snapshotOf(h);
    expect(after.images).toEqual(expected.images);
    expect(after.history).toEqual(expected.history);
  });

  it('keeps everything through a reset with its recovery codes', async () => {
    const { h, expected } = open(label);
    expect(expected.recoveryCodes).toBeTruthy();
    const r = await h.invoke('account:recoverWithCodes', { email: expected.email, codes: expected.recoveryCodes, newPassword: 'compat-new-password-3' });
    expect(r.ok, r.error).toBe(true);
    wholeWorkspaceMatches(await snapshotOf(h), expected);
  });

  it('can be exported again and imported by this build into a new account', async () => {
    const { h, expected, dir } = open(label);
    await signIn(h, expected);
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-compat-out-'));
    cleanups.push(() => fs.rmSync(out, { recursive: true, force: true }));
    h.pickSave(path.join(out, 'backup.zip'));
    const exported = await h.invoke('backupArchive:export', { data: await h.invoke('data:load') });
    expect(exported.ok, exported.error).toBe(true);

    const second = open(label);
    // A different account on a clean data folder.
    const fresh = loadMain(MAIN, {});
    cleanups.push(() => fresh.dispose());
    void second;
    void dir;
    expect((await fresh.invoke('account:register', { email: 'fresh@example.com', password: 'fresh-password-1' })).ok).toBe(true);
    fresh.pickOpen([path.join(out, 'backup.zip')]);
    const opened = await fresh.invoke('backupArchive:open');
    expect(opened.ok, opened.error).toBe(true);
    const gen = (await fresh.invoke('data:loadResult')).writeGeneration;
    const applied = await fresh.invoke('backupArchive:apply', { token: opened.token, workspace: opened.workspace, mode: 'replace', expectedGeneration: gen });
    expect(applied.ok, applied.error).toBe(true);
    wholeWorkspaceMatches(await snapshotOf(fresh), expected);
  });

  it("imports the full backup folder and the JSON export that release wrote", async () => {
    const { expected, dir } = open(label);
    const fresh = loadMain(MAIN, {});
    cleanups.push(() => fresh.dispose());
    expect((await fresh.invoke('account:register', { email: 'folder@example.com', password: 'fresh-password-1' })).ok).toBe(true);

    if (expected.exportFolder) {
      fresh.pickOpen([path.join(dir, 'exports', expected.exportFolder)]);
      const r = await fresh.invoke('data:importBundle');
      expect(r.ok, r.error).toBe(true);
      const got = await snapshotOf(fresh);
      expect(got.notes).toEqual(expected.notes);
      expect(got.images).toEqual(expected.images);
    }

    const json = path.join(dir, 'exports', 'workspace.json');
    fresh.pickOpen([json]);
    const opened = await fresh.invoke('backupArchive:open');
    expect(opened.ok, opened.error).toBe(true);
    expect(opened.kind).toBe('json');
    const gen = (await fresh.invoke('data:loadResult')).writeGeneration;
    expect((await fresh.invoke('backupArchive:apply', { token: opened.token, workspace: opened.workspace, mode: 'replace', expectedGeneration: gen })).ok).toBe(true);
    expect((await snapshotOf(fresh)).notes).toEqual(expected.notes);
  });
});

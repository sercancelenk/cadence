import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

type Api = {
  stagePreviousKey: (file: string, previous: Buffer, current: Buffer) => { ok: boolean; setAsideUnreadable?: boolean; error?: string };
  commitPreviousKey: (file: string) => void;
  discardPreviousKey: (file: string) => void;
  readPreviousKeys: (file: string, current: Buffer) => Buffer[];
  finalizePreviousKeys: (file: string, current: Buffer) => void;
  MAX_PREVIOUS_KEYS: number;
};
const { stagePreviousKey, commitPreviousKey, discardPreviousKey, readPreviousKeys, finalizePreviousKeys, MAX_PREVIOUS_KEYS } =
  require('./keyHistory.cjs') as Api;

let dir: string;
let file: string;
const k = () => crypto.randomBytes(32);
const hex = (keys: Buffer[]) => keys.map((x) => x.toString('hex')).sort();

/** One password change that went all the way through. */
function change(previous: Buffer, current: Buffer) {
  expect(stagePreviousKey(file, previous, current).ok).toBe(true);
  commitPreviousKey(file);
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-keyhist-'));
  file = path.join(dir, 'history.bin');
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('key history', () => {
  it('has no keys before any change', () => {
    expect(readPreviousKeys(file, k())).toEqual([]);
  });

  it('hands back the previous key under the current one, and only under it', () => {
    const [a, b] = [k(), k()];
    change(a, b);
    expect(hex(readPreviousKeys(file, b))).toEqual(hex([a]));
    expect(readPreviousKeys(file, a)).toEqual([]);
    expect(fs.readFileSync(file, 'utf8')).not.toContain(a.toString('hex'));
  });

  it('keeps every earlier key across several changes, and adds nothing when a change repeats', () => {
    const [a, b, c] = [k(), k(), k()];
    change(a, b);
    change(b, c);
    change(b, c);
    expect(hex(readPreviousKeys(file, c))).toEqual(hex([a, b]));
  });

  it('keeps only the most recent keys beyond the cap', () => {
    let prev = k();
    let cur = k();
    for (let i = 0; i < MAX_PREVIOUS_KEYS + 3; i += 1) {
      change(prev, cur);
      prev = cur;
      cur = k();
    }
    expect(readPreviousKeys(file, prev)).toHaveLength(MAX_PREVIOUS_KEYS);
  });
});

describe('durability', () => {
  it('flushes the list to disk before it replaces the old one: it is the only way into older snapshots', () => {
    const [a, b] = [k(), k()];
    const realFsync = fs.fsyncSync;
    const flushed: number[] = [];
    fs.fsyncSync = ((fd: number) => {
      flushed.push(fd);
      return realFsync(fd);
    }) as typeof fs.fsyncSync;
    try {
      stagePreviousKey(file, a, b);
    } finally {
      fs.fsyncSync = realFsync;
    }
    expect(flushed.length).toBeGreaterThanOrEqual(1);
    expect(hex(readPreviousKeys(file, b))).toEqual(hex([a]));
  });
});

describe('a change that is cut short', () => {
  it('leaves the live file as it was until the change is committed', () => {
    const [a, b, c] = [k(), k(), k()];
    change(a, b);
    const before = fs.readFileSync(file, 'utf8');
    stagePreviousKey(file, b, c);
    expect(fs.readFileSync(file, 'utf8')).toBe(before);
    expect(hex(readPreviousKeys(file, b))).toEqual(hex([a]));
  });

  it('is undone cleanly when the account record could not be saved', () => {
    const [a, b, c] = [k(), k(), k()];
    change(a, b);
    stagePreviousKey(file, b, c);
    discardPreviousKey(file);
    expect(fs.existsSync(`${file}.next`)).toBe(false);
    // Back on the old key, a later change still works and nothing was lost.
    change(b, c);
    expect(hex(readPreviousKeys(file, c))).toEqual(hex([a, b]));
  });

  it('is usable at once under the new key when the app stopped before the swap, and finishes at sign-in', () => {
    const [a, b, c] = [k(), k(), k()];
    change(a, b);
    stagePreviousKey(file, b, c); // crash: account saved with c, never committed
    expect(hex(readPreviousKeys(file, c))).toEqual(hex([a, b]));
    finalizePreviousKeys(file, c);
    expect(fs.existsSync(`${file}.next`)).toBe(false);
    expect(hex(readPreviousKeys(file, c))).toEqual(hex([a, b]));
  });

  it('keeps the earliest key when a first change was never swapped in and a second one follows', () => {
    const [k0, k1, k2] = [k(), k(), k()];
    stagePreviousKey(file, k0, k1); // change 1: account saved, but the swap never happened (no live file yet)
    expect(fs.existsSync(file)).toBe(false);
    change(k1, k2); // change 2, same session
    expect(hex(readPreviousKeys(file, k2))).toEqual(hex([k0, k1]));
  });

  it('ignores a stale staged copy sealed under a key that never became current', () => {
    const [a, b, never] = [k(), k(), k()];
    change(a, b);
    stagePreviousKey(file, b, never); // crash before the account record was saved
    expect(hex(readPreviousKeys(file, b))).toEqual(hex([a]));
    finalizePreviousKeys(file, b);
    expect(hex(readPreviousKeys(file, b))).toEqual(hex([a]));
    const c = k();
    change(b, c);
    expect(hex(readPreviousKeys(file, c))).toEqual(hex([a, b]));
  });
});

describe('a history file that cannot be opened', () => {
  it('is set aside, not deleted, and the key just replaced is still recorded', () => {
    const [a, b, stranger] = [k(), k(), k()];
    change(a, stranger);
    const damaged = fs.readFileSync(file, 'utf8');
    const r = stagePreviousKey(file, a, b);
    expect(r.ok).toBe(true);
    expect(r.setAsideUnreadable).toBe(true);
    commitPreviousKey(file);
    expect(hex(readPreviousKeys(file, b))).toEqual(hex([a]));
    expect(fs.readFileSync(`${file}.unreadable`, 'utf8')).toBe(damaged);
  });

  it('a truncated file does not stop the next change from being recorded', () => {
    const [a, b, c] = [k(), k(), k()];
    change(a, b);
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').slice(0, 20));
    change(b, c);
    expect(hex(readPreviousKeys(file, c))).toContain(b.toString('hex'));
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { writeAllSync } = require('./writeAllSync.cjs') as {
  writeAllSync: (fsDep: typeof fs, fd: number, data: string | Buffer) => number;
};
const { createDurableJsonWriter } = require('./durableWrite.cjs') as {
  createDurableJsonWriter: (deps: {
    fs: typeof fs;
    path: typeof path;
  }) => (filePath: string, text: string) => { ok: boolean; reason?: string };
};
const { createStagedWriter } = require('./stagedWrite.cjs') as {
  createStagedWriter: (deps: { fs: typeof fs; path: typeof path }) => {
    stage: (filePath: string, text: string, token: string) => { ok: boolean; tmp?: string };
    commit: (tmp: string, filePath: string) => { ok: boolean };
  };
};

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-writeall-'));
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

/**
 * A filesystem whose `writeSync` behaves the way POSIX allows but Node callers
 * usually never see: it accepts at most `chunk` bytes per call and reports how
 * many it took.
 */
function shortWritingFs(chunk: number) {
  return {
    ...fs,
    writeSync: (fd: number, buffer: Buffer, offset: number, length: number, position: number) =>
      fs.writeSync(fd, buffer, offset, Math.min(length, chunk), position),
  } as unknown as typeof fs;
}

describe('writeAllSync', () => {
  it('loops until every byte of a short-writing descriptor is written', () => {
    const target = path.join(dir, 'chunked.bin');
    const text = 'x'.repeat(5000);
    const fd = fs.openSync(target, 'w');
    try {
      expect(writeAllSync(shortWritingFs(64), fd, text)).toBe(5000);
    } finally {
      fs.closeSync(fd);
    }

    expect(fs.readFileSync(target, 'utf8')).toBe(text);
  });

  it('writes multi-byte characters without splitting them', () => {
    const target = path.join(dir, 'utf8.txt');
    const text = 'ağ düğüm ✅ '.repeat(500);
    const fd = fs.openSync(target, 'w');
    try {
      writeAllSync(shortWritingFs(7), fd, text);
    } finally {
      fs.closeSync(fd);
    }

    expect(fs.readFileSync(target, 'utf8')).toBe(text);
  });

  it('throws instead of spinning when the descriptor stops accepting bytes', () => {
    const stalledFs = { ...fs, writeSync: () => 0 } as unknown as typeof fs;
    const fd = fs.openSync(path.join(dir, 'stalled.txt'), 'w');
    try {
      expect(() => writeAllSync(stalledFs, fd, 'content')).toThrow(/short write/);
    } finally {
      fs.closeSync(fd);
    }
  });
});

describe('durable writers survive a short-writing filesystem', () => {
  it('durableWrite commits the complete file', () => {
    const target = path.join(dir, 'data.json');
    const text = JSON.stringify({ notes: Array.from({ length: 400 }, (_, i) => ({ id: `n${i}` })) });

    const writeJsonText = createDurableJsonWriter({ fs: shortWritingFs(128), path });
    expect(writeJsonText(target, text).ok).toBe(true);
    expect(fs.readFileSync(target, 'utf8')).toBe(text);
  });

  it('stagedWrite stages and commits the complete file', () => {
    const target = path.join(dir, 'staged.json');
    const text = JSON.stringify({ todoItems: Array.from({ length: 400 }, (_, i) => ({ id: i })) });

    const writer = createStagedWriter({ fs: shortWritingFs(128), path });
    const staged = writer.stage(target, text, 'tok');
    expect(staged.ok).toBe(true);
    expect(fs.readFileSync(staged.tmp!, 'utf8')).toBe(text);

    expect(writer.commit(staged.tmp!, target).ok).toBe(true);
    expect(fs.readFileSync(target, 'utf8')).toBe(text);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { createDurableJsonWriter } = require('./durableWrite.cjs') as {
  createDurableJsonWriter: (deps: {
    fs: typeof fs;
    path: typeof path;
  }) => (filePath: string, text: string) => { ok: boolean; reason?: string; error?: string };
};

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-durable-'));
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('durableWrite', () => {
  it('writes the file and leaves no temp file behind', () => {
    const writeJsonText = createDurableJsonWriter({ fs, path });
    const target = path.join(dir, 'data.json');

    expect(writeJsonText(target, '{"version":3}')).toEqual({ ok: true });
    expect(fs.readFileSync(target, 'utf8')).toBe('{"version":3}');
    expect(fs.existsSync(`${target}.tmp`)).toBe(false);
  });

  it('creates missing parent directories', () => {
    const writeJsonText = createDurableJsonWriter({ fs, path });
    const target = path.join(dir, 'nested', 'deeper', 'data.json');

    expect(writeJsonText(target, 'hello').ok).toBe(true);
    expect(fs.readFileSync(target, 'utf8')).toBe('hello');
  });

  it('replaces existing content atomically', () => {
    const writeJsonText = createDurableJsonWriter({ fs, path });
    const target = path.join(dir, 'data.json');
    fs.writeFileSync(target, 'old');

    expect(writeJsonText(target, 'new').ok).toBe(true);
    expect(fs.readFileSync(target, 'utf8')).toBe('new');
  });

  it('fsyncs the file before renaming it into place', () => {
    const order: string[] = [];
    const spyFs = {
      ...fs,
      fsyncSync: (fd: number) => {
        order.push('fsync');
        return fs.fsyncSync(fd);
      },
      renameSync: (from: string, to: string) => {
        order.push('rename');
        return fs.renameSync(from, to);
      },
    } as unknown as typeof fs;

    const writeJsonText = createDurableJsonWriter({ fs: spyFs, path });
    expect(writeJsonText(path.join(dir, 'data.json'), 'x').ok).toBe(true);

    expect(order[0]).toBe('fsync');
    expect(order).toContain('rename');
    expect(order.indexOf('fsync')).toBeLessThan(order.indexOf('rename'));
  });

  it('refuses to commit and keeps the previous file when fsync fails', () => {
    const target = path.join(dir, 'data.json');
    fs.writeFileSync(target, 'previous');

    const spyFs = {
      ...fs,
      fsyncSync: () => {
        throw new Error('simulated fsync failure');
      },
    } as unknown as typeof fs;
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const writeJsonText = createDurableJsonWriter({ fs: spyFs, path });
    const result = writeJsonText(target, 'new content');

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('durability');
    expect(fs.readFileSync(target, 'utf8')).toBe('previous');
    expect(fs.existsSync(`${target}.tmp`)).toBe(false);
  });

  it('still succeeds when the directory fsync is unsupported', () => {
    const target = path.join(dir, 'data.json');
    let call = 0;
    const spyFs = {
      ...fs,
      fsyncSync: (fd: number) => {
        call += 1;
        // First call is the file fsync (must succeed); the second is the
        // directory fsync, which Windows rejects.
        if (call > 1) throw new Error('EPERM');
        return fs.fsyncSync(fd);
      },
    } as unknown as typeof fs;

    const writeJsonText = createDurableJsonWriter({ fs: spyFs, path });

    expect(writeJsonText(target, 'content').ok).toBe(true);
    expect(fs.readFileSync(target, 'utf8')).toBe('content');
  });

  it('cleans up the temp file and reports io failure when the write throws', () => {
    const target = path.join(dir, 'data.json');
    fs.writeFileSync(target, 'previous');

    const spyFs = {
      ...fs,
      writeSync: () => {
        throw new Error('ENOSPC');
      },
    } as unknown as typeof fs;
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const writeJsonText = createDurableJsonWriter({ fs: spyFs, path });
    const result = writeJsonText(target, 'new content');

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('io');
    expect(fs.readFileSync(target, 'utf8')).toBe('previous');
    expect(fs.existsSync(`${target}.tmp`)).toBe(false);
  });
});

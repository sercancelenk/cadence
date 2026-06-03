import { describe, expect, it, vi } from 'vitest';
import { createPersistQueue } from './persistQueue';

describe('createPersistQueue', () => {
  it('runs writes strictly in enqueue order', async () => {
    const order: number[] = [];
    const queue = createPersistQueue(async (n: number) => {
      order.push(n);
      return { ok: true as const };
    });
    await queue.enqueue(1);
    await queue.enqueue(2);
    await queue.enqueue(3);
    expect(order).toEqual([1, 2, 3]);
  });

  it('discards stale failure when a newer job superseded it', async () => {
    let resolveFirst: (() => void) | undefined;
    const firstGate = new Promise<void>((r) => {
      resolveFirst = r;
    });
    const write = vi.fn(async (n: number) => {
      if (n === 1) {
        await firstGate;
        return { ok: false as const, reason: 'io', error: 'disk full' };
      }
      return { ok: true as const };
    });
    const queue = createPersistQueue(write);
    const p1 = queue.enqueue(1);
    const p2 = queue.enqueue(2);
    resolveFirst?.();
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toEqual({ ok: true });
    expect(r2).toEqual({ ok: true });
    expect(write).toHaveBeenCalledTimes(2);
  });

  it('surfaces failure from the latest job', async () => {
    const queue = createPersistQueue(async () => ({ ok: false as const, reason: 'rejected', error: 'nope' }));
    const r = await queue.enqueue({ x: 1 });
    expect(r).toEqual({ ok: false, reason: 'rejected', error: 'nope' });
  });

  it('flush waits until the tail promise settles', async () => {
    let done = false;
    const queue = createPersistQueue(async () => {
      await new Promise((r) => setTimeout(r, 30));
      done = true;
      return { ok: true as const };
    });
    void queue.enqueue(1);
    await queue.flush();
    expect(done).toBe(true);
  });

  it('keeps the queue alive when a write throws', async () => {
    const queue = createPersistQueue(async (n: number) => {
      if (n === 1) throw new Error('disk exploded');
      return { ok: true as const };
    });
    await expect(queue.enqueue(1)).rejects.toThrow('disk exploded');
    await expect(queue.enqueue(2)).resolves.toEqual({ ok: true });
    await queue.flush();
  });

  it('tracks latestSeq across enqueues', async () => {
    const queue = createPersistQueue(async () => ({ ok: true }));
    expect(queue.latestSeq()).toBe(0);
    void queue.enqueue(1);
    expect(queue.latestSeq()).toBe(1);
    await queue.enqueue(2);
    expect(queue.latestSeq()).toBe(2);
  });
});

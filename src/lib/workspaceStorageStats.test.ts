import { describe, expect, it, vi } from 'vitest';
import { emptyData } from '../model';
import { estimateWorkspaceStorage, formatStorageBytes } from './workspaceStorageStats';

describe('estimateWorkspaceStorage', () => {
  it('returns zero-ish breakdown for empty workspace', () => {
    const b = estimateWorkspaceStorage(emptyData());
    expect(b.counts.notes).toBe(0);
    expect(b.totalBytes).toBeGreaterThan(0);
  });

  it('separates archived notes and todos', () => {
    const data = emptyData();
    data.notes = [
      {
        id: 'n1',
        title: 'Active',
        body: 'hello',
        locked: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'n2',
        title: 'Old',
        body: 'bye',
        locked: false,
        archived: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    data.todoItems = [
      {
        id: 't1',
        groupId: data.todoGroups[0]!.id,
        title: 'Todo',
        status: 'todo',
        done: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 't2',
        groupId: data.todoGroups[0]!.id,
        title: 'Archived todo',
        status: 'todo',
        done: false,
        archived: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    const b = estimateWorkspaceStorage(data);
    expect(b.counts.notes).toBe(1);
    expect(b.counts.notesArchived).toBe(1);
    expect(b.counts.todoItems).toBe(1);
    expect(b.counts.todoItemsArchived).toBe(1);
    expect(b.notesArchivedBytes).toBeGreaterThan(0);
    expect(b.todoItemsArchivedBytes).toBeGreaterThan(0);
  });

  it('counts team items and other metadata buckets', () => {
    const data = emptyData();
    data.items = [
      {
        id: 'i1',
        personId: data.people[0]!.id,
        kind: 'task',
        title: 'Team task',
        body: '',
        done: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    data.aiSettings = { provider: 'openai', apiKey: 'sk-test', model: 'gpt-4o-mini' };
    const b = estimateWorkspaceStorage(data);
    expect(b.counts.teamItems).toBe(1);
    expect(b.teamItemsBytes).toBeGreaterThan(0);
    expect(b.otherBytes).toBeGreaterThan(0);
    expect(b.totalBytes).toBeGreaterThan(b.teamItemsBytes);
  });

  it('returns zero bytes when JSON serialisation fails', () => {
    const stringify = vi.spyOn(JSON, 'stringify').mockImplementation(() => {
      throw new TypeError('circular');
    });
    const b = estimateWorkspaceStorage(emptyData());
    expect(b.totalBytes).toBe(0);
    stringify.mockRestore();
  });

  it('estimates byte length without TextEncoder', () => {
    const Original = globalThis.TextEncoder;
    vi.stubGlobal('TextEncoder', undefined);
    const b = estimateWorkspaceStorage(emptyData());
    expect(b.totalBytes).toBeGreaterThan(0);
    vi.stubGlobal('TextEncoder', Original);
  });
});

describe('formatStorageBytes', () => {
  it('formats byte scales', () => {
    expect(formatStorageBytes(512)).toBe('512 B');
    expect(formatStorageBytes(2048)).toBe('2.0 KB');
    expect(formatStorageBytes(2 * 1024 * 1024)).toBe('2.0 MB');
    expect(formatStorageBytes(2 * 1024 * 1024 * 1024)).toBe('2.00 GB');
  });
});

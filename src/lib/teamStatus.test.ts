import { describe, expect, it } from 'vitest';
import { TEAM_STATUS_OPTIONS, teamStatusLabel } from './teamStatus';

describe('teamStatusLabel', () => {
  it('labels each known status', () => {
    expect(teamStatusLabel('active')).toBe('Active');
    expect(teamStatusLabel('paused')).toBe('Paused');
    expect(teamStatusLabel('archived')).toBe('Archived');
  });

  it('defaults undefined to active', () => {
    expect(teamStatusLabel(undefined)).toBe('Active');
  });

  it('falls back to active label for unknown status values', () => {
    expect(teamStatusLabel('bogus' as 'active')).toBe('Active');
  });
});

describe('TEAM_STATUS_OPTIONS', () => {
  it('lists all statuses with matching labels', () => {
    expect(TEAM_STATUS_OPTIONS).toEqual([
      { value: 'active', label: 'Active' },
      { value: 'paused', label: 'Paused' },
      { value: 'archived', label: 'Archived' },
    ]);
  });

  it('covers every status used by teamStatusLabel', () => {
    for (const { value, label } of TEAM_STATUS_OPTIONS) {
      expect(teamStatusLabel(value)).toBe(label);
    }
  });
});

import { describe, expect, it } from 'vitest';
import type { AppData, Team } from '../model';
import { sortedTeams } from './teamSort';

function team(id: string, name: string): Team {
  return { id, name, createdAt: '2020-01-01T00:00:00.000Z', status: 'active' };
}

function minimalData(overrides: Partial<AppData> = {}): AppData {
  return {
    version: 1,
    teams: [],
    people: [],
    items: [],
    notifiedReminderIds: [],
    todoGroups: [],
    todoItems: [],
    notes: [],
    ...overrides,
  } as AppData;
}

describe('sortedTeams', () => {
  it('sorts non-favorites alphabetically by name', () => {
    const data = minimalData({
      teams: [team('b', 'Zulu'), team('a', 'Alpha')],
    });
    expect(sortedTeams(data).map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('puts favorite teams first in favoriteTeamIds order', () => {
    const data = minimalData({
      teams: [team('c', 'Charlie'), team('a', 'Alpha'), team('b', 'Bravo')],
      profile: { displayName: 'Me', favoriteTeamIds: ['b', 'a'] },
    });
    expect(sortedTeams(data).map((t) => t.id)).toEqual(['b', 'a', 'c']);
  });

  it('sorts non-favorites with equal rank alphabetically by name', () => {
    const data = minimalData({
      teams: [team('z', 'Zulu'), team('m', 'Mike')],
      profile: { displayName: 'Me', favoriteTeamIds: [] },
    });
    expect(sortedTeams(data).map((t) => t.name)).toEqual(['Mike', 'Zulu']);
  });

  it('does not mutate the original teams array', () => {
    const teams = [team('b', 'B'), team('a', 'A')];
    const data = minimalData({ teams });
    sortedTeams(data);
    expect(data.teams.map((t) => t.id)).toEqual(['b', 'a']);
  });

  it('treats missing profile as no favorites', () => {
    const data = minimalData({
      teams: [team('b', 'Beta'), team('a', 'Alpha')],
    });
    expect(sortedTeams(data).map((t) => t.id)).toEqual(['a', 'b']);
  });
});

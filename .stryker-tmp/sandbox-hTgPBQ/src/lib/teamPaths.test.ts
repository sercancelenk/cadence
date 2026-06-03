// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { teamBase, teamLeader, teamMe, teamPeople, teamPerson } from './teamPaths';

describe('team path builders', () => {
  const teamId = 'team-alpha';
  const personId = 'person-42';

  it('teamBase', () => {
    expect(teamBase(teamId)).toBe('/teams/team-alpha');
  });

  it('teamMe', () => {
    expect(teamMe(teamId)).toBe('/teams/team-alpha/me');
  });

  it('teamPeople', () => {
    expect(teamPeople(teamId)).toBe('/teams/team-alpha/people');
  });

  it('teamLeader', () => {
    expect(teamLeader(teamId)).toBe('/teams/team-alpha/leader');
  });

  it('teamPerson', () => {
    expect(teamPerson(teamId, personId)).toBe('/teams/team-alpha/people/person-42');
  });
});

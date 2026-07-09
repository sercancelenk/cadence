import { describe, expect, it } from 'vitest';
import {
  teamBase,
  teamLeader,
  teamMe,
  teamPeople,
  teamPerson,
  teamPersonWorkspacePath,
  teamSkipLevel,
  withItemFocus,
  withWorkspaceTab,
} from './teamPaths';

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

  it('teamSkipLevel', () => {
    expect(teamSkipLevel(teamId)).toBe('/teams/team-alpha/skip-level');
  });

  it('teamPerson', () => {
    expect(teamPerson(teamId, personId)).toBe('/teams/team-alpha/people/person-42');
  });

  it('teamPersonWorkspacePath routes synthetic people to canonical paths', () => {
    expect(teamPersonWorkspacePath(teamId, { id: `__self__${teamId}`, isSelf: true })).toBe(
      '/teams/team-alpha/me',
    );
    expect(teamPersonWorkspacePath(teamId, { id: `__leader__${teamId}` })).toBe(
      '/teams/team-alpha/leader',
    );
    expect(teamPersonWorkspacePath(teamId, { id: `__skiplevel__${teamId}` })).toBe(
      '/teams/team-alpha/skip-level',
    );
    expect(teamPersonWorkspacePath(teamId, { id: personId })).toBe(
      '/teams/team-alpha/people/person-42',
    );
  });

  it('withItemFocus and withWorkspaceTab append query params', () => {
    expect(withItemFocus('/teams/t/me', 'item-1')).toBe('/teams/t/me?focus=item-1');
    expect(withItemFocus('/teams/t/me', 'item-1', 'meeting')).toBe(
      '/teams/t/me?focus=item-1&tab=meeting',
    );
    expect(withWorkspaceTab('/teams/t/leader', 'meeting')).toBe('/teams/t/leader?tab=meeting');
    expect(withWorkspaceTab('/teams/t/leader', 'workspace')).toBe('/teams/t/leader');
  });
});

import { isLeaderPerson, isSelfPerson, isSkipLevelPerson } from '../core/model';

export function teamBase(teamId: string): string {
  return `/teams/${teamId}`;
}

export function teamMe(teamId: string): string {
  return `/teams/${teamId}/me`;
}

export function teamPeople(teamId: string): string {
  return `/teams/${teamId}/people`;
}

export function teamLeader(teamId: string): string {
  return `/teams/${teamId}/leader`;
}

export function teamSkipLevel(teamId: string): string {
  return `/teams/${teamId}/skip-level`;
}

export function teamPerson(teamId: string, personId: string): string {
  return `/teams/${teamId}/people/${personId}`;
}

/**
 * Canonical workspace path for a person (Me / leader / skip-level / member).
 * Prefer this over `teamPerson` when building deep links so redirects do not
 * strip query params such as `?focus=` or `?tab=`.
 */
export function teamPersonWorkspacePath(
  teamId: string,
  person: Pick<{ id: string; isSelf?: boolean }, 'id' | 'isSelf'>,
): string {
  if (isSelfPerson(person)) return teamMe(teamId);
  if (isLeaderPerson(person)) return teamLeader(teamId);
  if (isSkipLevelPerson(person)) return teamSkipLevel(teamId);
  return teamPerson(teamId, person.id);
}

/** Append `?focus=` (and optional `tab`) for agenda / reminder deep links. */
export function withItemFocus(path: string, itemId: string, tab?: 'workspace' | 'timeline' | 'meeting'): string {
  const params = new URLSearchParams();
  params.set('focus', itemId);
  if (tab && tab !== 'workspace') params.set('tab', tab);
  return `${path}?${params.toString()}`;
}

export function withWorkspaceTab(path: string, tab: 'workspace' | 'timeline' | 'meeting'): string {
  if (tab === 'workspace') return path;
  return `${path}?tab=${encodeURIComponent(tab)}`;
}

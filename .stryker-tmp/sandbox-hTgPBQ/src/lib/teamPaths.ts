// @ts-nocheck
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

export function teamPerson(teamId: string, personId: string): string {
  return `/teams/${teamId}/people/${personId}`;
}

import { isSyntheticPerson, type Person, type Team } from '../../model';

export type DelegateOption = { id: string; name: string; teamName?: string };

/** The people a task can be handed to: real team members only, by name. Never sent to a model. */
export function delegateOptions(people: Person[], teams: Team[]): DelegateOption[] {
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const archivedTeams = new Set(teams.filter((t) => t.status === 'archived').map((t) => t.id));
  return people
    .filter((p) => !isSyntheticPerson(p) && !archivedTeams.has(p.teamId))
    .map((p) => {
      const team = teamName.get(p.teamId);
      return { id: p.id, name: p.name, ...(team ? { teamName: team } : {}) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Adds one new task for a person, with the title only. False when the person is no longer there (for
 * example after a sync) or the save was refused, so the caller never reports a task that was not written.
 */
export function addTaskForPerson(
  snapshot: { people: Person[] } | null,
  addItem: (personId: string, kind: 'task', fields: { title: string }) => boolean,
  personId: string,
  title: string,
): boolean {
  if (!snapshot?.people.some((p) => p.id === personId)) return false;
  return addItem(personId, 'task', { title });
}

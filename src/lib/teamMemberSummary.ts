import type { AppData, Item, Person } from '../model';
import { getLeaderPerson, getSelfPerson, isLeaderPerson, isSelfPerson, teamPeople } from '../model';

export type TeamMemberRole = 'self' | 'leader' | 'member';

export interface TeamMemberSummary {
  person: Person;
  role: TeamMemberRole;
  openTasks: number;
  /** Open tasks whose due date is in the past. Subset of openTasks. */
  overdueTasks: number;
  openGoals: number;
  /** Reminders due within the next 7 days that aren't done. */
  upcomingReminders: number;
  /** Most recent item updatedAt for this person, or undefined when they have none. */
  lastActivityAt?: string;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

interface MemberAccumulator {
  openTasks: number;
  overdueTasks: number;
  openGoals: number;
  upcomingReminders: number;
  lastActivityAt?: string;
}

function emptyAccumulator(): MemberAccumulator {
  return { openTasks: 0, overdueTasks: 0, openGoals: 0, upcomingReminders: 0, lastActivityAt: undefined };
}

function accumulate(acc: MemberAccumulator, item: Item, now: number): void {
  if (item.kind === 'task' && !item.done) {
    acc.openTasks += 1;
    if (item.dueAt) {
      const due = Date.parse(item.dueAt);
      if (!Number.isNaN(due) && due < now) acc.overdueTasks += 1;
    }
  }
  if (item.kind === 'goal' && !item.done) acc.openGoals += 1;
  if (item.remindAt && !item.done) {
    const t = Date.parse(item.remindAt);
    if (!Number.isNaN(t) && t >= now && t <= now + WEEK_MS) acc.upcomingReminders += 1;
  }
  if (!acc.lastActivityAt || item.updatedAt > acc.lastActivityAt) {
    acc.lastActivityAt = item.updatedAt;
  }
}

function roleOf(person: Person): TeamMemberRole {
  if (isSelfPerson(person)) return 'self';
  if (isLeaderPerson(person)) return 'leader';
  return 'member';
}

/**
 * Builds a per-member roster for the team overview: Me first, the leader
 * second, then the remaining members alphabetically by name. Stats are
 * computed in a single pass over `data.items` (no N×M filtering) so the
 * overview stays cheap for large teams.
 *
 * `now` is injectable to keep the reminder window deterministic in tests.
 */
export function summarizeTeamMembers(
  data: Pick<AppData, 'people' | 'items'>,
  teamId: string,
  now: number = Date.now(),
): TeamMemberSummary[] {
  const self = getSelfPerson(data, teamId);
  const leader = getLeaderPerson(data, teamId);
  const members = [...teamPeople(data, teamId)].sort((a, b) => a.name.localeCompare(b.name));

  const ordered: Person[] = [];
  if (self) ordered.push(self);
  if (leader) ordered.push(leader);
  ordered.push(...members);

  const personIds = new Set(ordered.map((p) => p.id));
  const stats = new Map<string, MemberAccumulator>();
  for (const item of data.items) {
    if (!personIds.has(item.personId)) continue;
    let acc = stats.get(item.personId);
    if (!acc) {
      acc = emptyAccumulator();
      stats.set(item.personId, acc);
    }
    accumulate(acc, item, now);
  }

  return buildSummaries(ordered, stats);
}

function buildSummaries(
  ordered: Person[],
  stats: Map<string, MemberAccumulator>,
): TeamMemberSummary[] {
  return ordered.map((person) => {
    const acc = stats.get(person.id) ?? emptyAccumulator();
    return {
      person,
      role: roleOf(person),
      openTasks: acc.openTasks,
      overdueTasks: acc.overdueTasks,
      openGoals: acc.openGoals,
      upcomingReminders: acc.upcomingReminders,
      lastActivityAt: acc.lastActivityAt,
    };
  });
}

export type MemberSort = 'name' | 'tasks' | 'recent';

export const MEMBER_SORT_OPTIONS: { value: MemberSort; label: string }[] = [
  { value: 'name', label: 'Name (A–Z)' },
  { value: 'tasks', label: 'Most open tasks' },
  { value: 'recent', label: 'Recent activity' },
];

function memberComparator(sort: MemberSort): (a: TeamMemberSummary, b: TeamMemberSummary) => number {
  const byName = (a: TeamMemberSummary, b: TeamMemberSummary) => a.person.name.localeCompare(b.person.name);
  if (sort === 'tasks') {
    return (a, b) => (b.openTasks - a.openTasks) || byName(a, b);
  }
  if (sort === 'recent') {
    return (a, b) => (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? '') || byName(a, b);
  }
  return byName;
}

/**
 * Filters by a case-insensitive name/title query and sorts the *member*
 * portion by the chosen key. The special "Me" and "Leader" rows always
 * stay pinned at the top (in that order) regardless of sort, so the user's
 * own workspace and their manager are never buried.
 */
export function arrangeMemberSummaries(
  summaries: TeamMemberSummary[],
  options: { query?: string; sort?: MemberSort } = {},
): TeamMemberSummary[] {
  const { query = '', sort = 'name' } = options;
  const q = query.trim().toLowerCase();
  const filtered = q
    ? summaries.filter(
        (s) =>
          s.person.name.toLowerCase().includes(q) || (s.person.title ?? '').toLowerCase().includes(q),
      )
    : summaries;

  const pinned = filtered.filter((s) => s.role === 'self' || s.role === 'leader');
  pinned.sort((a, b) => (a.role === 'self' ? 0 : 1) - (b.role === 'self' ? 0 : 1));
  const members = filtered.filter((s) => s.role === 'member').sort(memberComparator(sort));
  return [...pinned, ...members];
}

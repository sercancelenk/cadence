import { useMemo } from 'react';
import { useAccount } from '../../AccountContext';
import { useAppData } from '../../AppDataContext';
import {
  collectAgendaEntries,
  filterAgendaEntriesForDay,
  filterOverdueAgendaEntries,
} from '../../lib/agendaEntries';
import { filterFocusTodayItems } from '../../lib/planningMatrix';
import { PATH_AGENDA, PATH_TEAMS, PATH_TODOS } from '../../lib/routes';
import { sortedTeams } from '../../lib/teamSort';
import { teamBase, teamPeople } from '../../lib/teamPaths';
import { isSyntheticPerson, isTodoOpen, teamMemberCount, type Team } from '../../model';

export type HomeStat = {
  id: string;
  label: string;
  value: number;
  to: string;
  hint?: string;
};

export type HomeContinueTarget = {
  team: Team;
  openTasks: number;
  memberCount: number;
};

export function useHomeDashboard() {
  const { user } = useAccount();
  const { data } = useAppData();

  return useMemo(() => {
    const profile = data.profile ?? { displayName: 'Me', favoriteTeamIds: [] };
    const teamsSorted = sortedTeams(data);
    const lastTeam = data.lastTeamId ? data.teams.find((t) => t.id === data.lastTeamId) : undefined;
    const continueTeam = lastTeam ?? teamsSorted[0];

    const openTasksAll = data.items.filter(
      (it) => !it.done && it.kind === 'task' && data.people.some((p) => p.id === it.personId),
    ).length;

    const openTodos = data.todoItems.filter((t) => isTodoOpen(t.status) && t.archived !== true).length;

    const peopleCount = data.people.filter((p) => !isSyntheticPerson(p)).length;

    const agendaEntries = collectAgendaEntries(data);
    const overdueEntries = filterOverdueAgendaEntries(agendaEntries);
    const todayEntries = filterAgendaEntriesForDay(agendaEntries, new Date());
    const todayPreview = todayEntries.slice(0, 5);

    const stats: HomeStat[] = [
      {
        id: 'teams',
        label: 'Teams',
        value: data.teams.length,
        to: PATH_TEAMS,
      },
      {
        id: 'tasks',
        label: 'Open tasks',
        value: openTasksAll,
        to: continueTeam ? teamBase(continueTeam.id) : PATH_TEAMS,
        hint: continueTeam ? `In ${continueTeam.name}` : undefined,
      },
      {
        id: 'todos',
        label: 'To-dos',
        value: openTodos,
        to: PATH_TODOS,
      },
      {
        id: 'people',
        label: 'People',
        value: peopleCount,
        to: continueTeam ? teamPeople(continueTeam.id) : PATH_TEAMS,
        hint: continueTeam ? `In ${continueTeam.name}` : undefined,
      },
    ];

    const summaryParts: string[] = [];
    if (overdueEntries.length > 0) {
      summaryParts.push(
        `${overdueEntries.length} overdue on agenda`,
      );
    }
    if (openTodos > 0) {
      summaryParts.push(`${openTodos} open to-do${openTodos === 1 ? '' : 's'}`);
    }
    if (openTasksAll > 0) {
      summaryParts.push(`${openTasksAll} open team task${openTasksAll === 1 ? '' : 's'}`);
    }
    if (todayEntries.length > 0) {
      summaryParts.push(`${todayEntries.length} scheduled today`);
    }
    const activitySummary =
      summaryParts.length > 0 ? summaryParts.join(' · ') : 'Nothing urgent — pick up where you left off.';

    let continueTarget: HomeContinueTarget | null = null;
    if (continueTeam) {
      const memberCount = teamMemberCount(data, continueTeam.id);
      const openTasks = data.items.filter(
        (it) =>
          !it.done &&
          it.kind === 'task' &&
          data.people.some((p) => p.id === it.personId && p.teamId === continueTeam.id),
      ).length;
      continueTarget = { team: continueTeam, openTasks, memberCount };
    }

    const peopleCountByTeamId = new Map(
      teamsSorted.map((team) => [team.id, teamMemberCount(data, team.id)]),
    );

    const planningFocusItems = filterFocusTodayItems(data.todoItems);

    return {
      profile,
      user,
      teamsSorted,
      stats,
      activitySummary,
      overdueCount: overdueEntries.length,
      todayPreview,
      todayTotal: todayEntries.length,
      continueTarget,
      continueIsLastVisited: Boolean(lastTeam),
      peopleCountByTeamId,
      agendaHref: PATH_AGENDA,
      planningFocusItems,
      todoGroups: data.todoGroups,
    };
  }, [data, user]);
}

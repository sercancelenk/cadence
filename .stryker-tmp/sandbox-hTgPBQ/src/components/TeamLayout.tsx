// @ts-nocheck
import { useEffect } from 'react';
import { Navigate, Outlet, useParams } from 'react-router-dom';
import { useAppData } from '../AppDataContext';
import { PATH_TEAMS } from '../lib/routes';

export function TeamLayout() {
  const { teamId } = useParams();
  const { data, rememberTeam } = useAppData();
  const team = teamId ? data.teams.find((t) => t.id === teamId) : undefined;

  useEffect(() => {
    if (teamId && team) rememberTeam(teamId);
  }, [rememberTeam, team, teamId]);

  if (!teamId) return <Navigate to={PATH_TEAMS} replace />;
  if (!team) return <Navigate to={PATH_TEAMS} replace />;

  return <Outlet />;
}

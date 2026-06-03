// @ts-nocheck
import type { AppData, Team } from '../model';

/** Favoriler önce, sonra ada göre */
export function sortedTeams(data: AppData): Team[] {
  const fav = data.profile?.favoriteTeamIds ?? [];
  const rank = (id: string) => {
    const i = fav.indexOf(id);
    return i === -1 ? 1000 : i;
  };
  return [...data.teams].sort((a, b) => {
    const ra = rank(a.id);
    const rb = rank(b.id);
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name);
  });
}

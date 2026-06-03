// @ts-nocheck
import type { AppData } from '../model';

/** Quick suggestions (optional; users may enter any free-form value). */
export const SUGGESTED_CATEGORIES = ['Initiative', 'Operations', 'Team', 'Stakeholder', 'Personal growth', 'Leadership'];

export function distinctCategoriesForTeam(data: AppData, teamId: string): string[] {
  const personIds = new Set(data.people.filter((p) => p.teamId === teamId).map((p) => p.id));
  const set = new Set<string>();
  for (const it of data.items) {
    if (!personIds.has(it.personId)) continue;
    const c = it.category?.trim();
    if (c) set.add(c);
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'en'));
}

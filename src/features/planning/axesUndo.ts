type Axes = { planImportant?: boolean; planUrgent?: boolean };

export type AppliedAxes = { id: string; important: boolean; urgent: boolean };

/**
 * Undo for an AI classification. A task goes back to its previous axes only if it still holds
 * exactly what the AI step wrote; one the user has moved since, or that no longer exists, is left
 * as it is and counted in `skipped`.
 */
export function axesRestorePatches(
  current: ReadonlyArray<{ id: string } & Axes>,
  applied: readonly AppliedAxes[],
  previous: Readonly<Record<string, Axes>>,
): { restore: Array<{ id: string; patch: Axes }>; skipped: number } {
  const restore: Array<{ id: string; patch: Axes }> = [];
  let skipped = 0;
  for (const a of applied) {
    const now = current.find((t) => t.id === a.id);
    if (!now || now.planImportant !== a.important || now.planUrgent !== a.urgent) {
      skipped += 1;
      continue;
    }
    const before = previous[a.id] ?? {};
    restore.push({ id: a.id, patch: { planImportant: before.planImportant, planUrgent: before.planUrgent } });
  }
  return { restore, skipped };
}

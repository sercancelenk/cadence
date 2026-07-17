import { useEffect } from 'react';
import { useAppData, useAppDataActions } from '../../AppDataContext';
import { updateTodoItem } from '../../core/actions';
import {
  localCalendarDayKey,
  PLANNING_FOCUS_DAY_STORAGE_KEY,
  shouldClearFocusForNewDay,
} from '../../lib/planningMatrix';

/** Last calendar day successfully evaluated this session (allows midnight re-check). */
let lastRolloverDayKeyEvaluated: string | null = null;

function readStoredFocusDay(): string | null {
  try {
    return localStorage.getItem(PLANNING_FOCUS_DAY_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredFocusDay(dayKey: string): void {
  try {
    localStorage.setItem(PLANNING_FOCUS_DAY_STORAGE_KEY, dayKey);
  } catch {
    /* ignore quota / private mode */
  }
}

/** @internal test-only — resets the session guard between unit tests. */
export function resetPlanningFocusDayRolloverForTests(): void {
  lastRolloverDayKeyEvaluated = null;
}

/**
 * On a new local calendar day, clear yesterday’s “today focus” pins.
 * Day key lives in localStorage (UI ritual — not AppData schema).
 * Re-runs on visibility/focus so overnight Electron sessions still roll.
 * Advances the day key only after a successful `update` (or when no clear is needed).
 */
export function usePlanningFocusDayRollover(): void {
  const { ready } = useAppData();
  const { update } = useAppDataActions();

  useEffect(() => {
    if (!ready) return;

    const run = () => {
      const today = localCalendarDayKey();
      if (lastRolloverDayKeyEvaluated === today) return;

      const stored = readStoredFocusDay();
      if (shouldClearFocusForNewDay(stored, today)) {
        const applied = update((data) => {
          let next = data;
          let changed = false;
          for (const item of data.todoItems) {
            if (item.planFocusToday === true) {
              next = updateTodoItem(next, item.id, { planFocusToday: false });
              changed = true;
            }
          }
          return changed ? next : data;
        });
        // persistBlocked — leave stored day alone so a later attempt can clear.
        if (!applied) return;
      }

      writeStoredFocusDay(today);
      lastRolloverDayKeyEvaluated = today;
    };

    run();

    const onResume = () => {
      if (document.visibilityState === 'hidden') return;
      run();
    };
    document.addEventListener('visibilitychange', onResume);
    window.addEventListener('focus', onResume);
    return () => {
      document.removeEventListener('visibilitychange', onResume);
      window.removeEventListener('focus', onResume);
    };
  }, [ready, update]);
}

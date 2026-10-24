/**
 * Where AI actions can be started from. AI is a verb reached from the selection, the slash
 * menu, ⌘K and row menus: no permanent AI surface. Each surface asks this registry which
 * actions it may show; when AI is not enabled the answer is always "none".
 */

export type AiSurface = 'slash' | 'bubble' | 'palette' | 'taskRow';

export type AiAction = {
  id: string;
  label: string;
  hint: string;
  /** Extra search words for the slash menu and ⌘K. */
  keywords: string;
  surfaces: readonly AiSurface[];
  /** The registry task this action runs (`src/lib/ai/prompts`). */
  taskId: string;
};

export const AI_ACTIONS: readonly AiAction[] = [
  {
    id: 'extract-tasks',
    label: 'Extract tasks',
    hint: 'Find tasks in this text',
    keywords: 'ai extract tasks todo action items',
    surfaces: ['slash', 'bubble', 'palette'],
    taskId: 'ai.extract',
  },
  {
    // Ask AI starts from a task, so it has no meaning in ⌘K without choosing one first.
    id: 'ask-ai',
    label: 'Ask AI',
    hint: 'Get a plan for this task',
    keywords: 'ai ask coach plan',
    surfaces: ['taskRow'],
    taskId: 'ai.coach',
  },
];

export function availableAiActions(surface: AiSurface, ctx: { aiEnabled: boolean }): AiAction[] {
  if (!ctx.aiEnabled) return [];
  return AI_ACTIONS.filter((a) => a.surfaces.includes(surface));
}

/** `?ai=extract` on a page URL asks that page to open the matching AI dialog. */
export function aiIntentFromSearch(search: string): 'extract' | null {
  const value = new URLSearchParams(search).get('ai');
  return value === 'extract' ? 'extract' : null;
}

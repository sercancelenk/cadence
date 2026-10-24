import { coachTask } from './coach';
import { extractTask } from './extract';

/** Every AI task, by stable id. Prompts live here and only here. */
export const PROMPTS = {
  'ai.coach': coachTask,
  'ai.extract': extractTask,
} as const;

export type PromptId = keyof typeof PROMPTS;

export { coachTask, extractTask };
export type { CoachInput } from './coach';
export type { ExtractInput, ExtractedRow } from './extract';

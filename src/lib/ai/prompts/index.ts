import { coachTask } from './coach';
import { boxesTask } from './boxes';
import { breakdownTask } from './breakdown';
import { challengeTask } from './challenge';
import { digestTask } from './digest';
import { eisenhowerTask } from './eisenhower';
import { erdTask } from './erd';
import { extractTask } from './extract';
import { candorTask, reviewTask } from './feedback';
import { mockDataTask } from './mockdata';
import { prepTask } from './prep';
import { sbiTask } from './sbi';
import { screenshotTask } from './screenshot';
import { sketchTask } from './sketch';
import { structureTask } from './structure';
import { visualizeTask } from './visualize';
import { workspaceTask } from './workspace';

/** Every AI task, by stable id. Prompts live here and only here. */
export const PROMPTS = {
  'ai.coach': coachTask,
  'ai.extract': extractTask,
  'ai.visualize': visualizeTask,
  'ai.challenge': challengeTask,
  'ai.breakdown': breakdownTask,
  'ai.sbi': sbiTask,
  'ai.eisenhower': eisenhowerTask,
  'ai.structure': structureTask,
  'ai.mockdata': mockDataTask,
  'ai.erd': erdTask,
  'ai.sketch': sketchTask,
  'ai.digest': digestTask,
  'ai.prep': prepTask,
  'ai.screenshot': screenshotTask,
  'ai.workspace': workspaceTask,
  'ai.boxes': boxesTask,
  'ai.candor': candorTask,
  'ai.review': reviewTask,
} as const;

export type PromptId = keyof typeof PROMPTS;

export { breakdownTask, challengeTask, coachTask, digestTask, eisenhowerTask, erdTask, extractTask, mockDataTask, prepTask, sbiTask, screenshotTask, sketchTask, structureTask, visualizeTask, workspaceTask };
export type { CoachInput } from './coach';
export type { ExtractInput, ExtractedRow } from './extract';
export type { VisualizeInput, VisualizeOut } from './visualize';
export type { ChallengeInput, ChallengeOut } from './challenge';
export type { BreakdownInput, BreakdownStep } from './breakdown';
export type { SbiInput, SbiOut } from './sbi';
export type { EisenhowerInput, EisenhowerItem } from './eisenhower';
export type { StructureInput, StructureOut } from './structure';
export type { MockDataInput, MockDataOut } from './mockdata';
export type { ErdInput } from './erd';
export type { SketchInput, SketchOut } from './sketch';
export type { DigestInput } from './digest';
export type { PrepInput, PrepOut } from './prep';
export type { ScreenshotInput, ScreenshotOut } from './screenshot';
export type { WorkspaceInput } from './workspace';
export type { BoxesInput, BoxesOut } from './boxes';
export type { CandorOut, FeedbackInput, FeedbackPart, ReviewOut } from './feedback';

/**
 * Where AI actions can be started from. AI is a verb reached from the selection, the slash
 * menu, ⌘K and row menus: no permanent AI surface. Each surface asks this registry which
 * actions it may show; when AI is not enabled the answer is always "none".
 */

export type AiSurface = 'slash' | 'bubble' | 'palette' | 'taskRow' | 'tool';

/** The editor an action starts from. Only matters for the editor surfaces (slash, bubble). */
export type AiHost = 'notes' | 'feedback';

export type AiAction = {
  id: string;
  label: string;
  hint: string;
  /** Extra search words for the slash menu and ⌘K. */
  keywords: string;
  surfaces: readonly AiSurface[];
  /** Editors that offer the action; absent means every editor. */
  hosts?: readonly AiHost[];
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
    hosts: ['notes'],
    taskId: 'ai.extract',
  },
  {
    id: 'visualize',
    label: 'Visualize',
    hint: 'Turn this text into a diagram',
    keywords: 'ai visualize diagram mermaid flowchart sequence state chart',
    surfaces: ['slash', 'bubble'],
    hosts: ['notes'],
    taskId: 'ai.visualize',
  },
  {
    id: 'challenge-idea',
    label: 'Challenge my idea',
    hint: 'Find weak spots in this note',
    keywords: 'ai challenge critique devil advocate risks assumptions review',
    surfaces: ['slash', 'bubble'],
    hosts: ['notes'],
    taskId: 'ai.challenge',
  },
  {
    id: 'feedback-sbi',
    label: 'Rewrite as SBI',
    hint: 'Situation, Behavior, Impact',
    keywords: 'ai sbi feedback situation behavior impact rewrite',
    surfaces: ['bubble'],
    hosts: ['feedback'],
    taskId: 'ai.sbi',
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
  {
    id: 'classify-eisenhower',
    label: 'Classify with AI',
    hint: 'Suggest important / urgent for unsorted tasks',
    keywords: 'ai classify eisenhower matrix important urgent priority planning',
    surfaces: ['tool'],
    taskId: 'ai.eisenhower',
  },
  {
    id: 'structure-document',
    label: 'Structure this document',
    hint: 'Turn rough notes into sections and lists',
    keywords: 'ai structure organize scratchpad document outline',
    surfaces: ['tool'],
    taskId: 'ai.structure',
  },
  {
    id: 'mock-data',
    label: 'Generate mock data',
    hint: 'More records shaped like this JSON',
    keywords: 'ai mock data fake sample json generate records',
    surfaces: ['tool'],
    taskId: 'ai.mockdata',
  },
  {
    id: 'erd-from-text',
    label: 'Design with AI',
    hint: 'Describe tables and relations in words',
    keywords: 'ai erd database schema tables relations design entity',
    surfaces: ['tool'],
    taskId: 'ai.erd',
  },
  {
    id: 'sketch-to-mermaid',
    label: 'Convert to Mermaid',
    hint: 'Turn this sketch into a diagram you can edit as text',
    keywords: 'ai sketch excalidraw mermaid diagram convert',
    surfaces: ['tool'],
    taskId: 'ai.sketch',
  },
  {
    id: 'weekly-digest',
    label: 'Weekly digest',
    hint: 'A retrospective or an upward summary of your week',
    keywords: 'ai weekly digest retrospective summary report status week',
    surfaces: ['palette'],
    taskId: 'ai.digest',
  },
  {
    id: 'one-on-one-prep',
    label: 'Prepare a 1:1',
    hint: 'Follow-ups, goals and questions for this person',
    keywords: 'ai 1:1 one on one prep meeting agenda person',
    surfaces: ['tool'],
    taskId: 'ai.prep',
  },
  {
    id: 'screenshot-to-diagram',
    label: 'Diagram from a screenshot',
    hint: 'Turn a picture into Mermaid or HTML',
    keywords: 'ai screenshot image picture diagram mermaid html vision whiteboard',
    surfaces: ['palette', 'tool'],
    taskId: 'ai.screenshot',
  },
  {
    id: 'ask-workspace',
    label: 'Ask your workspace',
    hint: 'Answer from your notes and tasks, with sources',
    keywords: 'ai ask search question answer workspace notes tasks find',
    surfaces: ['palette'],
    taskId: 'ai.workspace',
  },
  {
    id: 'draw-from-description',
    label: 'Draw from a description',
    hint: 'Describe it in words; get a Mermaid note or a Sketch board',
    keywords: 'ai draw describe diagram mermaid sketch flowchart sequence whiteboard architecture',
    surfaces: ['palette', 'tool'],
    taskId: 'ai.visualize',
  },
  {
    id: 'break-down',
    label: 'Break down',
    hint: 'Split this task into steps',
    keywords: 'ai break down breakdown steps subtasks checklist split',
    surfaces: ['taskRow'],
    taskId: 'ai.breakdown',
  },
];

export function availableAiActions(surface: AiSurface, ctx: { aiEnabled: boolean; host?: AiHost }): AiAction[] {
  if (!ctx.aiEnabled) return [];
  const host = ctx.host ?? 'notes';
  return AI_ACTIONS.filter((a) => a.surfaces.includes(surface) && (!a.hosts || a.hosts.includes(host)));
}

/** `?ai=extract` on a page URL asks that page to open the matching AI dialog. */
export function aiIntentFromSearch(search: string): 'extract' | null {
  const value = new URLSearchParams(search).get('ai');
  return value === 'extract' ? 'extract' : null;
}

export type NotesAiRequest = { kind: 'extract' | 'visualize' | 'challenge'; text: string };

const NOTES_REQUEST_KIND: Record<string, NotesAiRequest['kind']> = {
  'extract-tasks': 'extract',
  visualize: 'visualize',
  'challenge-idea': 'challenge',
};

/**
 * What the notes page opens for an AI action started in the editor: the dialog and the text it
 * works on (the selection, else the whole note). `null` for actions that belong elsewhere.
 */
export function notesAiRequest(actionId: string, text: string, wholeNoteText: () => string): NotesAiRequest | null {
  if (!Object.hasOwn(NOTES_REQUEST_KIND, actionId)) return null;
  const kind = NOTES_REQUEST_KIND[actionId]!;
  return { kind, text: text.trim() ? text : wholeNoteText() };
}

/**
 * Whether a person's item offers the feedback rewrite. Feedback is people data, so the
 * organization's `aiPeople` flag applies in addition to `ai`.
 */
export function feedbackAiAvailable(args: {
  itemKind: string;
  features: { ai: boolean; aiPeople: boolean };
  hasConnection: boolean;
}): boolean {
  return args.itemKind === 'feedback' && peopleAiAvailable(args);
}

/** Whether AI that works on a person's data (Ask AI on their task or goal, feedback) is on offer. */
export function peopleAiAvailable(args: { features: { ai: boolean; aiPeople: boolean }; hasConnection: boolean }): boolean {
  return args.features.ai && args.features.aiPeople && args.hasConnection;
}

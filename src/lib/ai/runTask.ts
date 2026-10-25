import type { AISettings } from '../../model';
import { AIError, askAI, defaultModel } from '../ai';
import type { AIMessage, AIStopReason } from '../ai';
import type { AiImage } from './images';
import { resolveConnection } from './connections';
import { sanitizeFocusNote } from './focusNote';
import type { AiOptions, AiTask, DataClass, PromptContext } from './types';

export type RunTaskArgs<In, Out> = {
  task: AiTask<In, Out>;
  input: In;
  options?: AiOptions;
  settings: AISettings | undefined;
  /** The resolved feature flags (organization policy included). */
  features: { ai: boolean; aiPeople: boolean; aiFocusNote: boolean };
  /**
   * The caller knows what the data IS (a task or goal that belongs to a person is people data
   * whatever prompt handles it). It can raise a task to `people`; it can never lower one.
   */
  dataClass?: DataClass;
  /** A stored `systemPrompt` / `extractionGuidance`, honoured only as a constrained focus note. */
  legacyFocusNote?: string;
  /** Turns after the opening message (assistant, user, …), for follow-ups in a conversation. */
  conversation?: AIMessage[];
  /** Called with the text so far while the first reply streams in (the final value still comes from the parse). */
  onText?: (textSoFar: string) => void;
  /** Images for a `needsVision` task, sent with the first message only. */
  images?: AiImage[];
  signal?: AbortSignal;
  now?: Date;
};

export type RunTaskFailure = {
  ok: false;
  reason: 'not-configured' | 'policy' | 'blocked-people' | 'capability' | 'invalid-output' | 'engine' | 'cancelled';
  message: string;
  diagnostic?: string;
};

export type RunTaskResult<Out> =
  | {
      ok: true;
      value: Out;
      connectionName: string;
      model: string;
      fellBack: boolean;
      repaired: boolean;
      /** Why the (accepted) reply ended; `length` means it was cut off at the token limit. */
      stopReason: AIStopReason;
    }
  | RunTaskFailure;

const fail = (reason: RunTaskFailure['reason'], message: string, diagnostic?: string): RunTaskFailure => ({
  ok: false,
  reason,
  message,
  ...(diagnostic ? { diagnostic } : {}),
});

/**
 * Runs one AI task: gates → connection → prompt → request → validation → one repair attempt.
 * Nothing is written anywhere; the caller shows the value and applies it only on request.
 */
export async function runAiTask<In, Out>(args: RunTaskArgs<In, Out>): Promise<RunTaskResult<Out>> {
  const { task, input, features, signal } = args;
  const dataClass: DataClass = task.dataClass === 'people' || args.dataClass === 'people' ? 'people' : 'content';

  if (!features.ai) return fail('policy', 'AI is turned off by your organization.');
  if (dataClass === 'people' && !features.aiPeople) {
    return fail('policy', 'Your organization does not allow AI on 1:1 notes and feedback.');
  }

  const resolved = resolveConnection(args.settings, dataClass, task.id);
  if (!resolved.ok) return fail('not-configured', 'AI is not set up yet. Connect a provider in Settings.');
  const { connection, fellBack } = resolved;

  if (dataClass === 'people' && !connection.allowsPeopleData) {
    return fail(
      'blocked-people',
      `This uses 1:1 or feedback data, and “${connection.name}” is not allowed for it. Allow it in Settings → AI, or use a local model.`,
    );
  }
  if (task.needsJson && connection.probed && !connection.capabilities.includes('json') && !connection.jsonOverride) {
    return fail(
      'capability',
      `“${connection.name}” did not return reliable JSON when tested. Choose a larger model or another connection in Settings → AI.`,
    );
  }

  if (task.needsVision) {
    if (!args.images?.length) return fail('invalid-output', 'Add an image first.');
    if (!connection.capabilities.includes('vision')) {
      return fail(
        'capability',
        `“${connection.name}” has not been confirmed for images. Open Settings → AI and use “Check images” on it first, or choose a model that can read images.`,
      );
    }
  }

  const focus =
    task.allowsFocusNote && features.aiFocusNote && args.legacyFocusNote
      ? sanitizeFocusNote(args.legacyFocusNote)
      : '';
  const ctx: PromptContext = {
    now: args.now ?? new Date(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    options: args.options ?? {},
    ...(focus ? { focusNote: focus } : {}),
  };
  const parts = task.build(input, ctx);

  // A stored systemPrompt must never replace the built-in system text.
  const { systemPrompt: _ignored, ...engineSettings } = connection.settings;
  const base = {
    settings: engineSettings as AISettings,
    fallbackSystem: parts.system,
    maxOutputTokens: parts.maxOutputTokens,
    responseFormat: parts.json ? ('json' as const) : undefined,
    dataClass,
    signal,
  };
  const model = connection.settings.model?.trim() || (connection.settings.provider ? defaultModel(connection.settings.provider) : '');

  const messages: AIMessage[] = [
    { role: 'user', content: parts.user, ...(task.needsVision && args.images?.length ? { images: args.images } : {}) },
    ...(args.conversation ?? []),
  ];
  try {
    const first = await askAI({ ...base, messages, onText: args.onText });
    const parsed = task.parse(first.text, ctx);
    if (parsed.ok) {
      return {
        ok: true,
        value: parsed.value,
        connectionName: connection.name,
        model,
        fellBack,
        repaired: false,
        stopReason: first.stopReason,
      };
    }
    const retry = await askAI({
      ...base,
      messages: [
        ...messages,
        { role: 'assistant', content: first.text },
        {
          role: 'user',
          content: `That reply could not be used: ${parsed.error} Return only the corrected result in the required format.`,
        },
      ],
    });
    const again = task.parse(retry.text, ctx);
    if (again.ok) {
      return {
        ok: true,
        value: again.value,
        connectionName: connection.name,
        model,
        fellBack,
        repaired: true,
        stopReason: retry.stopReason,
      };
    }
    return fail('invalid-output', 'The AI did not return a usable result. Try again, or choose a larger model or another connection in Settings → AI.');
  } catch (err) {
    if ((err as DOMException)?.name === 'AbortError') return fail('cancelled', 'Cancelled.');
    if (err instanceof AIError) return fail('engine', err.message, err.diagnostic);
    return fail('engine', (err as Error)?.message || 'The request failed.');
  }
}

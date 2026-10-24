/**
 * Shared types for the AI foundation. Pure types: no behaviour lives here.
 * See docs/superpowers/specs/2026-10-24-ai-features-design.md (sections 5.1, 5.2).
 */

/** `people` data (1:1 notes, feedback, a person's goals and tasks) has stricter rules than `content`. */
export type DataClass = 'content' | 'people';

/** Fixed, per-task options the user can choose. Never free text. */
export type AiOptions = Record<string, string>;

export type PromptContext = {
  now: Date;
  /** IANA time zone, e.g. `Europe/Istanbul`. */
  timeZone: string;
  options: AiOptions;
  /** Already sanitized; only present when the task allows it and policy permits. */
  focusNote?: string;
};

export type PromptParts = {
  system: string;
  user: string;
  /** True when the reply must be JSON (the engine uses the provider's JSON mode where verified). */
  json: boolean;
  maxOutputTokens: number;
};

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

export type AiTask<In, Out> = {
  id: string;
  /** Bumped whenever the prompt changes, so a change is a reviewed diff. */
  promptVersion: number;
  dataClass: DataClass;
  needsJson: boolean;
  allowsFocusNote: boolean;
  build(input: In, ctx: PromptContext): PromptParts;
  parse(reply: string): ParseResult<Out>;
};

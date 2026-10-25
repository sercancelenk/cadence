import type { GatewayFormat } from '../../model';
import type { AIStopReason } from '../ai';
import type { SseEvent } from './sse';

/**
 * Reads the events of one provider's stream into text, a stop reason, and any error the
 * stream reported. Event shapes follow each provider's streaming documentation:
 *  - OpenAI Chat: `choices[0].delta.content`, `choices[0].finish_reason`, `[DONE]`;
 *  - OpenAI Responses: `response.output_text.delta`, `response.completed|incomplete|failed`;
 *  - Anthropic: `content_block_delta` (`text_delta`), `message_delta.stop_reason`, `error`;
 *  - Gemini (`streamGenerateContent?alt=sse`): a `GenerateContentResponse` per event.
 */

export type StreamResult = {
  /** At least one event was understood; false means the server did not stream. */
  saw: boolean;
  text: string;
  stopReason: AIStopReason;
  error: string | undefined;
  /** OpenAI/Anthropic refusal text (empty string when the refusal has no words). */
  refusal: string | undefined;
};

export function createStreamDecoder(
  format: GatewayFormat,
  onText: (textSoFar: string) => void,
): { feed(e: SseEvent): void; result(): StreamResult } {
  let text = '';
  let saw = false;
  let stopReason: AIStopReason = 'other';
  let error: string | undefined;
  let refusal: string | undefined;

  const add = (piece: unknown) => {
    if (typeof piece !== 'string' || !piece) return;
    text += piece;
    onText(text);
  };
  const obj = (v: unknown): Record<string, unknown> | null =>
    v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

  const chat = (j: Record<string, unknown>) => {
    const err = obj(j.error);
    if (err) {
      error = str(err.message) ?? 'The provider reported an error.';
      saw = true;
      return;
    }
    const choice = obj(Array.isArray(j.choices) ? j.choices[0] : undefined);
    if (!choice) return;
    saw = true;
    const delta = obj(choice.delta);
    add(delta?.content);
    if (typeof delta?.refusal === 'string') refusal = (refusal ?? '') + delta.refusal;
    const fr = str(choice.finish_reason);
    if (fr) stopReason = fr === 'length' ? 'length' : fr === 'stop' ? 'stop' : 'other';
  };

  const responses = (j: Record<string, unknown>) => {
    const type = str(j.type);
    if (!type) return;
    if (type === 'response.output_text.delta') {
      saw = true;
      add(j.delta);
    } else if (type === 'response.completed') {
      saw = true;
      stopReason = 'stop';
    } else if (type === 'response.incomplete') {
      saw = true;
      const reason = str(obj(obj(j.response)?.incomplete_details)?.reason);
      stopReason = reason === 'max_output_tokens' ? 'length' : 'other';
    } else if (type === 'response.failed') {
      saw = true;
      error = str(obj(obj(j.response)?.error)?.message) ?? 'The response failed.';
    } else if (type === 'error') {
      saw = true;
      error = str(j.message) ?? str(obj(j.error)?.message) ?? 'The provider reported an error.';
    } else if (type.startsWith('response.')) {
      saw = true;
    }
  };

  const anthropic = (j: Record<string, unknown>) => {
    const type = str(j.type);
    if (!type) return;
    saw = true;
    if (type === 'content_block_delta') {
      const d = obj(j.delta);
      if (d && d.type === 'text_delta') add(d.text);
    } else if (type === 'message_delta') {
      const sr = str(obj(j.delta)?.stop_reason);
      if (sr === 'refusal') refusal = '';
      if (sr) stopReason = sr === 'max_tokens' ? 'length' : sr === 'end_turn' || sr === 'stop_sequence' ? 'stop' : 'other';
    } else if (type === 'error') {
      error = str(obj(j.error)?.message) ?? 'The provider reported an error.';
    }
  };

  const gemini = (j: Record<string, unknown>) => {
    const block = str(obj(j.promptFeedback)?.blockReason);
    if (block) {
      saw = true;
      error = `The request was blocked (${block}).`;
    }
    const cand = obj(Array.isArray(j.candidates) ? j.candidates[0] : undefined);
    if (!cand) return;
    saw = true;
    const parts = obj(cand.content)?.parts;
    if (Array.isArray(parts)) for (const p of parts) add(obj(p)?.text);
    const fr = str(cand.finishReason);
    if (fr) stopReason = fr === 'MAX_TOKENS' ? 'length' : fr === 'STOP' ? 'stop' : 'other';
  };

  const decode = { 'openai-chat': chat, 'openai-responses': responses, anthropic, gemini }[format];

  return {
    feed(e) {
      if (e.data === '[DONE]') return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(e.data);
      } catch {
        return;
      }
      const j = obj(parsed);
      if (j) decode(j);
    },
    result: () => ({ saw, text: text.trim(), stopReason, error, refusal }),
  };
}

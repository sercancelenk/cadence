import { describe, expect, it } from 'vitest';
import type { GatewayFormat } from '../../model';
import { createStreamDecoder } from './streams';

type Ev = { event?: string; data: unknown };
function run(format: GatewayFormat, events: Ev[]) {
  const seen: string[] = [];
  const d = createStreamDecoder(format, (t) => seen.push(t));
  for (const e of events) d.feed({ ...(e.event ? { event: e.event } : {}), data: typeof e.data === 'string' ? e.data : JSON.stringify(e.data) });
  return { seen, result: d.result() };
}

describe('openai-chat', () => {
  it('collects delta.content and the finish reason; [DONE] ends it', () => {
    const { seen, result } = run('openai-chat', [
      { data: { choices: [{ delta: { role: 'assistant' } }] } },
      { data: { choices: [{ delta: { content: 'Hel' } }] } },
      { data: { choices: [{ delta: { content: 'lo' }, finish_reason: null }] } },
      { data: { choices: [{ delta: {}, finish_reason: 'stop' }] } },
      { data: '[DONE]' },
    ]);
    expect(seen).toEqual(['Hel', 'Hello']);
    expect(result).toEqual({ saw: true, text: 'Hello', stopReason: 'stop', error: undefined, refusal: undefined });
  });

  it('maps length to length and anything else to other; reads a refusal', () => {
    expect(run('openai-chat', [{ data: { choices: [{ delta: { content: 'x' }, finish_reason: 'length' }] } }]).result.stopReason).toBe('length');
    expect(run('openai-chat', [{ data: { choices: [{ delta: { content: 'x' }, finish_reason: 'content_filter' }] } }]).result.stopReason).toBe('other');
    const r = run('openai-chat', [{ data: { choices: [{ delta: { refusal: 'No.' }, finish_reason: 'stop' }] } }]).result;
    expect(r.text).toBe('');
    expect(r.refusal).toBe('No.');
  });

  it('reports an error object', () => {
    expect(run('openai-chat', [{ data: { error: { message: 'rate limited' } } }]).result.error).toBe('rate limited');
  });
});

describe('openai-responses', () => {
  it('collects output_text deltas; completed is stop; incomplete for the token limit is length', () => {
    const done = run('openai-responses', [
      { event: 'response.output_text.delta', data: { type: 'response.output_text.delta', delta: 'A' } },
      { event: 'response.output_text.delta', data: { type: 'response.output_text.delta', delta: 'B' } },
      { event: 'response.completed', data: { type: 'response.completed', response: { status: 'completed' } } },
    ]);
    expect(done.result).toMatchObject({ text: 'AB', stopReason: 'stop', saw: true });
    const cut = run('openai-responses', [
      { data: { type: 'response.output_text.delta', delta: 'A' } },
      { data: { type: 'response.incomplete', response: { incomplete_details: { reason: 'max_output_tokens' } } } },
    ]);
    expect(cut.result.stopReason).toBe('length');
  });

  it('reports failed and error events', () => {
    expect(run('openai-responses', [{ data: { type: 'response.failed', response: { error: { message: 'boom' } } } }]).result.error).toBe('boom');
    expect(run('openai-responses', [{ data: { type: 'error', message: 'bad key' } }]).result.error).toBe('bad key');
  });
});

describe('anthropic', () => {
  it('collects text_delta and reads stop_reason from message_delta', () => {
    const { seen, result } = run('anthropic', [
      { event: 'message_start', data: { type: 'message_start', message: {} } },
      { event: 'ping', data: { type: 'ping' } },
      { event: 'content_block_delta', data: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hi' } } },
      { event: 'content_block_delta', data: { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{' } } },
      { event: 'content_block_delta', data: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '!' } } },
      { event: 'message_delta', data: { type: 'message_delta', delta: { stop_reason: 'max_tokens' } } },
      { event: 'message_stop', data: { type: 'message_stop' } },
    ]);
    expect(seen).toEqual(['Hi', 'Hi!']);
    expect(result).toMatchObject({ text: 'Hi!', stopReason: 'length' });
  });

  it('refusal stop and error events', () => {
    expect(run('anthropic', [{ data: { type: 'message_delta', delta: { stop_reason: 'refusal' } } }]).result.refusal).toBe('');
    expect(run('anthropic', [{ event: 'error', data: { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } } }]).result.error).toBe('Overloaded');
  });
});

describe('gemini', () => {
  it('collects candidate text across chunks and maps the finish reason', () => {
    const { seen, result } = run('gemini', [
      { data: { candidates: [{ content: { parts: [{ text: 'One' }] } }] } },
      { data: { candidates: [{ content: { parts: [{ text: ' two' }] }, finishReason: 'MAX_TOKENS' }] } },
    ]);
    expect(seen).toEqual(['One', 'One two']);
    expect(result).toMatchObject({ text: 'One two', stopReason: 'length' });
  });

  it('reports a blocked prompt', () => {
    const r = run('gemini', [{ data: { promptFeedback: { blockReason: 'SAFETY' } } }]).result;
    expect(r.error).toMatch(/SAFETY/);
  });
});

describe('any format', () => {
  it('ignores events it cannot read, and saw is false when none were recognised', () => {
    const { seen, result } = run('openai-chat', [{ data: 'not json' }, { data: { unrelated: true } }]);
    expect(seen).toEqual([]);
    expect(result.saw).toBe(false);
    expect(result.text).toBe('');
  });
});

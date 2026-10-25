import { describe, expect, it } from 'vitest';
import { createSseParser, type SseEvent } from './sse';

function collect(chunks: string[]): SseEvent[] {
  const events: SseEvent[] = [];
  const p = createSseParser((e) => events.push(e));
  for (const c of chunks) p.push(c);
  p.end();
  return events;
}

describe('createSseParser', () => {
  it('reads data events separated by blank lines', () => {
    expect(collect(['data: {"a":1}\n\ndata: {"a":2}\n\n'])).toEqual([{ data: '{"a":1}' }, { data: '{"a":2}' }]);
  });

  it('reads the event name and joins several data lines with a newline', () => {
    expect(collect(['event: delta\ndata: one\ndata: two\n\n'])).toEqual([{ event: 'delta', data: 'one\ntwo' }]);
  });

  it('copes with chunks that split a line, an event or the blank line', () => {
    const whole = 'event: x\ndata: {"t":"héllo"}\n\ndata: [DONE]\n\n';
    for (let cut = 1; cut < whole.length; cut += 3) {
      expect(collect([whole.slice(0, cut), whole.slice(cut)]), `cut at ${cut}`).toEqual([
        { event: 'x', data: '{"t":"héllo"}' },
        { data: '[DONE]' },
      ]);
    }
  });

  it('handles CRLF and lone CR line ends', () => {
    expect(collect(['data: a\r\n\r\ndata: b\r\r'])).toEqual([{ data: 'a' }, { data: 'b' }]);
  });

  it('ignores comments, unknown fields and a leading space only once', () => {
    expect(collect([': ping\nid: 7\nretry: 100\ndata:  two spaces\n\n'])).toEqual([{ data: ' two spaces' }]);
    expect(collect(['data:nospace\n\n'])).toEqual([{ data: 'nospace' }]);
  });

  it('delivers a last event that was not followed by a blank line when the stream ends', () => {
    expect(collect(['data: tail'])).toEqual([{ data: 'tail' }]);
  });

  it('does not deliver an event with no data', () => {
    expect(collect(['event: ping\n\n'])).toEqual([]);
  });
});

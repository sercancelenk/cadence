/**
 * Server-Sent Events, as far as the AI providers use them: `event:` and `data:` lines, events
 * ended by a blank line. Fed text in whatever pieces arrive; a piece may end anywhere.
 */

export type SseEvent = { event?: string; data: string };

export function createSseParser(onEvent: (e: SseEvent) => void): { push(chunk: string): void; end(): void } {
  let buffer = '';
  let event: string | undefined;
  let data: string[] = [];
  // A CR at the very end of a chunk may be the first half of CRLF.
  let pendingCr = false;

  const dispatch = () => {
    if (data.length > 0) onEvent({ ...(event ? { event } : {}), data: data.join('\n') });
    event = undefined;
    data = [];
  };

  const line = (raw: string) => {
    if (raw === '') return dispatch();
    if (raw.startsWith(':')) return;
    const colon = raw.indexOf(':');
    const field = colon === -1 ? raw : raw.slice(0, colon);
    let value = colon === -1 ? '' : raw.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') event = value;
    else if (field === 'data') data.push(value);
  };

  return {
    push(chunk) {
      let text = buffer + chunk;
      buffer = '';
      if (pendingCr && text.startsWith('\n')) text = text.slice(1);
      pendingCr = false;
      let start = 0;
      for (let i = 0; i < text.length; i += 1) {
        const ch = text[i];
        if (ch !== '\n' && ch !== '\r') continue;
        line(text.slice(start, i));
        if (ch === '\r') {
          if (text[i + 1] === '\n') i += 1;
          else if (i + 1 >= text.length) pendingCr = true;
        }
        start = i + 1;
      }
      buffer = text.slice(start);
    },
    end() {
      if (buffer) line(buffer);
      buffer = '';
      dispatch();
    },
  };
}

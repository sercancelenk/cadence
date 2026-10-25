import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AISettings, GatewayFormat } from '../model';
import { askAI } from './ai';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR4nGO4IyJCEmIY1TCqYfhqAAACcQQQFwFJQgAAAABJRU5ErkJggg==';
const gw = (gatewayFormat: GatewayFormat): AISettings => ({
  provider: 'gateway',
  baseUrl: 'https://gw.example.com/v1',
  model: 'm',
  apiKey: 'sk-gw-secret-key',
  gatewayFormat,
});
const REPLY: Record<GatewayFormat, unknown> = {
  'openai-chat': { choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] },
  'openai-responses': { status: 'completed', output_text: 'ok' },
  anthropic: { content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' },
  gemini: { candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }] },
};

function stub(format: GatewayFormat) {
  const fetchMock = vi.fn(async () => Response.json(REPLY[format]));
  vi.stubGlobal('fetch', fetchMock);
  return () => JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
}
afterEach(() => vi.unstubAllGlobals());

const withImage = [
  { role: 'user' as const, content: 'What is this?', images: [{ mediaType: 'image/png' as const, base64: PNG }] },
];

describe('image parts follow each provider\'s documented shape', () => {
  it('openai-chat: text part then image_url with a data URL', async () => {
    const body = stub('openai-chat');
    await askAI({ settings: gw('openai-chat'), messages: withImage, dataClass: 'content' });
    expect(body().messages[1]).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: 'What is this?' },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${PNG}` } },
      ],
    });
  });

  it('openai-responses: input_text then input_image with a data URL string', async () => {
    const body = stub('openai-responses');
    await askAI({ settings: gw('openai-responses'), messages: withImage, dataClass: 'content' });
    expect(body().input[0]).toEqual({
      role: 'user',
      content: [
        { type: 'input_text', text: 'What is this?' },
        { type: 'input_image', image_url: `data:image/png;base64,${PNG}` },
      ],
    });
  });

  it('anthropic: image block with a base64 source, then the text', async () => {
    const body = stub('anthropic');
    await askAI({ settings: gw('anthropic'), messages: withImage, dataClass: 'content' });
    expect(body().messages[0]).toEqual({
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: PNG } },
        { type: 'text', text: 'What is this?' },
      ],
    });
  });

  it('gemini: inline_data part, then the text', async () => {
    const body = stub('gemini');
    await askAI({ settings: gw('gemini'), messages: withImage, dataClass: 'content' });
    expect(body().contents[0]).toEqual({
      role: 'user',
      parts: [{ inline_data: { mime_type: 'image/png', data: PNG } }, { text: 'What is this?' }],
    });
  });
});

describe('images in the engine', () => {
  it('text-only messages are built exactly as before', async () => {
    const body = stub('openai-chat');
    await askAI({ settings: gw('openai-chat'), messages: [{ role: 'user', content: 'hi' }], dataClass: 'content' });
    expect(body().messages[1]).toEqual({ role: 'user', content: 'hi' });
  });

  it('refuses invalid images before anything is sent', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const bad = [{ role: 'user' as const, content: 'x', images: [{ mediaType: 'image/png' as const, base64: 'not base64 !!' }] }];
    await expect(askAI({ settings: gw('openai-chat'), messages: bad, dataClass: 'content' })).rejects.toMatchObject({ name: 'AIError' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('the diagnostic never contains image data', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"nope"}', { status: 400 })));
    const err = await askAI({ settings: gw('openai-chat'), messages: withImage, dataClass: 'content' }).catch((e) => e);
    expect(err.diagnostic ?? '').not.toContain(PNG);
    expect(err.message).not.toContain(PNG);
  });
});

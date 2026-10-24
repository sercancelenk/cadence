/**
 * Ready-made connection settings and the help text shown in Settings.
 *
 * The three hosted providers are not separate code paths: each one is a preset
 * that the same request engine as the custom gateway runs (see `askAI`). A
 * preset can also be copied into the custom gateway form as a starting point.
 *
 * Every preset below was checked against a real server or the provider's
 * documentation; the comment on each says how.
 */

import type { AIProvider, AISettings, GatewayHeader } from '../model';

export type GatewayConnection = Pick<
  AISettings,
  'baseUrl' | 'gatewayFormat' | 'authHeader' | 'authScheme' | 'extraHeaders' | 'requestPath' | 'maxTokensField'
>;

export type HostedProvider = Extract<AIProvider, 'anthropic' | 'openai' | 'gemini'>;

const ANTHROPIC_BROWSER_HEADER: GatewayHeader = {
  name: 'anthropic-dangerous-direct-browser-access',
  value: 'true',
};

/** Connection settings for the hosted providers. */
export const HOSTED_CONNECTIONS: Record<HostedProvider, GatewayConnection> = {
  anthropic: {
    baseUrl: 'https://api.anthropic.com/v1',
    gatewayFormat: 'anthropic',
    // Anthropic requires this opt-in for calls made from a browser (the web build).
    extraHeaders: [ANTHROPIC_BROWSER_HEADER],
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    gatewayFormat: 'openai-chat',
    // OpenAI's API spec: max_tokens is deprecated and not accepted by reasoning models.
    maxTokensField: 'max_completion_tokens',
  },
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    gatewayFormat: 'gemini',
    // Google's documented examples pass the key as a `key` query parameter.
    requestPath: '/models/{model}:generateContent?key={apiKey}',
    authScheme: 'none',
  },
};

export type GatewayTemplate = {
  id: string;
  label: string;
  /** Short description shown next to the template. */
  hint: string;
  connection: GatewayConnection;
  /** A model name to suggest, when the template implies one. */
  modelExample?: string;
};

/**
 * Starting points for the custom gateway form. The hosted ones mirror
 * `HOSTED_CONNECTIONS`; the local ones were verified against a running
 * OmniRoute (`/v1`, all four formats) and Ollama (`/v1`, OpenAI Chat).
 */
export const GATEWAY_TEMPLATES: GatewayTemplate[] = [
  {
    id: 'omniroute',
    label: 'OmniRoute (local)',
    hint: 'A local router for many providers. Default port 20128.',
    connection: { baseUrl: 'http://localhost:20128/v1', gatewayFormat: 'openai-chat' },
    modelExample: 'auto/best-fast',
  },
  {
    id: 'ollama',
    label: 'Ollama (local)',
    hint: 'Models running on this computer. No API key needed.',
    connection: { baseUrl: 'http://localhost:11434/v1', gatewayFormat: 'openai-chat' },
  },
  {
    id: 'anthropic',
    label: 'Anthropic Claude',
    hint: 'Anthropic Messages API.',
    connection: HOSTED_CONNECTIONS.anthropic,
  },
  {
    id: 'openai',
    label: 'OpenAI',
    hint: 'OpenAI Chat Completions API.',
    connection: HOSTED_CONNECTIONS.openai,
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    hint: 'The key goes in the address, as in Google’s examples.',
    connection: HOSTED_CONNECTIONS.gemini,
  },
];

/** What the request engine can and cannot do. Keep in step with docs/AI-INTEGRATION.md. */
export const AI_LIMITS: string[] = [
  'Text in, text out. No images, files, tool calls or streaming.',
  'Replies are capped at 4,000 tokens; the system prompt at 4,000 characters.',
  'A request times out after 120 seconds. On desktop a reply larger than about 4 MB is refused.',
  'Redirects are refused, so the address must be the final one.',
  'Plain http:// works only for localhost and private-network addresses.',
];

export type ProviderInfo = {
  title: string;
  /** One or two sentences: what choosing this does. */
  summary: string;
  /** `label: value` rows. */
  facts: Array<[string, string]>;
  /** Extra guidance, one bullet each. */
  notes: string[];
};

const SENT = 'Task or note text you ask about, your instructions, and the conversation so far.';

export const PROVIDER_INFO: Record<AIProvider | 'none', ProviderInfo> = {
  none: {
    title: 'AI is off',
    summary: 'No AI buttons appear and nothing is ever sent anywhere. The rest of Cadence works the same.',
    facts: [],
    notes: ['Pick a provider below to turn the assistant and the task extractor on.'],
  },
  anthropic: {
    title: 'Anthropic Claude',
    summary: 'Sends requests straight from this device to Anthropic with your own API key.',
    facts: [
      ['Address', 'api.anthropic.com'],
      ['API format', 'Anthropic Messages'],
      ['Authentication', 'Your API key in the x-api-key header'],
      ['Sent', SENT],
    ],
    notes: [
      'Need a different address, header or API version? Use Custom gateway and start from the Anthropic template.',
    ],
  },
  openai: {
    title: 'OpenAI ChatGPT',
    summary: 'Sends requests straight from this device to OpenAI with your own API key.',
    facts: [
      ['Address', 'api.openai.com'],
      ['API format', 'OpenAI Chat Completions'],
      ['Authentication', 'Your API key as a Bearer token'],
      ['Sent', SENT],
    ],
    notes: [
      'Newer OpenAI models spend part of the reply limit on hidden reasoning, so very short limits can come back empty.',
      'Need a different address or header? Use Custom gateway and start from the OpenAI template.',
    ],
  },
  gemini: {
    title: 'Google Gemini',
    summary: 'Sends requests straight from this device to Google with your own API key.',
    facts: [
      ['Address', 'generativelanguage.googleapis.com'],
      ['API format', 'Google Gemini generateContent'],
      ['Authentication', 'Your API key in the request address (the key query parameter)'],
      ['Sent', SENT],
    ],
    notes: [
      'Google retired Gemini 1.x and gemini-2.0-flash (shut down 2026-06-01). Use a current model such as gemini-3.8-flash.',
      'Need a different address? Use Custom gateway and start from the Gemini template.',
    ],
  },
  gateway: {
    title: 'Custom gateway',
    summary:
      'Connects to any router, proxy or local model server you run or are given access to. You decide the address, headers, key and model.',
    facts: [
      ['API format', 'OpenAI Chat Completions, OpenAI Responses, Anthropic Messages or Google Gemini'],
      ['Address', 'Any https:// address, or http:// for localhost and private networks'],
      ['Authentication', 'Any header name; the key as Bearer <key> or on its own; or none'],
      ['Sent', SENT],
    ],
    notes: [
      'Start from a template (OmniRoute, Ollama, or a hosted provider) and change what you need.',
      'In the request path, {model} and {apiKey} are replaced by the model name and your key. A ?query string is allowed.',
      'Tools such as Codex or OpenCode show the provider type they use for the same gateway; pick the matching API format.',
      'The gateway decides which provider sees your text. Check who operates it before sending anything sensitive.',
    ],
  },
};

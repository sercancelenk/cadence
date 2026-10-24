# AI integration

Reference for what Cadence's optional AI assistant can connect to, what it
sends, and what it cannot do. The *Limits* and *Formats* sections are the
source for the "AI compatibility" note in each CHANGELOG entry: when this file
changes, say so there.

## How it connects

Cadence has one request engine. The hosted providers are presets of it, and
**Custom gateway** lets you set every part yourself. Requests go from your
device straight to the address you chose; there is no Cadence server in between.

- **Desktop app:** the main process makes the request with Electron's network
  stack, so the system proxy and certificate store apply. The browser's CORS and
  content-security rules do not apply, the address, path and headers are
  validated again there, and the organization policy is enforced there. The
  window's content-security policy no longer lists any AI host, so nothing in the
  window can reach a provider by another route.
- **Web app:** the browser makes the request, so the server must allow
  cross-origin (CORS) requests.

## Providers

| Choice | Address | API format | Authentication |
|---|---|---|---|
| Anthropic Claude | `https://api.anthropic.com/v1` | Anthropic Messages | `x-api-key` |
| OpenAI ChatGPT | `https://api.openai.com/v1` | OpenAI Chat Completions | `Authorization: Bearer` |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta` | Gemini generateContent | key in the address (`?key=`) |
| Custom gateway | your address | your choice (below) | your choice |

The three hosted choices take only an API key and a model. To change their
address, headers or path, choose **Custom gateway** and *Start from a template*.

### Default models

Model names age out, so the defaults were checked against each provider's
published information on **2026-10-24**; update them when you ship:

| Provider | Default | Checked against |
|---|---|---|
| Anthropic | `claude-sonnet-5-5` (also `claude-haiku-5-5`, `claude-opus-5-5`) | Anthropic's current model list |
| OpenAI | `gpt-5.4-mini` (also `gpt-5.5`, `gpt-5.6`) | OpenAI's published API spec: no shutdown notice. `gpt-4o-mini`, `gpt-4o`, `gpt-4.1-mini` are announced to shut down on 2027-01-14 |
| Gemini | `gemini-3.8-flash` (also `gemini-3.6-flash`, `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`) | Google's deprecations page: `gemini-2.0-flash(-lite)` shut down on 2026-06-01; the 2.5 models are limited to existing users |

OpenAI Chat: `max_tokens` is deprecated and not accepted by reasoning models, so
the OpenAI preset sends `max_completion_tokens`. For a custom gateway the
*Token limit field* setting chooses between the two (default `max_tokens`, which
local servers and most gateways understand).

## Custom gateway

Fields: base URL, model, API key (optional), API format, and under *Advanced*
the auth header name, how the key is written (Bearer / the key alone / no
header), extra headers (`Name: value` per line) and the request path.

| API format | Default request path | Default auth header |
|---|---|---|
| OpenAI Chat Completions | `/chat/completions` | `Authorization: Bearer <key>` |
| OpenAI Responses | `/responses` | `Authorization: Bearer <key>` |
| Anthropic Messages | `/messages` (+ `anthropic-version: 2023-06-01`) | `x-api-key` |
| Google Gemini | `/models/{model}:generateContent` | `x-goog-api-key` |

In the request path `{model}` is replaced by the URL-encoded model name and
`{apiKey}` by the URL-encoded key; a `?query` string is allowed. Examples:

- Gemini with the key in the address: `/models/{model}:generateContent?key={apiKey}` and *No auth header*.
- A gateway that wants an API version: `/openai/deployments/{model}/chat/completions?api-version=2024-02-01`.

Templates: OmniRoute (`http://localhost:20128/v1`), Ollama (`http://localhost:11434/v1`),
Anthropic, OpenAI, Gemini. Tools such as Codex or OpenCode show which provider
type they use for the same gateway; pick the matching format.

## What is sent

The text you ask about (a task, or the note you extract tasks from), your
instructions, and the conversation so far. Notes that are locked and not
unlocked are never sent. The API key is sent only to the address you configured.

## Limits

- Text in, text out. No images, files, tool calls or streaming.
- Replies are capped at 4,000 tokens; the system prompt at 4,000 characters; the task extractor reads at most 16,000 characters of notes.
- A request times out after 120 seconds (desktop and web). On desktop a reply over about 4 MB is refused.
- Redirects are refused on both: the address must be the final one.
- Plain `http://` works only for `localhost` (and `*.localhost`), `127.x`, `10.x`, `172.16-31.x`, `192.168.x`, `*.local` and `::1`.
- A header Cadence sets itself (`Host`, `Content-Type`, `Content-Length`, `Cookie`, …) cannot be overridden; at most 20 headers of up to 4,096 characters.

## Organization policy

`features.ai: false` turns AI off. `features.aiAllowedHosts` restricts requests
to the listed host names (see [ENTERPRISE.md](./ENTERPRISE.md)); a list with no
valid entry allows nothing. Both are enforced in the desktop app's main process;
the web build does not enforce them.

## Where settings are stored

Provider, key, model, address, headers and path are part of your workspace data:
inside the encrypted data file on desktop, in this browser's `localStorage`
(not encrypted) in the web app. Header values may contain tokens; treat them
like the API key.

## Diagnostics

*Test connection* shows **Diagnostic details** on failure: format, address, header
names (values hidden), HTTP status and the start of the reply. The API key is
masked everywhere, including in the address and in a reply that echoes it back.

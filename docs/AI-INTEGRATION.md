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

Templates are by API format: *OpenAI-compatible* (Chat Completions) and *OpenAI Responses* set only
the format, and Anthropic, OpenAI and Gemini also fill their address. Tools such as Codex or
OpenCode show which provider type they use for the same gateway; pick the matching format.

## Connections and routing

You can keep several connections (for example a company gateway and a local Ollama) and choose
which one each kind of task uses. The connection edited in **Settings → AI Assistant → Default
connection** is the default; extra ones are added under **Connections**.

- **Feature routing** has two choices: *Notes and tasks* and *People data*. Anything not
  routed uses the default. If a routed connection is deleted, tasks fall back to the default.
- **JSON replies**: *Test connection* also checks whether the connection returns reliable JSON.
  Tasks that need JSON (task extraction) are refused on a connection that was tested and found
  unreliable, with the reason and a pointer to Settings; an untested connection may try.
- **People data** (1:1 notes, feedback, and Ask AI on a person's own tasks and goals) only goes to a connection you allowed with the *Allow
  people data* switch. A model on this computer (`localhost`, `127.x`, `::1`) is allowed by
  default; a LAN host, a company gateway and the hosted providers are not. There is no
  per-use pop-up. An organization can turn this class off (`features.aiPeople`).
- Extra connections are stored inside `aiSettings`, so an older build keeps them untouched. When
  no other AI setting exists, Cadence keeps a default API format as a marker so the older version
  still recognises the settings. One limit of going back to an older version (notes and tasks are
  never affected): a connection whose provider the older version does not know is ignored there,
  so you re-enter it.
- Permission to receive people data and a JSON check belong to a destination: changing a
  connection's provider or address clears the permission (you are asked again), and changing the
  provider, address, model or API format clears the JSON check.
- You can keep up to 20 connections.

## Prompts

The prompts are part of the app: internal, versioned (`src/lib/ai/prompts/`), tested with
fixtures, and neither shown nor editable. What you choose are options (for Ask AI: *Focus* —
Plan, Risks, First 15 minutes). Your own text is always sent as data between clear markers, and
every reply is checked against the task's expected shape; anything that does not fit is
discarded (after one automatic retry) and nothing is applied.

Older versions let you type instructions. They are not deleted: **Settings → AI Assistant →
Privacy → Previous instructions** shows them with Copy and Remove, and they are still applied as
a short focus note (plain text, 200 characters, lowest priority, can only change emphasis) for
Ask AI and Extract tasks, unless the organization turned focus notes off (`features.aiFocusNote`).

## Where AI starts

AI is a verb, not a place. It is reached from the slash menu in a note (`/extract`), the ✨ menu
that appears with a text selection, ⌘K ("AI: Extract tasks from notes"), and the *Ask AI* button on
a task. None of these appear unless AI is configured and allowed.

## What is sent

The text you ask about (a task, or the note you extract tasks from) and the conversation so far.
Alongside it Cadence adds context so answers fit your data: today's date and your time zone
(Ask AI and Extract tasks), the names of your lists that are not archived (Extract tasks), and the
task's list name, due date, priority and linked note title (Ask AI). *What was sent* in the dialog
shows exactly what left the app. Notes that are locked and not unlocked are never sent. The API
key is sent only to the address you configured.

## Structured output (JSON)

AI tasks that need JSON (for example task extraction) ask the provider for it
where a documented mechanism exists. Checked on 2026-10-24 against OpenAI's
published API spec and Google's API reference, and live against a gateway:

| API format | Parameter sent when JSON is requested |
|---|---|
| OpenAI Chat Completions | `response_format: { "type": "json_object" }` |
| OpenAI Responses | `text: { "format": { "type": "json_object" } }` |
| Google Gemini | `generationConfig.responseMimeType: "application/json"` |
| Anthropic Messages | none: structured output there needs a JSON schema, so the request is unchanged and the reply is validated by Cadence |

OpenAI's JSON mode only works when the prompt also asks for JSON, which the
built-in prompts do. Whatever the provider does, Cadence validates the reply
against the task's schema and discards anything that does not fit.

## Limits

- Text in, text out. No images, files, tool calls or streaming.
- Replies are capped at 4,000 tokens; the system prompt at 4,000 characters; the task extractor reads at most 16,000 characters of notes.
- A request times out after 120 seconds (desktop and web). On desktop a reply over about 4 MB is refused.
- Redirects are refused on both: the address must be the final one.
- Plain `http://` works only for `localhost` (and `*.localhost`), `127.x`, `10.x`, `172.16-31.x`, `192.168.x`, `*.local` and `::1`.
- A header Cadence sets itself (`Host`, `Content-Type`, `Content-Length`, `Cookie`, …) cannot be overridden; at most 20 headers of up to 4,096 characters.

## Organization policy

`features.ai: false` turns AI off. `features.aiPeople` and `features.aiFocusNote` (booleans) switch off people data and the focus note separately; when absent they follow `features.ai`. `features.aiAllowedHosts` restricts requests
to the listed host names (see [ENTERPRISE.md](./ENTERPRISE.md)); a list with no
valid entry allows nothing. `features.ai` and `features.aiAllowedHosts` are enforced in the desktop
app's main process for every request, and `features.aiPeople` for every request the app labels as
people data (the main process sees that label, not the text itself). `features.aiFocusNote` is
applied by the app. The web build enforces none of them in a main process.

## Where settings are stored

Provider, key, model, address, headers and path are part of your workspace data:
inside the encrypted data file on desktop, in this browser's `localStorage`
(not encrypted) in the web app. Header values may contain tokens; treat them
like the API key.

## Diagnostics

*Test connection* shows **Diagnostic details** on failure: format, address, header
names (values hidden), HTTP status and the start of the reply. The API key is
masked everywhere, including in the address and in a reply that echoes it back.

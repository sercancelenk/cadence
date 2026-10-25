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
- **Images and live replies**: *Check images* and *Check live replies* on a connection send one tiny test
  request each. Diagram from a screenshot is refused on a connection that was not confirmed for images, with a
  pointer to Settings. Live replies are used by Weekly digest and Ask your workspace; a connection that does not
  stream still works, the answer just arrives at once. Like the JSON check, a result is stored only if the
  connection was not edited meanwhile.
- **Embedding model** (optional, OpenAI and Gemini formats): when set, Ask your workspace re-orders its
  keyword matches by meaning. It then sends your question and the title and excerpt of up to 24 matches to that
  connection's embeddings endpoint (`/embeddings` for OpenAI formats, `batchEmbedContents` for Gemini). Nothing is
  stored; if the request fails, the keyword order is used. Anthropic has no embeddings API.
- **People data** (1:1 notes, feedback, and Ask AI on a person's own tasks and goals) only goes to a connection you allowed with the *Allow
  people data* switch. A model on this computer (`localhost`, `127.x`, `::1`) is allowed by
  default (if that address is a router that forwards to another provider, switch the permission
  off for it); a LAN host, a company gateway and the hosted providers are not. There is no
  per-use pop-up. An organization can turn this class off (`features.aiPeople`).
- Extra connections are stored inside `aiSettings`, so an older build keeps them untouched. When
  no other AI setting exists, Cadence keeps a default API format as a marker so the older version
  still recognises the settings. One limit of going back to an older version (notes and tasks are
  never affected): a connection whose provider the older version does not know is ignored there,
  so you re-enter it.
- Permission to receive people data and a JSON check belong to a destination: changing a
  connection's provider or address clears the permission (you are asked again), and changing the
  provider, address, model or API format clears the JSON check.
- You can keep up to 20 connections. Entries a version cannot read (an unknown provider, a
  duplicate or reserved id, more than 20) are kept aside as they are (`unreadConnections`) and
  written back, so opening the workspace in this version never costs a newer one its connections.
- When the JSON check finds a connection unreliable, tasks that need structured replies are
  blocked on it. *Use for JSON tasks anyway* lets you override that for a connection you trust;
  the override is cleared if its provider, address, model or API format changes.

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

AI is a verb, not a place. It is reached from the slash menu in a note, the ✨ menu that appears
with a text selection, ⌘K, and the buttons on a task. None of these appear unless AI is configured
and allowed. Every result is shown first; nothing is written until you press the button, and a
change to a note or feedback text is one undo step (⌘Z).

| Feature | Start it from | Reads | Writes (only when you press the button) |
|---|---|---|---|
| Extract tasks | `/extract`, ✨ menu, ⌘K | the selection or the note | new tasks you pick |
| Ask AI | a task's ✨ button | the task and its context | the answer, appended to the task's details |
| Visualize | `/visualize`, ✨ menu | the selection or the note | a new Mermaid diagram block after the selection (its syntax is checked with Mermaid first, with one repair attempt) |
| Challenge my idea | `/challenge`, ✨ menu | the selection or the note | a separate block at the end of the note: assumptions, risks, alternatives, open questions |
| Break down | the list button on a task | the task and its context | a checklist in the task's details, or new tasks in the same list |
| Rewrite as SBI (also Radical Candor, Review draft) | ✨ menu on selected text in a *feedback* item (a person's page); pick the framework in the dialog | the selected feedback text and its type | replaces the selection with Situation / Behavior / Impact lines, or Care / Challenge lines, or a Summary / Strengths / Growth draft, if the text is unchanged |
| Classify with AI | *Classify with AI* on the Planning matrix (always shown when AI is on; disabled while nothing is unsorted) | titles, details (first 500 characters), due dates (with the days left or overdue), priority, list names and, for each task, the title and first 400 characters of up to 2 linked notes (locked and archived notes are never read), for up to 40 unsorted tasks; names of people are never sent | the important / urgent settings of the rows you keep ticked, with an **Undo** button. For a task that lands in Delegate you can pick a team member and *Add as a task for…*: one new task with the title only is added to that person; the original task is untouched |
| Structure this document | *Structure with AI* on Utilities → Document; choose Outline, RFC, Meeting summary or Table | the document text | a structured copy as a **new tab**; the original is untouched. Afterwards *Draw as Mermaid* (a new note) and *Draw as Sketch* (a new board in Utilities → Sketch) turn the structured copy into a diagram; they send that copy, not the original |
| Mock data | *Mock data with AI* on Utilities → JSON / YAML (a JSON tab with content) | your sample records | up to 50 invented records with the same keys, as a **new JSON tab** |
| Design with AI | *Design with AI* on Utilities → ER diagram | your request and the tables on the canvas | only **additions** (new tables, columns, relations) you tick; nothing existing changes |
| Draw from a description | ⌘K, the **AI** group in the left menu, *Draw with AI* on Utilities → Sketch, a card on Utilities → Tools | the description you type; for a change, also the current diagram (as Mermaid text, or as numbered boxes and arrows) and your change request | a Mermaid note, or a Sketch board (simple boxes and arrows), added as **new**; nothing existing is touched |
| Convert to Mermaid | *Convert to Mermaid* on Utilities → Sketch | the labels of the sketch's shapes and the arrows between them (read on your computer; the drawing itself is not sent) | a new note with a Mermaid block; the sketch is untouched |
| Diagram from a screenshot | ⌘K, Utilities → Tools | one picture you choose or paste, and an optional note | a new note with a Mermaid or HTML code block (HTML is cleaned and previewed in a frame without scripts) |
| Weekly digest | ⌘K, the left menu, a tile on Home (it suggests itself at the end of the week), *Prepare an update* on My leader and Skip-level pages | counts and titles of tasks done, created, in progress and overdue, and titles of notes edited in the last 7, 14 or 30 days; the text of a note only if you tick it (up to 5) | a new note with the summary (retrospective or status update) |
| Prepare a 1:1 | *Prepare with AI* in a person's 1:1 area | that person's open tasks and goals and what they touched in the last 4, 8 or 12 weeks; never their name | one new note item on the person (follow-ups, open goals, feedback to give, questions) |
| Ask your workspace | ⌘K | the best-matching excerpts of your notes and tasks (found on your computer), plus your question | nothing; the answer cites its sources as [1], [2] with links |

Rewrite as SBI and Prepare a 1:1 work on people data, so they only use a connection you allowed for
it and are off when your organization turns `features.aiPeople` off. Ask your workspace includes
people records only if you tick *Include people records*, which makes that request people data. If a note changed while a dialog was open, a
diagram or challenge is added at the end of the note instead, and an SBI rewrite replaces nothing
(you can copy it).

## What is sent

The text you ask about (a task, the selection or note you work on) and the conversation so far.
Alongside it Cadence adds context so answers fit your data: today's date and your time zone
(Ask AI, Extract tasks and Break down), the names of your lists that are not archived (Extract
tasks), and the task's list name, due date, priority and linked note title (Ask AI and Break down).
Rewrite as SBI (and its Radical Candor and Review draft options) sends only the selected text and the feedback type, never a person's name. Prepare a 1:1 sends
that person's items without their name. Weekly digest sends counts and titles (and note text only when you tick it);
people records and locked notes are never read. Ask your workspace sends your question and up to 8 excerpts of at
most 600 characters; locked and archived notes are never read. Convert to Mermaid sends labels and arrows, not the
drawing. *What was sent* in the dialog shows exactly what left the app. Notes that are locked and not unlocked are never sent. The API
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

- Text in, text out, plus one picture for Diagram from a screenshot (PNG, JPEG, WebP or GIF, up to 5 MB, and 5 MB in total per request). No files or tool calls. Streaming is used only by Weekly digest and Ask your workspace.
- Replies are capped at 4,000 tokens; the system prompt at 4,000 characters; the task extractor reads at most 16,000 characters of notes.
- A request times out after 120 seconds (desktop and web). On desktop a reply over about 4 MB is refused.
- Redirects are refused on both: the address must be the final one.
- Plain `http://` works only for `localhost` (and `*.localhost`), `127.x`, `10.x`, `172.16-31.x`, `192.168.x`, `*.local` and `::1`.
- A header Cadence sets itself (`Host`, `Content-Type`, `Content-Length`, `Cookie`, …) cannot be overridden; at most 20 headers of up to 4,096 characters, values in plain visible ASCII.
- Weekly digest lists at most 60 done, 40 created, 30 in-progress, 30 overdue tasks and 30 notes; Prepare a 1:1 at most 40 items of 300 characters; Convert to Mermaid at most 40 shapes; Mock data at most 50 records; Classify with AI at most 40 tasks per run.
- Visualize checks the diagram with Mermaid's parser and may ask once more, so one Generate can make up to four requests.
- On desktop a request body over 8 million characters is refused, a request id cannot be reused while it is running, and running requests are cancelled when the window closes. The web build also stops reading a reply over 4 million characters.

## Organization policy

`features.ai: false` turns AI off. `features.aiPeople` and `features.aiFocusNote` (booleans) switch off people data and the focus note separately; when absent they follow `features.ai`. `features.aiAllowedHosts` restricts requests
to the listed host names (see [ENTERPRISE.md](./ENTERPRISE.md)); a list with no
valid entry allows nothing. `features.ai` and `features.aiAllowedHosts` are enforced in the desktop
app's main process for every request, and `features.aiPeople` for every request the app labels as
people data (the main process sees that label, not the text itself). `features.aiFocusNote` is
applied by the app. The web build enforces none of them in a main process.

Boundary to know: the renderer asks the main process to make the request and states the address, so
these checks protect against a mistake or a restricted policy, not against code that already runs
inside the app window. Pin `features.aiAllowedHosts` to your gateway if that matters to you.

## Where settings are stored

Provider, key, model, address, headers and path are part of your workspace data:
inside the encrypted data file on desktop, in this browser's `localStorage`
(not encrypted) in the web app. Header values may contain tokens; treat them
like the API key. JSON, portable ZIP and full backup folders leave out API keys and extra headers (restoring
keeps the ones already on this device, only for the same provider and address). The Gemini preset
sends the key in the request address, as Google's reference examples do; a proxy that inspects
HTTPS can see it there. To send it as a header instead, use *Custom gateway* with the Gemini format.

## Diagnostics

*Test connection* shows **Diagnostic details** on failure: format, address, header
names (values hidden), HTTP status and the start of the reply. The API key is
masked everywhere, including in the address and in a reply that echoes it back.

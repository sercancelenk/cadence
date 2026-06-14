# AI agent rules & project context

How this repo steers AI coding agents (Cursor, and any tool that reads `AGENTS.md`)
toward production-ready, zero-data-loss work — and how to reuse the same setup in
other projects.

There are two kinds of files involved, with two different jobs:

| File | Job | Loaded |
|---|---|---|
| `AGENTS.md` (repo root) | **What** you work with — the project map | Always, automatically |
| `.cursor/rules/*.mdc` | **How** the agent should behave | By `globs` / `description` / `@`-mention |

The mental model: `AGENTS.md` tells the agent *what this project is*; the rules tell
it *how to act* (build a feature, review code). The two compose — a good rule on top
of a good map is what produces "expert who already knows the codebase" behaviour.

---

## The files

### `AGENTS.md` — project map (always on)

Plain markdown at the repo root. Cursor (and other agent tools) read it on every
request, so it's the cheapest place to put "must always know" facts: stack, entry
points, the zero-data-loss zone, where features live, test command, conventions.

Keep it short and high-signal (~150 tokens). It is **not** a `.mdc` rule, so it has
**no frontmatter** — no `---`, no `alwaysApply`. Those keys do nothing here and can
confuse parsers.

### `.cursor/rules/make-feature.mdc` — feature execution playbook

Invoke it with `@make-feature.mdc` then describe the feature. The agent acts as a
polyglot staff engineer receiving a directive from a tech lead: acknowledge the goal,
state detected stack + files read, plan, then build end-to-end with a 0% data-loss
guarantee.

### `.cursor/rules/expert-code-review.mdc` — review playbook

The mirror of the feature rule: the same standards, used to *audit* instead of
*produce*. Adds a severity system (`[BLOCKER]`/`[MAJOR]`/`[MINOR]`/`[NIT]`) and a
`file:line — issue — why — fix` output format so findings are scannable and
prioritised.

---

## How Cursor decides to load a rule

Each `.mdc` has YAML frontmatter:

```yaml
---
description: When the rule is relevant (the agent can pull it in by intent).
globs: ["*.ts", "*.tsx", "*.java", "*.go", "*.py"]   # auto-attach on these file types
alwaysApply: false                                    # set true to inject on every request
---
```

- **`globs`** — auto-attach when a matching file is in context. This only controls
  *whether the rule loads*, not which per-stack guard fires.
- **`description`** — lets the agent pull the rule in when your request matches the
  intent.
- **`@`-mention** — force-load a rule for the current message (the primary workflow
  here).
- **`alwaysApply: true`** — inject on every request (use sparingly; costs tokens).

Important nuance: **language-specific behaviour comes from the rule text, not the
globs.** The rules tell the agent to detect the stack from the manifest
(`package.json`, `pom.xml`/`build.gradle`, `go.mod`, `pyproject.toml`) and apply only
the matching `PER-STACK GUARDS` block. File extension just triggers loading.

---

## Design principles (why they're written this way)

1. **Token-efficient English.** Terse imperatives, arrows (`→`), checklists and
   abbreviations tokenize compactly — roughly 30–40% cheaper than prose, and Claude
   parses the structure well.
2. **Polyglot.** One rule serves TS/React/Electron, Java/JVM, Go and Python via
   manifest-based stack detection plus per-stack guard blocks.
3. **Priority ladder.** Both rules start with an explicit
   `correctness > data-safety > … > performance` order so trade-offs resolve
   consistently.
4. **Zero data loss is first-class.** A dedicated DATA SAFETY phase: reversible +
   idempotent migrations (expand → migrate → contract), deferred destructive ops,
   atomic writes, idempotency, concurrency safety.
5. **Engagement contract.** The agent restates the goal, names the detected stack and
   the files it read, and asks before acting on anything ambiguous — so you catch a
   wrong-file/wrong-stack start immediately.
6. **Symmetry.** `make-feature` produces to a standard; `expert-code-review` audits
   against the same standard. Together they form a build → review loop.

---

## How to use

1. Type `@` and pick the rule (`@make-feature.mdc` or `@expert-code-review.mdc`).
2. Right after it, give your directive in plain language, e.g.
   *"add per-note tags: a note can have multiple tags and the list can filter by tag."*
3. The agent will: restate the goal → report detected stack + files read → plan →
   ask if anything is ambiguous → execute.

For anything large or critical, also `@`-mention the specific files/folders involved.
The rule instructs the agent to read relevant code, but explicit context makes its
understanding far more reliable — the rule does not pre-load the whole project; it
reads on demand.

---

## Reusing this in another project

1. Copy `AGENTS.md` to the new repo root and rewrite the **PROJECT MAP** for that
   codebase (stack, entry points, data/zero-loss zone, test command, conventions).
   Keep it short. No frontmatter.
2. Copy `.cursor/rules/make-feature.mdc` and `.cursor/rules/expert-code-review.mdc`
   as-is. They're already polyglot, so they work unchanged. Trim the `PER-STACK
   GUARDS` to the languages that project actually uses if you want to save tokens.
3. Adjust each rule's `globs` to that project's file types if they differ.
4. (Optional) For a context that needs the standards on every request, set
   `alwaysApply: true` instead of `@`-mentioning.

---

## Maintenance notes

- Keep `AGENTS.md` in sync when structure, persistence format or conventions change —
  a stale map is worse than none.
- Fill in any `[...]` placeholders in `AGENTS.md` with real values (persistence
  format, test command, naming/state conventions).
- When you add a language to the project, add a one-line block to the `PER-STACK
  GUARDS` in both rules and extend their `globs`.

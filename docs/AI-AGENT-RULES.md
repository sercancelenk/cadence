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
it *how to act*. The two compose — a good rule on top of a good map is what produces
"expert who already knows the codebase" behaviour.

The rules model a **software team**: each `.mdc` is a senior specialist you can summon
for the kind of work in front of you.

| Rule (`@`-mention) | Team role | Job | Mastery |
|---|---|---|---|
| `developer-expert` | Staff/Principal Engineer | Execute a feature directive end-to-end | Polyglot: JS/TS/React/Vue/Electron/Node, Java, Go, Python |
| `code-review-expert` | Principal Reviewer | Audit + remediate to production-ready | Same polyglot stack; root-cause + adversarial review |
| `frontend-expert` | Frontend/UX Lead | Build/polish accessible, fast UI surfaces | React 18 + Vue 3 + Electron renderer + JS/V8 guru |
| `technical-architect` | Staff Architect | Decide + design (ADR/RFC, contracts, sequencing) | Java/Go/Python/JS + distributed/high-traffic + perf |
| `devops-expert` | DevOps/Release Lead | CI/CD, packaging, signing, deploy, rollback | GitHub Actions, electron-builder, supply chain |
| `test-expert` | SDET / Test Engineer | Write unit + mutation tests (test-only) | >95% coverage + mutation-killing across all stacks |

Every specialist is tuned to operate at the top of its domain: deep language/runtime
mastery, first-principles analysis, verification against real code (and benchmarks /
primary sources where relevant) — not surface-level pattern matching.

They share one spine — priority ladder, engagement contract, manifest-based stack
detection, 0% data-loss, verify-before-done — so findings and hand-offs compose
cleanly. The architect decides → feature/frontend build → reviewer audits → devops
ships.

---

## The files

### `AGENTS.md` — project map (always on)

Plain markdown at the repo root. Cursor (and other agent tools) read it on every
request, so it's the cheapest place to put "must always know" facts: stack, entry
points, the zero-data-loss zone, where features live, test command, conventions.

Keep it short and high-signal (~150 tokens). It is **not** a `.mdc` rule, so it has
**no frontmatter** — no `---`, no `alwaysApply`. Those keys do nothing here and can
confuse parsers.

### `.cursor/rules/developer-expert.mdc` — feature execution playbook

Invoke it with `@developer-expert.mdc` then describe the feature. The agent acts as a
polyglot staff engineer receiving a directive from a tech lead: acknowledge the goal,
state detected stack + files read, plan, then build end-to-end with a 0% data-loss
guarantee.

### `.cursor/rules/code-review-expert.mdc` — review playbook

The mirror of the feature rule: the same standards, used to *audit* instead of
*produce*. Adds a severity system (`[BLOCKER]`/`[MAJOR]`/`[MINOR]`/`[NIT]`) and a
`file:line — issue — why — fix` output format so findings are scannable and
prioritised.

### `.cursor/rules/frontend-expert.mdc` — UI/UX execution playbook

Invoke with `@frontend-expert.mdc` for any user-facing work. The agent acts as a
god-tier Frontend/UX lead **and JavaScript guru**: deep mastery of React 18, Vue 3,
the Electron renderer, and the JS/TS language + V8 engine (event loop, microtasks,
closures, memory/GC). It detects the framework from the manifest and applies only that
framework's guard. Builds/polishes surfaces with accessibility (WCAG 2.2 AA), render
performance, and design-system reuse as first-class concerns; its priority ladder
leads with `correctness > accessibility > UI data-integrity` so user input is never
dropped. Auto-attaches on `*.tsx`/`*.jsx`/`*.vue`/`*.css`.

### `.cursor/rules/technical-architect.mdc` — system-design playbook

Invoke with `@technical-architect.mdc` *before* large or cross-cutting changes. The
agent acts as a god-tier Staff Architect — polyglot (Java/JVM, Go, Python, JS/TS) with
deep system-design, distributed/high-traffic and performance-engineering expertise,
and a research-grade analysis discipline (first principles, root cause, quantify with
QPS/p99/memory, verify against real code + sources). It frames the forces, presents
2–3 options with trade-offs (incl. scale/perf), decides (ADR-style output), defines
contracts/migrations first, then sequences the work into reversible steps assigned to
the other roles. It **designs and decides**; it hands code execution to
`@developer-expert`/`@frontend-expert`.

### `.cursor/rules/devops-expert.mdc` — CI/CD & release playbook

Invoke with `@devops-expert.mdc` for **any** DevOps/SRE/platform operation — not just
CI/CD. It's a full-lifecycle owner: pipelines, build/packaging/containerization,
orchestration (Kubernetes/Helm), IaC (Terraform/Pulumi/Ansible), cloud + networking,
release/deploy strategies (canary/blue-green with automated rollback), observability
(metrics/logs/traces + SLO/error-budget), reliability (autoscaling, capacity, DR +
*tested* backups, chaos), incident response (runbooks, mitigate-first, blameless
postmortems), secrets/security/supply-chain, and cost/FinOps. Its priority ladder
leads with `reliability & release-safety > security/secrets > data durability (DR)`,
so it never silently weakens a gate, leaks a secret, or ships a data-losing change. The
`DOMAIN GUARDS` apply only to the domain in play, so it stays terse on a small repo and
deep on a distributed system. Auto-attaches on
`*.yml`/`*.yaml`/`Dockerfile`/`*.tf`/`*.hcl`.

### `.cursor/rules/test-expert.mdc` — testing & mutation playbook

Invoke with `@test-expert.mdc` to write or harden a suite. The agent acts as a god-tier
SDET: it understands the code + business flow first, then writes **test-only** changes
(it never edits production logic — untestable code is reported, not refactored). It
drives line coverage >95% and a strong mutation score with behaviour-anchored
assertions, killing survived mutants instead of padding coverage. Polyglot: Vitest +
Testing Library + Vue Test Utils + Stryker (JS/TS), JUnit 5 + Mockito + AssertJ + PIT
(Java), `go test` table tests + gremlins (Go), pytest + hypothesis + mutmut (Python).
Auto-attaches on `*.test.*`/`*.spec.*`/`*Test.java`/`*_test.go`/`test_*.py` + source.

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
2. **Polyglot.** One rule serves TS/React/Vue/Electron, Java/JVM, Go and Python via
   manifest-based stack detection plus per-stack guard blocks.
3. **Priority ladder.** Every rule starts with an explicit ordered ladder
   (e.g. `correctness > data-safety > … > performance`, tuned per role) so trade-offs
   resolve consistently within that specialist's domain.
4. **Zero data loss is first-class.** A dedicated DATA SAFETY phase: reversible +
   idempotent migrations (expand → migrate → contract), deferred destructive ops,
   atomic writes, idempotency, concurrency safety.
5. **Engagement contract.** The agent restates the goal, names the detected stack and
   the files it read, and asks before acting on anything ambiguous — so you catch a
   wrong-file/wrong-stack start immediately.
6. **Symmetry.** `developer-expert` produces to a standard; `code-review-expert` audits
   against the same standard. Together they form a build → review loop.
7. **One team, one spine.** Every role rule reuses the same skeleton — frontmatter,
   `ROLE`, `PRIORITY` ladder, `ENGAGEMENT` contract, phase `FLOW`, domain `GUARDS`,
   `VERIFY`, `CONSTRAINTS` — so a hand-off between roles (architect → builder →
   reviewer → devops) needs no translation. Adding a new specialist = copy the
   skeleton, swap the domain.

---

## How to use

1. Type `@` and pick the specialist for the job:
   - `@technical-architect.mdc` — *"should reminders be a separate store or live on todos? design it."*
   - `@developer-expert.mdc` — *"add per-note tags: a note can have multiple tags, filter the list by tag."*
   - `@frontend-expert.mdc` — *"make the planning matrix drag-and-drop accessible + smooth."*
   - `@code-review-expert.mdc` — *"review the sync flush changes for data-loss + races."*
   - `@test-expert.mdc` — *"get `core/model` to >95% coverage and kill the surviving mutants."*
   - `@devops-expert.mdc` — *"speed up CI without weakening the release gate."*
2. Right after the mention, give your directive in plain language.
3. The agent will: restate the goal → report detected stack + files read → plan →
   ask if anything is ambiguous → execute (or, for the architect, decide + design).

Rules compose — for a big change, start with `@technical-architect.mdc` to get a plan,
then `@`-mention `@developer-expert.mdc`/`@frontend-expert.mdc` per step, and finish with
`@code-review-expert.mdc` and `@devops-expert.mdc`.

For anything large or critical, also `@`-mention the specific files/folders involved.
The rule instructs the agent to read relevant code, but explicit context makes its
understanding far more reliable — the rule does not pre-load the whole project; it
reads on demand.

---

## Reusing this in another project

### Fastest: the bootstrap script (recommended)

`scripts/init-cursor-kit.sh` is **self-contained** — every rule template is embedded in
it, so it's the only file you need to carry to a new repo. Run it from the target
project root and it auto-detects the stack, installs the right roles, and writes
`AGENTS.md` + `.cursorignore`:

```bash
# from inside the new project (Java/Spring, Go, Python, web — anything):
bash /path/to/init-cursor-kit.sh
# or pipe it straight in:
curl -fsSL <raw-url>/init-cursor-kit.sh | bash
```

What it does:

- **Detects the stack** from manifests (`package.json`, `pom.xml`/`build.gradle`,
  `go.mod`, `pyproject.toml`/`requirements.txt`) and only installs roles that fit —
  e.g. a pure Go backend gets no `frontend-expert`.
- **Writes the polyglot rules** to `.cursor/rules/` (`developer-expert`,
  `code-review-expert`, `technical-architect`, `test-expert`, plus `frontend-expert`
  for web/desktop UI and `devops-expert` by default).
- **Generates `AGENTS.md`** pre-filled with the detected stack + test command; it
  prompts you for the rest when a terminal is available, and for anything you skip it
  leaves a `[...]` placeholder and drops a one-shot `init-agents.mdc` rule — `@`-mention
  it in Cursor and the agent scans the repo, completes the map, then deletes itself.
- **Writes a stack-aware `.cursorignore`** (secrets + per-language build/output dirs).
- Is **idempotent**: existing files are backed up to `*.bak` (use `--force` to
  overwrite, `--roles dev,review,arch,test,frontend,devops` to choose, `--no-prompt`
  for placeholders-only).

### Manual (if you prefer to copy files)

1. Copy `AGENTS.md` to the new repo root and rewrite the **PROJECT MAP** for that
   codebase (stack, entry points, data/zero-loss zone, test command, conventions).
   Keep it short. No frontmatter.
2. Copy the rule team from `.cursor/rules/`. The polyglot ones work unchanged; trim the
   `PER-STACK GUARDS` to the languages that project actually uses if you want to save
   tokens. The script's embedded `frontend-expert`/`devops-expert` are already
   genericized; the copies in *this* repo reference Cadence specifics, so prefer the
   script for portability.
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
  GUARDS` in `developer-expert` + `code-review-expert` and extend their `globs`.
- Keep the role rules coherent: they share one skeleton and hand off to each other by
  name (`@developer-expert`, `@frontend-expert`, `@devops-expert`, `@code-review-expert`,
  `@test-expert`).
  If you rename a rule, update those references in `technical-architect.mdc` and here.
- To add a new specialist (e.g. QA, data, security), copy any role rule's skeleton and
  swap the domain — keep the `PRIORITY` ladder + `ENGAGEMENT`/`VERIFY` contract.

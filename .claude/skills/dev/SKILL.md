---
name: dev
description: Polyglot staff engineer role that implements a feature end to end (scan, plan, build, data safety, verify). Invoke manually with the feature directive.
disable-model-invocation: true
argument-hint: <feature or change to implement>
---

Act as the role defined in `.cursor/rules/developer-expert.mdc`. Read that file now and follow it exactly (ENGAGEMENT, FLOW, PER-STACK GUARDS, CONSTRAINTS). Also honor `.cursor/rules/zero-data-loss.mdc` and `AGENTS.md`.

Task: $ARGUMENTS

Work in this session; do not spawn subagents. VERIFY with `npm run typecheck` and `npx vitest run` (scope to touched files first, full run before declaring done). If the change touches persistence, sync, import, restore, or delete paths, finish by suggesting `data-safety-reviewer`.

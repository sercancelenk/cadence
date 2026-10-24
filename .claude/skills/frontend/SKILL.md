---
name: frontend
description: Frontend/UX + JS-engine expert role for React, Tiptap editor, accessibility, renderer perf, and UI data-integrity. Invoke manually to build or audit user-facing surfaces.
disable-model-invocation: true
argument-hint: <UI goal or surface to audit>
---

Act as the role defined in `.cursor/rules/frontend-expert.mdc`. Read that file now and follow it exactly. Also honor `.cursor/rules/zero-data-loss.mdc` and `AGENTS.md` (no lost keystrokes, dirty guards on persisted fields).

Task: $ARGUMENTS

Work in this session; do not spawn subagents. Reuse existing components and tokens before adding any. Verify with `npm run typecheck` and the relevant tests; use `npm run test:e2e` only for critical flows.

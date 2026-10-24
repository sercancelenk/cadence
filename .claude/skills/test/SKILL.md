---
name: test
description: SDET role that writes unit and mutation-killing tests only (never edits production code). Invoke manually with the module to harden.
disable-model-invocation: true
argument-hint: <module or file to test>
---

Act as the role defined in `.cursor/rules/test-expert.mdc`. Read that file now and follow it exactly, including the TEST-ONLY constraint. Also honor `AGENTS.md`.

Task: $ARGUMENTS

Work in this session; do not spawn subagents. Run vitest and coverage scoped to the target (`npx vitest run <path> --coverage`), and mutation testing only on the target (`npx stryker run --mutate <path>`), never the whole repo. Report exact commands and numbers.

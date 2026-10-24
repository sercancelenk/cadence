---
name: architect
description: Staff/Principal architect + product strategist role (design, ADR/PRD, options, sequencing, blast radius). Invoke manually before big or cross-cutting changes.
disable-model-invocation: true
argument-hint: <problem or feature to analyze>
---

Act as the role defined in `.cursor/rules/technical-architect.mdc`. Read that file now and follow it exactly (priority ladder, FLOW, OUTPUT FORMAT). Also honor `.cursor/rules/zero-data-loss.mdc` and `AGENTS.md`.

Task: $ARGUMENTS

Work in this session; do not spawn subagents. Read only the files needed to map blast radius. Hand implementation to `/dev`, `/frontend`, `/devops`, `/test`.

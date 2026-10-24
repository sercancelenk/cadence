---
name: expert-review
description: Principal-engineer review and remediation role (severity-tagged findings, root cause, fixes, regression tests). Invoke manually on a diff, file, or bug.
disable-model-invocation: true
argument-hint: <diff, file, or bug to review>
---

Act as the role defined in `.cursor/rules/code-review-expert.mdc`. Read that file now and follow it exactly (SEVERITY, REVIEW CHECKLIST, REMEDIATE, OUTPUT FORMAT). Also honor `.cursor/rules/zero-data-loss.mdc` and `AGENTS.md`.

Target: $ARGUMENTS (default: current `git diff HEAD`)

Work in this session; do not spawn subagents unless the diff is very large. For any change touching persistence, sync, import, restore, or delete paths, also run `data-safety-reviewer` and merge its findings.

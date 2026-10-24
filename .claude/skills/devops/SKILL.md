---
name: devops
description: DevOps/SRE role for CI/CD, electron-builder packaging, signing, release, supply chain, and rollback. Invoke manually for pipeline, build, or release work.
disable-model-invocation: true
argument-hint: <pipeline, build, or release task>
---

Act as the role defined in `.cursor/rules/devops-expert.mdc`. Read that file now and follow it exactly (priority ladder, FLOW, OUTPUT FORMAT). Also honor `.cursor/rules/zero-data-loss.mdc` and `AGENTS.md`.

Task: $ARGUMENTS

Work in this session; do not spawn subagents. Real surfaces: `.github/workflows/{ci,pages,release}.yml`, `electron-builder*.json`, `scripts/`, `package.json` scripts (`check`, `check:release`, `ci:local`, `release:validate`). Never publish, tag, push, or run `--publish always` without explicit approval; prefer dry-run and `npm run release:validate`.

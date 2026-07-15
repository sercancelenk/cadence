PROJECT MAP:
- Stack: Electron + React + TypeScript (local-first notes app).
- Entry: electron/main.cjs (Main), src/ (Renderer).
- Core model: src/core/model/ — data schema + persistence. **ZERO DATA LOSS ZONE.**
- Features: src/features/notes/ (editor, version history, lock, sync).
- Lib: src/lib/ (rich text import, attachment index, auto-sync, dataIntegrity).
- Persistence: encrypted per-user JSON under Electron userData (`Cadence` / `Cadence (Dev)`); rolling `backups/<userId>/`. Migrations must be expand-only; never wipe notes/todos on upgrade.
- Test: *.test.ts colocated. Run: `npx vitest run` / `npm run typecheck`.
- Conventions: strict TS no `any`, [naming, state mgmt yaklaşımın].
- LANGUAGE: Communicate with me in Turkish or English. Keep all code, identifiers, comments, and git commit messages in English.
- Always begin every reply, thought, follow up, thinking etc with a line: `🧭 Active rules: <names of all .cursor/rules currently applied>`.

# TRUST INVARIANT (sacred)

**The #1 product promise is: users never lose their data — especially across version transitions.**

- No schema/UI/sync change may delete, empty, or silently replace notes/todos.
- Upgrades are additive or dual-read; failed loads must block persist, not save an empty scaffold.
- See `.cursor/rules/zero-data-loss.mdc` (alwaysApply). When in doubt, stop and verify with legacy fixtures + backups paths before shipping.

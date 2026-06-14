PROJECT MAP:
- Stack: Electron + React + TypeScript (local-first notes app).
- Entry: electron/main.cjs (Main), src/ (Renderer).
- Core model: src/core/model/ — data schema + persistence. ZERO data loss zone.
- Features: src/features/notes/ (editor, version history, lock, sync).
- Lib: src/lib/ (rich text import, attachment index, auto-sync).
- Persistence: [dosya formatı / DB ne ise]. Migration pattern: [varsa].
- Test: *.test.ts colocated. Run: [komut].
- Conventions: strict TS no `any`, [naming, state mgmt yaklaşımın].
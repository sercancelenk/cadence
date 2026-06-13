# Marketing screenshots

PNG files here are copied to `dist/screenshots/` when you run `npm run build:pages` and appear on the GitHub Pages landing page.

## Before you capture

1. Use the demo workspace (optional but recommended):
   ```bash
   node scripts/generate-screenshot-demo.mjs
   ```
2. **Settings → Data & backup → Import portable backup** (or Import JSON) → choose `docs/demo/cadence-screenshot-demo.json`
3. Use a **throwaway test account** — import replaces the whole workspace.
4. **Dark theme** (`data-theme="dark"`) matches the landing page.
5. Desktop window ~1280×800 or wider; avoid devtools in frame.

## Required — landing page (replace these six)

| File | Route / view | What to show |
|------|----------------|--------------|
| `home.png` | `/` | Stat cards, today schedule, quick access |
| `notes.png` | `/notes` | Two-pane notes; one note selected; optional version-history button visible |
| `todos.png` | `/todos` | Mixed statuses; one task with details open |
| `agenda.png` | `/agenda` | Overdue + today + upcoming |
| `planning.png` | `/planning` | Eisenhower matrix + today focus strip |
| `settings.png` | `/settings` | Scroll to show **Account & security** + **Data & backup** (portable ZIP + full backup buttons) |

## Recommended — docs & future landing sections

| File | Route | What to show |
|------|--------|--------------|
| `settings-backup.png` | `/settings` → Backup & recovery expanded | Platform-aware export/import (ZIP + folder on desktop) |
| `settings-recovery.png` | `/settings` → Recovery codes | Active status or “Generate codes” form |
| `analytics.png` | `/analytics` | Overview charts |
| `profile.png` | `/profile` | Avatar + profile fields |
| `recover.png` | `/recover` | Recovery codes + new password form (no real codes in frame) |

## After adding files

```bash
npm run preview:landing   # optional local check at http://localhost:3000
```

When files are in place, tell the agent to refresh `landing/index.html` alt text and README screenshot captions if needed.

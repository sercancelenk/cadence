# Screenshot demo workspace

Rich, software-themed sample data for marketing screenshots and GitHub Pages.

## Generate (optional)

Dates are relative to “today”, so re-run before a screenshot session if Activity / Agenda look empty:

```bash
node scripts/generate-screenshot-demo.mjs
```

This writes **`cadence-screenshot-demo.json`** in this folder.

## Import into Cadence

1. Start the desktop app (best for screenshots):
   ```bash
   npm run dev
   ```
   Or use the web/PWA build if you only need the browser UI.
2. Sign in (or create a throwaway account). Use a **test account** — import replaces your whole workspace.
3. **Settings → Data & backup → Import portable backup** (accepts `.zip` or `.json`) → choose `docs/demo/cadence-screenshot-demo.json`
4. Confirm — the app imports and reloads without save conflicts.

## What’s inside

| Area | Content |
|------|---------|
| **Teams** | Platform Engineering + Product, with people, goals, tasks, feedback |
| **To-dos** | Sprint lists, mixed statuses, overdue/today due dates, 1 archived list |
| **Planning** | 7 tasks in the Eisenhower matrix + today’s focus strip |
| **Notes** | Markdown notes (pinned, long bodies), 2 archived |
| **Agenda** | Reminders and due dates for today / this week |
| **Analytics / Activity** | Timestamps within today, this week, and this month |

## After screenshots

Export your real workspace first if needed, then import your backup JSON to restore production data.

# Compatibility: the last two releases

**Rule: every change must keep working for data written by the release being built and the two before it.**
Users update when they update (or not for weeks), restore backups from a month ago, and sometimes install an older
build by hand. None of that may cost them notes, tasks or the images their notes use.

## What "supported" means

| | Promise | Checked by |
|---|---|---|
| **C1 Upgrade** | Data written by release N-1 or N-2 opens in this build with every note, task, team, image and note-history revision, its PIN and recovery codes still work, and a password change, a reset and a restore of its old snapshots lose nothing. | `electron/compat/compat.test.ts` (runs in CI with every other test) against frozen data folders made by those releases' own code |
| **C2 Rollback** | If someone opens this build's data with N-1 or N-2, notes, tasks, teams and the images notes use are intact. What the older build cannot understand (new files, sealed history) may be invisible to it; our code never deletes it. Anything an older build would actively destroy is written down under "Known gaps" and weighed before shipping. | `node scripts/compat/downgrade-check.mjs <older-ref>` before each release |
| **C3 Backups** | Backup files written by this build open in N-1/N-2 where they can (a `.zip` is read by the older reader; extra folders are ignored), and this build opens every backup format those releases wrote (folder, JSON, ZIP). | `compat.test.ts` (folder and JSON of each release), `src/lib/backupBundle/*.test.ts` |
| **C4 Formats grow** | New data is a new file or a new optional field; nothing is renamed or removed; unknown files and fields are left alone. | review + `docs/BACKUP-RECOVERY-STANDARD.md` B9 |

Breaking any of these needs a tested migration, a note in `CHANGELOG.md` and **an explicit decision by the owner**.
"Nobody uses that" is not a reason.

## The window is a list

`electron/compat/releases.json` names the releases in the window and `electron/compat/fixtures/<label>/` holds the
data folder each one wrote (an account with notes in two months, tasks, two images, note history, a PIN, recovery
codes, two snapshots, a full backup folder and a JSON export), plus what it must contain after opening.

### When you cut a release

1. Add the release you just shipped to `releases.json`, drop the oldest entry, delete its fixture folder.
2. Build its fixture **from the commit that was released**, not from the working tree:
   `node scripts/compat/make-fixture.mjs <label> <git-ref-or-sha>`
3. Run `node scripts/compat/downgrade-check.mjs <ref>` for N-1 and N-2 and read the output: notes, tasks, teams and
   images must be identical; the history line is information.
4. Run the whole suite. If a fixture test fails, the change is wrong, not the fixture.

### When you change persistence, backup, auth or a file format

Run `npx vitest run electron/compat` first. Add a case to `compat.test.ts` (and to `scripts/compat/seed.mjs` if the
new thing must exist in every fixture from now on) for anything new that older data can meet.

## Known gaps (accepted, with the reason)

- **Note history after a password change.** From the release that sealed note history, an older build cannot read it.
  It sees no history, replaces a sealed history index with a new one on its next history write, and its image clean-up
  deletes images only that history used. Notes, tasks and the images notes use are unaffected. History was judged
  expendable. (Verified with `downgrade-check.mjs` and a throwaway harness against the previous release.)
- **The fixtures were made with a stubbed Electron**, so they prove the data layer, not the window, menus or packaging.
  Packaging is checked by the beta release (`docs/RELEASING.md`).

## Releases in the window now

See `electron/compat/releases.json`. `v-prev2` was chosen as the commit before the AI/backup-retention work; **confirm
it against the real release history** and rebuild if it is wrong.

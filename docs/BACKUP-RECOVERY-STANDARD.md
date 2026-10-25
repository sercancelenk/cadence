# Backup & recovery standard

The rules every change to backups, restores, imports, exports and key changes must follow. They come from real
defects found in review; each rule names the test that enforces it. A change that breaks a rule does not ship.
This builds on `.cursor/rules/zero-data-loss.mdc` (the trust invariant) and does not replace it.

## Vocabulary

- **Workspace**: the notes/tasks data file (and its monthly shards).
- **Sidecars**: files that belong to the workspace but live beside it: images (`attachments/`) and note history
  (`note-history/`).
- **Sealed**: encrypted under the account's data key, which is derived from the account password.
- **Snapshot**: an automatic copy under `backups/<userId>/` (workspace + hardlinked sidecars).
- **Export**: a readable (not encrypted) copy the user keeps: full backup folder, portable ZIP, JSON, daily folder.
- **Replace**: any operation that overwrites the live workspace from another source (restore, import).

## The rules

**B1. A replace needs a safety copy first, and stops without one.**
Restore and import call `snapshotBeforeReplace` and return its error untouched when the copy cannot be written.
Never call `snapshotCurrentDataFile` and ignore the result before a replace. The "you can undo this" text is a promise.
Enforced by: `electron/backupRecoveryStandard.test.ts` (static) and `mainSavePath.test.ts` › "replacing the workspace needs a safety copy first".

**B2. Every backup stays openable after the key changes.**
A password change or a reset with recovery codes stages the key it replaces (`stageKeyHistory`) *before* the account record
is saved, commits it after, and drops it if the change is abandoned, so no stop point loses the key. A damaged key list is set
aside, never deleted, and does not stop the new key from being recorded. Anything that reads a backup
(workspace, images, note history) must fall back to the earlier keys (`previousKeysFor`) and re-seal what it brings
under the current key. Do not add a sealed artifact kind without teaching its reader this fallback.
A restore never replaces an image that opens today with a snapshot copy that opens under no key; it keeps the good one and counts it.
Enforced by: `persistence/keyHistory.test.ts`, `mainSavePath.test.ts` › "snapshots across a key change".

**B3. Order: workspace first, sidecars after, and say what is missing.**
The workspace is committed (version-preflighted, atomic) before sidecars are swapped. After that point nothing
throws to the caller: each sidecar step reports a count (`attachmentsRestored`, `attachmentsFailed`,
`attachmentsSkipped`, `historyIncomplete`) and the UI says "incomplete" while confirming what did come back.
One bad image never stops the others.
Enforced by: `mainSavePath.test.ts` › "what a restore reports…", `src/lib/backupOutcome.test.ts`.

**B4. A backup that is missing something says so, and never prunes older ones because of it.**
Writers return `{ count, skipped }`. A non-zero `skipped` is recorded in the manifest, shown to the user, and blocks
pruning of older backups (daily mirror). Success text is never shown for an incomplete backup.
Enforced by: `mainSavePath.test.ts` › "data:exportBundle", `dailyBackupMirror.test.ts`.

**B5. Prefs are re-read before they are written back.**
A background task that outlives a user action (daily backup) re-reads settings right before its final write, so it
cannot undo a folder or retention change made meanwhile.
Enforced by: `dailyBackupMirror.test.ts`.

**B6. Background work never blocks the main thread for long.**
Long copies hand the event loop back (`setImmediate`) and run from several triggers (start, resume, focus, wake, timer)
so a missed day is made up on first use. A trigger is cheap when nothing is due. After a failure, wait before retrying.
Known exception: password change and the first-login history upgrade are synchronous (see "Known limits").

**B7. Exports carry no secrets and no half-written files.**
No AI keys, no `*.rekey`/`*.tmp` leftovers. The UI says an export is not encrypted wherever it offers one.
Enforced by: `backupPrivacyCopy.test.ts`, `noteHistoryEncryption.test.ts`.

**B8. Retention is the user's choice and never deletes silently.**
Lowering a number asks first with exact counts. Defaults for new setups may be small; existing setups keep their size.
Copy shows the user's current setting, not a constant (`snapshotSafetyNetText`).
Enforced by: `backupRetention.test.ts`, `backupRetentionText.test.ts`.

**B9. Formats grow, they do not change.**
Backup folders carry `manifest.json` with a `format` string. Add fields; never rename or remove one. Readers accept
older manifests that lack new fields. Files an older build cannot read must be ignored by it, not break it (as the key
history file is).

**B10. Honest copy.**
Words like "encrypted", "safe", "restored" and "complete" are used only when true for that exact artifact.
Errors say what happened to the user's data ("nothing was changed") before what to do.

## Checklist for a new persisted artifact (a new file kind next to the workspace)

1. Is it sealed? If yes: add it to key re-staging (`sidecarRekey`) and give its backup reader the earlier-key fallback (B2).
2. Does a snapshot include it? If it is hardlinked, every writer must be tmp + rename (see `sidecarSnapshot.cjs`).
3. Do exports include it, with `{ count, skipped }` (B4)? Do restore/import report it (B3)?
4. Does a leftover (`.tmp`, `.rekey`) of it stay out of exports (B7)?
5. Does a test cover: password change, restore of an older snapshot, a damaged file?

## Known limits (accepted, documented)

- Running an older build against a data folder a newer build already sealed loses note history there and may delete
  images only that history used. History was judged expendable; the main files stay recoverable.
- Password change and the first-login history upgrade block the main process for a moment on very large libraries.
- A user who changed their password on a build before key history existed has older snapshots sealed under a key that
  can no longer be derived; those snapshots cannot be opened.
- Exports are readable files. Encrypted exports are not built.
- While the app is fully closed no backup runs; the first one runs when it is opened (B6).

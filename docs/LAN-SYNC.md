# Moving data between devices — companion guide

**Audience:** One person, multiple devices (desktop + phone/PWA)
**Status:** Supported production use case for Cadence `0.2.x`
**Related:** [README § Move data between devices](../README.md#move-data-between-devices-offline-no-cloud), [README § Cloud sync](../README.md#cloud-sync-google-drive-end-to-end-encrypted), [HEALTH-CHECK-AND-ROADMAP](./HEALTH-CHECK-AND-ROADMAP.md)

> **History note:** Earlier releases shipped a same-Wi‑Fi "LAN sync" HTTPS
> server with QR pairing. That feature has been **removed**. The two paths
> below replace it; this file keeps its old name only so existing links stay
> valid.

---

## Two ways to share one workspace across devices

Cadence assumes **one human, one workspace, multiple screens** — not multi-user
collaboration. There is no live merge of two people editing the same note at the
same time. Two non-collaborative paths are supported:

| Path | When to use it | Network needed |
|------|----------------|----------------|
| **Offline backup transfer + merge** | You want zero cloud involvement, or the devices are rarely online together | None — move a file by hand |
| **Cloud sync (Google Drive)** | You want both devices to converge automatically, from anywhere | Internet + your own Drive |

If you follow the workflows below, **conflicts are rare** and usually mean "you
edited on both devices before they synced," not a broken sync engine.

---

## Path A — Offline encrypted-backup transfer (no cloud)

This is the simplest, most private way to move data, and it needs no network
link between the devices.

### Steps

1. **Source device → Settings → Backup → Export.** Choose:
   - **Portable ZIP** — encrypted workspace JSON **plus image attachments** (recommended; works on all platforms).
   - **JSON** — text-only, no images.
2. **Carry the file across** by any means you already trust — AirDrop, Files,
   a USB stick, a private message to yourself.
3. **Target device → Settings → Backup → Import**, and pick one of two modes:

| Import mode | Effect | Use for |
|-------------|--------|---------|
| **Replace (restore a backup)** | Overwrites the target workspace with the file | Restoring a device from a known-good backup |
| **Merge items from another device** | **Additive**: keeps every local item, appends only what's missing | "Fold my phone's new notes into my desktop" |

### Why merge is safe

The merge (`mergeAppendWorkspace`, `src/core/model/mergeWorkspace.ts`) is built
to never lose data:

- **Additive only** — every local entity survives untouched; nothing is overwritten or deleted.
- **No overwrite by id** — if a remote item shares an `id` with a local one, the local copy wins.
- **Content dedupe** — notes / todos / team items also dedupe by a stable content signature, so the same logical item created independently on both devices isn't imported twice.
- **Singletons stay local** — your profile, AI settings, **notes passphrase**, and active team are never taken from the imported file, so an import can't change your config or lock you out.
- **Idempotent** — re-importing the same file is a no-op.

The one documented trade-off: because the model has no tombstones, re-importing
an **old** file can resurrect an item you had deleted locally. Delete it again
if that happens.

---

## Path B — Cloud sync (Google Drive, end-to-end encrypted)

For always-on convergence across devices, connect Google Drive. Snapshots are
encrypted **on your device** (AES-256-GCM, PBKDF2 key from a sync passphrase you
choose) before they leave it, so Google stores an opaque blob it cannot read.

Setup and security details live in the README:
[Cloud sync (Google Drive, end-to-end encrypted)](../README.md#cloud-sync-google-drive-end-to-end-encrypted).

### What auto-sync does

Background sync runs when a Drive backend is connected:

| Trigger | Min gap |
|---------|---------|
| ~500 ms after app open | — |
| Window/tab focus | 30 s |
| `visibilitychange` → visible | 30 s |
| Browser `online` event | 30 s |

Algorithm (**push first, pull second**):

1. Compare the local content fingerprint (`computeLocalEtag`, `src/lib/syncFingerprint.ts`) with the last successful sync fingerprint.
2. If local changed → **push** with the remote concurrency token.
3. If local unchanged → **pull** (cheap "not modified" when the remote hasn't changed).
4. On a push **conflict** (version mismatch / 412) → **stop silently** (no overwrite). Resolve manually in Settings.

Manual **Pull** / **Push** in Settings always shows explicit success/error
messages, and auto-sync **never** auto-picks a winner on a conflict — that is
intentional.

---

## Recommended daily workflow (single user)

| Do | Don't |
|----|-------|
| Edit mainly on one device at a time | Edit the **same note** on two devices at once |
| Finish typing, wait for **Saved**, then switch devices | Force-quit mid-sentence before a sync/export |
| For cloud sync, glance at "synced N min ago" before big edits elsewhere | Assume two devices are live-collab like Google Docs |
| For offline transfer, **merge** (don't replace) when folding in another device | Replace your full workspace with a partial export |

---

## Data & security notes

| Topic | Desktop | Phone PWA |
|-------|---------|-----------|
| Storage | Encrypted file + 50 rolling backups | Browser `localStorage` (not app-encrypted) |
| Offline transfer | Export/import portable ZIP or JSON | Same |
| Cloud sync on wire | E2E-encrypted blob in your Drive `appData` folder | Same |
| Attachments | Sidecar files on disk; bundled into portable ZIP | Imported by id from the ZIP |

Phone PWA data is **logically separate** until you sync or import. Treat the
phone as a cache of your workspace, not a second backup strategy — keep desktop
backups (**Export** / full backup folder).

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Import did nothing / "nothing new" | You ran **merge** and the file had no new items | Expected — merge is idempotent |
| Images missing after import | You imported a JSON (text-only) export | Re-export and import a **portable ZIP** |
| Encrypted images skipped on import | Source-account encryption keys not available | Re-export a full backup from the source account |
| Cloud sync stuck / banner error | Drive auth expired or offline | Re-sign in under Settings → Cloud sync; check connectivity |
| Cloud push conflict | Another device pushed since your last pull | Use Settings → Pull host's version, then Push |

---

## Operator checklist

Before relying on cross-device transfer for travel:

- [ ] A recent **portable ZIP** export taken (and the file actually moved across)
- [ ] Target device **merge** ran and the expected notes/todos appeared
- [ ] If using cloud sync: signed in on both devices, "synced N min ago" recent
- [ ] Desktop **Export** / full backup taken (belt and suspenders)

---

## Revision history

| Date | Changes |
|------|---------|
| 2026-06-14 | Rewritten for the LAN-sync removal: offline encrypted-backup merge + Google Drive cloud sync |
| 2026-06-04 | Initial companion-device guide (single-user workflow, limitations, troubleshooting) |

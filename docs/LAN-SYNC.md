# Moving data between devices — companion guide

**Audience:** One person, multiple devices (desktop + phone/PWA)
**Related:** [README § Move data between devices](../README.md#move-data-between-devices-offline-no-cloud), [USER-GUIDE § Moving data between devices](./USER-GUIDE.md#moving-data-between-devices)

> **History note:** Earlier releases shipped a same-Wi-Fi "LAN sync" server with
> QR pairing and a Google Drive sync. Both have been **removed**; there is no
> sync service. This file keeps its old name only so existing links stay valid.

Cadence is local-first: one person, one workspace per device. A second device
gets your data when you carry a file across.

## Offline transfer with a portable backup

1. On the source device: **Settings → Data & backup → Backup & recovery → Export backup**.
2. Carry the file across (AirDrop, Files, USB, a private chat to yourself).
   The ZIP is **not encrypted** — it holds your notes and images in readable form, so move it only by ways you trust and delete it afterwards.
3. On the target device: **Settings → Data & backup → Backup & recovery → Import backup**, check what is inside, and choose **Add to what's here**.

## Merge or replace

- **Add to what's here** is additive. Everything already on the target stays; only items it does not have are added. Importing the same file twice changes nothing. Local settings (profile, AI settings, notes passphrase, active team) are never touched.
- **Replace what's here** overwrites the target workspace with the file. Use it to restore a device. A snapshot of the current workspace is taken first.

## What merge does not do

- If the same item was edited on both devices, the copy already on the target stays and the other edit is not applied.
- Deletions do not travel. Importing an old file can bring back an item you deleted on the target.
- Nothing runs in the background. Move a file each time you want the devices to catch up.

## Good habits

- Pick a main device and merge into it, then export from it when you need to refresh the other one.
- Export a fresh file just before you merge, so you never merge a stale one.
- Keep the ZIP out of shared or synced folders you do not control.

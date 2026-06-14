# Cadence — Privacy Policy

**Effective date:** 2026-05-20
**Last updated:** 2026-06-14

This document explains exactly what data Cadence collects, where it lives, and who can read it. We err on the side of "explain plainly", not "lawyer-tight". If anything is unclear, open an issue at <https://github.com/sercancelenk/cadence/issues>.

## Summary in one paragraph

Cadence is a **local-first** app: every note, todo, team, person, goal and reminder you create is stored on the devices you install Cadence on, encrypted at rest, and never sent to any server we run. The only times your data leaves your device are:

1. **When you move a backup file yourself** — you can export an encrypted backup and carry it to another device (AirDrop, Files, USB). This is a file *you* move; Cadence sends nothing over any network for it.
2. **When you opt in to cloud sync (Google Drive)** — Cadence encrypts your snapshot **before** uploading it to **your own** Google Drive account, in a hidden per-app folder. The decryption key is your sync passphrase, which never leaves your device.
3. **When you opt in to the AI assistant** — Cadence sends only the text you explicitly ask the assistant about (e.g. the contents of one task) to the AI provider you chose (Anthropic, OpenAI, Google), using **your own API key**. We never see this traffic.

Cadence does not collect telemetry. Cadence does not phone home. Cadence does not run any analytics. There is no "Cadence server" to leak.

## Data Cadence stores locally

| Where | What | Encryption |
|---|---|---|
| Desktop (Electron) — `app.getPath('userData')` | The full AppData JSON (teams, people, items, todos, notes, settings) | AES-256-GCM with a key derived from your account password (scrypt) |
| Desktop — same path | Backups: rolling 50-snapshot history | Same as above |
| Browser PWA — `localStorage` | The same AppData JSON | Browser-managed (sandbox); Cadence does not add a second layer |
| Browser PWA — `localStorage` (sync keys) | Google OAuth tokens, sync record | Plaintext (see threat model below) |
| Browser PWA — `sessionStorage` | Sync passphrase (only when "unlocked" for the current tab session) | Plaintext (cleared on tab close) |
| Browser PWA — `IndexedDB`/`localStorage` (notes lock) | Notes-feature encryption key envelope (when you enabled Notes lock) | AES-256-GCM with a key derived from your Notes passphrase (PBKDF2) |

### Threat model

For the items marked "plaintext" in `localStorage`/`sessionStorage`:

- The Google OAuth refresh token only grants access to a single hidden folder in your Google Drive (`drive.appdata` scope). It does NOT grant access to the rest of your Drive, Gmail, Calendar or any other Google service.
- The sync passphrase only decrypts already-uploaded encrypted snapshots. Without **also** stealing the OAuth tokens or the encrypted blob, it is useless.

In short: an attacker would need both client-side access AND server-side access to read your data. Anyone with that much access has already won.

## Data Cadence sends over the network

### Offline backup transfer (you, no network)

When you move data between your own devices with an exported backup, Cadence:

- Writes an encrypted backup file (portable ZIP or JSON) to a location you choose.
- Does nothing else — moving that file to another device (AirDrop, Files, USB) and importing it there is entirely under your control.

No server, no pairing, and no network connection between the devices is involved.

### Cloud sync to Google Drive (you, opt-in)

When you enable Settings → Cloud sync (Google Drive), Cadence:

- Opens Google's standard OAuth consent screen and requests **only** the `https://www.googleapis.com/auth/drive.appdata` scope. This scope gives Cadence access to **one hidden folder** that Google reserves for our app. It cannot see anything else in your Drive.
- Encrypts your entire AppData snapshot with AES-256-GCM, using a key derived from a "sync passphrase" **you set and remember locally** via PBKDF2-SHA-256 (200 000 iterations). Both the salt and the IV are random per upload.
- Uploads the resulting opaque ciphertext (typically 0.5–2 MB) to Google Drive.

**What Google sees:** an opaque blob in their `appdata` folder for your account, and the standard metadata they keep on every file (size, modification time, owner). Google does NOT have the decryption key.

**What Google can do with it:** store, replicate, hand back on request — exactly what you would expect from a backup service. They can also be compelled by lawful process to hand over the bytes, in which case the encryption is what stands between the bytes and your data.

**What Google CANNOT do:** read your notes, tasks, names, dates, or any other content of your workspace.

You can revoke Cadence's access at any time at <https://myaccount.google.com/permissions> or via Settings → Cloud sync → Sign out. Revoking does not delete the encrypted blob from your Drive — to remove it, use Google's "Apps that have access" panel or the Drive web UI's "Manage Apps" → "Delete hidden app data".

### AI assistant (you, opt-in, BYOK)

When you ask the AI assistant something, Cadence sends:

- The text you typed,
- The selected task / note / agenda body if any,
- Your model preference,

directly to the AI provider you configured (Anthropic, OpenAI, or Google), using **your own API key**. The traffic flows from your device to that provider, not through any Cadence server. Cadence stores your API key locally; it is sent only in the `Authorization` header of those direct calls.

## Children's privacy

Cadence is not directed at children under 13 and we do not knowingly collect any personal information from children.

## Changes to this policy

Any material change will be reflected in the **Last updated** date above and called out in the release notes. Because Cadence is open source, every word of this policy is in the same Git history as the code; you can verify exactly what changed when.

## Contact

Open an issue or discussion at <https://github.com/sercancelenk/cadence/issues>.

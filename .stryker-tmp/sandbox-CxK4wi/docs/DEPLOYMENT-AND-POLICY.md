# Deployment, updates, and policy — operator guide

This document captures **how enterprise policy interacts with app updates and fresh installs**, plus **how a solo user on the public build can lock features down for themselves**. It complements the IT-focused reference in [ENTERPRISE.md](./ENTERPRISE.md).

Keep this file in the repo so we do not re-discover the same answers in chat.

---

## 1. Two ways to lock down Cadence

| Approach | Who installs | What locks features | Typical audience |
| --- | --- | --- | --- |
| **Public `Cadence` + `policy.json`** | User or IT | JSON file on disk (5-layer search; highest path wins) | MDM fleets, mixed OS images, “one DMG for everyone” |
| **`Cadence for Work` build** | IT only | Compile-time `CADENCE_DISTRIBUTION=enterprise` → baseline `work-strict` | Auditors, air-gapped fleets, “binary is the policy” |

Both paths:

- Gate **LAN sync**, **Google Drive sync**, **AI**, **JSON export**, and **update checks** independently.
- Enforce sensitive IPC in the Electron **main process** (renderer cannot bypass sync by calling IPC directly).
- Leave **tasks, notes, backups, PIN** intact — only outbound / exfiltration surfaces change.

Policy reference: [`policy.example.json`](../policy.example.json). Install helpers: [`scripts/install-policy.sh`](../scripts/install-policy.sh), [`scripts/install-policy.ps1`](../scripts/install-policy.ps1).

---

## 2. What is stored where (do not confuse the paths)

| Store | Path (macOS) | Holds |
| --- | --- | --- |
| **Workspace data** | `~/Library/Application Support/Cadence/cadence-data-<userId>.json` | Todos, notes, teams, **`profile.displayName`**, AI keys, etc. |
| **Accounts** | `~/Library/Application Support/Cadence/cadence-accounts.json` | Email, password hash, optional `displayName` at registration |
| **Policy** | See [ENTERPRISE.md §3](./ENTERPRISE.md#3-where-to-put-the-file) | Feature flags only |
| **User preset** | Browser/Electron `localStorage` (`cadence.features.preset.v1`) | Personal / Work-Standard / Work-Strict when **no** policy |

**Top bar and Profile page** read `profile.displayName` from the **workspace data file**, not from `cadence-accounts.json`. If display name resets after restart, the data file was not loaded correctly (fixed in `normalizeData` → `parseProfile`).

---

## 3. Existing user — app update (auto-update or new DMG)

### What the update changes

- Application binary only (`Cadence.app` contents).
- New UI, bug fixes, data-integrity banner, todo Markdown details, etc.

### What the update does **not** touch

| Artifact | Survives update? |
| --- | --- |
| `cadence-data-*.json` (your work) | Yes |
| `backups/<userId>/` | Yes |
| `policy.json` (if IT deployed it) | Yes |
| `localStorage` preset (if no policy) | Yes |
| `cadence-accounts.json` | Yes |

### Behaviour after update

```text
User had Cadence 0.2, Personal preset, no policy
        ↓
Update to 0.3
        ↓
Same data folder, same preset → still Personal (sync/AI visible)
```

```text
User had Cadence + IT deployed policy.json (work-strict)
        ↓
Update to 0.3
        ↓
policy.json still on disk → still managed, still locked down
        (user must restart app if it was running during IT's first deploy)
```

**Policy is read on every cold start.** It is cached for the process lifetime — changing `policy.json` requires **quit and reopen** Cadence (same as Chrome enterprise policies).

---

## 4. IT deploys policy **after** users already have Cadence

No reinstall required.

1. IT places `policy.json` (e.g. `/Library/Application Support/Cadence/policy.json` on macOS).
2. User **quits Cadence completely** and opens it again.
3. Settings → **App profile** shows **Managed by organization**.
4. Gated Settings cards disappear per policy.
5. **Todos, notes, backups unchanged.**

Removing policy + restart → falls back to the user's saved **App profile** preset in Settings (or `personal` if never chosen).

---

## 5. Fresh install — never had Cadence before

### A) Public build + policy first (recommended for companies)

```bash
# macOS example (IT):
sudo ./scripts/install-policy.sh ./policy.json
# Then hand the user the normal Cadence DMG from GitHub Releases.
```

First launch:

- Welcome tour explains the device is **managed** (no preset picker).
- Features match policy.
- User registers / signs in and works as usual.

### B) Public build, no policy (individual)

1. Install DMG.
2. First launch → welcome tour → pick **Personal**, **Work-Standard**, or **Work-Strict**.
3. Change anytime in **Settings → App profile** (unless a policy appears later).

### C) Enterprise build (`Cadence for Work`)

```bash
npm run build:enterprise   # or CI: npm run build:release:enterprise
```

- Separate app ID → installs **side-by-side** with public Cadence.
- Separate `userData` folder (different product name).
- Baseline **work-strict**; optional `policy.json` may **loosen** flags only (e.g. enable AI).
- Updates use the **`enterprise`** channel, not `latest`.

---

## 6. Personal user on public Cadence — restrict yourself

You do **not** need the enterprise DMG. Three practical options, strictest last:

### Option 1 — In-app preset (easiest)

1. **Settings → App profile**
2. Choose **Work-Strict** (no sync, no AI, no JSON export) or **Work-Standard** (no sync only).
3. Done. Stored in `localStorage` on this device.

You can change it back anytime — there is no IT lock.

### Option 2 — Your own `policy.json` (user-writable path)

Create:

`~/Library/Application Support/Cadence/policy.json`

```json
{
  "managedBy": "Self (local policy)",
  "preset": "work-strict"
}
```

Restart Cadence. Settings shows **Managed by organization** and hides gated features.

**Caveat:** you can edit or delete this file yourself (lowest precedence path). Good for discipline, not for compliance audits.

### Option 3 — System-wide policy (harder to undo)

Same as IT deploy, but you run the install script with `sudo`:

```bash
./scripts/install-policy.sh --validate ./my-policy.json
sudo ./scripts/install-policy.sh ./my-policy.json
```

Targets `/Library/Application Support/Cadence/policy.json` on macOS — normal users cannot change it without admin rights.

To remove:

```bash
sudo ./scripts/install-policy.sh --uninstall
# then restart Cadence
```

---

## 7. Precedence (single source of truth)

When the app resolves features:

1. **`Cadence for Work` build** → baseline `work-strict`, user cannot pick Personal in UI.
2. Else **`policy.json`** on disk (any of the 5 search paths) → **wins over user preset**.
3. Else **user preset** from Settings / welcome tour (`localStorage`).
4. Else **`personal`** (everything on).

See `src/lib/features.tsx` → `resolveFeatures()`.

---

## 8. Quick troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Updated app but still see Sync/AI | No policy; Personal preset | IT deploy policy + restart, or user picks Work-Strict in Settings |
| Policy deployed but UI unchanged | App not restarted | Quit Cadence fully, reopen |
| "Managed" but want Personal back | Policy still present | Remove policy file, restart |
| Display name resets to "Me" after restart | Old bug: profile not parsed on load | Fixed: `parseProfile` in `normalizeData` (≥ current tree) |
| Display name OK until restart | Save failed (no session key) | Re-login; check red autosave banner; Profile → Save waits for disk |
| Two Cadence apps, data missing | Opened wrong flavor | Public vs **Cadence for Work** use different data dirs; use Export/Import to move |

---

## 9. Related docs

- [ENTERPRISE.md](./ENTERPRISE.md) — flag matrix, paths, MDM, build flavors
- [README.md](../README.md) — user-facing feature list
- [`policy.example.json`](../policy.example.json) — annotated template

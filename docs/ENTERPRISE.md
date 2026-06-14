# Cadence — Enterprise / shared-device deployment

This guide is for IT administrators, MSPs, and anyone who wants to lock down
Cadence on company laptops so it never reaches external services. The whole
mechanism works **without a Cadence-operated server**: a single JSON file on
the device controls what the app exposes.

> TL;DR — drop a `policy.json` at the right path, restart Cadence, done.
> Sync, AI, export and update features can each be disabled independently,
> and the user cannot bypass the policy from the app UI.
>
> **Updates vs fresh installs vs self-restriction on the public build:**
> see [DEPLOYMENT-AND-POLICY.md](./DEPLOYMENT-AND-POLICY.md).

---

## 1. What the policy controls

Cadence groups its outbound / data-leaving features into four flags:

| Flag | What it gates | Why an admin might disable it |
| --- | --- | --- |
| `features.sync.cloud` | Google Drive sync (E2E-encrypted snapshots in the user's own Drive) | Prevent any cloud upload of company data |
| `features.ai` | Bring-your-own-key AI assistant (calls OpenAI / Anthropic directly from the renderer) | Block company content from reaching LLM providers |
| `features.dataExport` | "Export JSON" button in Settings → Backup | Block USB / personal-email exfiltration |
| `features.updateCheck` | Periodic + manual GitHub Releases ping | Required only for fully air-gapped deployments |

> **Legacy flag:** `features.sync.lan` is still accepted for backward
> compatibility with older `policy.json` files, but same-Wi-Fi LAN sync has
> been removed — the flag now gates nothing and can be dropped from new
> policies.

A user **does not need to be aware of the policy**. Disabled features
simply do not render their entry points in the UI. Where defence in depth
matters (e.g. the Google Drive OAuth handshake), the policy is also enforced
inside the Electron main process so a buggy or modified renderer cannot
bypass it.

---

## 2. Three presets, one custom mode

Most deployments don't need to think about individual flags. Pick one of
the three named presets:

| Preset | Cloud sync | AI | Export | Updates |
| --- | :---: | :---: | :---: | :---: |
| `personal` (default if no policy) | ✓ | ✓ | ✓ | ✓ |
| `work-standard` | ✗ | ✓ | ✓ | ✓ |
| `work-strict` | ✗ | ✗ | ✗ | ✓ |

If you need something the presets don't cover (e.g. "cloud sync is fine,
but no AI and no exports") use a preset as the base and override the
specific flags with a `features` block:

```json
{
  "managedBy": "Acme Corp IT",
  "preset": "work-strict",
  "features": {
    "sync": { "lan": true }
  }
}
```

> Anything missing from `features` inherits from the preset. Anything
> present in `features` wins. The only required field is `managedBy`
> (free-form label shown to end-users) plus either `preset` OR a
> non-empty `features` block.

A minimum valid file:

```json
{ "managedBy": "Acme Corp IT", "preset": "work-strict" }
```

See [`policy.example.json`](../policy.example.json) for a fully annotated
example.

---

## 3. Where to put the file

Cadence looks for `policy.json` on every launch, in this order. The first
hit wins; later candidates are ignored.

| # | macOS | Windows | Linux |
| --- | --- | --- | --- |
| 1 | `Cadence.app/Contents/Resources/policy.json` (signed into the bundle) | `Cadence\resources\policy.json` (inside install dir) | `usr/lib/cadence/resources/policy.json` |
| 2 | `/Library/Managed Preferences/cadence.policy.json` (MDM-friendly) | `%ProgramFiles%\Cadence\policy.json` | `/etc/cadence/policy.json` |
| 3 | `/Library/Application Support/Cadence/policy.json` | `%ProgramData%\Cadence\policy.json` | (same as #2) |
| 4 | `~/Library/Application Support/Cadence/policy.json` (user-writable; lowest precedence) | `%APPDATA%\Cadence\policy.json` | `~/.local/share/cadence/policy.json` |

### Which path should I pick?

- **Big org with MDM (Jamf, Intune, Workspace ONE, etc.)** — use the
  Managed Preferences path. Push it as a configuration profile; MDM
  guarantees the file is read-only to the user.
- **Smaller team, no MDM** — use the system-wide Application Support /
  ProgramData path. A one-line `sudo cp` (or scripted MSI) deploys it.
  Standard users cannot edit files there without admin rights, so the
  policy survives "let me just turn this off real quick" attempts.
- **Personal lab / sandbox** — the user-writable path is fine. Note that
  the user can edit it (and the next launch will pick up the change),
  which is the point in a self-hosted homelab scenario.
- **Cadence build hosted by your company** — bake `policy.json` into the
  bundle at build time (Phase 2 — see the [Roadmap](../README.md)).

---

## 4. What the user sees

- **Settings → App profile** card always shows the active configuration.
  When a policy is in effect:
  - The "Active" badge reads `Managed by organization`.
  - The preset picker is hidden; instead a read-only "what's enabled"
    grid is shown.
  - The policy path and `managedBy` label are exposed for self-service
    diagnostics ("why is Cloud sync hidden? — open Settings, look at the
    badge, contact IT").
- **Welcome tour** on first sign-in only shows feature explanations for
  things that the policy keeps available. There is no preset picker —
  the policy has already chosen.
- **Disabled features are invisible**. The Sync / Cloud sync / AI
  Settings cards do not render. The "Export JSON" button does not render.
  Manual update check does not render.
- **Cloud sync is enforced server-side**. Even if a modified renderer
  tried to call `gdrive:beginAuth`, the Electron main process refuses with
  the policy reason when `features.sync.cloud` is disabled.

---

## 5. Deploying a policy

Three options, in order of complexity / hardening:

1. **Self-install scripts** (Phase 2, recommended for non-MDM teams).
2. **MDM / GPO push** (recommended for big orgs).
3. **`Cadence for Work` enterprise build** (locked binary, see §10).

### 5.a Self-install scripts (Phase 2)

Cadence ships two helper scripts under `scripts/`. They validate the
JSON, write it atomically (temp file + rename within the same directory
— power-loss safe), and harden the resulting file's ACL so end-users
can't trivially overwrite it.

**macOS / Linux:**

```bash
# Validate before deploying (no admin needed):
./scripts/install-policy.sh --validate ./my-policy.json

# Install (admin required because it writes to /Library or /etc):
sudo ./scripts/install-policy.sh ./my-policy.json

# Remove the deployed policy:
sudo ./scripts/install-policy.sh --uninstall
```

**Windows (from an elevated PowerShell):**

```powershell
# Validate (no admin needed):
.\scripts\install-policy.ps1 -Source .\my-policy.json -Validate

# Install — must run elevated; the script asserts before touching disk:
.\scripts\install-policy.ps1 -Source .\my-policy.json

# Remove:
.\scripts\install-policy.ps1 -Uninstall
```

Both installers target the highest-precedence non-MDM path on their OS
(see §3), so a normal sign-in user cannot override the policy by
dropping their own file at a lower-precedence path.

### 5.b MDM / GPO (recommended for managed fleets)

**macOS, MDM (Jamf example).** Push a configuration profile that writes
the file to `/Library/Managed Preferences/cadence.policy.json`. Make
sure the file is literal JSON (not a `.plist`), since Cadence parses it
as JSON. Jamf "Configuration Profiles → Application & Custom Settings →
Upload" works as long as the resulting on-disk file has the exact name
above.

**Windows, GPO.** Drop the file via the *Files* preferences extension;
target `%ProgramData%\Cadence\policy.json`. Set Security tab to deny
"Write" for `Users`. No registry entries are needed.

### 5.c Plain `sudo cp` (no scripts, no MDM)

The scripts above are wrappers around exactly this; included for
completeness:

```bash
# macOS:
sudo mkdir -p "/Library/Application Support/Cadence"
sudo cp policy.json "/Library/Application Support/Cadence/policy.json"
sudo chown root:wheel "/Library/Application Support/Cadence/policy.json"
sudo chmod 644 "/Library/Application Support/Cadence/policy.json"

# Linux:
sudo mkdir -p /etc/cadence
sudo cp policy.json /etc/cadence/policy.json
sudo chmod 644 /etc/cadence/policy.json
```

```powershell
# Windows (elevated):
$dst = "$env:ProgramData\Cadence"
New-Item -ItemType Directory -Force $dst | Out-Null
Copy-Item policy.json $dst
icacls $dst /grant Users:R /T
```

In every case, quit and reopen Cadence. The "App profile" badge should
now read "Managed by organization".

---

## 6. Validating the deployment

After deploying, on each affected device:

1. Launch Cadence. Open **Settings → App profile**.
2. Confirm the badge reads `Managed by organization`.
3. Confirm the `Policy path` shows the path you deployed to.
4. Confirm the "what's enabled" grid matches your policy.
5. Confirm the gated cards are NOT visible in Settings (Sync, Cloud
   sync, AI, etc. depending on which flags you disabled).
6. (Optional) Try `Settings → Cloud sync` if you disabled it — the
   section should not exist. Even calling the `gdrive:beginAuth` IPC
   programmatically from DevTools will receive a "disabled by your
   organization policy" error from the main process.

---

## 7. Updating or removing the policy

- **Update**: replace the file and restart the app. Cadence caches the
  policy for the lifetime of the process; restart is necessary
  (intentionally — same behaviour as Chrome / Edge).
- **Remove**: delete the file at the active path and restart. The next
  launch falls back to the user's onboarding preset (or `personal` if
  they haven't picked one).

---

## 8. Frequently asked questions

**Does Cadence phone home to verify the policy?**
No. The policy is read entirely from disk. There is no Cadence-operated
server, no licensing server, and no telemetry. The only outbound network
calls Cadence ever makes are the ones the user (or your policy) enables
explicitly.

**Can a user circumvent the policy by editing files?**
The two upper-precedence paths (app bundle, OS-managed) are owned by
root/Administrator on a hardened machine. A user without elevation cannot
edit them. The lower-precedence paths are deliberately user-writable to
support homelab use; if you care, deploy at one of the higher-precedence
paths.

**My users see Settings → App profile but no other locked sections.
Where's the rest of Settings?**
The Settings page lists only cards relevant to the current policy.
`Appearance`, `App profile`, `PIN protection`, `Backups & recovery` and
`Reminders` are always visible. Sync, Cloud sync, AI Settings, Backup
(JSON export/import) and Auto updates are hidden when their flag is off.

**Can I keep updates running while air-gapping everything else?**
Yes. `features.updateCheck = true` while all other flags are `false` is
the recommended setting for regulated industries — security patches
still arrive but no company content can leave the device.

**Where do feature gates live in the codebase?**
- `src/lib/features.tsx` — types, presets, precedence rules, React context.
- `electron/main.cjs` — policy file loader (5-layer search) +
  defence-in-depth gating for the cloud-sync OAuth handshake.
- Individual views (`Settings.tsx`, `TodosPage.tsx`, `People.tsx`) call
  `useFeatures()` to conditionally render their AI / sync / export UI.

**Why is the policy cached per-process and not re-read on every IPC?**
Re-reading would cause the UI to flicker between gated/ungated states if
the file is being edited live. Chrome / Edge enterprise policies behave
the same way: change a policy, restart the app.

---

## 9. Build flavors — `Cadence` vs `Cadence for Work`

Phase 2 introduces a second binary flavor for orgs that want
defence-in-depth beyond a sidecar policy file: an installer that **is**
the policy.

### 9.a Public build (`Cadence`)

- App ID: `com.cadence.app`
- Update channel: `latest` (default)
- Onboarding asks the user to pick a preset (Personal / Work-Standard /
  Work-Strict).
- An optional `policy.json` on disk overrides their choice.
- Built via the standard `npm run build` / `npm run build:release`.

### 9.b Enterprise build (`Cadence for Work`)

- App ID: `com.cadence.app.enterprise`
- Update channel: `enterprise` (auto-updater never crosses to the public
  channel; you can roll out independent versions to your fleet).
- Onboarding **skips** the preset picker; the user lands on a
  pre-locked Work-Strict baseline (no sync, no AI, no JSON export).
- A sidecar `policy.json` is still respected — but only to **loosen**
  specific flags (e.g. re-enable AI for an internal Azure OpenAI). The
  baseline cannot be loosened back to "Personal" from any source.
- Settings → App profile shows the badge "This is the Cadence for Work
  build" instead of the policy badge.
- Build & publish:

  ```bash
  # Local build (DMG + zip under release/enterprise/):
  npm run build:enterprise

  # CI / signed release with auto-update artifacts:
  npm run build:release:enterprise
  ```

  Both wrap the standard flow with `CADENCE_DISTRIBUTION=enterprise`,
  which:
  1. Tells Vite to substitute `import.meta.env.CADENCE_DISTRIBUTION`
     with the literal `"enterprise"`. The renderer's feature resolver
     short-circuits to "managed, distribution-locked" so the user cannot
     re-enable gated features from the UI.
  2. Selects `electron-builder.enterprise.json` for packaging, which
     overrides the app ID, product name, output directory and update
     channel.

### 9.c Choosing between the two

| Question | Answer |
| --- | --- |
| Do you ship your own signed installer to your fleet? | Use the **enterprise build**. Removes the "did the policy file deploy correctly?" failure mode. |
| Do you push policy via Jamf / Intune / GPO across a mixed fleet? | Use the **public build** + policy file. One installer, per-machine policy. |
| Do you want some users on Personal and some on Strict on the same OS image? | Use the **public build** + per-user policy file (in the user-writable path). |
| Do you need an air-gapped binary with NO sync / AI surface visible to auditors? | Use the **enterprise build**. The bundle still contains the code (Phase 3 will tree-shake it out), but the renderer cannot reach it. |

### 9.d Side-by-side install

The two flavors install side-by-side on the same machine (distinct app
IDs and product names). They keep separate user data directories
because Electron derives `app.getPath('userData')` from the productName.
Don't try to copy data between them by hand — use the in-app
JSON export/import if you really need to.

---

## 10. Phase 3 — roadmap

Currently scoped but not yet implemented:

- **Tree-shaking** the sync / AI / Drive modules behind dynamic imports
  guarded on `import.meta.env.CADENCE_DISTRIBUTION === 'enterprise'`, so
  the enterprise binary contains literally zero references to Google
  Drive, OpenAI, or any external host.
- **Code-signed `.pkg` / `.msi` installers** that bake `policy.json`
  into a payload outside the app bundle. Removes the "did someone with
  admin replace the file?" risk class.
- **A `cadence policy verify` CLI** to dump the live resolved feature
  set + active policy path, for fleet-wide audit scripts.

When these ship this document will be updated.

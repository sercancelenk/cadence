import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { IcDownload, IcLock, IcRefresh, IcSparkles, IcTrash, IcUpload, IcWifi } from '../components/icons';
import { Button } from '../components/ui/Button';
import { useAccount } from '../AccountContext';
import { useAppData } from '../AppDataContext';
import { useSession } from '../AuthContext';
import { useToast } from '../components/ui/Toast';
import { askAI, AIError, defaultModel } from '../lib/ai';
import {
  APP_SLUG,
  DATA_FILE_PREFIX,
  SYNC_FINGERPRINT,
  SYNC_FINGERPRINT_LEGACY,
} from '../lib/appBranding';
import type { AIProvider, AppData } from '../model';
import { AI_PROVIDER_OPTIONS } from '../model';
import type { CacheBreakdownEntry, CacheStats, DataFileInfo, DataSources, SaveError } from '../vite-env';
import { CollapsibleCard } from '../components/ui/CollapsibleCard';
import {
  buildPairUrl,
  clearPair,
  computeLocalEtag,
  formatRelativeSync,
  loadPair,
  normalizeHostUrl,
  pullSnapshot,
  pushSnapshot,
  recordSync,
  savePair,
  type LanSyncPair,
} from '../lib/lanSyncClient';
import { parseRemoteSnapshot } from '../lib/syncSnapshotGuard';
import {
  getLastSyncEvent,
  subscribeSyncEvents,
  type SyncEvent,
} from '../lib/syncEvents';
import {
  beginAuth,
  getClientIdSource,
  isClientConfigured,
  loadStoredTokens,
  setRuntimeClientId,
  signOut,
  type AuthFailureReason,
  type ClientIdSource,
  type OAuthTokens,
} from '../lib/syncBackends/gdriveAuth';
import {
  createGDriveBackend,
  disconnectGDrive,
} from '../lib/syncBackends/gdrive';
import {
  getActiveBackendId,
  setActiveBackendId,
  subscribeActiveBackend,
  type SyncBackendId,
} from '../lib/syncBackends';
import {
  clearSyncPassphrase,
  hasSyncPassphrase,
  setSyncPassphrase,
  subscribeSyncPassphrase,
} from '../lib/syncSession';
import {
  PRESETS,
  PRESET_LABELS,
  useFeatures,
  type PresetName,
} from '../lib/features';

export function Settings() {
  const { data, replaceAll } = useAppData();
  const { pinEnabled, refresh: refreshSession, lockSession } = useSession();
  const toast = useToast();
  const { features, managed, source, setPreset } = useFeatures();
  const [path, setPath] = useState<string>('');
  const [appVersion, setAppVersion] = useState<string>('');
  const [newPin, setNewPin] = useState('');
  const [newPin2, setNewPin2] = useState('');
  const [clearPin, setClearPin] = useState('');
  const [updaterOpen, setUpdaterOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void (async () => {
      const p = await window.cadence?.userDataPath?.();
      if (p) setPath(p);
      const v = await window.cadence?.getAppVersion?.();
      if (v) setAppVersion(v);
      await refreshSession();
    })();
  }, [refreshSession]);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${APP_SLUG}-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page settings-page">
      <header className="page-head settings-page__head">
        <h1>Settings</h1>
        <p className="muted">
          Everything about Cadence lives on your device. Grouped here by what each setting controls.
        </p>
      </header>

      <SettingsGroup
        eyebrow="Account & security"
        description="Who can open Cadence on this device, and how your data file is protected."
      >
        <StaySignedInSection />
        <CollapsibleCard id="pin" title="PIN protection" badge={pinEnabled ? 'Enabled' : 'Disabled'}>
        <p className="muted">
          Adds a quick lock screen when Cadence starts and when you choose <em>Lock now</em>. Useful when you step away from your desk so a passer-by can't open the app and read 1:1 notes.
        </p>
        <p className="muted small">
          The PIN is independent of your account password. Your data file is already encrypted at rest with a key derived from the account password — the PIN is purely a UI barrier in front of the unlocked workspace.
        </p>
        <p className="muted small">Status: {pinEnabled ? 'Enabled' : 'Disabled'}</p>
        {pinEnabled ? (
          <div className="row" style={{ marginTop: 8 }}>
            <Button type="button" variant="secondary" icon={<IcLock size={17} />} onClick={() => lockSession()}>
              Lock now
            </Button>
            <span className="muted small">Returns you to the PIN screen without quitting the app.</span>
          </div>
        ) : null}
        {!pinEnabled ? (
          <form
            className="row"
            style={{ marginTop: 10, flexDirection: 'column', alignItems: 'stretch' }}
            onSubmit={async (e: FormEvent) => {
              e.preventDefault();
              const a = newPin.trim();
              const b = newPin2.trim();
              if (a.length < 4 || a !== b) {
                toast.showError(
                  'Invalid PIN',
                  'It must be at least 4 characters and both fields must match.',
                );
                return;
              }
              // setPin runs a round-trip self-verify in the main process and
              // rolls back if the stored hash cannot reproduce the same PIN.
              // So a successful response here guarantees the lock screen will
              // accept the same characters the user just typed.
              const r = await window.cadence?.authSetPin?.({ pin: a });
              if (r?.ok) {
                setNewPin('');
                setNewPin2('');
                // refreshSession() only updates the pinEnabled flag (the
                // current session stays unlocked). The next launch — or an
                // explicit "Lock now" click — is when the PIN screen appears.
                await refreshSession();
                toast.showSuccess(
                  'PIN saved',
                  'It\u2019ll appear at next launch or when you click \u201cLock now\u201d. Forgot it later? Reset from the lock screen with your account password.',
                );
              } else {
                toast.showError('Could not save PIN', r?.error);
              }
            }}
          >
            <input className="input" type="password" placeholder="New PIN" value={newPin} onChange={(e) => setNewPin(e.target.value)} />
            <input className="input" type="password" placeholder="Confirm PIN" value={newPin2} onChange={(e) => setNewPin2(e.target.value)} />
            <Button type="submit" variant="primary" icon={<IcLock size={17} />}>
              Create PIN
            </Button>
          </form>
        ) : (
          <form
            className="row"
            style={{ marginTop: 10, flexDirection: 'column', alignItems: 'stretch' }}
            onSubmit={async (e: FormEvent) => {
              e.preventDefault();
              const r = await window.cadence?.authClear?.({ pin: clearPin.trim() });
              if (r?.ok) {
                setClearPin('');
                await refreshSession();
                toast.showSuccess('PIN removed', 'The lock screen will no longer appear at launch.');
              } else {
                toast.showError('Incorrect PIN', r?.error);
              }
            }}
          >
            <input
              className="input"
              type="password"
              placeholder="Current PIN (to remove)"
              value={clearPin}
              onChange={(e) => setClearPin(e.target.value)}
            />
            <Button type="submit" variant="danger" icon={<IcTrash size={17} />}>
              Remove PIN protection
            </Button>
          </form>
        )}
        </CollapsibleCard>
      </SettingsGroup>

      <SettingsGroup
        eyebrow="Data & backup"
        description="Where your workspace lives on disk, how to copy it elsewhere, and how to restore an earlier state."
      >
        {features.dataExport ? (
          <CollapsibleCard id="backup" title="Backup">
            <div className="row">
              <Button type="button" variant="primary" icon={<IcDownload size={17} />} onClick={exportJson}>
                Export JSON
              </Button>
              <Button type="button" variant="secondary" icon={<IcUpload size={17} />} onClick={() => fileRef.current?.click()}>
                Import JSON
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                try {
                  const text = await f.text();
                  const parsed = JSON.parse(text) as AppData;
                  replaceAll(parsed);
                  toast.showSuccess('Backup imported', 'Your workspace was replaced with the contents of the file.');
                } catch {
                  toast.showError(
                    'Could not import that file',
                    'It is unreadable or the JSON is malformed. Your existing workspace was not touched.',
                  );
                }
                }}
              />
            </div>
            <p className="muted small" style={{ marginTop: 8 }}>
              Importing replaces your existing data. Always export a backup first. Backups exported by older
              builds (file name <code>leeadman-backup-*.json</code>) work too — the importer reads the JSON
              contents, not the filename.
            </p>
          </CollapsibleCard>
        ) : null}

        {/* Backups & Recovery is the IN-APP restore flow (snapshots stored on
            disk by the main process). It does NOT exfiltrate data — even on
            work-strict, IT typically wants users to be able to recover their
            own workspace. We keep this visible regardless of the dataExport
            flag, which only governs file-out / file-in. */}
        <BackupsRecoverySection />

        <CollapsibleCard id="data-location" title="Data location" defaultOpen={false}>
          {path ? <pre className="pre">{path}</pre> : <p className="muted">No Electron data path available; in the browser preview, data lives in localStorage.</p>}
          <p className="muted small">File name pattern: {DATA_FILE_PREFIX}-data-&lt;userId&gt;.json</p>
        </CollapsibleCard>

        <StorageCacheSection />
      </SettingsGroup>

      {features.sync.lan || features.sync.cloud ? (
        <SettingsGroup
          eyebrow="Sync"
          description="Keep this workspace in step with your other devices."
        >
          {features.sync.lan ? <SyncSection /> : null}
          {features.sync.cloud ? <CloudSyncSection /> : null}
        </SettingsGroup>
      ) : null}

      <SettingsGroup
        eyebrow="Integrations"
        description="Optional services and OS-level features Cadence can talk to."
      >
        {features.ai ? <AISettingsSection /> : null}
        <CollapsibleCard id="reminders" title="Reminders" defaultOpen={false}>
          <p className="muted">
            The OS will request notification permission. Fill in the &quot;Reminder&quot; field on a task or note; a desktop notification will fire at the scheduled time
            (the same reminder will not repeat — adjusting the time can re-trigger it).
          </p>
        </CollapsibleCard>
      </SettingsGroup>

      <SettingsGroup
        eyebrow="About"
        description="Version info, update channel, and the workspace profile (personal / work)."
      >
        <AppProfileSection
          features={features}
          managed={managed}
          source={source}
          setPreset={setPreset}
        />
        <CollapsibleCard id="version" title="Application version" defaultOpen={false} badge={appVersion || '—'}>
          <p>
            Installed version: <strong>{appVersion || '—'}</strong> · Data schema: v{data.version}
          </p>
        </CollapsibleCard>
        {features.updateCheck ? (
          <>
            <CollapsibleCard id="updates" title="Auto updates (GitHub Releases)" defaultOpen={false}>
              <p className="muted">
                When the packaged app launches, it checks GitHub Releases for a newer version. You can also check on demand below — a dialog will guide you through download and restart.
              </p>
              <div className="row" style={{ marginTop: 12 }}>
                <Button
                  type="button"
                  variant="secondary"
                  icon={<IcRefresh size={17} />}
                  onClick={() => setUpdaterOpen(true)}
                >
                  Check for updates
                </Button>
              </div>
            </CollapsibleCard>

            <UpdaterDialog open={updaterOpen} onClose={() => setUpdaterOpen(false)} />
          </>
        ) : null}
      </SettingsGroup>
    </div>
  );
}

/**
 * Visual grouping wrapper for Settings cards. Renders a small "eyebrow"
 * heading + short description, then the cards as a flex column with a
 * tighter rhythm than the page-level default. The cards themselves keep
 * their CollapsibleCard styling — this is purely a structural overlay.
 *
 * Using a real <section> with a labelled <header> means assistive tech
 * announces "Account & security, section" before stepping into the
 * individual cards, which matches the visual hierarchy.
 */
function SettingsGroup({
  eyebrow,
  description,
  children,
}: {
  eyebrow: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="settings-group" aria-label={eyebrow}>
      <header className="settings-group__head">
        <h2 className="settings-group__eyebrow">{eyebrow}</h2>
        {description ? <p className="settings-group__desc">{description}</p> : null}
      </header>
      <div className="settings-group__body">{children}</div>
    </section>
  );
}

type SyncStatus = {
  enabled: boolean;
  running: boolean;
  port: number | null;
  token: string | null;
  ips: string[];
  // TLS material is only populated while the server is running. The
  // fingerprint is the SHA-256 of the self-signed cert; we surface a
  // short prefix in the UI so a paranoid user can verify the warning
  // they'll see on the phone.
  tls: {
    fingerprint: string | null;
    notAfter: string | null;
  } | null;
};

function SyncSection() {
  const { data, replaceAll } = useAppData();
  const toast = useToast();
  const isElectronHost = typeof window !== 'undefined' && !!window.cadence?.syncStatus;

  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshStatus = async () => {
    if (!isElectronHost) return;
    const s = await window.cadence!.syncStatus();
    setStatus(s);
  };

  useEffect(() => {
    void refreshStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const enable = async () => {
    setBusy(true);
    try {
      const r = await window.cadence!.syncEnable();
      if (!r?.ok) toast.showError('Could not start sync server', r?.error);
      await refreshStatus();
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      await window.cadence!.syncDisable();
      await refreshStatus();
    } finally {
      setBusy(false);
    }
  };

  const rotate = async () => {
    setBusy(true);
    try {
      const r = await window.cadence!.syncRotateToken();
      if (!r?.ok) toast.showError('Could not rotate token', 'The previous token is still valid until you try again.');
      else toast.showSuccess('Sync token rotated', 'Paired devices need the new token to reconnect.');
      await refreshStatus();
    } finally {
      setBusy(false);
    }
  };

  // Client-side pair form for the *current* device (mobile/PWA or another desktop).
  // `savedPair` is the persisted pair info (host URL + token + ETag); when it's
  // present we show the "connected" badge and use it for auto-pull. The form
  // fields shadow `savedPair` so the user can edit + repair without losing the
  // saved record until they explicitly Pull successfully.
  const [savedPair, setSavedPair] = useState<LanSyncPair | null>(() => loadPair());
  const [pairUrl, setPairUrl] = useState(() => savedPair?.url ?? '');
  const [pairToken, setPairToken] = useState(() => savedPair?.token ?? '');
  const [pairBusy, setPairBusy] = useState(false);
  const [pairMsg, setPairMsg] = useState<{ kind: 'ok' | 'error' | 'info'; text: string } | null>(null);
  // Force re-render every minute so the "synced 3 min ago" badge stays
  // fresh without us needing a separate ticking state on every screen.
  const [, setNowTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setNowTick((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  // Re-read the saved pair after mount. The `useState(loadPair)` init runs
  // BEFORE the app-level auto-pull effect has had a chance to handle a
  // `?pair=...` URL, so when the user lands directly on /settings via QR
  // we'd otherwise show "not paired" until they reload. We also wire up
  // the `storage` event so opening a second tab and pairing there keeps
  // this tab in sync.
  useEffect(() => {
    const refresh = () => setSavedPair(loadPair());
    // Microtask delay covers the QR-scan race: the auto-pull hook's
    // effect (which actually writes the pair) runs in the same tick as
    // ours but isn't guaranteed to fire first.
    const t = window.setTimeout(refresh, 50);
    window.addEventListener('storage', refresh);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  // Sync form fields with `savedPair` when it changes (e.g. the QR-scan
  // flow populated it from another component). We only overwrite empty
  // fields to avoid trampling on the user's in-progress edits.
  useEffect(() => {
    if (!savedPair) return;
    setPairUrl((u) => (u ? u : savedPair.url));
    setPairToken((t) => (t ? t : savedPair.token));
  }, [savedPair]);

  // Normalise whatever the user typed into a canonical base URL.
  // Accepts: "192.168.1.5", "192.168.1.5:9787", "http://192.168.1.5",
  //          "http://192.168.1.5:9787/", "leeadman.local:9787".
  const sanitizedHost = useMemo(() => normalizeHostUrl(pairUrl), [pairUrl]);

  // Detect the dreaded mixed-content scenario: the renderer is loaded over
  // HTTPS (PWA on github.io) and the user is pointing it at an http:// host.
  // The browser will silently block the request — we make the failure
  // diagnosable up front instead.
  const isMixedContentBlocked = useMemo(() => {
    if (typeof window === 'undefined') return false;
    if (window.location.protocol !== 'https:') return false;
    return !!sanitizedHost && sanitizedHost.startsWith('http://');
  }, [sanitizedHost]);

  // 12-second timeout for all LAN calls. The user feels the pain when their
  // phone is on another Wi-Fi network and fetch hangs for 30s.
  const fetchWithTimeout = (input: string, init: RequestInit, ms = 12_000) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    return fetch(input, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(t));
  };

  const describeError = (
    label: 'Pull' | 'Push' | 'Test',
    err: unknown,
    resp?: Response,
  ): { kind: 'error'; text: string } => {
    if (resp && !resp.ok) {
      switch (resp.status) {
        case 401:
          return { kind: 'error', text: `${label} failed: token is incorrect or has been rotated on the host.` };
        case 503:
          return { kind: 'error', text: `${label} failed: no signed-in user on the host (open Cadence there and log in first).` };
        case 404:
          return { kind: 'error', text: `${label} failed: host responded but doesn't speak Cadence sync (404). Double-check the URL/port.` };
        default:
          return { kind: 'error', text: `${label} failed (HTTP ${resp.status}).` };
      }
    }
    const msg = err instanceof Error ? err.message : String(err);
    if ((err as DOMException)?.name === 'AbortError') {
      return {
        kind: 'error',
        text: `${label} timed out. Check that both devices are on the same Wi-Fi and the host server is running.`,
      };
    }
    if (isMixedContentBlocked) {
      return {
        kind: 'error',
        text: `${label} blocked: this page is served over HTTPS but the host is http://. Open the LAN URL the host shows (\"For mobile/PWA on this network\") in your browser and try again.`,
      };
    }
    return { kind: 'error', text: `${label} failed: ${msg}` };
  };

  const testReach = async () => {
    setPairMsg(null);
    if (!sanitizedHost) {
      setPairMsg({ kind: 'error', text: 'Enter a host URL first (e.g. http://192.168.1.5:9787).' });
      return;
    }
    if (isMixedContentBlocked) {
      setPairMsg({
        kind: 'error',
        text:
          'This page is served over HTTPS. Modern browsers block fetches to plain http:// hosts. Open the LAN URL shown on the host (e.g. http://192.168.1.5:9787/) in your mobile browser — that loads the PWA over HTTP and unlocks pairing.',
      });
      return;
    }
    setPairBusy(true);
    try {
      const resp = await fetchWithTimeout(`${sanitizedHost}/v1/ping`, { method: 'GET' }, 8_000);
      if (!resp.ok) {
        setPairMsg(describeError('Test', null, resp));
        return;
      }
      const j = await resp.json();
      // Accept both the current sync fingerprint and the pre-rename one,
      // so a freshly-installed Cadence build can pair with a desktop peer
      // that hasn't been upgraded yet. The set is intentionally small —
      // we still want to reject random services that happen to live on
      // the discovered port.
      if (j?.name !== SYNC_FINGERPRINT && j?.name !== SYNC_FINGERPRINT_LEGACY) {
        setPairMsg({
          kind: 'error',
          text: 'Reachable, but the responder is not a Cadence sync server. Double-check the URL.',
        });
        return;
      }
      setPairMsg({
        kind: 'ok',
        text: 'Reachable. Try Pull from host — you\'ll get a 503 if no user is signed in on the host yet, or 401 if the token is wrong.',
      });
    } catch (err) {
      setPairMsg(describeError('Test', err));
    } finally {
      setPairBusy(false);
    }
  };

  // Internal helper: turn a `PullOutcome` / `PushOutcome` discriminated
  // union into a user-facing message. Keeps the action functions tidy.
  const pullErrorMessage = useCallback(
    (
      outcome: Exclude<Awaited<ReturnType<typeof pullSnapshot>>, { kind: 'ok' } | { kind: 'not-modified' }>,
    ): { kind: 'error'; text: string } => {
      switch (outcome.kind) {
        case 'unauthorised':
          return { kind: 'error', text: 'Pull failed: token is incorrect or has been rotated on the host.' };
        case 'no-session':
          return { kind: 'error', text: 'Pull failed: no signed-in user on the host (open Cadence there and log in first).' };
        case 'mixed-content':
          return {
            kind: 'error',
            text:
              'Pull blocked: this page is HTTPS but the host is http://. Open the LAN URL the host shows in your mobile browser.',
          };
        case 'timeout':
          return { kind: 'error', text: 'Pull timed out. Check that both devices are on the same Wi-Fi and the host server is running.' };
        case 'http-error':
          if (outcome.status === 404) {
            return { kind: 'error', text: "Pull failed: host responded but doesn't speak Cadence sync (404). Double-check the URL/port." };
          }
          return { kind: 'error', text: `Pull failed (HTTP ${outcome.status})${outcome.message ? `: ${outcome.message}` : ''}.` };
        case 'network-error':
          return { kind: 'error', text: `Pull failed: ${outcome.message}` };
      }
    },
    [],
  );

  const pushErrorMessage = useCallback(
    (
      outcome: Exclude<Awaited<ReturnType<typeof pushSnapshot>>, { kind: 'ok' } | { kind: 'conflict' }>,
    ): { kind: 'error'; text: string } => {
      switch (outcome.kind) {
        case 'unauthorised':
          return { kind: 'error', text: 'Push failed: token is incorrect or has been rotated on the host.' };
        case 'too-large':
          return { kind: 'error', text: 'Push failed: payload exceeds the 25 MB limit. Compact your workspace or sync fewer items.' };
        case 'mixed-content':
          return {
            kind: 'error',
            text:
              'Push blocked: this page is HTTPS but the host is http://. Open the LAN URL the host shows in your mobile browser.',
          };
        case 'timeout':
          return { kind: 'error', text: 'Push timed out. Check that both devices are on the same Wi-Fi and the host server is running.' };
        case 'http-error':
          return { kind: 'error', text: `Push failed (HTTP ${outcome.status})${outcome.message ? `: ${outcome.message}` : ''}.` };
        case 'network-error':
          return { kind: 'error', text: `Push failed: ${outcome.message}` };
      }
    },
    [],
  );

  const pull = useCallback(async () => {
    setPairMsg(null);
    const token = pairToken.trim();
    if (!sanitizedHost || !token) {
      setPairMsg({ kind: 'error', text: 'Host URL and token are required.' });
      return;
    }
    if (isMixedContentBlocked) {
      setPairMsg({
        kind: 'error',
        text:
          'This page is HTTPS. Open the LAN URL the host displays (e.g. http://192.168.1.5:9787/) in your mobile browser and pair from there.',
      });
      return;
    }
    setPairBusy(true);
    try {
      // First explicit pull from this device: don't send `If-None-Match`
      // because we WANT the body — the user has nothing local to compare
      // against yet. We pass the prior ETag only on background auto-pulls.
      const outcome = await pullSnapshot(sanitizedHost, token);
      if (outcome.kind === 'ok') {
        replaceAll(outcome.data as AppData);
        const next = savePair({ url: sanitizedHost, token, etag: outcome.etag });
        recordSync(outcome.etag);
        setSavedPair(next);
        setPairMsg({ kind: 'ok', text: 'Pulled snapshot from host. This device is now paired.' });
      } else if (outcome.kind === 'not-modified') {
        // Shouldn't happen on an explicit pull (we didn't send If-None-Match)
        // but defensively persist the pair anyway.
        setSavedPair(savePair({ url: sanitizedHost, token }));
        setPairMsg({ kind: 'ok', text: 'Already up to date.' });
      } else {
        setPairMsg(pullErrorMessage(outcome));
      }
    } finally {
      setPairBusy(false);
    }
  }, [pairToken, sanitizedHost, isMixedContentBlocked, replaceAll, pullErrorMessage]);

  const push = useCallback(async () => {
    setPairMsg(null);
    const token = pairToken.trim();
    if (!sanitizedHost || !token) {
      setPairMsg({ kind: 'error', text: 'Host URL and token are required.' });
      return;
    }
    if (isMixedContentBlocked) {
      setPairMsg({
        kind: 'error',
        text:
          'This page is HTTPS. Open the LAN URL the host displays (e.g. http://192.168.1.5:9787/) in your mobile browser and pair from there.',
      });
      return;
    }
    if (!window.confirm("This will overwrite the host's data with the data from this device. Continue?")) {
      return;
    }
    setPairBusy(true);
    try {
      // Send `If-Match` with the ETag we received on our last pull. The
      // host returns 412 if its data has changed since — that's the
      // "you'd be overwriting newer edits" guard that turns last-write-
      // wins into a deliberate choice the user has to make.
      const outcome = await pushSnapshot(sanitizedHost, token, data, savedPair?.etag);
      if (outcome.kind === 'ok') {
        const next = savePair({ url: sanitizedHost, token, etag: outcome.etag, lastSyncedAt: new Date().toISOString() });
        setSavedPair(next);
        setPairMsg({ kind: 'ok', text: 'Pushed local data to the host.' });
      } else if (outcome.kind === 'conflict') {
        // Offer to pull, overwriting local. This is the safe choice: the
        // user can manually re-apply their edits afterwards. We don't
        // attempt automatic merge — too risky for a workspace this
        // structured (it'd silently lose data on conflicts in nested
        // fields).
        const confirmPull = window.confirm(
          `${outcome.message ?? 'Host has newer changes than your last pull.'}\n\nPull the host's version now? This will overwrite your local data.`,
        );
        if (confirmPull) {
          const pullOutcome = await pullSnapshot(sanitizedHost, token);
          if (pullOutcome.kind === 'ok') {
            replaceAll(pullOutcome.data as AppData);
            const next = savePair({ url: sanitizedHost, token, etag: pullOutcome.etag });
            setSavedPair(next);
            setPairMsg({
              kind: 'ok',
              text: 'Pulled host snapshot. Re-apply your edits, then push again.',
            });
          } else if (pullOutcome.kind === 'not-modified') {
            setPairMsg({ kind: 'info', text: 'Host is already in sync — nothing to pull.' });
          } else {
            setPairMsg(pullErrorMessage(pullOutcome));
          }
        } else {
          setPairMsg({
            kind: 'info',
            text: 'Push cancelled. Use Pull to see the host\'s latest version first.',
          });
        }
      } else {
        setPairMsg(pushErrorMessage(outcome));
      }
    } finally {
      setPairBusy(false);
    }
  }, [pairToken, sanitizedHost, isMixedContentBlocked, data, savedPair?.etag, replaceAll, pullErrorMessage, pushErrorMessage]);

  // "Disconnect" — forget the saved pair so this device stops auto-pulling.
  const disconnect = useCallback(() => {
    if (!window.confirm('Forget the paired host? This device will stop auto-syncing until you pair again.')) {
      return;
    }
    clearPair();
    setSavedPair(null);
    setPairMsg({ kind: 'info', text: 'Disconnected. This device is no longer paired with any host.' });
  }, []);

  // Host URLs are HTTPS — the sync server runs TLS with a self-signed
  // cert so modern browsers (with HTTPS-Only on) actually navigate to
  // it, and an HTTPS PWA can fetch from it without mixed-content
  // blocking. The "Proceed Anyway" prompt on first visit is a one-time
  // cost, explained right above the QR.
  const hostUrls = status?.ips?.length && status?.port
    ? status.ips.map((ip) => `https://${ip}:${status.port}`)
    : [];

  // TLS fingerprint shown so a paranoid user can verify out-of-band
  // (compare with what the phone shows in the cert warning dialog).
  // We render a short 8-byte prefix because the full 32 bytes is
  // unreadable on a phone screen.
  const certFingerprintShort = useMemo(() => {
    const fp = status?.tls?.fingerprint;
    if (!fp) return null;
    return fp.split(':').slice(0, 8).join(':');
  }, [status?.tls?.fingerprint]);

  // Build a QR payload for the FIRST advertised LAN URL — the typical
  // user case is "show me a code my phone can scan". Multi-homed hosts
  // (Wi-Fi + Ethernet + VPN) get the first IP; we trust `os.networkInterfaces()`
  // to put the routable one first, and the user can still copy any
  // alternate URL manually below the QR.
  //
  // Payload format: `https://<ip>:<port>/?pair=<base64url(token)>`. When
  // scanned with a phone camera, the OS opens the URL; the browser
  // shows a one-time cert warning, the user taps "Proceed Anyway",
  // then the PWA loads from the host (same-origin, no mixed-content)
  // and reads `?pair=` to auto-pair.
  const qrPayload = useMemo(() => {
    if (!status?.token || hostUrls.length === 0) return '';
    return buildPairUrl(hostUrls[0], status.token, '/');
  }, [hostUrls, status?.token]);

  const [qrSvg, setQrSvg] = useState<string>('');
  useEffect(() => {
    if (!qrPayload) {
      setQrSvg('');
      return;
    }
    // `qrcode` returns a Promise — generate the SVG asynchronously so a
    // huge URL doesn't block the main thread. We render the result as
    // raw HTML (`dangerouslySetInnerHTML`) because qrcode's output is a
    // static SVG string with no JS — safe to inline.
    let cancelled = false;
    QRCode.toString(qrPayload, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 220,
      color: { dark: '#0f172a', light: '#ffffff' },
    })
      .then((svg) => {
        if (!cancelled) setQrSvg(svg);
      })
      .catch(() => {
        if (!cancelled) setQrSvg('');
      });
    return () => {
      cancelled = true;
    };
  }, [qrPayload]);

  return (
    <CollapsibleCard
      id="sync"
      title="Multi-device sync (no cloud)"
      defaultOpen={false}
      badge={status?.running ? 'Running' : status?.enabled ? 'Stopped' : undefined}
    >
      <p className="muted">
        Keep two devices on the same Wi-Fi in sync without any cloud server. The desktop app
        runs a tiny <strong>HTTPS</strong> server protected by a one-time token; another device
        (a second desktop, or the PWA on your phone) pulls or pushes a snapshot directly over
        the LAN. The TLS certificate is generated by your computer and never leaves it — so the
        first time a phone connects you'll see a "not private" warning and tap "Proceed"; that's
        normal and you only do it once per device. Nothing leaves your network.
      </p>

      {isElectronHost ? (
        <div className="card sync-host">
          <h3 style={{ margin: '0 0 8px' }}>This device as host</h3>
          {status ? (
            <>
              <p className="muted small">
                Status:{' '}
                <strong style={{ color: status.running ? 'var(--ok)' : 'var(--muted)' }}>
                  {status.running ? 'Running' : 'Stopped'}
                </strong>
                {status.port ? ` · port ${status.port}` : ''}
              </p>
              <div className="row" style={{ marginTop: 8 }}>
                {!status.enabled || !status.running ? (
                  <Button type="button" variant="primary" icon={<IcWifi size={17} />} onClick={enable} disabled={busy}>
                    Start sync server
                  </Button>
                ) : (
                  <Button type="button" variant="secondary" onClick={disable} disabled={busy}>
                    Stop sync server
                  </Button>
                )}
                <Button type="button" variant="ghost" onClick={rotate} disabled={busy || !status.enabled}>
                  Rotate token
                </Button>
              </div>
              {status.token ? (
                <div className="sync-host__details">
                  {qrSvg ? (
                    <div className="field sync-host__qr">
                      <span>Scan to pair a phone (same Wi-Fi)</span>
                      <div
                        className="sync-host__qr-canvas"
                        // qrcode lib output is a static SVG string with no
                        // scripts — safe to inline.
                        dangerouslySetInnerHTML={{ __html: qrSvg }}
                      />
                      <div className="sync-host__cert-note">
                        <strong>First time? You'll see a security warning. That's expected.</strong>
                        <p>
                          Cadence encrypts the LAN connection with a certificate generated by{' '}
                          <em>this</em> Mac/PC — no browser knows about it yet. On your phone, tap{' '}
                          <strong>Advanced → Visit Website / Proceed Anyway</strong> once. Your phone
                          will remember this device and never ask again.
                        </p>
                        {certFingerprintShort ? (
                          <p className="muted small" style={{ margin: '6px 0 0' }}>
                            Certificate fingerprint (SHA-256, first 8 bytes):{' '}
                            <code>{certFingerprintShort}</code>
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                  <div className="field">
                    <span>Pairing token</span>
                    <input className="input" readOnly value={status.token} onFocus={(e) => e.currentTarget.select()} />
                  </div>
                  {hostUrls.length > 0 ? (
                    <>
                      <div className="field">
                        <span>If the QR doesn't work — open this URL on the phone manually</span>
                        {hostUrls.map((u) => (
                          <div className="row" key={`pwa-${u}`} style={{ alignItems: 'stretch', gap: 6 }}>
                            <input
                              className="input"
                              readOnly
                              value={`${u}/`}
                              onFocus={(e) => e.currentTarget.select()}
                              style={{ flex: 1 }}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => {
                                if (typeof navigator !== 'undefined' && navigator.clipboard) {
                                  void navigator.clipboard.writeText(`${u}/`);
                                }
                              }}
                              title="Copy"
                            >
                              Copy
                            </Button>
                          </div>
                        ))}
                        <p className="muted small" style={{ marginTop: 6 }}>
                          The PWA is bundled on this port and served over HTTPS. The same cert
                          covers all listed interfaces — opening any one and tapping{' '}
                          <em>Advanced → Proceed</em> once teaches your phone to trust this device.
                        </p>
                      </div>
                      <div className="field">
                        <span>API base (for another desktop Cadence)</span>
                        {hostUrls.map((u) => (
                          <input
                            key={`api-${u}`}
                            className="input"
                            readOnly
                            value={u}
                            onFocus={(e) => e.currentTarget.select()}
                          />
                        ))}
                      </div>
                    </>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : (
            <p className="muted">Loading status…</p>
          )}
        </div>
      ) : null}

      <div className="card sync-client">
        <h3 style={{ margin: '0 0 8px' }}>
          {savedPair ? 'Paired with host' : 'Pair with another device'}
        </h3>

        {savedPair ? (
          <div className="sync-client__status" role="status">
            <span className="sync-client__dot sync-client__dot--ok" aria-hidden />
            <div className="sync-client__status-text">
              <strong>Connected</strong> to <code>{savedPair.url}</code>
              {savedPair.lastSyncedAt ? (
                <span className="muted small">
                  {' '}· last synced {formatRelativeSync(savedPair.lastSyncedAt)}
                </span>
              ) : (
                <span className="muted small"> · awaiting first sync</span>
              )}
              <div className="muted small" style={{ marginTop: 2 }}>
                Auto-syncs on launch, focus and every minute or so. Local edits push up first;
                remote changes pull down after.
              </div>
            </div>
            <Button type="button" variant="ghost" onClick={disconnect}>
              Disconnect
            </Button>
          </div>
        ) : (
          <p className="muted small" style={{ marginTop: 0 }}>
            On the host device, scan the QR code with your phone — or copy the URL and token below.
          </p>
        )}

        {isMixedContentBlocked ? (
          <div className="sync-warning" role="alert">
            <strong>Mixed-content block detected.</strong> This page is served over <code>https://</code> but the host
            is <code>http://</code>. Browsers refuse to fetch across that boundary — that's exactly the &quot;Pull
            failed&quot; you'd see otherwise.
            <p style={{ margin: '8px 0 0' }}>
              <strong>Fix:</strong> on the host (the desktop running Cadence), copy the LAN URL it shows under{' '}
              <em>This device as host → For mobile or PWA on this network</em> (e.g. <code>http://192.168.1.5:9787/</code>)
              and open <strong>that</strong> URL in your mobile browser. It loads the same Cadence PWA over plain
              HTTP from the host, so pairing then just works.
            </p>
          </div>
        ) : null}

        <form
          className="profile-form"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void pull();
          }}
        >
          <label className="field">
            <span>Host URL (e.g. http://192.168.1.5:9787)</span>
            <input
              className="input"
              type="url"
              placeholder="http://192.168.1.5:9787"
              value={pairUrl}
              onChange={(e) => setPairUrl(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
            {pairUrl && sanitizedHost && sanitizedHost !== pairUrl.trim().replace(/\/+$/, '') ? (
              <span className="muted small" style={{ marginTop: 4 }}>
                Will use: <code>{sanitizedHost}</code>
              </span>
            ) : null}
          </label>
          <label className="field">
            <span>Token</span>
            <input
              className="input"
              type="password"
              placeholder="Paste pairing token"
              value={pairToken}
              onChange={(e) => setPairToken(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </label>
          <div className="row" style={{ justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
            <Button type="button" variant="ghost" onClick={() => void testReach()} disabled={pairBusy}>
              Test reachability
            </Button>
            <Button type="button" variant="secondary" onClick={push} disabled={pairBusy}>
              Push to host
            </Button>
            <Button type="submit" variant="primary" disabled={pairBusy}>
              {pairBusy ? 'Working…' : 'Pull from host'}
            </Button>
          </div>
          {pairMsg ? (
            <p
              className={`form-msg small ${pairMsg.kind === 'ok' ? 'form-msg--ok' : pairMsg.kind === 'error' ? 'form-msg--err' : ''}`}
            >
              {pairMsg.text}
            </p>
          ) : null}
        </form>
      </div>

      <details className="muted" style={{ marginTop: 8 }}>
        <summary>Why no cloud / drive?</summary>
        <p style={{ marginTop: 8 }}>
          A real "no-cloud" cross-device sync needs a side channel. The options without a server are:
        </p>
        <ol>
          <li>
            <strong>Same-network HTTP</strong> (this section): the host runs a local server on
            your Wi-Fi and the second device fetches from it. No cloud, no drive — but both
            devices must be online together at sync time.
          </li>
          <li>
            <strong>Encrypted file export / import</strong>: ship the JSON via AirDrop / email
            attachment / USB. Manual but offline.
          </li>
          <li>
            <strong>WebRTC peer-to-peer</strong>: requires a tiny signalling rendezvous service,
            so it isn't truly server-free.
          </li>
        </ol>
        <p>
          Browsers block plain-HTTP requests from HTTPS pages, so for the PWA you'll either need
          to open it over <code>http://</code> on the local network or run the desktop app on
          both endpoints.
        </p>
      </details>
    </CollapsibleCard>
  );
}

/* ------------------------------------------------------------------ */
/* Cloud sync (Google Drive)                                          */
/* ------------------------------------------------------------------ */

/**
 * Cloud sync via Google Drive (end-to-end encrypted).
 *
 * Sits beside the LAN sync card. Both can be configured independently
 * — only one drives auto-sync at a time, picked by the user via the
 * radio toggle at the top of this card. LAN is faster on the same
 * Wi-Fi; Drive works anywhere with an internet connection and acts as
 * an off-site backup.
 *
 * Security model
 * ==============
 *
 * The browser uses Google's OAuth 2.0 popup flow (PKCE — no client
 * secret on disk). We request only the `drive.appdata` scope, so
 * Cadence cannot see anything else in the user's Drive and the
 * snapshot file is invisible in their Drive UI.
 *
 * Snapshots are passed through `snapshotCrypto.wrapSnapshot` before
 * upload using a "sync passphrase" the user sets the first time they
 * connect. The passphrase lives in `sessionStorage` (cleared on tab
 * close) so a quick "lock" is just closing the tab. Google sees an
 * AES-256-GCM blob — no plaintext anywhere on their servers.
 */
/**
 * One-screen "bring your own Google Cloud project" wizard.
 *
 * Why this exists
 * ===============
 *
 * The official Cadence build embeds a published Google OAuth client ID
 * at compile time and the end user clicks "Sign in with Google" without
 * ever seeing this card. But for users who installed Cadence from a
 * DMG / portable build that did NOT have a client ID baked in (e.g. a
 * forked / nightly build), the in-app "Sign in" button has nothing to
 * call. Forcing them to fork the repo, set an env var, and rebuild is
 * not a real product experience.
 *
 * Solution: this card lets the user paste their own Google Cloud OAuth
 * client ID into a field. We persist it to localStorage and
 * `getClientId()` picks it up at runtime — no rebuild, no env var.
 *
 * The form is also surfaced (as a sub-section, collapsed by default)
 * inside the connected-state UI so a user who wants to migrate from a
 * built-in client ID to their own self-hosted one can do that without
 * disconnecting first.
 */
function GDriveClientIdSetup({
  onSaved,
  defaultExpanded,
}: {
  onSaved?: () => void;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState<boolean>(!!defaultExpanded);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [source, setSource] = useState<ClientIdSource>(() => getClientIdSource());

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const result = setRuntimeClientId(value);
    setBusy(false);
    if (result.ok) {
      setSource(getClientIdSource());
      setMsg({
        kind: 'ok',
        text: 'Client ID saved. You can now click "Sign in with Google" below to connect.',
      });
      setValue('');
      onSaved?.();
    } else {
      setMsg({ kind: 'error', text: result.reason });
    }
  };

  const handleClear = () => {
    setRuntimeClientId(null);
    setSource(getClientIdSource());
    setMsg({ kind: 'ok', text: 'Custom client ID cleared.' });
    onSaved?.();
  };

  return (
    <div>
      <p style={{ margin: 0 }}>
        Google Drive sync is <strong>end-to-end encrypted</strong> — your snapshot is wrapped
        with AES-256-GCM (key derived from your passphrase) before it ever leaves this device.
        Google sees opaque bytes only.
      </p>

      <p className="muted" style={{ marginTop: 10 }}>
        This build of Cadence does not ship with a Google OAuth client ID, so you need to
        connect Cadence to your own Google Cloud project before signing in. It is free, takes
        about 5 minutes, and the project stays under your account.
      </p>

      <ol className="muted" style={{ marginTop: 10, paddingLeft: 22, lineHeight: 1.6 }}>
        <li>
          Open the{' '}
          <a
            href="https://console.cloud.google.com/projectcreate"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google Cloud Console
          </a>{' '}
          and create a project (any name).
        </li>
        <li>
          In <strong>APIs &amp; Services → Library</strong>, enable{' '}
          <strong>Google Drive API</strong>.
        </li>
        <li>
          In <strong>APIs &amp; Services → OAuth consent screen</strong>, choose{' '}
          <strong>External</strong>, fill the required fields (app name + your email is
          enough), and add yourself as a <strong>Test user</strong>.
        </li>
        <li>
          In <strong>APIs &amp; Services → Credentials</strong>, create an{' '}
          <strong>OAuth Client ID</strong> with type{' '}
          <em>Web application</em> (works for both desktop &amp; PWA). Add{' '}
          <code>{typeof window !== 'undefined' ? window.location.origin : ''}</code> to{' '}
          <em>Authorized JavaScript origins</em> and the same URL plus{' '}
          <code>?oauth=google</code> to <em>Authorized redirect URIs</em>.
        </li>
        <li>
          Copy the resulting client ID (it ends with{' '}
          <code>.apps.googleusercontent.com</code>) into the field below.
        </li>
      </ol>

      {!expanded ? (
        <div className="row" style={{ marginTop: 12 }}>
          <Button type="button" variant="primary" onClick={() => setExpanded(true)}>
            I have my client ID — paste it here
          </Button>
          <a
            href="https://github.com/sercancelenk/cadence/blob/main/README.md#cloud-sync-google-drive-end-to-end-encrypted"
            target="_blank"
            rel="noopener noreferrer"
            style={{ marginLeft: 'auto', alignSelf: 'center' }}
          >
            Full setup guide
          </a>
        </div>
      ) : (
        <form onSubmit={handleSave} style={{ marginTop: 12 }}>
          <label className="muted small" style={{ display: 'block', marginBottom: 6 }}>
            Your Google OAuth Client ID
          </label>
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="123456789-abcdef.apps.googleusercontent.com"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            style={{ width: '100%', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
            disabled={busy}
          />
          <div className="row" style={{ marginTop: 10 }}>
            <Button type="submit" variant="primary" disabled={busy || !value.trim()}>
              Save client ID
            </Button>
            <Button type="button" variant="ghost" onClick={() => setExpanded(false)} disabled={busy}>
              Cancel
            </Button>
            {source === 'runtime' ? (
              <Button type="button" variant="ghost" onClick={handleClear} disabled={busy}>
                Clear saved ID
              </Button>
            ) : null}
          </div>
        </form>
      )}

      {msg ? (
        <p className={`muted small ${msg.kind === 'error' ? 'text-danger' : ''}`} style={{ marginTop: 8 }}>
          {msg.text}
        </p>
      ) : null}

      {source === 'runtime' ? (
        <p className="muted small" style={{ marginTop: 12 }}>
          Currently using a <strong>user-supplied</strong> client ID. Cadence will use it for
          every Drive sign-in on this device.
        </p>
      ) : null}
    </div>
  );
}

function CloudSyncSection() {
  const { data, replaceAll } = useAppData();

  const [tokens, setTokens] = useState<OAuthTokens | null>(() => loadStoredTokens());
  const [activeId, setActiveId] = useState<SyncBackendId | null>(() => getActiveBackendId());
  const [hasPassphrase, setHasPassphrase] = useState<boolean>(() => hasSyncPassphrase());
  // The last conflict etag returned by Drive — drives the "Resolve
  // conflict" inline UI. Cleared on successful resolution.
  const [conflictEtag, setConflictEtag] = useState<string | null>(null);
  // Most recent background sync event (success or error). Surfaces
  // failures the user wouldn't otherwise see because auto-sync is
  // silent by design.
  const [lastEvent, setLastEvent] = useState<SyncEvent | null>(() => getLastSyncEvent());

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'info' | 'error'; text: string } | null>(null);

  // Passphrase form state. We keep three fields so we can branch the
  // UI between "first-time set" (two confirm inputs) and "unlock"
  // (single input).
  const [ppNew1, setPpNew1] = useState('');
  const [ppNew2, setPpNew2] = useState('');
  const [ppUnlock, setPpUnlock] = useState('');
  const [showSetup, setShowSetup] = useState(false);

  // Re-render whenever the backend selection changes (could be flipped
  // from elsewhere, e.g. the user re-pairs LAN).
  useEffect(() => {
    return subscribeActiveBackend(() => setActiveId(getActiveBackendId()));
  }, []);
  // Same for the passphrase — kept in sessionStorage so other tabs
  // might toggle it.
  useEffect(() => {
    return subscribeSyncPassphrase(() => setHasPassphrase(hasSyncPassphrase()));
  }, []);
  // Subscribe to background sync outcomes so "Drive token expired"
  // and similar errors don't sit silently in the void.
  useEffect(() => {
    return subscribeSyncEvents((event) => setLastEvent(event));
  }, []);
  // If Drive auto-pull says the passphrase doesn't open the remote
  // snapshot, automatically lock so the unlock form re-appears with a
  // clear explanation. (B3 — smart recovery.)
  useEffect(() => {
    if (
      lastEvent?.backendId === 'gdrive' &&
      lastEvent.kind === 'error' &&
      lastEvent.code === 'wrong-password'
    ) {
      clearSyncPassphrase();
    }
  }, [lastEvent]);

  // Tracked as state (rather than recomputed each render) because the
  // runtime-client-ID setup flow can flip this from false → true while
  // CloudSyncSection is mounted. Bumped by GDriveClientIdSetup via the
  // onSaved callback below.
  const [clientReady, setClientReady] = useState<boolean>(() => isClientConfigured());

  const handleConnect = async () => {
    setBusy(true);
    setMsg(null);
    const result = await beginAuth();
    setBusy(false);
    if (result.ok) {
      setTokens(result.tokens);
      setActiveBackendId('gdrive');
      setMsg({
        kind: 'ok',
        text: `Signed in${result.tokens.email ? ` as ${result.tokens.email}` : ''}. Set a sync passphrase below to start syncing.`,
      });
    } else {
      setMsg({ kind: 'error', text: describeAuthError(result.reason, result.detail) });
    }
  };

  const handleDisconnect = async () => {
    if (
      !window.confirm(
        'Sign out of Google Drive on this device? Your encrypted snapshot stays on Drive — you can sign back in later to restore it.',
      )
    )
      return;
    setBusy(true);
    await signOut();
    disconnectGDrive();
    if (getActiveBackendId() === 'gdrive') setActiveBackendId(null);
    setTokens(null);
    setBusy(false);
    setMsg({ kind: 'info', text: 'Signed out of Google Drive.' });
  };

  const handleSetPassphrase = (e: FormEvent) => {
    e.preventDefault();
    if (ppNew1.length < 8) {
      setMsg({ kind: 'error', text: 'Sync passphrase must be at least 8 characters.' });
      return;
    }
    if (ppNew1 !== ppNew2) {
      setMsg({ kind: 'error', text: 'The two passphrases do not match.' });
      return;
    }
    setSyncPassphrase(ppNew1);
    setPpNew1('');
    setPpNew2('');
    setShowSetup(false);
    setMsg({
      kind: 'ok',
      text: 'Sync passphrase set. Background sync will start within a minute.',
    });
  };

  const handleUnlock = (e: FormEvent) => {
    e.preventDefault();
    if (!ppUnlock) return;
    setSyncPassphrase(ppUnlock);
    setPpUnlock('');
    setMsg({ kind: 'ok', text: 'Sync passphrase unlocked for this session.' });
  };

  const handleLock = () => {
    clearSyncPassphrase();
    setMsg({ kind: 'info', text: 'Sync passphrase cleared from this tab.' });
  };

  // Manual push/pull lets the user force a sync round-trip without
  // waiting for the background scheduler. Useful for testing and for
  // "I just made an important edit, sync it now" moments.
  //
  // We update BOTH `etag` (remote concurrency token) and
  // `localFingerprint` (content hash) on every successful round-trip
  // so the next auto-sync sees a consistent baseline. Otherwise the
  // background hook would re-pull immediately because its dirty
  // check expects a fingerprint we haven't recorded.
  const runManualSync = async (mode: 'push' | 'pull' | 'push-force') => {
    setBusy(true);
    setMsg(null);
    try {
      const backend = createGDriveBackend();
      if (!backend) {
        setMsg({ kind: 'error', text: 'Drive is not connected. Sign in first.' });
        return;
      }
      const record = backend.getRecord();
      if (mode === 'push' || mode === 'push-force') {
        // `push-force` skips the If-Match header so the upload always
        // wins — used by the conflict UI's "Override remote" button.
        const ifMatch = mode === 'push-force' ? undefined : record?.etag;
        const out = await backend.push(data, ifMatch);
        if (out.kind === 'ok') {
          const fp = await computeLocalEtag(data);
          backend.setRecord({
            etag: out.etag,
            localFingerprint: fp,
            lastSyncedAt: new Date().toISOString(),
          });
          setMsg({
            kind: 'ok',
            text:
              mode === 'push-force'
                ? 'Override pushed — your local snapshot is now the Drive copy.'
                : 'Encrypted snapshot pushed to Drive.',
          });
          setConflictEtag(null);
        } else if (out.kind === 'conflict') {
          setConflictEtag(out.currentEtag ?? null);
          setMsg({
            kind: 'error',
            text:
              'Conflict: someone else pushed since your last pull. Choose how to resolve below.',
          });
        } else {
          setMsg({ kind: 'error', text: describePushOutcome(out) });
        }
      } else {
        const out = await backend.pull(record?.etag);
        if (out.kind === 'ok') {
          const parsed = parseRemoteSnapshot(out.data);
          if (parsed.kind !== 'ok') {
            setMsg({
              kind: 'error',
              text:
                'Drive returned a snapshot with an unrecognised shape — refusing to overwrite local data.',
            });
            return;
          }
          replaceAll(parsed.data);
          const fp = await computeLocalEtag(parsed.data);
          backend.setRecord({
            etag: out.etag,
            localFingerprint: fp,
            lastSyncedAt: new Date().toISOString(),
          });
          setMsg({ kind: 'ok', text: 'Pulled encrypted snapshot from Drive.' });
          setConflictEtag(null);
        } else if (out.kind === 'not-modified') {
          backend.setRecord({
            etag: record?.etag,
            localFingerprint: record?.localFingerprint,
            lastSyncedAt: new Date().toISOString(),
          });
          setMsg({ kind: 'info', text: 'Drive copy matches local — nothing to pull.' });
        } else if (out.kind === 'no-snapshot') {
          setMsg({
            kind: 'info',
            text: 'No snapshot on Drive yet. Push to create one.',
          });
        } else if (out.kind === 'wrong-password') {
          // Smart recovery (B3): clear the stale passphrase so the
          // user doesn't have to remember to "Lock" before re-entering
          // the right one.
          clearSyncPassphrase();
          setMsg({
            kind: 'error',
            text:
              'Sync passphrase does not open the Drive snapshot. Enter the passphrase you used when first connecting Drive.',
          });
        } else {
          setMsg({ kind: 'error', text: describePullOutcome(out) });
        }
      }
    } finally {
      setBusy(false);
    }
  };

  // Render — branching by configuration state so the user always sees
  // the most relevant call to action first.
  if (!clientReady) {
    return (
      <CollapsibleCard
        id="cloud-sync"
        title="Cloud sync (Google Drive)"
        defaultOpen={false}
        badge="Setup required"
      >
        <GDriveClientIdSetup
          onSaved={() => {
            setClientReady(isClientConfigured());
            setActiveId(getActiveBackendId());
          }}
        />
      </CollapsibleCard>
    );
  }

  return (
    <CollapsibleCard
      id="cloud-sync"
      title="Cloud sync (Google Drive)"
      defaultOpen={false}
      badge={tokens ? (activeId === 'gdrive' ? 'Active' : 'Connected') : undefined}
    >
      <p className="muted">
        End-to-end encrypted backup to your own Google Drive. Cadence wraps your snapshot
        with AES-256-GCM (PBKDF2-derived key) <strong>before</strong> it leaves the device —
        Google sees opaque ciphertext only. The snapshot lives in Drive&apos;s hidden{' '}
        <code>appData</code> folder, so it does not clutter your file list and survives a
        reinstall.
      </p>

      {!tokens ? (
        <div className="row" style={{ marginTop: 10 }}>
          <Button type="button" variant="primary" onClick={handleConnect} disabled={busy}>
            Sign in with Google
          </Button>
        </div>
      ) : (
        <>
          <div className="card" style={{ marginTop: 10 }}>
            <p style={{ margin: 0 }}>
              Signed in: <strong>{tokens.email || 'Google account'}</strong>
            </p>
            <p className="muted small" style={{ margin: '6px 0 10px' }}>
              Drive scope: <code>drive.appdata</code> (single hidden folder, no other access).
            </p>
            <Button type="button" variant="ghost" onClick={handleDisconnect} disabled={busy}>
              Sign out
            </Button>
          </div>

          {hasPassphrase ? (
            <div className="card" style={{ marginTop: 10 }}>
              <p style={{ margin: 0 }}>
                Sync passphrase: <strong style={{ color: 'var(--ok)' }}>Unlocked this session</strong>
              </p>
              <p className="muted small" style={{ margin: '6px 0 10px' }}>
                Closing this tab clears it. You&apos;ll re-enter it next time.
              </p>
              <Button type="button" variant="ghost" onClick={handleLock} icon={<IcLock size={16} />}>
                Lock now
              </Button>
            </div>
          ) : showSetup ? (
            <form className="card" style={{ marginTop: 10 }} onSubmit={handleSetPassphrase}>
              <p style={{ margin: '0 0 8px' }}>Set a sync passphrase</p>
              <p className="muted small" style={{ margin: '0 0 10px' }}>
                This passphrase encrypts everything before upload. If you lose it, the
                snapshot on Drive becomes unrecoverable — there is no reset.
              </p>
              <div className="col" style={{ gap: 8 }}>
                <input
                  type="password"
                  className="input"
                  placeholder="Passphrase (8+ characters)"
                  value={ppNew1}
                  onChange={(e) => setPpNew1(e.target.value)}
                  autoFocus
                />
                <input
                  type="password"
                  className="input"
                  placeholder="Confirm passphrase"
                  value={ppNew2}
                  onChange={(e) => setPpNew2(e.target.value)}
                />
              </div>
              <div className="row" style={{ marginTop: 10 }}>
                <Button type="submit" variant="primary">
                  Set passphrase
                </Button>
                <Button type="button" variant="ghost" onClick={() => setShowSetup(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <form className="card" style={{ marginTop: 10 }} onSubmit={handleUnlock}>
              <p style={{ margin: '0 0 8px' }}>Unlock sync passphrase</p>
              <p className="muted small" style={{ margin: '0 0 10px' }}>
                Enter the passphrase you set when first connecting Drive. New device? Use{' '}
                <em>First-time setup</em> below.
              </p>
              <input
                type="password"
                className="input"
                placeholder="Sync passphrase"
                value={ppUnlock}
                onChange={(e) => setPpUnlock(e.target.value)}
              />
              <div className="row" style={{ marginTop: 10 }}>
                <Button type="submit" variant="primary" disabled={!ppUnlock}>
                  Unlock
                </Button>
                <Button type="button" variant="ghost" onClick={() => setShowSetup(true)}>
                  First-time setup
                </Button>
              </div>
            </form>
          )}

          <div className="card" style={{ marginTop: 10 }}>
            <p style={{ margin: '0 0 8px' }}>Auto-sync provider</p>
            <p className="muted small" style={{ margin: '0 0 10px' }}>
              Only one provider drives background sync at a time. Switch any time.
              Greyed-out options need to be configured first.
            </p>
            <div className="col" style={{ gap: 6 }}>
              {(() => {
                const driveReady = !!tokens;
                const lanReady = !!loadPair();
                return (
                  <>
                    <label
                      style={{
                        display: 'flex',
                        gap: 8,
                        alignItems: 'center',
                        opacity: driveReady ? 1 : 0.55,
                        cursor: driveReady ? 'pointer' : 'not-allowed',
                      }}
                      title={driveReady ? 'Use Google Drive for background sync' : 'Sign in to Google Drive first'}
                    >
                      <input
                        type="radio"
                        name="active-sync-backend"
                        checked={activeId === 'gdrive'}
                        onChange={() => setActiveBackendId('gdrive')}
                        disabled={!driveReady}
                      />
                      <span>
                        Google Drive (encrypted, anywhere)
                        {!driveReady ? <em className="muted small"> — sign in first</em> : null}
                      </span>
                    </label>
                    <label
                      style={{
                        display: 'flex',
                        gap: 8,
                        alignItems: 'center',
                        opacity: lanReady ? 1 : 0.55,
                        cursor: lanReady ? 'pointer' : 'not-allowed',
                      }}
                      title={lanReady ? 'Use the paired LAN host for background sync' : 'Pair a host in the Multi-device sync card above'}
                    >
                      <input
                        type="radio"
                        name="active-sync-backend"
                        checked={activeId === 'lan'}
                        onChange={() => setActiveBackendId('lan')}
                        disabled={!lanReady}
                      />
                      <span>
                        LAN host (fast, same Wi-Fi)
                        {!lanReady ? <em className="muted small"> — pair a host first</em> : null}
                      </span>
                    </label>
                    <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        type="radio"
                        name="active-sync-backend"
                        checked={activeId === null}
                        onChange={() => setActiveBackendId(null)}
                      />
                      <span>Off (no background sync)</span>
                    </label>
                  </>
                );
              })()}
            </div>
          </div>

          <div className="row" style={{ marginTop: 10 }}>
            <Button
              type="button"
              variant="secondary"
              icon={<IcUpload size={16} />}
              onClick={() => runManualSync('push')}
              disabled={busy || !hasPassphrase}
              title={!hasPassphrase ? 'Unlock the sync passphrase first' : 'Push now'}
            >
              Push now
            </Button>
            <Button
              type="button"
              variant="secondary"
              icon={<IcDownload size={16} />}
              onClick={() => runManualSync('pull')}
              disabled={busy || !hasPassphrase}
              title={!hasPassphrase ? 'Unlock the sync passphrase first' : 'Pull now'}
            >
              Pull now
            </Button>
          </div>

          {conflictEtag ? (
            <div
              className="card"
              role="alert"
              style={{
                marginTop: 10,
                borderColor: 'var(--err)',
                background: 'color-mix(in oklab, var(--err) 10%, transparent)',
              }}
            >
              <p style={{ margin: '0 0 8px', color: 'var(--err)' }}>
                <strong>Conflict</strong>: another device pushed to Drive after your last
                pull. Pick how to resolve:
              </p>
              <ul className="muted small" style={{ margin: '0 0 10px', paddingLeft: 18 }}>
                <li>
                  <strong>Pull first</strong>: download the newer Drive copy onto this
                  device, losing whatever you edited locally since the last sync.
                </li>
                <li>
                  <strong>Override remote</strong>: overwrite Drive with your local copy.
                  Other devices will pick up your version on their next sync.
                </li>
              </ul>
              <div className="row">
                <Button
                  type="button"
                  variant="secondary"
                  icon={<IcDownload size={16} />}
                  onClick={() => runManualSync('pull')}
                  disabled={busy}
                >
                  Pull first
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  icon={<IcUpload size={16} />}
                  onClick={() => {
                    if (
                      window.confirm(
                        'Override the Drive copy with your local snapshot? Other devices will see your version on next sync.',
                      )
                    ) {
                      void runManualSync('push-force');
                    }
                  }}
                  disabled={busy}
                >
                  Override remote
                </Button>
                <Button type="button" variant="ghost" onClick={() => setConflictEtag(null)}>
                  Dismiss
                </Button>
              </div>
            </div>
          ) : null}

          {lastEvent && lastEvent.backendId === 'gdrive' && lastEvent.kind === 'error' ? (
            <p
              className="muted small"
              role="status"
              style={{ marginTop: 10, color: 'var(--err)' }}
            >
              Last background sync: {lastEvent.text}
            </p>
          ) : null}
        </>
      )}

      {msg ? (
        <p
          className="muted small"
          role="status"
          style={{
            marginTop: 10,
            color:
              msg.kind === 'error' ? 'var(--err)' : msg.kind === 'ok' ? 'var(--ok)' : undefined,
          }}
        >
          {msg.text}
        </p>
      ) : null}
    </CollapsibleCard>
  );
}

function describeAuthError(reason: AuthFailureReason, detail?: string): string {
  switch (reason) {
    case 'no-client-id':
      return detail ?? 'OAuth client ID not configured. See README → Cloud sync setup.';
    case 'popup-blocked':
      return 'Your browser blocked the consent popup. Allow popups for this site and try again.';
    case 'user-cancelled':
      return 'Sign-in cancelled.';
    case 'electron-unsupported':
      return detail ?? 'Drive sync currently requires the browser PWA.';
    case 'network-error':
      return `Network error during sign-in${detail ? ` (${detail})` : ''}.`;
    case 'token-exchange-failed':
      return `Google rejected the sign-in${detail ? `: ${detail}` : ''}.`;
    default:
      return detail ?? 'Unexpected error during sign-in.';
  }
}

function describePullOutcome(
  outcome: Exclude<
    Awaited<ReturnType<NonNullable<ReturnType<typeof createGDriveBackend>>['pull']>>,
    { kind: 'ok' } | { kind: 'not-modified' } | { kind: 'no-snapshot' } | { kind: 'wrong-password' }
  >,
): string {
  switch (outcome.kind) {
    case 'auth-required':
      return 'Google session expired. Sign out and back in.';
    case 'unsupported-version':
      return 'Drive holds a snapshot from a newer Cadence build. Update this device first.';
    case 'mixed-content':
      return 'This page is HTTPS but the chosen sync host is HTTP. Use HTTPS.';
    case 'timeout':
      return 'Drive request timed out. Check your connection.';
    case 'http-error':
      return `Drive returned HTTP ${outcome.status}${outcome.message ? `: ${outcome.message}` : ''}.`;
    case 'network-error':
      return `Network error: ${outcome.message}`;
  }
}

function describePushOutcome(
  outcome: Exclude<
    Awaited<ReturnType<NonNullable<ReturnType<typeof createGDriveBackend>>['push']>>,
    { kind: 'ok' } | { kind: 'conflict' }
  >,
): string {
  switch (outcome.kind) {
    case 'auth-required':
      return 'Google session expired. Sign out and back in.';
    case 'too-large':
      return 'Snapshot is too large to upload. Trim attachments and try again.';
    case 'mixed-content':
      return 'This page is HTTPS but the chosen sync host is HTTP. Use HTTPS.';
    case 'timeout':
      return 'Drive request timed out. Check your connection.';
    case 'http-error':
      return `Drive returned HTTP ${outcome.status}${outcome.message ? `: ${outcome.message}` : ''}.`;
    case 'network-error':
      return `Network error: ${outcome.message}`;
  }
}

type UpdaterPhase =
  | { kind: 'checking' }
  | { kind: 'available'; version?: string }
  | { kind: 'downloading'; percent: number; transferred: number; total: number }
  | { kind: 'downloaded'; version?: string }
  | { kind: 'not-available'; version?: string }
  | { kind: 'dev' }
  | { kind: 'unsupported' }
  | { kind: 'error'; message?: string };

function UpdaterDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [phase, setPhase] = useState<UpdaterPhase>({ kind: 'checking' });
  const [installing, setInstalling] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    const api = window.cadence;
    if (!api?.onUpdaterEvent || !api?.checkForUpdates) {
      setPhase({ kind: 'unsupported' });
      return;
    }
    setPhase({ kind: 'checking' });
    setInstalling(false);

    const off = api.onUpdaterEvent((e) => {
      switch (e.status) {
        case 'checking':
          setPhase({ kind: 'checking' });
          break;
        case 'available':
          setPhase({ kind: 'available', version: e.version });
          break;
        case 'downloading':
          setPhase({
            kind: 'downloading',
            percent: e.percent,
            transferred: e.transferred,
            total: e.total,
          });
          break;
        case 'downloaded':
          setPhase({ kind: 'downloaded', version: e.version });
          break;
        case 'not-available':
          setPhase({ kind: 'not-available', version: e.version });
          break;
        case 'error':
          setPhase({ kind: 'error', message: e.message });
          break;
      }
    });

    void (async () => {
      const r = await api.checkForUpdates?.();
      if (r && !r.ok) {
        if (r.reason === 'dev') setPhase({ kind: 'dev' });
        else setPhase({ kind: 'error', message: r.error || 'Update check failed.' });
      }
    })();

    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      off?.();
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const installNow = async () => {
    setInstalling(true);
    const r = await window.cadence?.installUpdate?.();
    if (!r?.ok) {
      setInstalling(false);
      toast.showError('Could not install the update', r?.error);
    }
  };

  return (
    <div className="updater-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="updater-dialog" onClick={(e) => e.stopPropagation()}>
        <h3 className="updater-dialog__title">App update</h3>

        {phase.kind === 'checking' && (
          <p className="muted">Checking GitHub Releases for a newer version…</p>
        )}

        {phase.kind === 'available' && (
          <>
            <p>
              A newer version
              {phase.version ? <> (<strong>v{phase.version}</strong>)</> : ''} is available.
              Downloading now…
            </p>
            <div className="progress" style={{ width: '100%' }}>
              <div className="progress__bar" style={{ width: '6%' }} />
            </div>
          </>
        )}

        {phase.kind === 'downloading' && (
          <>
            <p>Downloading the update…</p>
            <div className="progress" style={{ width: '100%' }}>
              <div className="progress__bar" style={{ width: `${Math.max(2, Math.round(phase.percent))}%` }} />
            </div>
            <p className="muted small" style={{ marginTop: 8 }}>
              {Math.round(phase.percent)}%
              {phase.total > 0
                ? ` · ${(phase.transferred / 1024 / 1024).toFixed(1)} / ${(phase.total / 1024 / 1024).toFixed(1)} MB`
                : ''}
            </p>
          </>
        )}

        {phase.kind === 'downloaded' && (
          <>
            <p>
              Update{phase.version ? <> <strong>v{phase.version}</strong></> : ''} is ready to install.
            </p>
            <p className="muted small">
              The app will quit, swap in the new version, and relaunch automatically.
            </p>
            <div className="updater-dialog__actions">
              <Button type="button" variant="secondary" onClick={onClose} disabled={installing}>Later</Button>
              <Button type="button" variant="primary" onClick={installNow} disabled={installing}>
                {installing ? 'Installing…' : 'Install & restart'}
              </Button>
            </div>
          </>
        )}

        {phase.kind === 'not-available' && (
          <>
            <p>
              You're on the latest version
              {phase.version ? <> (<strong>v{phase.version}</strong>)</> : ''}.
            </p>
            <div className="updater-dialog__actions">
              <Button type="button" variant="primary" onClick={onClose}>OK</Button>
            </div>
          </>
        )}

        {phase.kind === 'dev' && (
          <>
            <p>Update checks are disabled in development mode.</p>
            <p className="muted small">
              Run a packaged build to receive auto-updates from GitHub Releases.
            </p>
            <div className="updater-dialog__actions">
              <Button type="button" variant="primary" onClick={onClose}>OK</Button>
            </div>
          </>
        )}

        {phase.kind === 'unsupported' && (
          <>
            <p>Auto-updates are only available in the packaged desktop app.</p>
            <div className="updater-dialog__actions">
              <Button type="button" variant="primary" onClick={onClose}>OK</Button>
            </div>
          </>
        )}

        {phase.kind === 'error' && (
          <>
            <p>Something went wrong while checking for updates.</p>
            {phase.message ? (
              <pre className="pre" style={{ whiteSpace: 'pre-wrap', maxHeight: 160, overflow: 'auto' }}>{phase.message}</pre>
            ) : null}
            <div className="updater-dialog__actions">
              <Button type="button" variant="primary" onClick={onClose}>Close</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Bring-your-own-key AI settings. The key lives in AppData (encrypted at rest
 * in Electron, plaintext in PWA localStorage — we say so explicitly). All API
 * calls run from the renderer; we never proxy through any of our own servers.
 */
function AISettingsSection() {
  const { data, updateAISettings } = useAppData();
  const ai = data.aiSettings;
  const [provider, setProvider] = useState<AIProvider | ''>(ai?.provider ?? '');
  const [apiKey, setApiKey] = useState(ai?.apiKey ?? '');
  const [model, setModel] = useState(ai?.model ?? '');
  const [showKey, setShowKey] = useState(false);
  const [savedAt, setSavedAt] = useState<string>('');
  const [testStatus, setTestStatus] = useState<{ kind: 'idle' | 'running' | 'ok' | 'error'; message?: string }>({
    kind: 'idle',
  });

  // Re-sync local state when the underlying AppData changes (e.g. after replaceAll on import).
  useEffect(() => {
    setProvider(ai?.provider ?? '');
    setApiKey(ai?.apiKey ?? '');
    setModel(ai?.model ?? '');
  }, [ai?.provider, ai?.apiKey, ai?.model]);

  const placeholderModel = useMemo(() => (provider ? defaultModel(provider) : ''), [provider]);
  const modelExamples = useMemo(
    () => (provider ? AI_PROVIDER_OPTIONS.find((p) => p.value === provider)?.modelExamples ?? [] : []),
    [provider],
  );
  // Gemini 1.x was retired from v1beta in late 2025; surface a one-click fix
  // for users who still have the old name saved.
  const modelIsRetiredGemini = provider === 'gemini' && /^gemini-1\.[05]/i.test(model.trim());
  const dirty =
    (ai?.provider ?? '') !== provider ||
    (ai?.apiKey ?? '') !== apiKey.trim() ||
    (ai?.model ?? '') !== model.trim();
  const canSave = !!provider && apiKey.trim().length >= 8;

  const save = () => {
    updateAISettings({
      provider: (provider || undefined) as AIProvider | undefined,
      apiKey: apiKey.trim(),
      model: model.trim(),
    });
    setSavedAt(new Date().toLocaleTimeString());
    setTestStatus({ kind: 'idle' });
  };

  const remove = () => {
    if (!window.confirm('Remove the stored API key from this device?')) return;
    updateAISettings({ provider: undefined, apiKey: '', model: '', systemPrompt: '' });
    setProvider('');
    setApiKey('');
    setModel('');
    setSavedAt('');
    setTestStatus({ kind: 'idle' });
  };

  const test = async () => {
    if (!provider || apiKey.trim().length < 8) return;
    setTestStatus({ kind: 'running' });
    try {
      const result = await askAI({
        settings: {
          provider: provider as AIProvider,
          apiKey: apiKey.trim(),
          model: model.trim(),
        },
        messages: [
          {
            role: 'user',
            content: 'Reply with the single word "ok" so I can confirm the connection works.',
          },
        ],
        maxOutputTokens: 32,
      });
      setTestStatus({
        kind: 'ok',
        message: `Connection works. Provider answered: "${result.text.replace(/\s+/g, ' ').slice(0, 80)}"`,
      });
    } catch (err) {
      const message = err instanceof AIError ? err.message : (err as Error)?.message ?? String(err);
      setTestStatus({ kind: 'error', message });
    }
  };

  const isDesktop = typeof window !== 'undefined' && !!window.cadence;

  return (
    <CollapsibleCard
      id="ai"
      title={
        <>
          <IcSparkles size={17} /> AI Assistant
        </>
      }
      defaultOpen={false}
      badge={ai?.apiKey ? `Configured · ${ai?.provider ?? ''}` : 'Not configured'}
    >
      <p className="muted">
        Each task gets an "Ask AI" button when you connect a provider here. The assistant uses your API key to suggest
        next steps for whatever you're working on. We never proxy these requests — they go straight from this device
        to the provider you choose.
      </p>
      <p className="muted small">
        {isDesktop
          ? 'Desktop build: your API key is stored inside the encrypted data file (AES-256-GCM, derived from your account password).'
          : 'Web build: your API key is stored in this browser only (localStorage, not encrypted). Use a low-budget key with usage limits.'}
      </p>

      <label className="field">
        <span>Provider</span>
        <select
          className="input"
          value={provider}
          onChange={(e) => setProvider(e.target.value as AIProvider | '')}
        >
          <option value="">— Disabled —</option>
          {AI_PROVIDER_OPTIONS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>API key</span>
        <div className="row" style={{ gap: 6 }}>
          <input
            className="input"
            type={showKey ? 'text' : 'password'}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="sk-…   /   AIza…"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            style={{ flex: 1 }}
          />
          <Button type="button" variant="ghost" onClick={() => setShowKey((v) => !v)}>
            {showKey ? 'Hide' : 'Show'}
          </Button>
        </div>
      </label>

      <label className="field">
        <span>Model {placeholderModel ? <em className="muted">(default: {placeholderModel})</em> : null}</span>
        <input
          className="input"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder={placeholderModel || 'Choose a provider first'}
          value={model}
          onChange={(e) => setModel(e.target.value)}
        />
        {modelExamples.length > 0 ? (
          <span className="muted small" style={{ marginTop: 4, display: 'block' }}>
            Suggested: {modelExamples.map((m, i) => (
              <span key={m}>
                <button
                  type="button"
                  className="auth-link auth-link--inline"
                  onClick={() => setModel(m)}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                >
                  {m}
                </button>
                {i < modelExamples.length - 1 ? ', ' : ''}
              </span>
            ))}
          </span>
        ) : null}
        {modelIsRetiredGemini ? (
          <span
            className="small"
            style={{
              marginTop: 6,
              display: 'block',
              padding: '6px 10px',
              borderRadius: 6,
              background: 'rgba(220, 38, 38, 0.08)',
              border: '1px solid var(--danger)',
              color: 'var(--text)',
            }}
          >
            Heads up: Gemini 1.x models were retired by Google in late 2025 and will return HTTP 404. Click{' '}
            <button
              type="button"
              className="auth-link auth-link--inline"
              onClick={() => setModel('gemini-2.0-flash')}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 600 }}
            >
              gemini-2.0-flash
            </button>{' '}
            to switch to the current GA model.
          </span>
        ) : null}
      </label>

      <div className="row" style={{ marginTop: 12, flexWrap: 'wrap' }}>
        <Button type="button" variant="primary" disabled={!canSave || !dirty} onClick={save}>
          Save
        </Button>
        <Button
          type="button"
          variant="secondary"
          icon={<IcRefresh size={16} />}
          disabled={!canSave || testStatus.kind === 'running'}
          onClick={test}
        >
          {testStatus.kind === 'running' ? 'Testing…' : 'Test connection'}
        </Button>
        {ai?.apiKey ? (
          <Button type="button" variant="ghost" icon={<IcTrash size={16} />} onClick={remove}>
            Remove key
          </Button>
        ) : null}
        {savedAt ? <span className="muted small">Saved at {savedAt}</span> : null}
      </div>

      {testStatus.kind === 'ok' && testStatus.message ? (
        <p className="muted small" style={{ marginTop: 8, color: 'var(--ok, #6cf38d)' }}>
          {testStatus.message}
        </p>
      ) : null}
      {testStatus.kind === 'error' && testStatus.message ? (
        <pre
          className="pre"
          style={{
            marginTop: 8,
            padding: 8,
            borderRadius: 8,
            background: 'rgba(255,99,99,0.12)',
            color: '#ff8d8d',
            whiteSpace: 'pre-wrap',
            maxHeight: 160,
            overflow: 'auto',
          }}
        >
          {testStatus.message}
        </pre>
      ) : null}
    </CollapsibleCard>
  );
}

// ---------- Backups & Recovery -----------------------------------------------
//
// Lists every place on disk where the user's data might still be (live file,
// rolling backups, legacy single-user file, orphaned per-user files from a
// previous account UUID). Lets the user preview a candidate and restore it
// into the live file. Every restore takes a "pre-restore" snapshot of the
// current state so the operation is itself undoable.

function BackupsRecoverySection() {
  const { reload } = useAppData();
  const isElectron = typeof window !== 'undefined' && !!window.cadence?.dataListSources;
  const [sources, setSources] = useState<DataSources | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [saveError, setSaveError] = useState<SaveError | null>(null);

  const refresh = async () => {
    if (!isElectron) return;
    setBusy(true);
    try {
      const r = await window.cadence!.dataListSources!();
      setSources(r);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void refresh();
    if (!window.cadence?.onSaveError) return;
    const off = window.cadence.onSaveError((e) => setSaveError(e));
    return off;
  }, []);

  if (!isElectron) {
    return (
      <CollapsibleCard id="backups" title="Backups & recovery" defaultOpen={false}>
        <p className="muted">
          This panel is only available in the desktop app. In the browser preview, your data lives in the browser&apos;s
          local storage and is automatically cleared if you switch browsers or use private mode.
        </p>
      </CollapsibleCard>
    );
  }

  const restore = async (filePath: string, label: string) => {
    if (!window.confirm(`Restore data from "${label}"?\n\nYour current data will be snapshotted first so you can undo this.`)) {
      return;
    }
    setBusy(true);
    setMsg(null);
    // Capture the *target snapshot's* counts before we run the restore so
    // we can tell the user exactly what they'll see after reload. This
    // turns the previously silent "I clicked restore and nothing visibly
    // happened" into a concrete confirmation:
    //   "Restored: 3 teams, 12 tasks, 5 notes."
    const targetSnapshot = sources?.backups.find((b) => b.path === filePath)
      || (sources?.live?.path === filePath ? sources.live : null)
      || (sources?.legacy?.path === filePath ? sources.legacy : null)
      || sources?.otherUsers.find((o) => o.path === filePath)
      || null;
    const c = targetSnapshot?.counts;
    const restoredShapeText = c
      ? `${c.teams ?? 0} team${(c.teams ?? 0) === 1 ? '' : 's'}, ` +
        `${c.todoItems ?? 0} task${(c.todoItems ?? 0) === 1 ? '' : 's'}, ` +
        `${c.notes ?? 0} note${(c.notes ?? 0) === 1 ? '' : 's'}` +
        (c.todoGroupsArchived ? ` (${c.todoGroupsArchived} archived list${c.todoGroupsArchived === 1 ? '' : 's'})` : '')
      : '';
    try {
      const r = await window.cadence!.dataRestoreFromSource!({ filePath });
      if (r.ok) {
        // Successful restore means the file is now consistent with the
        // session — any earlier save error (e.g. "refusing to overwrite an
        // undecipherable file" banner left over from before the user
        // re-authenticated) is no longer relevant. Clear it so the user
        // doesn't see "error" + "success" stacked, which was the source
        // of the "uyarı çıktı ama data yüklemiş" confusion.
        setSaveError(null);
        const headline = `Restored from ${r.restoredFrom ?? label}.`;
        setMsg({
          kind: 'ok',
          text: restoredShapeText
            ? `${headline} Loaded: ${restoredShapeText}.`
            : `${headline} Reloading…`,
        });
        await reload();
        await refresh();
      } else {
        setMsg({ kind: 'error', text: r.error || 'Restore failed.' });
      }
    } catch (err) {
      setMsg({ kind: 'error', text: String(err) });
    } finally {
      setBusy(false);
    }
  };

  const openFolder = async () => {
    await window.cadence?.openUserDataFolder?.();
  };

  const totalSnapshots = sources?.backups.length ?? 0;

  return (
    <CollapsibleCard
      id="backups"
      title="Backups & recovery"
      defaultOpen={false}
      badge={sources ? `${totalSnapshots} snapshot${totalSnapshots === 1 ? '' : 's'}` : undefined}
    >
      <p className="muted small" style={{ marginBottom: 12 }}>
        Cadence snapshots your data file every time it saves, after every sign-in, and at app launch. If something looks
        wrong (e.g. your data appeared empty after an update), you can restore from any snapshot below — your <em>current</em>
        state is always backed up first, so this is reversible.
      </p>

      {saveError ? (
        <div
          style={{
            marginBottom: 12,
            padding: '10px 12px',
            border: '1px solid var(--danger)',
            background: 'rgba(220, 38, 38, 0.08)',
            borderRadius: 8,
            color: 'var(--text)',
          }}
        >
          <strong>Heads up:</strong> Cadence refused to overwrite your data file because it cannot be decrypted with the
          current session key. Your data is still on disk — pick a recent backup below and restore it.
          <div className="muted small" style={{ marginTop: 4 }}>
            Reason: {saveError.reason ?? 'unknown'}
            {saveError.error ? ` — ${saveError.error}` : ''}
          </div>
        </div>
      ) : null}

      <div className="row" style={{ marginBottom: 12 }}>
        <Button type="button" variant="secondary" icon={<IcRefresh size={16} />} onClick={refresh} disabled={busy}>
          Refresh
        </Button>
        <Button type="button" variant="ghost" onClick={openFolder}>
          Open data folder
        </Button>
      </div>

      {msg ? (
        <p
          className="small"
          style={{
            marginBottom: 12,
            color: msg.kind === 'ok' ? 'var(--ok)' : 'var(--danger)',
          }}
        >
          {msg.text}
        </p>
      ) : null}

      {sources ? (
        <>
          <DataSourceRow
            label="Current data file"
            sub="The live file the app reads from."
            info={sources.live}
            onRestore={null}
          />
          <DataSourceRow
            label="Legacy single-user file (leeadman-data.json — pre-rename)"
            sub="From the pre-accounts version (Leeadman). Restoring imports it into your current account."
            info={sources.legacy}
            onRestore={(f) => restore(f, 'legacy data file')}
          />

          {sources.backups.length > 0 ? (
            <>
              <h3 style={{ fontSize: 14, marginTop: 18, marginBottom: 8 }}>Automatic snapshots</h3>
              {sources.backups.map((b) => (
                <DataSourceRow
                  key={b.path}
                  info={b}
                  label={b.name}
                  sub={`${formatBytes(b.bytes)} · ${formatRelativeTime(b.mtime)}`}
                  onRestore={(f) => restore(f, b.name)}
                />
              ))}
            </>
          ) : (
            <p className="muted small" style={{ marginTop: 12 }}>
              No automatic snapshots yet. The next save will create one.
            </p>
          )}

          {sources.otherUsers.length > 0 ? (
            <>
              <h3 style={{ fontSize: 14, marginTop: 18, marginBottom: 8 }}>Other accounts on this machine</h3>
              <p className="muted small" style={{ marginBottom: 8 }}>
                Data files that belong to a different user ID on this computer. Useful if you registered twice by mistake.
              </p>
              {sources.otherUsers.map((o) => (
                <DataSourceRow
                  key={o.path}
                  info={o}
                  label={o.name}
                  sub={`${formatBytes(o.bytes)} · ${formatRelativeTime(o.mtime)}`}
                  onRestore={(f) => restore(f, o.name)}
                />
              ))}
            </>
          ) : null}
        </>
      ) : (
        <p className="muted small">Loading…</p>
      )}
    </CollapsibleCard>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Storage & cache
// ────────────────────────────────────────────────────────────────────────
// Honest, read-only picture of what Cadence occupies on disk plus a
// **safe** cache-wipe button. The wipe ONLY touches Chromium-managed
// caches (HTTP cache, V8 code cache, GPU/shader caches) — never your
// tasks, notes, AI keys, backups or account list.

function StorageCacheSection() {
  const isElectron =
    typeof window !== 'undefined' && !!window.cadence?.cacheStats && !!window.cadence?.clearChromiumCache;
  const [stats, setStats] = useState<CacheStats | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [swStatus, setSwStatus] = useState<'idle' | 'reloading'>('idle');

  const refresh = async () => {
    if (!isElectron) return;
    setBusy(true);
    try {
      const r = await window.cadence!.cacheStats!();
      setStats(r);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const clearCache = async () => {
    if (!isElectron) return;
    if (
      !window.confirm(
        'Clear browser-engine caches?\n\n• HTTP cache, code cache, GPU/shader caches\n• Tasks, notes, AI keys, backups and account list are NOT affected.\n\nYou may need to wait a few seconds the next time the app fetches a page or recompiles JS.',
      )
    ) {
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const r = await window.cadence!.clearChromiumCache!();
      if (r.ok) {
        setMsg({
          kind: 'ok',
          text: `Cleared. Chromium caches now use ${formatBytes(r.chromiumBytes)}.`,
        });
        await refresh();
      } else {
        setMsg({ kind: 'error', text: r.error || 'Clear failed.' });
      }
    } catch (err) {
      setMsg({ kind: 'error', text: String(err) });
    } finally {
      setBusy(false);
    }
  };

  const reloadPwaCache = async () => {
    setSwStatus('reloading');
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      // A clean reload picks up the next-version service worker on its first
      // navigation. We bypass the HTTP cache to be safe.
      window.location.reload();
    } catch {
      setSwStatus('idle');
    }
  };

  return (
    <CollapsibleCard
      id="storage"
      title="Storage & cache"
      defaultOpen={false}
      badge={stats && stats.ok ? formatBytes(stats.totalBytes) : undefined}
    >
      <p className="muted small" style={{ marginBottom: 12 }}>
        How much disk Cadence uses on this device, and a safe way to reclaim space. Your tasks, notes, AI keys and
        backups are <strong>never</strong> touched by the cache buttons below.
      </p>

      {!isElectron ? (
        <>
          <p className="muted small">
            Disk diagnostics are only available in the desktop app. The PWA stores everything in this browser&apos;s
            local storage (tiny — a few KB at most).
          </p>
          <div className="row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
            <Button
              type="button"
              variant="secondary"
              icon={<IcRefresh size={16} />}
              onClick={() => void reloadPwaCache()}
              disabled={swStatus === 'reloading'}
            >
              {swStatus === 'reloading' ? 'Reloading…' : 'Reload web assets'}
            </Button>
          </div>
          <p className="muted small" style={{ marginTop: 8 }}>
            Use this if the app feels &quot;stuck&quot; on an old version. It re-registers the service worker and
            refreshes the page; your saved data and AI key are kept.
          </p>
        </>
      ) : stats && stats.ok ? (
        <>
          <ul className="cache-stats">
            <CacheRow label="Encrypted data file" bytes={stats.dataFileBytes} hint="Your tasks, notes, AI key. Never touched by cache buttons." />
            {stats.legacyBytes > 0 ? (
              <CacheRow label="Legacy data file" bytes={stats.legacyBytes} hint="Pre-accounts era single-user file. Kept until you delete it manually." />
            ) : null}
            <CacheRow
              label={`Backups · ${stats.backupsSelfCount} snapshot${stats.backupsSelfCount === 1 ? '' : 's'}`}
              bytes={stats.backupsSelfBytes}
              hint="Rolling 50-snapshot safety net. Auto-pruned."
            />
            {stats.backupsAllBytes !== stats.backupsSelfBytes ? (
              <CacheRow
                label="Backups (other accounts)"
                bytes={stats.backupsAllBytes - stats.backupsSelfBytes}
                hint="Backups for other accounts that exist on this machine."
              />
            ) : null}
            <CacheRow
              label="Browser-engine caches (Chromium)"
              bytes={stats.chromiumBytes}
              hint="HTTP / code / GPU / shader caches. Safe to clear; will repopulate as needed."
              breakdown={stats.chromiumBreakdown}
            />
            <CacheRow label="Total userData folder" bytes={stats.totalBytes} emphasis hint={stats.userDataPath} />
          </ul>

          {msg ? (
            <div
              className="cache-msg"
              role={msg.kind === 'error' ? 'alert' : 'status'}
              data-kind={msg.kind}
            >
              {msg.text}
            </div>
          ) : null}

          <div className="row" style={{ marginTop: 12, flexWrap: 'wrap' }}>
            <Button type="button" variant="secondary" icon={<IcRefresh size={16} />} onClick={refresh} disabled={busy}>
              Refresh sizes
            </Button>
            <Button
              type="button"
              variant="danger"
              icon={<IcTrash size={16} />}
              onClick={() => void clearCache()}
              disabled={busy || stats.chromiumBytes === 0}
              title={stats.chromiumBytes === 0 ? 'Nothing to clear' : undefined}
            >
              Clear browser caches
            </Button>
          </div>

          <p className="muted small" style={{ marginTop: 10 }}>
            Want to see the folder yourself? Use <strong>Backups &amp; recovery → Open data folder</strong> above.
          </p>
        </>
      ) : stats && !stats.ok ? (
        <p className="muted small" style={{ color: 'var(--danger)' }}>Couldn&apos;t read sizes: {stats.error}</p>
      ) : (
        <p className="muted small">Calculating sizes…</p>
      )}
    </CollapsibleCard>
  );
}

function CacheRow({
  label,
  bytes,
  hint,
  emphasis,
  breakdown,
}: {
  label: string;
  bytes: number;
  hint?: string;
  emphasis?: boolean;
  breakdown?: CacheBreakdownEntry[];
}) {
  const meaningfulBreakdown = (breakdown ?? []).filter((b) => b.bytes > 0);
  return (
    <li className={`cache-row${emphasis ? ' cache-row--emphasis' : ''}`}>
      <div className="cache-row__main">
        <span className="cache-row__label">{label}</span>
        <span className="cache-row__bytes">{formatBytes(bytes)}</span>
      </div>
      {hint ? <div className="cache-row__hint muted small">{hint}</div> : null}
      {meaningfulBreakdown.length > 0 ? (
        <details className="cache-row__details">
          <summary className="muted small">Breakdown</summary>
          <ul>
            {meaningfulBreakdown.map((b) => (
              <li key={b.label}>
                <span>{b.label}</span>
                <span className="muted small">{formatBytes(b.bytes)}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </li>
  );
}

function DataSourceRow({
  info,
  label,
  sub,
  onRestore,
}: {
  info: DataFileInfo | null;
  label: string;
  sub?: string;
  onRestore: ((filePath: string) => void) | null;
}) {
  if (!info) {
    return (
      <div className="list__row" style={{ marginBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 600 }}>{label}</div>
          <div className="muted small">Not present on this machine.</div>
        </div>
      </div>
    );
  }
  const c = info.counts;
  // Build the human summary. Tasks and notes are the two things users
  // most often ask "where did my X go?" about, so we always show those
  // counts even when zero. Other counts only show when non-zero to keep
  // the line short.
  const dataSummary = c
    ? [
        c.teams ? `${c.teams} team${c.teams === 1 ? '' : 's'}` : null,
        c.people ? `${c.people} people` : null,
        c.items ? `${c.items} items` : null,
        // For todo groups we include the archived split when relevant —
        // that's the exact failure mode the user reported ("Todos sayfası
        // boş ama backup'ta data var"). Seeing "2 lists (2 archived)"
        // makes the diagnosis obvious from the recovery viewer alone.
        c.todoGroups
          ? `${c.todoGroups} list${c.todoGroups === 1 ? '' : 's'}${
              c.todoGroupsArchived ? ` (${c.todoGroupsArchived} archived)` : ''
            }`
          : null,
        `${c.todoItems ?? 0} task${(c.todoItems ?? 0) === 1 ? '' : 's'}`,
        `${c.notes ?? 0} note${(c.notes ?? 0) === 1 ? '' : 's'}${
          c.notesLocked ? ` (${c.notesLocked} locked)` : ''
        }`,
      ]
        .filter(Boolean)
        .join(' · ') || 'empty'
    : info.encrypted && !info.decryptable
    ? 'encrypted (cannot decrypt with current password)'
    : info.error
    ? `error: ${info.error}`
    : 'unreadable';

  // Same "everything archived → looks empty" red flag the TodosPage
  // empty-state handles, but visible right inside Backups & Recovery so
  // the user can spot a snapshot taken AFTER the accidental archive vs
  // a healthier one taken before.
  const allGroupsArchived =
    !!c && (c.todoGroups ?? 0) > 0 && (c.todoGroupsArchived ?? 0) === c.todoGroups;
  // notesLock object exists but no notes are locked — orphan lock that
  // would cause "your notes ask for a passphrase that never works"
  // confusion. New normalize() strips this on load, but the indicator
  // helps users avoid restoring an older snapshot that still carries
  // the orphan.
  const orphanNotesLock = !!c && c.hasNotesLock && !c.notesLocked;

  const canReveal = typeof window !== 'undefined' && !!window.cadence?.revealInOS;

  return (
    <div className="list__row" style={{ marginBottom: 8 }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontWeight: 600, wordBreak: 'break-word' }}>{label}</div>
        {sub ? <div className="muted small">{sub}</div> : null}
        <div className="muted small" style={{ marginTop: 4 }}>
          {dataSummary}
          {info.encrypted ? ' · encrypted' : ''}
          {info.bytes != null ? ` · ${formatBytes(info.bytes)}` : ''}
        </div>
        {(allGroupsArchived || orphanNotesLock) ? (
          <div
            className="small"
            style={{
              marginTop: 4,
              color: '#b45309',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            {allGroupsArchived ? (
              <span>
                ⚠ All todo lists in this snapshot are archived — restoring will look like
                "empty Todos page". Turn on "Show archived" in Todos after restore.
              </span>
            ) : null}
            {orphanNotesLock ? (
              <span>
                ⚠ This snapshot carries a notes-lock object but no locked notes. The app
                now auto-cleans this on load, but it&apos;s worth picking a cleaner snapshot
                if you can.
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {canReveal ? (
          <Button
            type="button"
            variant="ghost"
            onClick={async () => {
              try {
                await window.cadence!.revealInOS!({ filePath: info.path });
              } catch (err) {
                console.warn('[cadence] revealInOS failed', err);
              }
            }}
            title="Show this file in Finder / Explorer"
          >
            Reveal
          </Button>
        ) : null}
        {onRestore ? (
          <Button
            type="button"
            variant="secondary"
            icon={<IcUpload size={16} />}
            onClick={() => onRestore(info.path)}
            disabled={info.encrypted && !info.decryptable}
          >
            Restore
          </Button>
        ) : (
          <span className="muted small">live</span>
        )}
      </div>
    </div>
  );
}

// `normalizeHostUrl` moved to `lib/lanSyncClient.ts` so it can be reused
// from the auto-pull hook and any non-UI callers.

function formatBytes(bytes: number | undefined) {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatRelativeTime(iso: string | undefined) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const diff = Date.now() - d.getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 14) return `${days}d ago`;
  return d.toLocaleString();
}

// ─── Stay-signed-in (OS keychain session resume) ───────────────────────────────
//
// Persists the user's data-encryption key in the OS keychain (Electron's
// `safeStorage`: macOS Keychain, Windows DPAPI, Linux libsecret) so the
// next app launch can resume the workspace without asking for the
// password again. The PIN screen still appears if the user enabled one,
// which is the intended UX — PIN is a fast presence check; the password
// is the heavy "I want to set up this device" credential.
//
// Defaults ON for new accounts (see `account:register`); old accounts
// are backfilled to ON on next login. The toggle here lets the user
// flip back to the previous "ask me on every launch" behaviour at any
// time — useful on shared / kiosk machines.
//
// In the browser PWA there is no Electron IPC, so this card hides
// itself entirely (no Keychain available, the question is moot).

function StaySignedInSection() {
  const { user } = useAccount();
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasElectron = typeof window !== 'undefined' && !!window.cadence?.accountGetRememberMe;

  useEffect(() => {
    if (!hasElectron) {
      setLoading(false);
      return;
    }
    let alive = true;
    void (async () => {
      try {
        const r = await window.cadence!.accountGetRememberMe!();
        if (!alive) return;
        setAvailable(!!r?.available);
        setEnabled(!!r?.enabled);
      } catch {
        if (!alive) return;
        setAvailable(false);
        setEnabled(false);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [hasElectron, user]);

  if (!hasElectron) return null;

  const toggle = async (next: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const r = await window.cadence!.accountSetRememberMe!({ value: next });
      if (r?.ok) {
        setEnabled(!!r.enabled);
        setAvailable(!!r.available);
      } else {
        setError(r?.error ?? 'Could not update this setting.');
        if (typeof r?.available === 'boolean') setAvailable(r.available);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  const badge = loading
    ? '…'
    : !available
      ? 'Unavailable'
      : enabled
        ? 'Enabled'
        : 'Disabled';

  return (
    <CollapsibleCard id="stay-signed-in" title="Stay signed in" badge={badge}>
      <p className="muted">
        Skip the password prompt on every app launch. Your encryption key is stored in your operating system's keychain (macOS Keychain, Windows Credential Manager, or Linux libsecret) and never written to disk in clear text.
      </p>
      <p className="muted small">
        Logging out always clears the cached key, so the next launch will ask for your password again until you sign in once more. The PIN lock (below) is independent and keeps protecting the app at launch even when this is on.
      </p>
      {!available ? (
        <p className="muted small" style={{ marginTop: 8 }}>
          This computer does not expose a secure keychain to Cadence (common on Linux without libsecret). The setting is disabled — you'll be asked for your password on every restart, as before.
        </p>
      ) : null}
      <div className="row" style={{ marginTop: 10 }}>
        <Button
          type="button"
          variant={enabled ? 'primary' : 'secondary'}
          onClick={() => void toggle(true)}
          disabled={!available || busy || enabled}
        >
          {enabled ? 'On' : 'Turn on'}
        </Button>
        <Button
          type="button"
          variant={!enabled ? 'primary' : 'secondary'}
          onClick={() => void toggle(false)}
          disabled={busy || !enabled}
        >
          {!enabled ? 'Off' : 'Turn off'}
        </Button>
      </div>
      {error ? <p className="muted small" style={{ color: 'var(--danger, #d93025)', marginTop: 8 }}>{error}</p> : null}
    </CollapsibleCard>
  );
}

// ─── App profile (feature presets / enterprise policy) ─────────────────────────
//
// Top-of-Settings card that shows the currently active feature preset and
// either lets the user switch between Personal / Work-Standard / Work-Strict
// (when no policy file is in effect) or surfaces a "Managed by your
// organization" badge with the policy path (when one is).
//
// The card is intentionally the SECOND card on the Settings page (right
// after Appearance) — it's the discoverable place where a user notices
// that some features are gated, and learns what the work modes mean.

type AppProfileSectionProps = {
  features: ReturnType<typeof useFeatures>['features'];
  managed: ReturnType<typeof useFeatures>['managed'];
  source: ReturnType<typeof useFeatures>['source'];
  setPreset: ReturnType<typeof useFeatures>['setPreset'];
};

function AppProfileSection({ features, managed, source, setPreset }: AppProfileSectionProps) {
  const currentPreset: PresetName | 'custom' = (() => {
    // Match against the three named presets; otherwise call it "custom"
    // (a policy.json with granular overrides falls here).
    for (const name of ['personal', 'work-standard', 'work-strict'] as PresetName[]) {
      const p = PRESETS[name];
      if (
        p.sync.lan === features.sync.lan &&
        p.sync.cloud === features.sync.cloud &&
        p.ai === features.ai &&
        p.dataExport === features.dataExport &&
        p.updateCheck === features.updateCheck
      ) {
        return name;
      }
    }
    return 'custom';
  })();

  const badgeText = managed
    ? 'Managed by organization'
    : currentPreset === 'custom'
      ? 'Custom'
      : PRESET_LABELS[currentPreset].title;

  return (
    <CollapsibleCard
      id="app-profile"
      title="App profile"
      defaultOpen={false}
      badge={badgeText}
    >
      {managed ? (
        <div className="app-profile__managed">
          <p>
            <strong>
              {source.kind === 'distribution'
                ? 'This is the Cadence for Work build.'
                : 'This device is managed by your organization.'}
            </strong>{' '}
            Sync, AI, export and update settings are{' '}
            {source.kind === 'distribution'
              ? 'baked into this build flavor'
              : 'governed by a policy file deployed to this machine'}
            . You can&apos;t change the preset here — contact your IT administrator if something
            isn&apos;t right.
          </p>
          {source.kind === 'policy' ? (
            <dl className="app-profile__meta">
              <dt>Policy path</dt>
              <dd>
                <code>{source.path}</code>
              </dd>
              {source.managedBy ? (
                <>
                  <dt>Managed by</dt>
                  <dd>{source.managedBy}</dd>
                </>
              ) : null}
              {source.preset ? (
                <>
                  <dt>Base preset</dt>
                  <dd>{PRESET_LABELS[source.preset].title}</dd>
                </>
              ) : null}
            </dl>
          ) : null}
          {source.kind === 'distribution' ? (
            <dl className="app-profile__meta">
              <dt>Build flavor</dt>
              <dd>Cadence for Work ({source.distribution})</dd>
              {source.policyHint ? (
                <>
                  <dt>Sidecar policy</dt>
                  <dd>
                    <code>{source.policyHint.path}</code>
                  </dd>
                  {source.policyHint.managedBy ? (
                    <>
                      <dt>Managed by</dt>
                      <dd>{source.policyHint.managedBy}</dd>
                    </>
                  ) : null}
                </>
              ) : null}
            </dl>
          ) : null}
          <FeatureGrid features={features} />
        </div>
      ) : (
        <div className="app-profile__picker">
          <p className="muted small">
            Choose the profile that matches where you&apos;ll use Cadence. You can change this any
            time — the app remembers your choice on this device.
          </p>
          <div className="app-profile__presets">
            {(['personal', 'work-standard', 'work-strict'] as PresetName[]).map((name) => {
              const label = PRESET_LABELS[name];
              const selected = currentPreset === name;
              return (
                <button
                  key={name}
                  type="button"
                  className={`app-profile__card${selected ? ' app-profile__card--selected' : ''}`}
                  onClick={() => setPreset(name)}
                  aria-pressed={selected}
                >
                  <div className="app-profile__card-head">
                    <span className="app-profile__card-title">{label.title}</span>
                    {selected ? <span className="app-profile__card-badge">Active</span> : null}
                  </div>
                  <p className="app-profile__card-desc">{label.description}</p>
                  <FeatureChips preset={name} />
                </button>
              );
            })}
          </div>
          {currentPreset === 'custom' ? (
            <p className="muted small" style={{ marginTop: 12 }}>
              The active configuration matches none of the three named presets — selecting a card
              above will overwrite it.
            </p>
          ) : null}
        </div>
      )}
    </CollapsibleCard>
  );
}

function FeatureChips({ preset }: { preset: PresetName }) {
  const f = PRESETS[preset];
  const chips: { label: string; on: boolean }[] = [
    { label: 'LAN sync', on: f.sync.lan },
    { label: 'Cloud sync', on: f.sync.cloud },
    { label: 'AI assistant', on: f.ai },
    { label: 'Data export', on: f.dataExport },
    { label: 'Auto updates', on: f.updateCheck },
  ];
  return (
    <ul className="app-profile__chips">
      {chips.map((c) => (
        <li
          key={c.label}
          className={`app-profile__chip app-profile__chip--${c.on ? 'on' : 'off'}`}
          aria-label={`${c.label}: ${c.on ? 'enabled' : 'disabled'}`}
        >
          <span aria-hidden>{c.on ? '✓' : '×'}</span>
          {c.label}
        </li>
      ))}
    </ul>
  );
}

function FeatureGrid({
  features,
}: {
  features: AppProfileSectionProps['features'];
}) {
  const rows: { label: string; on: boolean; hint: string }[] = [
    {
      label: 'LAN sync',
      on: features.sync.lan,
      hint: "Same-Wi-Fi device pairing (data stays inside the company network).",
    },
    {
      label: 'Cloud sync',
      on: features.sync.cloud,
      hint: "End-to-end encrypted snapshots in Google Drive.",
    },
    {
      label: 'AI assistant',
      on: features.ai,
      hint: "Bring-your-own-key calls to OpenAI / Anthropic from the renderer.",
    },
    {
      label: 'Data export',
      on: features.dataExport,
      hint: "JSON backup downloads from the Backup card.",
    },
    {
      label: 'Auto updates',
      on: features.updateCheck,
      hint: "Periodic + manual checks against GitHub Releases.",
    },
  ];
  return (
    <ul className="app-profile__grid">
      {rows.map((r) => (
        <li
          key={r.label}
          className={`app-profile__row app-profile__row--${r.on ? 'on' : 'off'}`}
        >
          <span className="app-profile__row-label">
            <span className="app-profile__row-icon" aria-hidden>
              {r.on ? '✓' : '×'}
            </span>
            {r.label}
          </span>
          <span className="muted small">{r.hint}</span>
        </li>
      ))}
    </ul>
  );
}

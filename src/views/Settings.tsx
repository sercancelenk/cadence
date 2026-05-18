import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { IcDownload, IcLock, IcMoon, IcRefresh, IcSparkles, IcSun, IcTrash, IcUpload, IcWifi } from '../components/icons';
import { Button } from '../components/ui/Button';
import { useAppData } from '../AppDataContext';
import { useSession } from '../AuthContext';
import { askAI, AIError, defaultModel } from '../lib/ai';
import type { AIProvider, AppData } from '../model';
import { AI_PROVIDER_OPTIONS } from '../model';
import { useTheme } from '../ThemeContext';

export function Settings() {
  const { data, replaceAll } = useAppData();
  const { theme, setTheme } = useTheme();
  const { pinEnabled, refresh: refreshSession, lockSession } = useSession();
  const [path, setPath] = useState<string>('');
  const [appVersion, setAppVersion] = useState<string>('');
  const [newPin, setNewPin] = useState('');
  const [newPin2, setNewPin2] = useState('');
  const [clearPin, setClearPin] = useState('');
  const [updaterOpen, setUpdaterOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void (async () => {
      const p = await window.leeadman?.userDataPath?.();
      if (p) setPath(p);
      const v = await window.leeadman?.getAppVersion?.();
      if (v) setAppVersion(v);
      await refreshSession();
    })();
  }, [refreshSession]);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leeadman-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page">
      <header className="page-head">
        <h1>Settings</h1>
        <p className="muted">Your data lives on this computer. Export a backup to keep it elsewhere.</p>
      </header>

      <section className="card">
        <h2 className="card__title">Appearance</h2>
        <p className="muted small">You can also toggle the theme from the top bar.</p>
        <div className="row">
          <Button
            type="button"
            variant={theme === 'dark' ? 'primary' : 'secondary'}
            icon={<IcMoon size={17} />}
            onClick={() => setTheme('dark')}
          >
            Dark
          </Button>
          <Button
            type="button"
            variant={theme === 'light' ? 'primary' : 'secondary'}
            icon={<IcSun size={17} />}
            onClick={() => setTheme('light')}
          >
            Light
          </Button>
        </div>
      </section>

      <section className="card">
        <h2 className="card__title">PIN protection</h2>
        <p className="muted">
          Adds a quick lock screen when Leeadman starts and when you choose <em>Lock now</em>. Useful when you step away from your desk so a passer-by can't open the app and read 1:1 notes.
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
                window.alert('PIN must be at least 4 characters and both fields must match.');
                return;
              }
              // setPin runs a round-trip self-verify in the main process and
              // rolls back if the stored hash cannot reproduce the same PIN.
              // So a successful response here guarantees the lock screen will
              // accept the same characters the user just typed.
              const r = await window.leeadman?.authSetPin?.({ pin: a });
              if (r?.ok) {
                setNewPin('');
                setNewPin2('');
                await refreshSession();
                window.alert(
                  'PIN saved. You will be prompted on next launch. If you ever lose it, you can reset it from the lock screen with your account password.',
                );
              } else {
                window.alert(r?.error ?? 'Could not save PIN.');
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
              const r = await window.leeadman?.authClear?.({ pin: clearPin.trim() });
              if (r?.ok) {
                setClearPin('');
                await refreshSession();
                window.alert('PIN removed.');
              } else {
                window.alert(r?.error ?? 'Incorrect PIN.');
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
      </section>

      <section className="card">
        <h2 className="card__title">Application version</h2>
        <p>
          Installed version: <strong>{appVersion || '—'}</strong> · Data schema: v{data.version}
        </p>
      </section>

      <section className="card">
        <h2 className="card__title">Auto updates (GitHub Releases)</h2>
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
      </section>

      <UpdaterDialog open={updaterOpen} onClose={() => setUpdaterOpen(false)} />

      <section className="card">
        <h2 className="card__title">Data location (Electron)</h2>
        {path ? <pre className="pre">{path}</pre> : <p className="muted">No Electron data path available; in the browser preview, data lives in localStorage.</p>}
        <p className="muted small">File name pattern: leeadman-data-&lt;userId&gt;.json</p>
      </section>

      <section className="card">
        <h2 className="card__title">Backup</h2>
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
              } catch {
                window.alert('Could not read the file or the JSON is invalid.');
              }
            }}
          />
        </div>
        <p className="muted small" style={{ marginTop: 8 }}>
          Importing replaces your existing data. Always export a backup first.
        </p>
      </section>

      <SyncSection />

      <AISettingsSection />

      <section className="card">
        <h2 className="card__title">Reminders</h2>
        <p className="muted">
          The OS will request notification permission. Fill in the &quot;Reminder&quot; field on a task or note; a desktop notification will fire at the scheduled time
          (the same reminder will not repeat — adjusting the time can re-trigger it).
        </p>
      </section>
    </div>
  );
}

type SyncStatus = {
  enabled: boolean;
  running: boolean;
  port: number | null;
  token: string | null;
  ips: string[];
};

function SyncSection() {
  const { data, replaceAll } = useAppData();
  const isElectronHost = typeof window !== 'undefined' && !!window.leeadman?.syncStatus;

  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshStatus = async () => {
    if (!isElectronHost) return;
    const s = await window.leeadman!.syncStatus();
    setStatus(s);
  };

  useEffect(() => {
    void refreshStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const enable = async () => {
    setBusy(true);
    try {
      const r = await window.leeadman!.syncEnable();
      if (!r?.ok) window.alert(r?.error ?? 'Could not start sync server.');
      await refreshStatus();
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      await window.leeadman!.syncDisable();
      await refreshStatus();
    } finally {
      setBusy(false);
    }
  };

  const rotate = async () => {
    setBusy(true);
    try {
      const r = await window.leeadman!.syncRotateToken();
      if (!r?.ok) window.alert('Could not rotate token.');
      await refreshStatus();
    } finally {
      setBusy(false);
    }
  };

  // Client-side pair form for the *current* device (mobile/PWA or another desktop).
  const [pairUrl, setPairUrl] = useState('');
  const [pairToken, setPairToken] = useState('');
  const [pairBusy, setPairBusy] = useState(false);
  const [pairMsg, setPairMsg] = useState<string | null>(null);

  const sanitizedHost = pairUrl.trim().replace(/\/+$/, '');

  const pull = async () => {
    setPairMsg(null);
    if (!sanitizedHost || !pairToken.trim()) {
      setPairMsg('Host URL and token are required.');
      return;
    }
    setPairBusy(true);
    try {
      const resp = await fetch(`${sanitizedHost}/v1/snapshot`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${pairToken.trim()}` },
      });
      if (!resp.ok) {
        setPairMsg(`Pull failed (${resp.status}).`);
        return;
      }
      const json = await resp.json();
      const remote = json?.data;
      if (!remote || typeof remote !== 'object') {
        setPairMsg('Host returned no data.');
        return;
      }
      replaceAll(remote);
      setPairMsg('Pulled snapshot from host. Local data was replaced.');
    } catch (err) {
      setPairMsg(`Pull failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setPairBusy(false);
    }
  };

  const push = async () => {
    setPairMsg(null);
    if (!sanitizedHost || !pairToken.trim()) {
      setPairMsg('Host URL and token are required.');
      return;
    }
    if (!window.confirm('This will overwrite the host\'s data with the data from this device. Continue?')) {
      return;
    }
    setPairBusy(true);
    try {
      const resp = await fetch(`${sanitizedHost}/v1/snapshot`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${pairToken.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ data }),
      });
      if (!resp.ok) {
        setPairMsg(`Push failed (${resp.status}).`);
        return;
      }
      setPairMsg('Pushed local data to the host.');
    } catch (err) {
      setPairMsg(`Push failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setPairBusy(false);
    }
  };

  const hostUrls = status?.ips?.length && status?.port
    ? status.ips.map((ip) => `http://${ip}:${status.port}`)
    : [];

  return (
    <section className="card">
      <h2 className="card__title">Multi-device sync (no cloud)</h2>
      <p className="muted">
        Keep two devices on the same Wi-Fi in sync without any cloud server. The desktop app
        runs a tiny HTTP server protected by a one-time token; another device (a second
        desktop, or the PWA when running over HTTP) pulls or pushes a snapshot directly.
        Nothing leaves your network.
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
                  <div className="field">
                    <span>Pairing token</span>
                    <input className="input" readOnly value={status.token} onFocus={(e) => e.currentTarget.select()} />
                  </div>
                  {hostUrls.length > 0 ? (
                    <div className="field">
                      <span>Reachable URLs</span>
                      {hostUrls.map((u) => (
                        <input key={u} className="input" readOnly value={u} onFocus={(e) => e.currentTarget.select()} />
                      ))}
                    </div>
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
        <h3 style={{ margin: '0 0 8px' }}>Pair with another device</h3>
        <p className="muted small" style={{ marginTop: 0 }}>
          Open Settings on the host device, copy the reachable URL and token, then paste them here.
        </p>
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
            />
          </label>
          <label className="field">
            <span>Token</span>
            <input
              className="input"
              type="password"
              placeholder="Paste pairing token"
              value={pairToken}
              onChange={(e) => setPairToken(e.target.value)}
            />
          </label>
          <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
            <Button type="button" variant="ghost" onClick={push} disabled={pairBusy}>
              Push to host
            </Button>
            <Button type="submit" variant="primary" disabled={pairBusy}>
              {pairBusy ? 'Working…' : 'Pull from host'}
            </Button>
          </div>
          {pairMsg ? <p className="form-msg form-msg--ok small">{pairMsg}</p> : null}
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
    </section>
  );
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

  useEffect(() => {
    if (!open) return;
    const api = window.leeadman;
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
    const r = await window.leeadman?.installUpdate?.();
    if (!r?.ok) {
      setInstalling(false);
      window.alert(r?.error ?? 'Could not install the update.');
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
      const reply = await askAI({
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
        message: `Connection works. Provider answered: "${reply.replace(/\s+/g, ' ').slice(0, 80)}"`,
      });
    } catch (err) {
      const message = err instanceof AIError ? err.message : (err as Error)?.message ?? String(err);
      setTestStatus({ kind: 'error', message });
    }
  };

  const isDesktop = typeof window !== 'undefined' && !!window.leeadman;

  return (
    <section className="card">
      <h2 className="card__title">
        <IcSparkles size={17} /> AI Assistant
      </h2>
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
    </section>
  );
}

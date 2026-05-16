import { FormEvent, useEffect, useRef, useState } from 'react';
import { IcDownload, IcLock, IcMoon, IcRefresh, IcSun, IcTrash, IcUpload, IcWifi } from '../components/icons';
import { Button } from '../components/ui/Button';
import { useAppData } from '../AppDataContext';
import { useSession } from '../AuthContext';
import type { AppData } from '../model';
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
              if (newPin.length < 4 || newPin !== newPin2) {
                window.alert('PIN must be at least 4 characters and both fields must match.');
                return;
              }
              const r = await window.leeadman?.authSetPin?.({ pin: newPin });
              if (r?.ok) {
                setNewPin('');
                setNewPin2('');
                await refreshSession();
                window.alert('PIN saved. You will be prompted on next launch.');
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
              const r = await window.leeadman?.authClear?.({ pin: clearPin });
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
          When the packaged app launches, it checks GitHub Releases for a newer version. The repository owner is configured automatically by the release workflow.
        </p>
        <div className="row" style={{ marginTop: 12 }}>
          <Button
            type="button"
            variant="secondary"
            icon={<IcRefresh size={17} />}
            onClick={async () => {
              const r = await window.leeadman?.checkForUpdates?.();
              if (!r?.ok && r?.reason === 'dev') {
                window.alert('Update checks are disabled in development mode. Run the packaged app to receive updates.');
              } else if (r?.ok) {
                window.alert('Update check started. You will be notified if a new version is available.');
              } else {
                window.alert(`Update check failed: ${r?.error ?? 'unknown error'}`);
              }
            }}
          >
            Check for updates
          </Button>
        </div>
      </section>

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

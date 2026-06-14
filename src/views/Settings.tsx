import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { IcDownload, IcLock, IcRefresh, IcSparkles, IcTrash, IcUpload } from '../components/icons';
import { Button } from '../components/ui/Button';
import { IcHelpCircle } from '../components/icons';
import { useAccount } from '../AccountContext';
import { useSession } from '../AuthContext';
import { useToast } from '../components/ui/Toast';
import { askAI, AIError, defaultModel } from '../lib/ai';
import { APP_SLUG } from '../lib/appBranding';
import { resolveAppProfileLabel } from '../lib/appProfileLabel';
import type { AIProvider } from '../model';
import { AI_PROVIDER_OPTIONS, appDataToPersistJson, compactAppDataForPersist, normalizeData } from '../model';
import {
  describeMergeSummary,
  mergeAppendWorkspace,
  type MergeAppendSummary,
} from '../core/model/mergeWorkspace';
import type { CacheBreakdownEntry, CacheStats, DataFileInfo, DataSources, SaveError } from '../vite-env';
import { CollapsibleCard } from '../components/ui/CollapsibleCard';
import { RecoveryCodesPanel } from '../components/RecoveryCodesPanel';
import { parseRemoteSnapshot, snapshotParseErrorMessage } from '../lib/syncSnapshotGuard';
import { computeLocalEtag } from '../lib/syncFingerprint';
import { prepareForRemoteApply } from '../lib/syncApplyGuard';
import { estimateWorkspaceStorage } from '../lib/workspaceStorageStats';
import { isElectronApp, backupPlatform, backupPlatformLabel } from '../lib/runtime';
import { exportPortableBackupZip, importPortableBackupFile } from '../lib/backupBundle';
import { useAppData } from '../AppDataContext';
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
import type { ReminderSyncStatus } from '../lib/reminderDelivery/types';
import { supportsPwaOsSchedule } from '../lib/reminderDelivery/capabilities';

function RemindersSettingsSection() {
  const toast = useToast();
  const [status, setStatus] = useState<ReminderSyncStatus | null>(null);

  const refreshStatus = () => {
    void window.cadence?.reminderSyncStatus?.().then((s) => {
      if (s) setStatus(s);
    });
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const s = await window.cadence?.reminderSyncStatus?.();
      if (!cancelled && s) setStatus(s);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isElectron = typeof window !== 'undefined' && !!window.cadence?.reminderSyncStatus;
  const pwaOsSchedule = !isElectron && supportsPwaOsSchedule();
  const isLinux = isElectron && status?.platform === 'linux';
  const pendingTotal = (status?.pendingInApp ?? 0) + (status?.pendingOs ?? 0);
  const showOsLimitWarning =
    isElectron &&
    (status?.platform === 'darwin' || status?.platform === 'win32') &&
    status?.osScheduling &&
    pendingTotal >= 50;

  const updateBackground = (patch: { launchAtLogin?: boolean; hideToTrayOnClose?: boolean }) => {
    void window.cadence?.setReminderBackgroundSettings?.(patch).then((r) => {
      if (!r?.ok) {
        toast.showError('Reminder settings', r?.error || 'Could not save');
        return;
      }
      refreshStatus();
    });
  };

  return (
    <>
      <p className="muted">
        On a to-do, open the calendar control, pick a time, and leave &quot;Remind me&quot; on. Cadence schedules a
        desktop notification for that slot.
      </p>
      {isElectron && status?.platform === 'darwin' ? (
        <p className="muted" style={{ marginTop: 8 }}>
          {status.osScheduling
            ? 'Reminders are registered with macOS and can fire when Cadence is quit. Allow notifications in System Settings → Notifications → Cadence.'
            : 'In development (npm run dev), reminders fire while the app is open only — allow notifications for Electron in System Settings → Notifications. Quit-after-fire needs a packaged Cadence.app build.'}
          {status.osError ? ` (${status.osError})` : null}
        </p>
      ) : isElectron && status?.platform === 'win32' ? (
        <p className="muted" style={{ marginTop: 8 }}>
          {status.osScheduling
            ? 'Reminders are scheduled with Windows and can fire when Cadence is quit. Allow notifications for Cadence in Windows Settings → System → Notifications.'
            : 'Reminders run while Cadence is open. Quit-after-fire requires the packaged Windows app with the notify helper built.'}
          {status.osError ? ` (${status.osError})` : null}
        </p>
      ) : isLinux ? (
        <>
          <p className="muted" style={{ marginTop: 8 }}>
            Linux does not offer reliable OS-level scheduled notifications after Cadence quits. Reminders fire while the
            app process is running — use the system tray and launch at login so Cadence stays available in the background.
            {status.pendingInApp > 0 ? ` (${status.pendingInApp} pending)` : null}
          </p>
          <div className="stack" style={{ marginTop: 12, gap: 10 }}>
            <label className="row" style={{ gap: 8, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={status.launchAtLogin === true}
                onChange={(e) => updateBackground({ launchAtLogin: e.target.checked })}
              />
              <span>Launch Cadence at login</span>
            </label>
            <label className="row" style={{ gap: 8, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={status.hideToTrayOnClose !== false}
                onChange={(e) => updateBackground({ hideToTrayOnClose: e.target.checked })}
              />
              <span>Minimize to tray when closing the window (keeps reminders running)</span>
            </label>
          </div>
        </>
      ) : isElectron ? (
        <p className="muted" style={{ marginTop: 8 }}>
          Reminders work while Cadence is running via the main-process scheduler.
        </p>
      ) : (
        <p className="muted" style={{ marginTop: 8 }}>
          {pwaOsSchedule
            ? 'Reminders are scheduled in the browser and can fire when Cadence is closed (Chrome with Notification Triggers). Allow notifications when prompted.'
            : 'In the browser, keep Cadence open for reminders to fire on time. Safari and Firefox do not support background scheduling yet.'}
        </p>
      )}
      {showOsLimitWarning ? (
        <p className="muted" style={{ marginTop: 8, color: 'var(--warn, #c9a227)' }}>
          You have {pendingTotal} scheduled reminders. macOS and Windows may stop accepting new ones around 64 — consider
          clearing completed tasks or turning off reminders you no longer need.
        </p>
      ) : null}
      {isElectron ? (
        <div className="row" style={{ marginTop: 12 }}>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              void window.cadence?.requestReminderPermission?.().then((r) => {
                refreshStatus();
                if (r?.granted) toast.showSuccess('Notifications enabled');
                else if (r?.error) toast.showError('Notification permission', r.error);
              });
            }}
          >
            Request notification permission
          </Button>
        </div>
      ) : null}
    </>
  );
}

export function Settings() {
  const navigate = useNavigate();
  const { data, importWorkspace, syncFromDisk, flushPendingSave } = useAppData();
  const { user } = useAccount();
  const { pinEnabled, refresh: refreshSession, lockSession } = useSession();
  const toast = useToast();
  const { features, managed, source, setPreset } = useFeatures();
  const [appVersion, setAppVersion] = useState<string>('');
  const [newPin, setNewPin] = useState('');
  const [newPin2, setNewPin2] = useState('');
  const [clearPin, setClearPin] = useState('');
  const [updaterOpen, setUpdaterOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const mergeFileRef = useRef<HTMLInputElement>(null);
  const [importBusy, setImportBusy] = useState(false);
  const isElectron = isElectronApp();

  useEffect(() => {
    void (async () => {
      const v = await window.cadence?.getAppVersion?.();
      if (v) setAppVersion(v);
      await refreshSession();
    })();
  }, [refreshSession]);

  const exportJson = async () => {
    try {
      await flushPendingSave();
      await prepareForRemoteApply();
    } catch {
      /* best effort */
    }
    // Normalize defensively so the backup file is always a complete, canonical
    // (current-version) schema — even if the in-memory snapshot predates a
    // migration — which keeps round-trip restores forward-compatible.
    const blob = new Blob([appDataToPersistJson(normalizeData(data))], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${APP_SLUG}-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportFullBundle = async () => {
    try {
      await flushPendingSave();
      await prepareForRemoteApply();
    } catch {
      /* best effort */
    }
    if (!window.cadence?.exportDataBundle) {
      exportJson();
      toast.showInfo(
        'JSON exported',
        'Full backup with images is available in the desktop app. This export contains JSON only.',
      );
      return;
    }
    const r = await window.cadence.exportDataBundle(compactAppDataForPersist(data));
    if (r?.canceled) return;
    if (r?.ok && r.path) {
      toast.showSuccess('Full backup saved', `Folder: ${r.path}`);
      return;
    }
    toast.showError('Export failed', r?.error ?? 'Could not write backup folder.');
  };

  const exportPortableZip = async () => {
    if (!user) {
      toast.showError('Not signed in', 'Sign in before exporting a backup.');
      return;
    }
    try {
      await flushPendingSave();
      await prepareForRemoteApply();
      const r = await exportPortableBackupZip(user.id, data);
      let detail = `${r.attachmentCount} image${r.attachmentCount === 1 ? '' : 's'} included.`;
      if (r.attachmentMissing > 0) {
        detail += ` ${r.attachmentMissing} referenced image${r.attachmentMissing === 1 ? '' : 's'} were missing on this device.`;
      }
      toast.showSuccess('Portable backup saved', detail);
    } catch (err) {
      toast.showError('Export failed', err instanceof Error ? err.message : 'Could not build ZIP backup.');
    }
  };

  const importBackupFile = async (file: File) => {
    if (importBusy) return;
    if (!user) {
      toast.showError('Not signed in', 'Sign in before importing a backup.');
      return;
    }
    const isZip = file.name.toLowerCase().endsWith('.zip');
    const prompt = isZip
      ? 'Import this portable backup? Your current workspace and images on this device will be replaced. Export first if you are unsure.'
      : 'Import this JSON file? Your workspace will be replaced. JSON does not include images — use a .zip portable backup for pictures.';
    if (!window.confirm(prompt)) return;

    setImportBusy(true);
    try {
      const r = await importPortableBackupFile(file, {
        userId: user.id,
        importWorkspace: async (next) => {
          const imported = await importWorkspace(next);
          if (!imported.ok) return imported;
          return { ok: true as const };
        },
      });
      if (!r.ok) {
        toast.showError('Import failed', r.error);
        return;
      }
      await syncFromDisk();
      if (isZip) {
        let detail = `${r.attachmentsImported} image${r.attachmentsImported === 1 ? '' : 's'} restored.`;
        if (r.attachmentsSkipped > 0) {
          detail += ` ${r.attachmentsSkipped} could not be imported.`;
        }
        if (r.attachmentsEncryptedSkipped && r.attachmentsEncryptedSkipped > 0) {
          detail += ` ${r.attachmentsEncryptedSkipped} encrypted image${r.attachmentsEncryptedSkipped === 1 ? '' : 's'} need the desktop app to import.`;
        }
        toast.showSuccess('Portable backup imported', detail);
      } else {
        toast.showSuccess(
          'Workspace imported',
          'JSON loaded. If images are missing, import a .zip portable backup exported from desktop or web.',
        );
      }
    } catch (err) {
      toast.showError('Import failed', err instanceof Error ? err.message : 'Could not read backup file.');
    } finally {
      setImportBusy(false);
    }
  };

  // Additive "bring items from another device" import. Unlike `importBackupFile`
  // (a full replace, used to restore a backup), this folds the incoming
  // workspace into the current one with `mergeAppendWorkspace`: every local
  // item is kept verbatim and only entities this device doesn't already have
  // are appended. Idempotent and lossless — re-importing the same file is a
  // no-op. This is the primary desktop→phone transfer path (export a portable
  // ZIP on desktop, AirDrop / Files it across, merge here) and never needs a
  // network connection between the devices.
  const mergeImportFile = async (file: File) => {
    if (importBusy) return;
    if (!user) {
      toast.showError('Not signed in', 'Sign in before importing.');
      return;
    }
    setImportBusy(true);
    let mergeSummary: MergeAppendSummary | null = null;
    try {
      const r = await importPortableBackupFile(file, {
        userId: user.id,
        importWorkspace: async (next) => {
          const imported = await importWorkspace(next);
          if (!imported.ok) return imported;
          return { ok: true as const };
        },
        transformWorkspace: (remote) => {
          const merged = mergeAppendWorkspace(data, remote);
          mergeSummary = merged.summary;
          return merged.data;
        },
      });
      if (!r.ok) {
        toast.showError('Merge failed', r.error);
        return;
      }
      await syncFromDisk();
      const summaryText = mergeSummary
        ? describeMergeSummary(mergeSummary)
        : 'Already up to date — nothing new to import.';
      toast.showSuccess('Items merged', summaryText);
    } catch (err) {
      toast.showError('Merge failed', err instanceof Error ? err.message : 'Could not read the file.');
    } finally {
      setImportBusy(false);
    }
  };

  const importFullBundle = async () => {
    if (importBusy) return;
    if (!window.cadence?.importDataBundle) {
      toast.showInfo(
        'Desktop app required',
        'Import folder backup (with images) works in the Cadence desktop app.',
      );
      return;
    }
    if (
      !window.confirm(
        'Import a full backup folder? This replaces your workspace and attachment files on this device.',
      )
    ) {
      return;
    }
    setImportBusy(true);
    try {
      const r = await window.cadence.importDataBundle();
      if (r?.canceled) return;
      if (r?.ok) {
        await syncFromDisk();
        const att = typeof r.attachmentsRestored === 'number' ? r.attachmentsRestored : null;
        const skipped = typeof r.attachmentsSkipped === 'number' && r.attachmentsSkipped > 0 ? r.attachmentsSkipped : 0;
        let detail = r.importedFrom ? `Restored from ${r.importedFrom}.` : 'Workspace restored.';
        if (att != null) detail += ` ${att} image${att === 1 ? '' : 's'} imported.`;
        if (skipped > 0) {
          detail += ` ${skipped} encrypted image${skipped === 1 ? '' : 's'} could not be read — re-export a full backup from the source account.`;
        }
        toast.showSuccess('Backup imported', detail);
        return;
      }
      toast.showError('Import failed', r?.error ?? 'Could not read backup folder.');
    } catch (err) {
      toast.showError('Import failed', err instanceof Error ? err.message : 'Could not read backup folder.');
    } finally {
      setImportBusy(false);
    }
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
        <AccountRecoverySection />
        {isElectron ? (
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
        ) : null}
      </SettingsGroup>

      <SettingsGroup
        eyebrow="Data & backup"
        description="Automatic snapshots, manual export, and restore — everything in one place."
      >
        <BackupsRecoverySection
          canExport={features.dataExport}
          importBusy={importBusy}
          onSetImportBusy={setImportBusy}
          onExportJson={() => void exportJson()}
          onExportPortableZip={() => void exportPortableZip()}
          onExportFullBundle={() => void exportFullBundle()}
          onImportBackup={() => fileRef.current?.click()}
          onMergeImport={() => mergeFileRef.current?.click()}
          onImportFolder={() => void importFullBundle()}
          fileInput={
            <>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json,application/zip,.zip"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  await importBackupFile(f);
                }}
              />
              <input
                ref={mergeFileRef}
                type="file"
                accept="application/json,.json,application/zip,.zip"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  await mergeImportFile(f);
                }}
              />
            </>
          }
        />

        <StorageCacheSection />
      </SettingsGroup>

      {features.sync.cloud ? (
        <SettingsGroup
          eyebrow="Sync"
          description="Keep this workspace in step with your other devices."
        >
          {features.sync.cloud ? <CloudSyncSection /> : null}
        </SettingsGroup>
      ) : null}

      <SettingsGroup
        eyebrow="Integrations"
        description="Optional services and OS-level features Cadence can talk to."
      >
        {features.ai ? <AISettingsSection /> : null}
        <CollapsibleCard id="reminders" title="Reminders" defaultOpen={false}>
          <RemindersSettingsSection />
        </CollapsibleCard>
      </SettingsGroup>

      <SettingsGroup
        eyebrow="About"
        description="Version info, update channel, workspace profile, and the in-app user guide."
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
        <CollapsibleCard id="user-guide" title="User guide" defaultOpen={false}>
          <p className="muted">
            Step-by-step help for daily use, backups, recovery codes, and sync. Nothing leaves your device unless you
            choose.
          </p>
          <div className="row" style={{ marginTop: 12 }}>
            <Button
              type="button"
              variant="secondary"
              icon={<IcHelpCircle size={17} />}
              onClick={() => navigate('/guide')}
            >
              Open user guide
            </Button>
          </div>
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

/* ------------------------------------------------------------------ */
/* Cloud sync (Google Drive)                                          */
/* ------------------------------------------------------------------ */

/**
 * Cloud sync via Google Drive (end-to-end encrypted).
 *
 * This is the only background sync backend: it drives auto-sync when the
 * user connects Drive. It works anywhere with an internet connection and
 * acts as an off-site backup. For offline device-to-device transfer the
 * user instead exports a backup and merges it in (Settings → Backup).
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
  const { data, replaceAll, flushPendingSave } = useAppData();

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
        await flushPendingSave();
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
              text: snapshotParseErrorMessage(parsed),
            });
            return;
          }
          await flushPendingSave();
          await prepareForRemoteApply();
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
  const { flushPendingSave } = useAppData();
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
    try {
      await flushPendingSave();
    } catch {
      /* best effort — still attempt install */
    }
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

function BackupsRecoverySection({
  canExport,
  importBusy,
  onSetImportBusy,
  onExportJson,
  onExportPortableZip,
  onExportFullBundle,
  onImportBackup,
  onMergeImport,
  onImportFolder,
  fileInput,
}: {
  canExport: boolean;
  importBusy?: boolean;
  onSetImportBusy?: (busy: boolean) => void;
  onExportJson: () => void;
  onExportPortableZip: () => void;
  onExportFullBundle: () => void;
  onImportBackup: () => void;
  onMergeImport: () => void;
  onImportFolder: () => void;
  fileInput: ReactNode;
}) {
  const { reload, flushPendingSave } = useAppData();
  const platform = backupPlatform();
  const isElectron = platform === 'desktop';
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
    } catch (err) {
      setMsg({ kind: 'error', text: err instanceof Error ? err.message : 'Could not load snapshots.' });
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

  if (!isElectron && !canExport) {
    return null;
  }

  const restore = async (filePath: string, label: string) => {
    if (busy || importBusy) return;
    if (!window.confirm(`Restore data from "${label}"?\n\nYour current data will be snapshotted first so you can undo this.`)) {
      return;
    }
    setBusy(true);
    onSetImportBusy?.(true);
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
      try {
        await flushPendingSave();
        await prepareForRemoteApply();
      } catch {
        /* best effort */
      }
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
      onSetImportBusy?.(false);
      setBusy(false);
    }
  };

  const openFolder = async () => {
    await window.cadence?.openUserDataFolder?.();
  };

  const totalSnapshots = sources?.backups.length ?? 0;
  const liveCounts = sources?.live?.counts;
  const liveSummary = liveCounts
    ? `${liveCounts.teams ?? 0} team${(liveCounts.teams ?? 0) === 1 ? '' : 's'}, ` +
      `${liveCounts.todoItems ?? 0} task${(liveCounts.todoItems ?? 0) === 1 ? '' : 's'}, ` +
      `${liveCounts.notes ?? 0} note${(liveCounts.notes ?? 0) === 1 ? '' : 's'}`
    : null;
  const hasLegacy =
    !!sources?.legacy && (sources.legacy.bytes ?? 0) > 0;

  return (
    <CollapsibleCard
      id="backups"
      title="Backup & recovery"
      defaultOpen={false}
      badge={
        isElectron && sources
          ? `${totalSnapshots} snapshot${totalSnapshots === 1 ? '' : 's'}`
          : undefined
      }
    >
      {canExport ? (
        <>
          <div className="backup-platform">
            <span className="backup-platform__badge">{backupPlatformLabel(platform)}</span>
            {platform === 'desktop' ? (
              <>
                <p className="muted small backup-platform__lead">
                  On desktop, use a <strong>full backup folder</strong> for note version history and local restores.
                  Use a <strong>portable ZIP</strong> to move workspace and images to web, mobile, or another account.
                  Import always replaces data on this device — export first if you are unsure.
                </p>
                <div className="backup-platform__actions">
                  <Button
                    type="button"
                    variant="primary"
                    icon={<IcDownload size={17} />}
                    title="Save data.json, images, and note version history into a folder"
                    onClick={onExportFullBundle}
                  >
                    Export full backup
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    icon={<IcUpload size={17} />}
                    title="Replace workspace and images from a backup folder"
                    onClick={onImportFolder}
                    disabled={importBusy}
                  >
                    Import backup folder
                  </Button>
                </div>
                <div className="backup-platform__actions" style={{ marginTop: 8 }}>
                  <Button
                    type="button"
                    variant="secondary"
                    icon={<IcDownload size={17} />}
                    title="Cross-platform ZIP with workspace and images (no note history)"
                    onClick={onExportPortableZip}
                  >
                    Export portable ZIP
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    icon={<IcUpload size={17} />}
                    title="Import a .zip or .json portable backup"
                    onClick={onImportBackup}
                    disabled={importBusy}
                  >
                    Import portable backup
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    icon={<IcUpload size={17} />}
                    title="Add new items from another device's backup without replacing what's here"
                    onClick={onMergeImport}
                    disabled={importBusy}
                  >
                    Merge from another device
                  </Button>
                  {fileInput}
                </div>
                <details className="backup-platform__advanced">
                  <summary className="small">Text-only JSON (advanced)</summary>
                  <p className="muted small">
                    Exports workspace text and settings only — <strong>not</strong> embedded images. Useful for a
                    quick copy or debugging; prefer full backup or ZIP for real restores.
                  </p>
                  <div className="backup-platform__actions">
                    <Button
                      type="button"
                      variant="secondary"
                      icon={<IcDownload size={17} />}
                      onClick={onExportJson}
                    >
                      Export JSON
                    </Button>
                  </div>
                </details>
              </>
            ) : platform === 'mobile' ? (
              <>
                <p className="muted small backup-platform__lead">
                  Download a <strong>portable ZIP</strong> to back up text and images on this phone, or import a backup
                  from desktop or another device. JSON-only exports skip photos.
                </p>
                <div className="backup-platform__actions">
                  <Button
                    type="button"
                    variant="primary"
                    icon={<IcDownload size={17} />}
                    onClick={onExportPortableZip}
                  >
                    Download portable ZIP
                  </Button>
                  <Button type="button" variant="secondary" icon={<IcUpload size={17} />} onClick={onImportBackup} disabled={importBusy}>
                    Import portable backup
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    icon={<IcUpload size={17} />}
                    title="Add new items from another device's backup without replacing what's here"
                    onClick={onMergeImport}
                    disabled={importBusy}
                  >
                    Merge from another device
                  </Button>
                  {fileInput}
                </div>
                <details className="backup-platform__advanced">
                  <summary className="small">Text-only JSON (advanced)</summary>
                  <p className="muted small backup-platform__footnote">
                    JSON includes text and settings, not photos pasted into notes. Clearing browser data can erase local
                    copies.
                  </p>
                  <div className="backup-platform__actions">
                    <Button type="button" variant="secondary" icon={<IcDownload size={17} />} onClick={onExportJson}>
                      Download JSON
                    </Button>
                  </div>
                </details>
              </>
            ) : (
              <>
                <p className="muted small backup-platform__lead">
                  Export a <strong>portable ZIP</strong> to keep notes and images in one file, or import a backup from
                  desktop or another browser. JSON-only exports skip embedded images.
                </p>
                <div className="backup-platform__actions">
                  <Button
                    type="button"
                    variant="primary"
                    icon={<IcDownload size={17} />}
                    onClick={onExportPortableZip}
                  >
                    Export portable ZIP
                  </Button>
                  <Button type="button" variant="secondary" icon={<IcUpload size={17} />} onClick={onImportBackup} disabled={importBusy}>
                    Import portable backup
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    icon={<IcUpload size={17} />}
                    title="Add new items from another device's backup without replacing what's here"
                    onClick={onMergeImport}
                    disabled={importBusy}
                  >
                    Merge from another device
                  </Button>
                  {fileInput}
                </div>
                <details className="backup-platform__advanced">
                  <summary className="small">Text-only JSON (advanced)</summary>
                  <p className="muted small backup-platform__footnote">
                    JSON does not include embedded images — only pointers stored on the device that created them.
                  </p>
                  <div className="backup-platform__actions">
                    <Button type="button" variant="secondary" icon={<IcDownload size={17} />} onClick={onExportJson}>
                      Export JSON
                    </Button>
                  </div>
                </details>
              </>
            )}
          </div>
        </>
      ) : null}

      {isElectron ? (
        <>
          <p className="muted small" style={{ marginBottom: 12 }}>
            Cadence saves automatic snapshots at launch, sign-in, and before each save. Restore any snapshot below —
            your current state is backed up first, so you can undo a restore.
            {liveSummary ? (
              <>
                {' '}
                <strong>Current workspace:</strong> {liveSummary}.
              </>
            ) : null}
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

      <div className="row" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <Button
          type="button"
          variant="secondary"
          icon={<IcRefresh size={16} />}
          title="Reload the snapshot list from disk"
          onClick={refresh}
          disabled={busy}
        >
          Refresh
        </Button>
        <Button
          type="button"
          variant="ghost"
          title="Open the Cadence data folder in Finder / Explorer"
          onClick={openFolder}
        >
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
          {hasLegacy ? (
            <DataSourceRow
              label="Legacy Leeadman data"
              sub="Pre-rename single-user file. Restoring imports it into your current account."
              info={sources.legacy}
              onRestore={(f) => restore(f, 'legacy data file')}
              restoreBusy={busy}
            />
          ) : null}

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
                  restoreBusy={busy}
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
                  restoreBusy={busy}
                />
              ))}
            </>
          ) : null}
        </>
      ) : (
        <p className="muted small">Loading…</p>
      )}
        </>
      ) : null}
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
  const { data } = useAppData();
  const workspace = useMemo(() => estimateWorkspaceStorage(data), [data]);
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
        Workspace size by area, plus disk usage on desktop. Cache buttons never touch your tasks, notes, or backups.
      </p>

      <div style={{ marginBottom: 16 }}>
        <p className="small" style={{ margin: '0 0 8px', fontWeight: 600 }}>
          Workspace content
        </p>
        <ul className="cache-stats">
          <CacheRow
            label={`Notes · ${workspace.counts.notes} active`}
            bytes={workspace.notesBytes}
            hint="Unlocked note titles and bodies in the active list."
          />
          {workspace.counts.notesArchived > 0 ? (
            <CacheRow
              label={`Notes · ${workspace.counts.notesArchived} archived`}
              bytes={workspace.notesArchivedBytes}
              hint="Shelved notes — hidden from Active but still in your workspace file."
            />
          ) : null}
          <CacheRow
            label={`To-dos · ${workspace.counts.todoItems} active`}
            bytes={workspace.todoItemsBytes}
            hint="Open and completed tasks in active lists."
          />
          {workspace.counts.todoItemsArchived > 0 ? (
            <CacheRow
              label={`To-dos · ${workspace.counts.todoItemsArchived} archived`}
              bytes={workspace.todoItemsArchivedBytes}
              hint="Shelved tasks — hidden from Active but still in your workspace file."
            />
          ) : null}
          <CacheRow
            label={`Team work · ${workspace.counts.teamItems} items`}
            bytes={workspace.teamItemsBytes}
            hint="Agenda items, goals, and 1:1 notes across teams."
          />
          <CacheRow
            label="Teams & people"
            bytes={workspace.teamsAndPeopleBytes}
            hint="Team metadata, roster, and profile."
          />
          <CacheRow
            label="Settings & other"
            bytes={workspace.otherBytes}
            hint="Todo lists, AI settings, utility docs, lock state, reminders."
          />
          <CacheRow
            label="Workspace JSON total"
            bytes={workspace.totalBytes}
            emphasis
            hint="Sum of the rows above — approximate in-memory size before encryption."
          />
        </ul>
      </div>

      {!isElectron ? (
        <>
          <p className="muted small">
            Disk diagnostics are only available in the desktop app. The PWA stores your workspace in this browser&apos;s
            local storage — the breakdown above reflects your current data size.
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
            <CacheRow
              label="Encrypted workspace files"
              bytes={stats.dataFileBytes}
              hint="Your workspace on disk (desktop app). Never touched by cache buttons."
            />
            {stats.legacyBytes > 0 ? (
              <CacheRow label="Legacy data file" bytes={stats.legacyBytes} hint="Pre-accounts era single-user file. Kept until you delete it manually." />
            ) : null}
            <CacheRow
              label={`Backups · ${stats.backupsSelfCount} snapshot${stats.backupsSelfCount === 1 ? '' : 's'}`}
              bytes={stats.backupsSelfBytes}
              hint="Rolling 50-snapshot safety net (data + attachment sidecars). Auto-pruned."
            />
            {'attachmentsSelfBytes' in stats && stats.attachmentsSelfBytes > 0 ? (
              <CacheRow
                label={`Rich-text images · ${stats.attachmentsSelfCount} file${stats.attachmentsSelfCount === 1 ? '' : 's'}`}
                bytes={stats.attachmentsSelfBytes}
                hint="Sidecar files for pasted screenshots and uploaded images in notes/todos."
              />
            ) : null}
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
            Want to browse the folder? Use <strong>Backup &amp; recovery → Open data folder</strong> above.
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
  restoreBusy,
}: {
  info: DataFileInfo | null;
  label: string;
  sub?: string;
  onRestore: ((filePath: string) => void) | null;
  restoreBusy?: boolean;
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
            disabled={restoreBusy || (info.encrypted && !info.decryptable)}
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

// ─── Account recovery codes (local-first password reset) ─────────────────────

function AccountRecoverySection() {
  const { user, setupRecovery, confirmRecoverySetup, getRecoveryStatus } = useAccount();
  const toast = useToast();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [configuredAt, setConfiguredAt] = useState<string | undefined>();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [newCodes, setNewCodes] = useState<string[] | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setConfigured(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const r = await getRecoveryStatus();
      setConfigured(r.configured);
      setConfiguredAt(r.configuredAt);
    } finally {
      setLoading(false);
    }
  }, [user, getRecoveryStatus]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const state = location.state as { recoverySetupRequired?: boolean } | null;
    if (!state?.recoverySetupRequired) return;
    toast.showInfo(
      'Generate new recovery codes',
      'Password reset succeeded. Create and save a fresh set of recovery codes for this device.',
    );
    window.history.replaceState({}, document.title);
  }, [location.state, toast]);

  if (!user) return null;

  if (newCodes) {
    return (
      <CollapsibleCard id="recovery-codes" title="Recovery codes" badge="New" defaultOpen>
        <RecoveryCodesPanel
          codes={newCodes}
          title="Save your new recovery codes"
          onConfirmed={() => {
            void (async () => {
              const r = await confirmRecoverySetup();
              if (!r.ok) {
                toast.showError('Could not save recovery codes', r.error);
                return;
              }
              setNewCodes(null);
              setPassword('');
              void refresh();
              toast.showSuccess('Recovery codes saved', 'Keep them somewhere safe — we cannot show them again.');
            })();
          }}
        />
      </CollapsibleCard>
    );
  }

  const generate = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await setupRecovery(password);
      if (r.ok && r.recoveryCodes) {
        setNewCodes(r.recoveryCodes);
        setPassword('');
      } else {
        toast.showError('Could not create recovery codes', r.error);
      }
    } finally {
      setBusy(false);
    }
  };

  const badge = loading ? '…' : configured ? 'Active' : 'Not set up';
  const configuredLabel =
    configured && configuredAt
      ? `Active since ${new Date(configuredAt).toLocaleDateString()}`
      : configured
        ? 'Active on this device'
        : 'Not configured';

  return (
    <CollapsibleCard id="recovery-codes" title="Recovery codes" badge={badge} defaultOpen={!configured}>
      <p className="muted">
        Like a crypto wallet seed phrase — these codes let you reset your account password on{' '}
        <strong>this device only</strong>. No server is involved. Changing your password clears the
        old codes; generate a fresh set afterward.
      </p>
      <p className="muted small">Status: {configuredLabel}</p>
      <form
        className="row"
        style={{ marginTop: 10, flexDirection: 'column', alignItems: 'stretch', maxWidth: 360 }}
        onSubmit={(e) => void generate(e)}
      >
        <label className="field">
          <span>Account password (to {configured ? 'regenerate' : 'create'} codes)</span>
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <Button type="submit" variant="secondary" icon={<IcLock size={17} />} disabled={busy || !password}>
          {busy ? 'Working…' : configured ? 'Regenerate recovery codes' : 'Generate recovery codes'}
        </Button>
      </form>
      {configured ? (
        <p className="muted small" style={{ marginTop: 8 }}>
          Regenerating prepares a new set — your previous codes stay active until you confirm you saved the new ones.
        </p>
      ) : null}
    </CollapsibleCard>
  );
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
  const { badgeLabel, preset: currentPreset } = resolveAppProfileLabel(features, managed, source);

  return (
    <CollapsibleCard
      id="app-profile"
      title="App profile"
      defaultOpen={false}
      badge={badgeLabel}
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

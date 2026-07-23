import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { IcDownload, IcLock, IcRefresh, IcSparkles, IcTrash, IcUpload } from '../components/icons';
import { Button } from '../components/ui/Button';
import { IcHelpCircle } from '../components/icons';
import { useAccount } from '../AccountContext';
import { useSession } from '../AuthContext';
import { useToast } from '../components/ui/Toast';
import { useConfirm } from '../components/ui/ConfirmProvider';
import { AppModal, AppModalActions } from '../components/ui/AppModal';
import { askAI, AIError, defaultModel } from '../lib/ai';
import { APP_SLUG } from '../lib/appBranding';
import { formatAppVersion } from '../lib/appVersionLabel';
import { resolveAppProfileLabel } from '../lib/appProfileLabel';
import type { AIProvider } from '../model';
import { AI_PROVIDER_OPTIONS, appDataToPersistJson, compactAppDataForPersist, normalizeData } from '../model';
import {
  describeMergeSummary,
  mergeAppendWorkspace,
  type MergeAppendSummary,
} from '../core/model/mergeWorkspace';
import type {
  CacheBreakdownEntry,
  CacheStats,
  DailyBackupMirrorPrefs,
  DataFileInfo,
  DataSources,
  SaveError,
} from '../vite-env';
import { CollapsibleCard } from '../components/ui/CollapsibleCard';
import { RecoveryCodesPanel } from '../components/RecoveryCodesPanel';
import { prepareForRemoteApply } from '../lib/syncApplyGuard';
import { estimateWorkspaceStorage } from '../lib/workspaceStorageStats';
import { isElectronApp, backupPlatform, backupPlatformLabel } from '../lib/runtime';
import { exportPortableBackupZip, importPortableBackupFile } from '../lib/backupBundle';
import { useAppData } from '../AppDataContext';
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
  const { data, importWorkspace, syncFromDisk, flushPendingSave, getLatestSnapshot } = useAppData();
  const { user } = useAccount();
  const { pinEnabled, refresh: refreshSession, lockSession } = useSession();
  const toast = useToast();
  const { confirm } = useConfirm();
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
    const description = isZip
      ? 'Your current workspace and images on this device will be replaced. Export first if you are unsure.'
      : 'Your workspace will be replaced. JSON does not include images — use a .zip portable backup for pictures.';
    if (
      !(await confirm({
        title: isZip ? 'Import portable backup?' : 'Import JSON backup?',
        description,
        confirmLabel: 'Import',
        danger: true,
      }))
    ) {
      return;
    }

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
      // Flush debounced editor / locked-note buffers into the in-memory
      // snapshot BEFORE we read the merge base, otherwise unsaved local edits
      // are excluded from the merge and then lost when the merged result is
      // imported (replace). `flushPendingSave` runs the before-flush hooks and
      // commits them synchronously to the snapshot store.
      await flushPendingSave();
      const r = await importPortableBackupFile(file, {
        userId: user.id,
        importWorkspace: async (next) => {
          const imported = await importWorkspace(next);
          if (!imported.ok) return imported;
          return { ok: true as const };
        },
        transformWorkspace: (remote) => {
          // Read the freshest local snapshot (post-flush) rather than the stale
          // render closure `data`.
          const merged = mergeAppendWorkspace(getLatestSnapshot(), remote);
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
      !(await confirm({
        title: 'Import full backup folder?',
        description: 'This replaces your workspace and attachment files on this device.',
        confirmLabel: 'Import',
        danger: true,
      }))
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
        <CollapsibleCard
          id="version"
          title="Application version"
          defaultOpen={false}
          badge={formatAppVersion(appVersion).label}
        >
          {(() => {
            const v = formatAppVersion(appVersion);
            return (
              <>
                <p>
                  Installed release: <strong>{v.label}</strong>
                </p>
                <p className="muted small">
                  {v.build !== null ? <>Build {v.build} · </> : null}
                  {v.raw ? <>Version {v.raw} · </> : null}
                  Data schema v{data.version}
                </p>
              </>
            );
          })()}
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

type UpdaterPhase =
  | { kind: 'checking'; attempt?: number }
  | { kind: 'available'; version?: string }
  | { kind: 'downloading'; percent: number; transferred: number; total: number }
  | { kind: 'downloaded'; version?: string }
  | { kind: 'not-available'; version?: string }
  | { kind: 'dev' }
  | { kind: 'unsupported' }
  | { kind: 'error'; message?: string };

/** How many times the initial check auto-retries before showing an error. */
const UPDATE_CHECK_MAX_ATTEMPTS = 3;

function UpdaterDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { flushPendingSave } = useAppData();
  const [phase, setPhase] = useState<UpdaterPhase>({ kind: 'checking' });
  const [installing, setInstalling] = useState(false);
  const toast = useToast();
  // Set by the effect while the dialog is open; lets the "Try again" button
  // restart the whole check (with a fresh retry budget) from render scope.
  const restartRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!open) return;
    const api = window.cadence;
    if (!api?.onUpdaterEvent || !api?.checkForUpdates) {
      setPhase({ kind: 'unsupported' });
      return;
    }

    let attempt = 0;
    // Once the flow reaches a real result (available/downloading/…), a later
    // error is a genuine download error — surface it instead of retrying.
    let progressed = false;
    let handled = false;
    let disposed = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const failOrRetry = (message?: string) => {
      if (disposed || handled) return;
      handled = true;
      if (!progressed && attempt < UPDATE_CHECK_MAX_ATTEMPTS - 1) {
        attempt += 1;
        setPhase({ kind: 'checking', attempt });
        retryTimer = setTimeout(() => {
          handled = false;
          start();
        }, 1200 * attempt);
      } else {
        setPhase({ kind: 'error', message });
      }
    };

    const start = () => {
      if (disposed) return;
      handled = false;
      setPhase(attempt > 0 ? { kind: 'checking', attempt } : { kind: 'checking' });
      setInstalling(false);
      void (async () => {
        try {
          const r = await api.checkForUpdates?.();
          if (r && !r.ok) {
            if (r.reason === 'dev') {
              handled = true;
              setPhase({ kind: 'dev' });
            } else {
              failOrRetry(r.error || 'Update check failed.');
            }
          }
        } catch (err) {
          failOrRetry(err instanceof Error ? err.message : String(err));
        }
      })();
    };

    const off = api.onUpdaterEvent((e) => {
      if (disposed) return;
      switch (e.status) {
        case 'checking':
          // Preserve any retry-attempt label already set by `start`.
          break;
        case 'available':
          progressed = true;
          handled = true;
          setPhase({ kind: 'available', version: e.version });
          break;
        case 'downloading':
          progressed = true;
          handled = true;
          setPhase({
            kind: 'downloading',
            percent: e.percent,
            transferred: e.transferred,
            total: e.total,
          });
          break;
        case 'downloaded':
          progressed = true;
          handled = true;
          setPhase({ kind: 'downloaded', version: e.version });
          break;
        case 'not-available':
          progressed = true;
          handled = true;
          setPhase({ kind: 'not-available', version: e.version });
          break;
        case 'error':
          if (progressed) setPhase({ kind: 'error', message: e.message });
          else failOrRetry(e.message);
          break;
      }
    });

    restartRef.current = () => {
      if (retryTimer) clearTimeout(retryTimer);
      attempt = 0;
      progressed = false;
      handled = false;
      start();
    };

    start();

    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      restartRef.current = null;
      off?.();
    };
  }, [open]);

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

  const updaterFooter =
    phase.kind === 'downloaded' ? (
      <AppModalActions
        onCancel={onClose}
        onConfirm={() => void installNow()}
        cancelLabel="Later"
        confirmLabel={installing ? 'Installing…' : 'Install & restart'}
        confirmDisabled={installing}
        cancelDisabled={installing}
        busy={installing}
      />
    ) : phase.kind === 'error' ? (
      <AppModalActions
        onCancel={onClose}
        onConfirm={() => restartRef.current?.()}
        cancelLabel="Close"
        confirmLabel="Try again"
      />
    ) : phase.kind === 'not-available' ||
      phase.kind === 'dev' ||
      phase.kind === 'unsupported' ? (
      <div className="app-modal__actions">
        <button type="button" className="app-modal__btn-confirm" onClick={onClose}>
          OK
        </button>
      </div>
    ) : undefined;

  return (
    <AppModal
      title="App update"
      onClose={onClose}
      size="sm"
      className="updater-backdrop"
      footer={updaterFooter}
    >
      {phase.kind === 'checking' && (
        <p className="muted">
          {phase.attempt
            ? `Connection hiccup — retrying… (attempt ${phase.attempt + 1} of ${UPDATE_CHECK_MAX_ATTEMPTS})`
            : 'Checking GitHub Releases for a newer version…'}
        </p>
      )}

      {phase.kind === 'available' && (
        <>
          <p>
            A newer version
            {phase.version ? <> (<strong>{formatAppVersion(phase.version).label}</strong>)</> : ''} is
            available. Downloading now…
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
            Update{phase.version ? <> <strong>{formatAppVersion(phase.version).label}</strong></> : ''} is
            ready to install.
          </p>
          <p className="muted small">
            The app will quit, swap in the new version, and relaunch automatically.
          </p>
        </>
      )}

      {phase.kind === 'not-available' && (
        <p>
          You're on the latest version
          {phase.version ? <> (<strong>{formatAppVersion(phase.version).label}</strong>)</> : ''}.
        </p>
      )}

      {phase.kind === 'dev' && (
        <>
          <p>Update checks are disabled in development mode.</p>
          <p className="muted small">
            Run a packaged build to receive auto-updates from GitHub Releases.
          </p>
        </>
      )}

      {phase.kind === 'unsupported' && <p>Auto-updates are only available in the packaged desktop app.</p>}

      {phase.kind === 'error' && (
        <>
          <p>We couldn't reach the update server.</p>
          <p className="muted small">
            Please check your internet connection and try again. Your app keeps working normally in
            the meantime, and it will check again automatically the next time you open it.
          </p>
          {phase.message ? (
            <details style={{ marginTop: 8 }}>
              <summary className="muted small" style={{ cursor: 'pointer' }}>
                Technical details
              </summary>
              <pre
                className="pre"
                style={{ whiteSpace: 'pre-wrap', maxHeight: 160, overflow: 'auto', marginTop: 6 }}
              >
                {phase.message}
              </pre>
            </details>
          ) : null}
        </>
      )}
    </AppModal>
  );
}

/**
 * Bring-your-own-key AI settings. The key lives in AppData (encrypted at rest
 * in Electron, plaintext in PWA localStorage — we say so explicitly). All API
 * calls run from the renderer; we never proxy through any of our own servers.
 */
function AISettingsSection() {
  const { confirm } = useConfirm();
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

  const remove = async () => {
    if (
      !(await confirm({
        title: 'Remove API key?',
        description: 'The stored API key will be removed from this device.',
        confirmLabel: 'Remove',
        danger: true,
      }))
    ) {
      return;
    }
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
          <Button type="button" variant="ghost" icon={<IcTrash size={16} />} onClick={() => void remove()}>
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
  const { confirm } = useConfirm();
  const toast = useToast();
  const { data, reload, flushPendingSave } = useAppData();
  const platform = backupPlatform();
  const isElectron = platform === 'desktop';
  const [sources, setSources] = useState<DataSources | null>(null);
  const [selectedBackupPath, setSelectedBackupPath] = useState<string | null>(null);
  const [mirrorPrefs, setMirrorPrefs] = useState<DailyBackupMirrorPrefs | null>(null);
  const [mirrorKeepDays, setMirrorKeepDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [saveError, setSaveError] = useState<SaveError | null>(null);

  const supportsDailyMirror =
    isElectron && typeof window !== 'undefined' && !!window.cadence?.backupMirrorGet;

  const refreshMirror = async () => {
    if (!supportsDailyMirror) return;
    try {
      const r = await window.cadence!.backupMirrorGet!();
      if (r.prefs) setMirrorPrefs(r.prefs);
      if (typeof r.keepDays === 'number') setMirrorKeepDays(r.keepDays);
    } catch (err) {
      console.warn('[cadence] backupMirrorGet failed', err);
    }
  };

  const refresh = async () => {
    if (!isElectron) return;
    setBusy(true);
    try {
      const r = await window.cadence!.dataListSources!();
      setSources(r);
      setSelectedBackupPath((prev) => {
        if (prev && r.backups.some((b) => b.path === prev)) return prev;
        return r.backups[0]?.path ?? null;
      });
      await refreshMirror();
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
    if (
      !(await confirm({
        title: `Restore from "${label}"?`,
        description:
          'Your current data will be snapshotted first so you can undo this.',
        confirmLabel: 'Restore',
        danger: true,
      }))
    ) {
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
            Cadence saves automatic snapshots at launch, sign-in, and before each save — workspace text, images, and
            note history. Restoring puts that full set back; your current state is snapshotted first so you can undo.
            {liveSummary ? (
              <>
                {' '}
                <strong>Current workspace:</strong> {liveSummary}.
              </>
            ) : null}
          </p>

          {supportsDailyMirror && canExport ? (
            <div className="backup-daily-mirror">
              <h3 className="backup-daily-mirror__title">Daily full backup folder</h3>
              <p className="muted small backup-daily-mirror__lead">
                Optional. In-app snapshots keep working as before. If you choose a folder, Cadence also writes one{' '}
                <strong>full export</strong> there per day (data, images, note history) — so a copy survives even if
                the app is removed. Files are <strong>readable on disk</strong> (same as Export full backup) — pick a
                private folder. Older daily folders are pruned after {mirrorKeepDays} days. Restore with{' '}
                <strong>Import backup folder</strong>.
              </p>
              {mirrorPrefs?.mirrorDir ? (
                <p className="small backup-daily-mirror__path" title={mirrorPrefs.mirrorDir}>
                  <strong>Folder:</strong> {mirrorPrefs.mirrorDir}
                </p>
              ) : (
                <p className="muted small">No folder selected — daily off-app backup is off.</p>
              )}
              {mirrorPrefs?.lastOkAt ? (
                <p className="muted small">
                  Last daily backup: {formatRelativeTime(mirrorPrefs.lastOkAt)}
                  {mirrorPrefs.lastDailyDate ? ` (${mirrorPrefs.lastDailyDate})` : ''}.
                </p>
              ) : null}
              {mirrorPrefs?.lastError ? (
                <p className="small backup-daily-mirror__error" role="alert">
                  Last attempt failed: {mirrorPrefs.lastError}
                </p>
              ) : null}
              <div className="backup-platform__actions">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy || importBusy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const r = await window.cadence!.backupMirrorChooseDir!();
                      if (r.canceled) return;
                      if (!r.ok) {
                        toast.showError('Daily backup', r.error || 'Could not set folder.');
                        return;
                      }
                      if (r.prefs) setMirrorPrefs(r.prefs);
                      if (typeof r.keepDays === 'number') setMirrorKeepDays(r.keepDays);
                      toast.showSuccess('Daily backup folder set', 'A full export will run once per day.');
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {mirrorPrefs?.mirrorDir ? 'Change folder' : 'Choose folder'}
                </Button>
                {mirrorPrefs?.mirrorDir ? (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={busy || importBusy || !data}
                      onClick={async () => {
                        if (!data) return;
                        setBusy(true);
                        try {
                          await flushPendingSave();
                          const r = await window.cadence!.backupMirrorRunNow!(data);
                          if (r.prefs) setMirrorPrefs(r.prefs);
                          if (!r.ok) {
                            toast.showError('Daily backup', r.error || 'Backup failed.');
                            return;
                          }
                          toast.showSuccess('Daily backup written', r.path || 'Folder updated.');
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Backup now
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={busy || importBusy}
                      onClick={async () => {
                        if (
                          !(await confirm({
                            title: 'Stop daily folder backups?',
                            description:
                              'In-app automatic snapshots are unchanged. Existing files in the folder are not deleted.',
                            confirmLabel: 'Clear folder setting',
                          }))
                        ) {
                          return;
                        }
                        setBusy(true);
                        try {
                          const r = await window.cadence!.backupMirrorClearDir!();
                          if (!r.ok) {
                            toast.showError('Daily backup', r.error || 'Could not clear setting.');
                            return;
                          }
                          if (r.prefs) setMirrorPrefs(r.prefs);
                          toast.showSuccess('Daily backup folder cleared', 'Off-app daily backups are off.');
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Clear
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
          ) : null}

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
            <div className="backup-snapshots">
              <h3 className="backup-snapshots__title">Automatic snapshots</h3>
              <p className="muted small backup-snapshots__lead">
                {sources.backups.length} local safety cop{sources.backups.length === 1 ? 'y' : 'ies'} (up to 50).
                Pick one to preview or restore — same coverage as a full local backup.
              </p>
              <label className="backup-snapshots__picker">
                <span className="backup-snapshots__picker-label">Snapshot</span>
                <select
                  className="backup-snapshots__select"
                  value={selectedBackupPath ?? sources.backups[0]?.path ?? ''}
                  onChange={(e) => setSelectedBackupPath(e.target.value)}
                  disabled={busy}
                  aria-label="Choose automatic snapshot"
                >
                  {sources.backups.map((b) => (
                    <option key={b.path} value={b.path}>
                      {formatSnapshotOptionLabel(b)}
                    </option>
                  ))}
                </select>
              </label>
              {(() => {
                const selected =
                  sources.backups.find((b) => b.path === selectedBackupPath) ?? sources.backups[0] ?? null;
                if (!selected) return null;
                return (
                  <DataSourceRow
                    info={selected}
                    label={formatSnapshotKindLabel(selected.name)}
                    sub={`${formatBytes(selected.bytes)} · ${formatRelativeTime(selected.mtime)}`}
                    onRestore={(f) => restore(f, selected.name)}
                    restoreBusy={busy}
                  />
                );
              })()}
            </div>
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
  const { confirm } = useConfirm();
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
      !(await confirm({
        title: 'Clear cache?',
        description:
          'Any temporary browser-engine caches on this device will be removed. Tasks, notes, AI keys, backups, and your account list are not affected. The next page load may take a few seconds longer.',
        confirmLabel: 'Clear cache',
        danger: true,
      }))
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

const SNAPSHOT_KIND_LABELS: Record<string, string> = {
  'pre-save': 'Before save',
  'pre-restore': 'Before restore',
  'pre-import': 'Before import',
  'pre-write': 'Before write',
  'pre-monthly-layout': 'Before layout change',
  'pre-pwchange': 'Before password change',
  'pre-recovery': 'Before recovery',
  launch: 'At launch',
  'post-login': 'After sign-in',
};

/** Human label from `data-<kind>-<ts>.json` filenames. */
function formatSnapshotKindLabel(name: string): string {
  const m = /^data-([a-z0-9-]+)-\d{4}-.+\.json$/i.exec(name);
  if (!m) return name;
  const kind = m[1].toLowerCase();
  return SNAPSHOT_KIND_LABELS[kind] ?? kind.replace(/-/g, ' ');
}

function formatSnapshotOptionLabel(info: DataFileInfo): string {
  const kind = formatSnapshotKindLabel(info.name);
  const when = formatRelativeTime(info.mtime) || 'unknown time';
  const notes = info.counts?.notes;
  const tasks = info.counts?.todoItems;
  const shape =
    notes != null || tasks != null
      ? ` · ${tasks ?? 0} task${(tasks ?? 0) === 1 ? '' : 's'}, ${notes ?? 0} note${(notes ?? 0) === 1 ? '' : 's'}`
      : '';
  return `${kind} · ${when}${shape}`;
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
            AI, export and update settings are{' '}
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
      label: 'AI assistant',
      on: features.ai,
      hint: 'Bring-your-own-key calls to OpenAI / Anthropic from the renderer.',
    },
    {
      label: 'Data export',
      on: features.dataExport,
      hint: 'JSON backup downloads from the Backup card.',
    },
    {
      label: 'Auto updates',
      on: features.updateCheck,
      hint: 'Periodic + manual checks against GitHub Releases.',
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

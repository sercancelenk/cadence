/**
 * Welcome tour — a 3-step "you just signed up, here's what Cadence is"
 * walkthrough that ONLY shows on the very first authenticated load
 * per account. After it's dismissed (any of the three exit paths) we
 * stamp `cadence.tour.completed.v1=<accountId>` and never show it
 * again on this device.
 *
 * Why this exists:
 *   The app is genuinely complex (teams, todos, notes, LAN sync,
 *   cloud sync, AI assistant). Without a tour, new users land on an
 *   empty workspace and bounce. Three short cards in a row are enough
 *   to set expectations and point at the two features that need any
 *   setup (cloud sync, AI key) without being annoying.
 *
 * Hard constraints:
 *   - Must NOT block first-paint. It mounts after `AppData.ready` and
 *     decides "should I show" from localStorage synchronously.
 *   - New sign-ups stash recovery codes in sessionStorage; the tour
 *     injects a mandatory "save your codes" step before the rest can be
 *     skipped. If the tour is suppressed (returning device) but codes
 *     are still pending, only the recovery step is shown.
 *   - Must survive a fresh install on a paired phone. Pairing the
 *     phone already counts as "I'm a returning user" — we suppress
 *     the tour if the user has any LAN/Drive sync state on this
 *     device.
 *   - Must be theme-aware. Reuses existing `.btn`, `.card`, and
 *     `.surface` tokens (no inline colours).
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAccount } from '../AccountContext';
import { RecoveryCodesPanel } from './RecoveryCodesPanel';
import { loadPair } from '../lib/lanSyncClient';
import { loadStoredTokens, isClientConfigured } from '../lib/syncBackends/gdriveAuth';
import {
  clearPendingRecoveryCodes,
  readPendingRecoveryCodes,
} from '../lib/pendingRecoveryCodes';
import { PRESET_LABELS, useFeatures, type PresetName } from '../lib/features';

const COMPLETED_KEY = 'cadence.tour.completed.v1';

function readCompletedAccountIds(): string[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(COMPLETED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function markCompleted(accountId: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  const ids = readCompletedAccountIds();
  if (ids.includes(accountId)) return;
  try {
    window.localStorage.setItem(COMPLETED_KEY, JSON.stringify([...ids, accountId]));
  } catch {
    /* QuotaExceededError on private mode — fine, we just show the tour again */
  }
}

/**
 * Are there any signals that this device has already been used as a
 * Cadence install? If yes, we don't show the tour — the user is
 * returning, not new.
 */
function looksLikeReturningDevice(): boolean {
  // LAN sync pair persisted = device was paired before.
  if (loadPair()) return true;
  // Drive sync tokens persisted = device signed into Drive before.
  if (loadStoredTokens()) return true;
  return false;
}

export function WelcomeTour() {
  const { user } = useAccount();
  const { managed, hasUserPreset, setPreset, features } = useFeatures();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [chosenPreset, setChosenPreset] = useState<PresetName | null>(null);
  const [pendingRecovery, setPendingRecovery] = useState<string[] | null>(() => readPendingRecoveryCodes());
  const [recoveryAcknowledged, setRecoveryAcknowledged] = useState(false);

  // Decide ONCE on mount whether this run should show the tour. We
  // recompute only when the account changes (e.g. user signs out
  // and signs back in).
  const shouldShowTour = useMemo(() => {
    if (!user) return false;
    if (looksLikeReturningDevice()) return false;
    // If the user already picked an "App profile" preset on this device
    // (e.g. they completed an earlier tour and just signed up under a
    // new account) we still want to show the welcome cards, but the
    // policy/preset step itself becomes informational instead of a
    // forced choice.
    return !readCompletedAccountIds().includes(user.id);
  }, [user]);

  const shouldOpen = shouldShowTour || !!pendingRecovery;

  useEffect(() => {
    if (shouldOpen) setOpen(true);
  }, [shouldOpen]);

  useEffect(() => {
    setPendingRecovery(readPendingRecoveryCodes());
    setRecoveryAcknowledged(false);
    setStep(0);
  }, [user?.id]);

  if (!open || !user) return null;

  const dismiss = () => {
    setOpen(false);
    if (shouldShowTour) markCompleted(user.id);
  };

  type Step = {
    title: string;
    body: ReactNode;
    /** Step-specific override for the "advance" button label. */
    nextLabel?: string;
    /** Whether the Next button is allowed to proceed (e.g. preset chosen). */
    nextEnabled?: boolean;
    /** Recovery step — must be completed before Skip / dismiss. */
    isRecovery?: boolean;
  };

  // Three-step tour, with an EXTRA first step injected when the user
  // hasn't yet chosen a preset and isn't on a managed device. That step
  // is the single source of truth for "where will you use Cadence?".
  const steps: Step[] = [];

  const needsProfileStep = !managed && !hasUserPreset && shouldShowTour;

  if (needsProfileStep) {
    steps.push({
      title: 'Where will you use Cadence?',
      body: (
        <>
          <p>
            Pick the profile that matches your situation. Cadence ships with three sensible
            defaults; you can change this any time from Settings → App profile.
          </p>
          <div className="welcome-tour__presets">
            {(['personal', 'work-standard', 'work-strict'] as PresetName[]).map((p) => {
              const label = PRESET_LABELS[p];
              const isSelected = chosenPreset === p;
              return (
                <button
                  key={p}
                  type="button"
                  className={`welcome-tour__preset${isSelected ? ' welcome-tour__preset--selected' : ''}`}
                  onClick={() => {
                    setChosenPreset(p);
                    setPreset(p);
                  }}
                  aria-pressed={isSelected}
                >
                  <span className="welcome-tour__preset-title">{label.title}</span>
                  <span className="welcome-tour__preset-desc">{label.description}</span>
                </button>
              );
            })}
          </div>
        </>
      ),
      nextEnabled: chosenPreset !== null,
    });
  } else if (managed && shouldShowTour) {
    steps.push({
      title: 'Welcome to Cadence',
      body: (
        <>
          <p>
            <strong>This device is managed by your organization.</strong> Sync, AI, export and
            update settings have been pre-configured for you — you don&apos;t need to set anything
            up. Anything that doesn&apos;t appear in Settings has been disabled by your
            administrator.
          </p>
          <p className="muted small">
            See Settings → App profile for the full list of enabled features and the policy file
            governing this device.
          </p>
        </>
      ),
    });
  }

  if (pendingRecovery) {
    steps.push({
      title: 'Save your recovery codes',
      isRecovery: true,
      body: (
        <>
          <p>
            Your account is set up with <strong>recovery codes</strong> — like a crypto wallet seed phrase.
            They are the only way to reset your password on this device without a backup export.
          </p>
          <RecoveryCodesPanel
            embedded
            codes={pendingRecovery}
            onAcknowledgedChange={setRecoveryAcknowledged}
          />
        </>
      ),
      nextEnabled: recoveryAcknowledged,
      nextLabel: 'I saved them — continue',
    });
  }

  if (shouldShowTour) {
  steps.push({
    title: needsProfileStep ? "Here's what Cadence is" : 'Welcome to Cadence',
    body: (
      <>
        <p>
          Cadence is a local-first workspace for managing teams, notes, and to-dos. Everything you
          create lives on your device by default — nothing leaves it unless you choose.
        </p>
        <ul className="welcome-tour__bullets">
          <li>
            <strong>To-dos</strong> with reminders, schedules, and status tracking.
          </li>
          <li>
            <strong>Notes</strong> with optional passphrase-protected encryption.
          </li>
          <li>
            <strong>Teams</strong>, people, agendas, and analytics.
          </li>
        </ul>
      </>
    ),
  });

  // Sync overview only makes sense when at least one sync backend is
  // available under the current policy/preset. Otherwise we'd be teasing
  // the user about a feature they can't actually use.
  if (features.sync.lan || features.sync.cloud) {
    steps.push({
      title: 'Sync across devices, on your terms',
      body: (
        <>
          <p>
            Cadence has up to two ways to keep multiple devices in sync — both optional, and you
            can mix them. (Some options may be unavailable in your profile.)
          </p>
          <ul className="welcome-tour__bullets">
            {features.sync.lan ? (
              <li>
                <strong>LAN sync</strong> — turn your computer into a tiny private host. Your phone
                joins by scanning a QR code on the same Wi-Fi. No cloud, no account.
              </li>
            ) : null}
            {features.sync.cloud ? (
              <li>
                <strong>Cloud sync (Google Drive)</strong>{' '}
                {isClientConfigured() ? (
                  <>— end-to-end encrypted, stored in your own Drive&apos;s hidden app folder.</>
                ) : (
                  <>
                    — available when your administrator configures a Google OAuth client ID. See
                    Settings for current status.
                  </>
                )}
              </li>
            ) : null}
          </ul>
        </>
      ),
    });
  }

  steps.push({
    title: 'A couple of next steps (all optional)',
    body: (
      <>
        <p>You can start using Cadence right now without configuring anything. When you&apos;re ready:</p>
        <ul className="welcome-tour__bullets">
          {features.sync.lan || features.sync.cloud ? (
            <li>
              Open <Link to="/settings">Settings → Sync</Link> to pair a device or sign in to a
              cloud backend.
            </li>
          ) : null}
          {features.ai ? (
            <li>
              Add an AI provider key in Settings → AI assistant if you want intelligent note &amp;
              todo extraction.
            </li>
          ) : null}
          <li>
            See <Link to="/settings">Settings → App profile</Link> to review which features are
            enabled on this device.
          </li>
          <li>
            Read the <Link to="/guide">user guide</Link> for backups, recovery codes, and sync.
          </li>
        </ul>
      </>
    ),
  });

  } // shouldShowTour

  const cur = steps[step];
  const isLast = step === steps.length - 1;
  const nextAllowed = cur.nextEnabled !== false;
  const hasOutstandingRecovery = !!pendingRecovery;
  const canSkip = !cur.isRecovery && !hasOutstandingRecovery;

  const advance = () => {
    if (cur.isRecovery) {
      clearPendingRecoveryCodes();
      setPendingRecovery(null);
      setRecoveryAcknowledged(false);
    }
    setStep((s) => s + 1);
  };

  const finish = () => {
    if (cur.isRecovery) {
      clearPendingRecoveryCodes();
      setPendingRecovery(null);
    }
    dismiss();
  };

  return (
    <div className="welcome-tour__backdrop" role="dialog" aria-modal="true" aria-labelledby="welcome-tour-title">
      <div className={`welcome-tour__card surface${cur.isRecovery ? ' welcome-tour__card--recovery' : ''}`}>
        <div className="welcome-tour__progress">
          {steps.map((_, i) => (
            <span
              key={i}
              className={`welcome-tour__dot ${i === step ? 'welcome-tour__dot--active' : ''}`}
              aria-hidden="true"
            />
          ))}
        </div>
        <h2 id="welcome-tour-title" className="welcome-tour__title">
          {cur.title}
        </h2>
        <div className="welcome-tour__body">{cur.body}</div>
        <div className="welcome-tour__actions">
          {canSkip ? (
            <button type="button" className="btn btn--ghost" onClick={dismiss}>
              Skip
            </button>
          ) : (
            <span />
          )}
          {!isLast ? (
            <button
              type="button"
              className="btn btn--primary"
              disabled={!nextAllowed}
              onClick={advance}
            >
              {cur.nextLabel ?? 'Next'}
            </button>
          ) : (
            <button type="button" className="btn btn--primary" disabled={!nextAllowed} onClick={finish}>
              Get started
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

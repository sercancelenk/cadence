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
 *   - Must survive a fresh install on a paired phone. Pairing the
 *     phone already counts as "I'm a returning user" — we suppress
 *     the tour if the user has any LAN/Drive sync state on this
 *     device.
 *   - Must be theme-aware. Reuses existing `.btn`, `.card`, and
 *     `.surface` tokens (no inline colours).
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAccount } from '../AccountContext';
import { loadPair } from '../lib/lanSyncClient';
import { loadStoredTokens, isClientConfigured } from '../lib/syncBackends/gdriveAuth';

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
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  // Decide ONCE on mount whether this run should show the tour. We
  // recompute only when the account changes (e.g. user signs out
  // and signs back in).
  const shouldShow = useMemo(() => {
    if (!user) return false;
    if (looksLikeReturningDevice()) return false;
    return !readCompletedAccountIds().includes(user.id);
  }, [user]);

  useEffect(() => {
    if (shouldShow) setOpen(true);
  }, [shouldShow]);

  if (!open || !user) return null;

  const dismiss = () => {
    setOpen(false);
    markCompleted(user.id);
  };

  const steps = [
    {
      title: 'Welcome to Cadence',
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
    },
    {
      title: 'Sync across devices, on your terms',
      body: (
        <>
          <p>
            Cadence has two ways to keep multiple devices in sync. Pick whichever fits how you
            work — both are optional.
          </p>
          <ul className="welcome-tour__bullets">
            <li>
              <strong>LAN sync</strong> — turn your computer into a tiny private host. Your phone
              joins by scanning a QR code on the same Wi-Fi. No cloud, no account.
            </li>
            <li>
              <strong>Cloud sync (Google Drive)</strong>{' '}
              {isClientConfigured() ? (
                <>— end-to-end encrypted, stored in your own Drive's hidden app folder.</>
              ) : (
                <>
                  — available when your administrator configures a Google OAuth client ID. See
                  Settings for current status.
                </>
              )}
            </li>
          </ul>
        </>
      ),
    },
    {
      title: 'Two short setup steps (optional)',
      body: (
        <>
          <p>You can start using Cadence right now without configuring anything. When you're ready:</p>
          <ul className="welcome-tour__bullets">
            <li>
              Open <Link to="/settings">Settings → Cloud sync</Link> to pair a device or sign in to
              Drive.
            </li>
            <li>
              Add an AI provider key in Settings → AI assistant if you want intelligent note &amp; todo
              extraction.
            </li>
            <li>
              For full guidance, see the README on GitHub — every feature is documented there.
            </li>
          </ul>
        </>
      ),
    },
  ];

  const cur = steps[step];
  const isLast = step === steps.length - 1;

  return (
    <div className="welcome-tour__backdrop" role="dialog" aria-modal="true" aria-labelledby="welcome-tour-title">
      <div className="welcome-tour__card surface">
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
          <button type="button" className="btn btn--ghost" onClick={dismiss}>
            Skip
          </button>
          {!isLast ? (
            <button type="button" className="btn btn--primary" onClick={() => setStep((s) => s + 1)}>
              Next
            </button>
          ) : (
            <button type="button" className="btn btn--primary" onClick={dismiss}>
              Get started
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

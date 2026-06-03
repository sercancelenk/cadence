// @ts-nocheck
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { migrateLegacyStorage } from './lib/legacyStorageMigration';
import { maybeHandleOAuthRedirect } from './lib/syncBackends/gdriveAuth';
import { registerServiceWorker } from './pwa';

// Copy any pre-rename `leeadman-*` localStorage / sessionStorage keys to
// their `cadence-*` equivalents BEFORE anything else reads from storage.
// Idempotent and self-marking; see `legacyStorageMigration.ts`.
migrateLegacyStorage();

// OAuth redirect handling. When this tab IS the popup that Google sent
// the user back to (URL contains `?oauth=google&code=…`), forward the
// code to the opener via postMessage and close ourselves. We MUST do
// this before mounting React — otherwise the popup briefly renders the
// app shell which flashes the user's workspace at Google's referrer.
if (maybeHandleOAuthRedirect()) {
  // The redirect handler will close this window shortly. Skip the
  // normal render path; document.body stays empty for the ~50 ms gap.
} else {
  const rootEl = document.getElementById('root');
  if (!rootEl) {
    throw new Error('Cadence: root element #root not found in document.');
  }

  createRoot(rootEl).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );

  registerServiceWorker();
}

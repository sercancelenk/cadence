import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { migrateLegacyStorage } from './lib/legacyStorageMigration';
import { retireCloudSyncState } from './lib/retireCloudSyncState';
import { registerServiceWorker } from './pwa';

// Copy any pre-rename `leeadman-*` localStorage / sessionStorage keys to
// their `cadence-*` equivalents BEFORE anything else reads from storage.
// Idempotent and self-marking; see `legacyStorageMigration.ts`.
migrateLegacyStorage();

// Cloud sync is product-disabled: clear dormant Drive tokens / active-backend
// pointer so a future accidental re-enable cannot sync against stale state.
// Does not touch local workspace data. Idempotent.
retireCloudSyncState();

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

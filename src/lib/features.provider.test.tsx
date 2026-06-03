import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FeaturesProvider, useFeatures } from './features';

function Probe() {
  const features = useFeatures();
  return (
    <div>
      <span data-testid="loading">{String(features.loading)}</span>
      <span data-testid="managed">{String(features.managed)}</span>
      <span data-testid="cloud">{String(features.features.sync.cloud)}</span>
      <span data-testid="has-preset">{String(features.hasUserPreset)}</span>
      <button type="button" onClick={() => features.setPreset('work-standard')}>
        choose
      </button>
    </div>
  );
}

describe('FeaturesProvider', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete window.cadence;
  });

  afterEach(() => {
    cleanup();
    delete window.cadence;
  });

  it('loads managed policy from the Electron bridge', async () => {
    window.cadence = {
      policyGet: vi.fn(async () => ({
        path: '/etc/cadence/policy.json',
        preset: 'work-strict',
      })),
    } as unknown as Window['cadence'];

    render(
      <FeaturesProvider>
        <Probe />
      </FeaturesProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    expect(screen.getByTestId('managed').textContent).toBe('true');
    expect(screen.getByTestId('cloud').textContent).toBe('false');
  });

  it('clears policy when policyGet throws', async () => {
    window.cadence = {
      policyGet: vi.fn(async () => {
        throw new Error('policy read failed');
      }),
    } as unknown as Window['cadence'];

    render(
      <FeaturesProvider>
        <Probe />
      </FeaturesProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    expect(screen.getByTestId('managed').textContent).toBe('false');
  });

  it('persists a user preset selection to localStorage', async () => {
    window.cadence = {
      policyGet: vi.fn(async () => null),
    } as unknown as Window['cadence'];

    render(
      <FeaturesProvider>
        <Probe />
      </FeaturesProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    fireEvent.click(screen.getByRole('button', { name: 'choose' }));

    expect(window.localStorage.getItem('cadence.features.userPreset.v1')).toBe('work-standard');
    expect(screen.getByTestId('has-preset').textContent).toBe('true');
  });

  it('useFeatures falls back outside the provider', () => {
    render(<Probe />);
    expect(screen.getByTestId('cloud').textContent).toBe('true');
  });
});

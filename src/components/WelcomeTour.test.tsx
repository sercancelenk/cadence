/**
 * Regression test for the sign-up crash:
 *   "Mobilden register olup sonra recovery codes adımında exception."
 *
 * Root cause: `WelcomeTour` rebuilt its `steps` array every render from live
 * state. Picking a preset flipped `hasUserPreset` (dropping the profile step)
 * and acknowledging recovery codes nulled `pendingRecovery` (dropping the
 * recovery step). Meanwhile `step` is a numeric index — when the array shrank
 * mid-flow, `steps[step]` became `undefined` and `cur.isRecovery` threw
 * "Cannot read properties of undefined".
 *
 * This pins that advancing through the profile + recovery steps reaches the
 * final informational step without throwing.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WelcomeTour } from './WelcomeTour';

const recoveryStore: { codes: string[] | null } = {
  codes: ['AAAA-BBBB', 'CCCC-DDDD', 'EEEE-FFFF', 'GGGG-HHHH', 'JJJJ-KKKK', 'LLLL-MMMM', 'NNNN-PPPP', 'QQQQ-RRRR'],
};

vi.mock('../AccountContext', () => ({
  useAccount: () => ({ user: { id: 'u1', email: 'a@b.com', displayName: 'A' } }),
}));

// Mobile companion surface: the tour skips the next-steps cards, so the
// array is short. That is exactly where shrinking it mid-flow overran `step`.
vi.mock('../lib/runtime', () => ({ useMobileWeb: () => true }));

vi.mock('../lib/pendingRecoveryCodes', () => ({
  readPendingRecoveryCodes: () => recoveryStore.codes,
  clearPendingRecoveryCodes: () => {
    recoveryStore.codes = null;
  },
  stashPendingRecoveryCodes: () => {},
}));

// A stateful mock so `setPreset` actually flips `hasUserPreset`, reproducing the
// render where the profile step would otherwise vanish from the array.
vi.mock('../lib/features', async () => {
  const React = await import('react');
  return {
    PRESET_LABELS: {
      personal: { title: 'Personal', description: 'd' },
      'work-standard': { title: 'Work standard', description: 'd' },
      'work-strict': { title: 'Work strict', description: 'd' },
    },
    useFeatures: () => {
      const [preset, setPreset] = React.useState<string | null>(null);
      return {
        managed: false,
        loading: false,
        features: { sync: { cloud: false }, ai: true },
        hasUserPreset: preset !== null,
        setPreset: (p: string) => setPreset(p),
      };
    },
  };
});

afterEach(() => {
  cleanup();
  recoveryStore.codes = ['AAAA-BBBB', 'CCCC-DDDD', 'EEEE-FFFF', 'GGGG-HHHH', 'JJJJ-KKKK', 'LLLL-MMMM', 'NNNN-PPPP', 'QQQQ-RRRR'];
  localStorage.clear();
});

function renderTour() {
  return render(
    <MemoryRouter>
      <WelcomeTour />
    </MemoryRouter>,
  );
}

describe('WelcomeTour sign-up flow', () => {
  it('advances profile → recovery → welcome without going out of bounds', () => {
    renderTour();

    // Step 1: profile picker.
    expect(screen.getByText('Where will you use Cadence?')).toBeTruthy();
    fireEvent.click(screen.getByText('Personal'));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    // Step 2: recovery codes — must acknowledge before continuing.
    expect(screen.getByText('Save your recovery codes')).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox'));
    // This advance previously crashed: the array shrank by two steps while
    // `step` advanced by one, so `steps[step]` was undefined.
    expect(() =>
      fireEvent.click(screen.getByRole('button', { name: 'I saved them — continue' })),
    ).not.toThrow();

    // Step 3: the informational welcome card is reachable, not a blank crash.
    expect(screen.getByText("Here's what Cadence is")).toBeTruthy();
  });
});

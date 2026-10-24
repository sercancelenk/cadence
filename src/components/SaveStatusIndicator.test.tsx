import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SaveStatusIndicator, saveIndicatorState } from './SaveStatusIndicator';

const err = { reason: 'persist-exception', error: 'boom', at: 1 } as const;

afterEach(cleanup);

describe('saveIndicatorState', () => {
  it('is saved when nothing is pending, in flight or failed', () => {
    expect(saveIndicatorState({ lastSaveError: null, saving: false, hasPendingSave: false })).toBe('saved');
  });
  it('is unsaved while edits wait for the next write', () => {
    expect(saveIndicatorState({ lastSaveError: null, saving: false, hasPendingSave: true })).toBe('unsaved');
  });
  it('is saving while a write is in flight, even with nothing else pending', () => {
    expect(saveIndicatorState({ lastSaveError: null, saving: true, hasPendingSave: false })).toBe('saving');
  });
  it('shows an error over everything else', () => {
    expect(saveIndicatorState({ lastSaveError: err, saving: true, hasPendingSave: true })).toBe('error');
  });
});

describe('<SaveStatusIndicator />', () => {
  it('shows an icon only, with the state announced through its label', () => {
    render(<SaveStatusIndicator lastSaveError={null} saving={false} hasPendingSave={false} />);
    const el = screen.getByRole('status');
    expect(el.getAttribute('aria-label')).toBe('All changes saved');
    expect(el.getAttribute('data-state')).toBe('saved');
    expect(el.textContent).toBe('');
  });

  it('hints at the shortcut while changes are waiting', () => {
    render(<SaveStatusIndicator lastSaveError={null} saving={false} hasPendingSave />);
    expect(screen.getByRole('status').getAttribute('data-state')).toBe('unsaved');
    expect(screen.getByRole('status').getAttribute('aria-label')).toMatch(/save now/i);
  });
});

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ result: undefined as undefined | boolean, ai: undefined as undefined | Record<string, unknown>, flags: { ai: true, aiPeople: true, aiFocusNote: true } }));
vi.mock('../AppDataContext', () => ({ useAppData: () => ({ data: { aiSettings: state.ai } }) }));
vi.mock('../lib/features', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/features')>()),
  useFeatures: () => ({ features: state.flags }),
}));
vi.mock('./AIPrepDialog', () => ({
  AIPrepDialog: (props: { personId: string; onAdd: (f: { title: string; body: string }) => boolean; onClose: () => void }) => (
    <div data-testid="prep" data-person={props.personId}>
      <button type="button" onClick={() => (state.result = props.onAdd({ title: '1:1 prep', body: 'b' }))}>add</button>
    </div>
  ),
}));

import { PersonPrepButton } from './PersonPrepButton';

beforeEach(() => {
  state.ai = { provider: 'openai', apiKey: 'sk-test-key-12345', model: 'm' };
  state.flags = { ai: true, aiPeople: true, aiFocusNote: true };
});
afterEach(cleanup);

describe('PersonPrepButton', () => {
  it('opens the dialog for this person and adds ONE note item with what it returns', async () => {
    const addItem = vi.fn(() => true);
    render(<PersonPrepButton personId="p1" addItem={addItem} />);
    fireEvent.click(screen.getByRole('button', { name: /Prepare with AI/ }));
    expect((await screen.findByTestId('prep')).getAttribute('data-person')).toBe('p1');
    fireEvent.click(screen.getByRole('button', { name: 'add' }));
    expect(addItem).toHaveBeenCalledTimes(1);
    expect(addItem).toHaveBeenCalledWith('p1', 'note', { title: '1:1 prep', body: 'b' });
  });

  it('tells the dialog whether the item was saved', async () => {
    const addItem = vi.fn(() => false);
    render(<PersonPrepButton personId="p1" addItem={addItem} />);
    fireEvent.click(screen.getByRole('button', { name: /Prepare with AI/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'add' }));
    expect(state.result).toBe(false);
  });

  it('is hidden when AI or people-data AI is off, or nothing is connected', () => {
    state.flags = { ai: true, aiPeople: false, aiFocusNote: true };
    render(<PersonPrepButton personId="p1" addItem={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Prepare with AI/ })).toBeNull();
    cleanup();
    state.flags = { ai: true, aiPeople: true, aiFocusNote: true };
    state.ai = undefined;
    render(<PersonPrepButton personId="p1" addItem={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Prepare with AI/ })).toBeNull();
  });
});

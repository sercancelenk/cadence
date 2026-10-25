import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { subscribeAiTool } from '../../lib/ai/launcher';

const state = vi.hoisted(() => ({ ai: undefined as undefined | Record<string, unknown>, enabled: true }));
vi.mock('../../AppDataContext', () => ({ useAppData: () => ({ data: { aiSettings: state.ai } }) }));
vi.mock('../../lib/features', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/features')>()),
  useFeatures: () => ({ features: { ai: state.enabled, aiPeople: true, aiFocusNote: true } }),
}));

import { HomeQuickAccess } from './HomeQuickAccess';

beforeEach(() => {
  state.ai = { provider: 'openai', apiKey: 'sk-test-key-12345', model: 'm' };
  state.enabled = true;
});
afterEach(cleanup);

const mount = (now?: Date) => render(<MemoryRouter><HomeQuickAccess now={now} /></MemoryRouter>);

describe('HomeQuickAccess weekly digest', () => {
  it('opens the weekly digest through the launcher', () => {
    const opened = vi.fn();
    const off = subscribeAiTool(opened);
    mount();
    fireEvent.click(screen.getByRole('button', { name: /Weekly digest/ }));
    expect(opened).toHaveBeenCalledWith('weekly-digest');
    off();
  });

  it('is not shown when AI is off or nothing is connected', () => {
    state.enabled = false;
    mount();
    expect(screen.queryByRole('button', { name: /Weekly digest/ })).toBeNull();
    cleanup();
    state.enabled = true;
    state.ai = undefined;
    mount();
    expect(screen.queryByRole('button', { name: /Weekly digest/ })).toBeNull();
  });

  it('still lists the page tiles', () => {
    mount();
    expect(screen.getByRole('link', { name: /Agenda/ })).toBeTruthy();
  });

  it('suggests the weekly retrospective at the end of the week, and keeps the usual text on other days', () => {
    mount(new Date(2026, 9, 23, 12)); // Friday
    expect(screen.getByRole('button', { name: /Weekly digest/ }).textContent).toMatch(/end of the week/i);
    cleanup();
    mount(new Date(2026, 9, 21, 12)); // Wednesday
    expect(screen.getByRole('button', { name: /Weekly digest/ }).textContent).not.toMatch(/end of the week/i);
  });

  it('only labels the tile on a Friday: nothing is opened or sent by itself', () => {
    const opened = vi.fn();
    const off = subscribeAiTool(opened);
    mount(new Date(2026, 9, 23, 12));
    expect(opened).not.toHaveBeenCalled();
    off();
  });
});

describe('HomeQuickAccess tile colours', () => {
  it('colours each tile icon like its menu item', () => {
    mount();
    const toneOf = (title: string) => screen.getByText(title).closest('a,button')?.querySelector('.home-tile__ic')?.getAttribute('data-tone');
    expect(toneOf('Agenda')).toBe('coral');
    expect(toneOf('Planning')).toBe('orange');
    expect(toneOf('To-dos')).toBe('green');
    expect(toneOf('Teams')).toBe('violet');
    expect(toneOf('Notes')).toBe('blue');
    expect(toneOf('Weekly digest')).toBe('ai');
  });
});

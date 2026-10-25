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

import { UtilitiesToolsHubPage } from './UtilitiesToolsHubPage';

beforeEach(() => {
  state.ai = { provider: 'openai', apiKey: 'sk-test-key-12345', model: 'm' };
  state.enabled = true;
});
afterEach(cleanup);
const mount = () => render(<MemoryRouter><UtilitiesToolsHubPage /></MemoryRouter>);

describe('UtilitiesToolsHubPage', () => {
  it('lists the tools', () => {
    mount();
    expect(screen.getByRole('link', { name: /Sketch/ })).toBeTruthy();
  });

  it('offers a diagram from a screenshot through the launcher when AI is usable', () => {
    const opened = vi.fn();
    const off = subscribeAiTool(opened);
    mount();
    fireEvent.click(screen.getByRole('button', { name: /Diagram from a screenshot/ }));
    expect(opened).toHaveBeenCalledWith('screenshot-to-diagram');
    off();
  });

  it('hides it when AI is off or nothing is connected', () => {
    state.enabled = false;
    mount();
    expect(screen.queryByRole('button', { name: /Diagram from a screenshot/ })).toBeNull();
    cleanup();
    state.enabled = true;
    state.ai = undefined;
    mount();
    expect(screen.queryByRole('button', { name: /Diagram from a screenshot/ })).toBeNull();
  });

  it('offers drawing from a description through the launcher when AI is usable', () => {
    const opened = vi.fn();
    const off = subscribeAiTool(opened);
    mount();
    fireEvent.click(screen.getByRole('button', { name: /Draw from a description/ }));
    expect(opened).toHaveBeenCalledWith('draw-from-description');
    off();
    cleanup();
    state.enabled = false;
    mount();
    expect(screen.queryByRole('button', { name: /Draw from a description/ })).toBeNull();
  });
});

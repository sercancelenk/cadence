import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AISettings } from '../model';

const openAiTool = vi.hoisted(() => vi.fn());
let aiSettings: AISettings | undefined;
let flags = { ai: true, aiPeople: true, aiFocusNote: true };

vi.mock('../lib/ai/launcher', () => ({ openAiTool }));
vi.mock('../AppDataContext', () => ({ useAppData: () => ({ data: { aiSettings } }) }));
vi.mock('../lib/features', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/features')>()),
  useFeatures: () => ({ features: flags }),
}));

import { UpwardUpdateButton } from './UpwardUpdateButton';

beforeEach(() => {
  openAiTool.mockClear();
  aiSettings = { provider: 'openai', apiKey: 'sk-cloud-key-1234', model: 'gpt-5.4-mini' };
  flags = { ai: true, aiPeople: true, aiFocusNote: true };
});
afterEach(cleanup);

describe('UpwardUpdateButton', () => {
  it('opens the weekly digest as a status update', () => {
    render(<UpwardUpdateButton />);
    fireEvent.click(screen.getByRole('button', { name: /Prepare an update/ }));
    expect(openAiTool).toHaveBeenCalledWith('weekly-digest', { mode: 'upward' });
  });

  it('is absent when AI is switched off or nothing is connected', () => {
    flags = { ai: false, aiPeople: false, aiFocusNote: false };
    render(<UpwardUpdateButton />);
    expect(screen.queryByRole('button')).toBeNull();
    cleanup();
    flags = { ai: true, aiPeople: true, aiFocusNote: true };
    aiSettings = undefined;
    render(<UpwardUpdateButton />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

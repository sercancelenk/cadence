import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const runAiTask = vi.hoisted(() => vi.fn());
vi.mock('../lib/ai/runTask', () => ({ runAiTask }));
vi.mock('../AppDataContext', () => ({
  useAppData: () => ({ data: { aiSettings: { provider: 'openai', apiKey: 'sk-cloud-key-1234', model: 'm' } } }),
}));
vi.mock('../lib/features', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/features')>()),
  useFeatures: () => ({ features: { ai: true, aiPeople: true, aiFocusNote: true } }),
}));

import { PersonAIAssistantDialog } from './PersonAIAssistantDialog';

afterEach(cleanup);

describe('PersonAIAssistantDialog', () => {
  it('always runs the request as people data, so a person\u2019s task or goal can only go where people data is allowed', async () => {
    runAiTask.mockResolvedValueOnce({ ok: false, reason: 'blocked-people', message: 'Not allowed for people data.' });
    render(
      <MemoryRouter>
        <PersonAIAssistantDialog open onClose={() => {}} task={{ title: 'Plan 1:1 agenda' }} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ask for recommendations' }));
    await waitFor(() => expect(runAiTask).toHaveBeenCalled());
    expect(runAiTask.mock.calls[0][0].dataClass).toBe('people');
    expect(screen.getByText('People data')).toBeTruthy();
  });
});

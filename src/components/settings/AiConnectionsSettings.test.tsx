import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AISettings } from '../../model';

const updateAISettings = vi.fn();
const setAIRoute = vi.fn();
const upsertAIConnection = vi.fn();
const patchAIConnection = vi.fn();
const removeAIConnection = vi.fn();
const askAI = vi.hoisted(() => vi.fn());
const confirm = vi.fn(async () => true);
let aiSettings: AISettings | undefined;
let flags = { ai: true, aiPeople: true, aiFocusNote: true };

vi.mock('../../AppDataContext', () => ({
  useAppData: () => ({ data: { aiSettings }, updateAISettings, upsertAIConnection, patchAIConnection, removeAIConnection, setAIRoute }),
}));
vi.mock('../../lib/ai', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../lib/ai')>()), askAI }));
vi.mock('../ui/ConfirmProvider', () => ({ useConfirm: () => ({ confirm }) }));
vi.mock('../../lib/features', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/features')>()),
  useFeatures: () => ({ features: flags }),
}));

import { AiConnectionsSettings } from './AiConnectionsSettings';

const company = {
  id: 'c-company',
  name: 'Company gateway',
  provider: 'gateway' as const,
  baseUrl: 'https://ai.corp.example.com/v1',
  model: 'team/model-x',
  apiKey: 'sk-corp-key-12345',
  capabilities: ['json' as const],
  probedAt: '2026-10-24T10:00:00.000Z',
};
const ollama = { id: 'c-ollama', name: 'Ollama', provider: 'gateway' as const, baseUrl: 'http://localhost:11434/v1', model: 'llama3' };
const base: AISettings = { provider: 'openai', apiKey: 'sk-default-key-1234', model: 'gpt-5.4-mini' };

function mount(settings: AISettings | null = base) {
  aiSettings = settings ?? undefined;
  return render(<AiConnectionsSettings />);
}
const row = (name: string) => within(screen.getByRole('list', { name: 'Connections' })).getByRole('listitem', { name });
const lastPatch = () => updateAISettings.mock.calls.at(-1)?.[0];
const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });

beforeEach(() => {
  updateAISettings.mockClear();
  setAIRoute.mockClear();
  upsertAIConnection.mockClear();
  patchAIConnection.mockClear();
  removeAIConnection.mockClear();
  askAI.mockReset();
  confirm.mockClear();
  confirm.mockResolvedValue(true);
  flags = { ai: true, aiPeople: true, aiFocusNote: true };
});
afterEach(cleanup);

describe('Connections list', () => {
  it('lists the default first and then the extras, with a JSON chip each', () => {
    mount({ ...base, defaultMeta: { name: 'Work OpenAI', capabilities: ['json'], probedAt: '2026-10-24T09:00:00.000Z' }, connections: [company, ollama] });
    const names = within(screen.getByRole('list', { name: 'Connections' })).getAllByRole('listitem').map((li) => li.getAttribute('aria-label'));
    expect(names).toEqual(['Work OpenAI', 'Company gateway', 'Ollama']);
    expect(within(row('Work OpenAI')).getByText('JSON: ok')).toBeTruthy();
    expect(within(row('Company gateway')).getByText('JSON: ok')).toBeTruthy();
    expect(within(row('Ollama')).getByText('JSON: untested')).toBeTruthy();
    expect(within(row('Company gateway')).getByText(/ai\.corp\.example\.com/)).toBeTruthy();
  });

  it('shows "unreliable" for a connection that was probed and found without JSON', () => {
    mount({ ...base, defaultMeta: { probedAt: '2026-10-24T09:00:00.000Z' } });
    expect(within(row('OpenAI ChatGPT')).getByText('JSON: unreliable')).toBeTruthy();
  });

  it('shows nothing to list without a configured default or extras', () => {
    mount(null);
    expect(screen.queryByRole('list', { name: 'Connections' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Add connection' })).toBeTruthy();
  });
});

describe('people data switch', () => {
  it('is on for a local gateway by default and off for a company gateway and hosted providers', () => {
    mount({ ...base, connections: [company, ollama] });
    const sw = (name: string) => within(row(name)).getByRole('checkbox', { name: `Allow people data on ${name}` }) as HTMLInputElement;
    expect(sw('OpenAI ChatGPT').checked).toBe(false);
    expect(sw('Company gateway').checked).toBe(false);
    expect(sw('Ollama').checked).toBe(true);
  });

  it('writes an explicit value for an extra connection and for the default one', () => {
    mount({ ...base, connections: [company] });
    fireEvent.click(within(row('Company gateway')).getByRole('checkbox', { name: 'Allow people data on Company gateway' }));
    expect(patchAIConnection).toHaveBeenCalledWith('c-company', { allowPeopleData: true });
    expect(updateAISettings).not.toHaveBeenCalled();
    fireEvent.click(within(row('OpenAI ChatGPT')).getByRole('checkbox', { name: 'Allow people data on OpenAI ChatGPT' }));
    expect(lastPatch().defaultMeta).toEqual({ allowPeopleData: true });
  });

  it('can switch a local gateway off explicitly', () => {
    mount({ ...base, connections: [ollama] });
    fireEvent.click(within(row('Ollama')).getByRole('checkbox', { name: 'Allow people data on Ollama' }));
    expect(patchAIConnection).toHaveBeenCalledWith('c-ollama', { allowPeopleData: false });
  });

  it('is disabled, with the reason, when the organization turned people data off', () => {
    flags = { ai: true, aiPeople: false, aiFocusNote: true };
    mount({ ...base, connections: [ollama] });
    const sw = within(row('Ollama')).getByRole('checkbox', { name: 'Allow people data on Ollama' }) as HTMLInputElement;
    expect(sw.disabled).toBe(true);
    expect(screen.getByText(/organization turned off AI for 1:1/i)).toBeTruthy();
  });
});

describe('embedding model on an extra connection', () => {
  it('is stored with the connection', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Add connection' }));
    type(screen.getByLabelText('Connection name'), 'Local');
    fireEvent.change(screen.getByLabelText('Provider'), { target: { value: 'gateway' } });
    type(screen.getByLabelText(/^Base URL/), 'http://localhost:11434/v1');
    type(screen.getByLabelText(/^Model/), 'llama3');
    type(screen.getByLabelText(/^Embedding model/), 'nomic-embed-text');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(upsertAIConnection.mock.calls.at(-1)?.[0]).toMatchObject({ embeddingModel: 'nomic-embed-text' });
  });
});

describe('adding, editing and removing connections', () => {
  it('adds a connection with a generated id and the entered name', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Add connection' }));
    const save = () => screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;
    type(screen.getByLabelText('Connection name'), 'Ollama at home');
    fireEvent.change(screen.getByLabelText('Provider'), { target: { value: 'gateway' } });
    type(screen.getByLabelText(/^Base URL/), 'http://localhost:11434/v1');
    type(screen.getByLabelText(/^Model/), 'llama3');
    expect(save().disabled).toBe(false);
    fireEvent.click(save());
    const added = upsertAIConnection.mock.calls.at(-1)?.[0];
    expect(added).toMatchObject({ name: 'Ollama at home', provider: 'gateway', baseUrl: 'http://localhost:11434/v1', model: 'llama3' });
    expect(typeof added.id).toBe('string');
    expect(added.id.length).toBeGreaterThan(5);
    expect(added.id).not.toBe('default');
  });

  it('needs a name, and a new connection cannot be "Disabled"', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Add connection' }));
    fireEvent.change(screen.getByLabelText('Provider'), { target: { value: 'gateway' } });
    type(screen.getByLabelText(/^Base URL/), 'http://localhost:11434/v1');
    type(screen.getByLabelText(/^Model/), 'llama3');
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true); // no name yet
    expect(screen.queryByRole('option', { name: '— Disabled —' })).toBeNull();
  });

  it('edits an extra connection in place and keeps its probe result when only the name changes', () => {
    mount({ ...base, connections: [company] });
    fireEvent.click(screen.getByRole('button', { name: 'Edit Company gateway' }));
    type(screen.getByLabelText('Connection name'), 'Corp AI');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const c = upsertAIConnection.mock.calls.at(-1)?.[0];
    expect(c).toMatchObject({ id: 'c-company', name: 'Corp AI', capabilities: ['json'], probedAt: company.probedAt });
  });

  it('forgets the probe result when the model changes, because it described the old one', () => {
    mount({ ...base, connections: [company] });
    fireEvent.click(screen.getByRole('button', { name: 'Edit Company gateway' }));
    type(screen.getByLabelText(/^Model/), 'team/model-y');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const c = upsertAIConnection.mock.calls.at(-1)?.[0];
    expect(c.model).toBe('team/model-y');
    expect(c.probedAt).toBeUndefined();
    expect(c.capabilities).toBeUndefined();
  });

  it('removes a connection by id (the action also cleans the routing that pointed to it)', async () => {
    mount({ ...base, connections: [company, ollama], routing: { content: 'c-company' } });
    fireEvent.click(screen.getByRole('button', { name: 'Remove Company gateway' }));
    await waitFor(() => expect(removeAIConnection).toHaveBeenCalledTimes(1));
    expect(removeAIConnection).toHaveBeenCalledWith('c-company');
    expect(updateAISettings).not.toHaveBeenCalled(); // never a whole-list write built from a stale list
  });

  it('does nothing when the user declines', async () => {
    confirm.mockResolvedValueOnce(false);
    mount({ ...base, connections: [ollama] });
    fireEvent.click(screen.getByRole('button', { name: 'Remove Ollama' }));
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(removeAIConnection).not.toHaveBeenCalled();
  });

  it('a probe result is written by id, so it cannot resurrect a connection removed meanwhile', async () => {
    mount({ ...base, connections: [company] });
    fireEvent.click(screen.getByRole('button', { name: 'Edit Company gateway' }));
    askAI
      .mockResolvedValueOnce({ text: 'ok', stopReason: 'stop' })
      .mockResolvedValueOnce({ text: '{"ok":true}', stopReason: 'stop' });
    fireEvent.click(screen.getByRole('button', { name: /Test connection/ }));
    await waitFor(() => expect(patchAIConnection).toHaveBeenCalledTimes(1));
    const [id, meta] = patchAIConnection.mock.calls[0];
    expect(id).toBe('c-company');
    expect(meta.capabilities).toEqual(['json']);
    expect(typeof meta.probedAt).toBe('string');
    expect(updateAISettings).not.toHaveBeenCalled();
    expect(upsertAIConnection).not.toHaveBeenCalled();
  });

  describe('consent for people data belongs to a destination', () => {
    const allowed = { ...ollama, allowPeopleData: true };

    it('is kept when only the name changes', () => {
      mount({ ...base, connections: [allowed] });
      fireEvent.click(screen.getByRole('button', { name: 'Edit Ollama' }));
      type(screen.getByLabelText('Connection name'), 'Home Ollama');
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(upsertAIConnection.mock.calls.at(-1)?.[0].allowPeopleData).toBe(true);
    });

    it('is cleared when the address changes: a different destination needs a new decision', () => {
      mount({ ...base, connections: [allowed] });
      fireEvent.click(screen.getByRole('button', { name: 'Edit Ollama' }));
      type(screen.getByLabelText(/^Base URL/), 'https://remote.example.com/v1');
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      const saved = upsertAIConnection.mock.calls.at(-1)?.[0];
      expect(saved.baseUrl).toBe('https://remote.example.com/v1');
      expect(saved.allowPeopleData).toBeUndefined();
    });

    it('is cleared when the provider changes', () => {
      mount({ ...base, connections: [{ ...company, allowPeopleData: true }] });
      fireEvent.click(screen.getByRole('button', { name: 'Edit Company gateway' }));
      fireEvent.change(screen.getByLabelText('Provider'), { target: { value: 'openai' } });
      type(screen.getByLabelText(/^API key/), 'sk-another-key-1234');
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(upsertAIConnection.mock.calls.at(-1)?.[0].allowPeopleData).toBeUndefined();
    });
  });

  it('switching an extra connection to a hosted provider drops the old gateway address and headers', () => {
    mount({
      ...base,
      connections: [{ ...company, extraHeaders: [{ name: 'x-tenant', value: 'team-token-12345' }], gatewayFormat: 'anthropic' as const, requestPath: '/messages' }],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Edit Company gateway' }));
    fireEvent.change(screen.getByLabelText('Provider'), { target: { value: 'openai' } });
    type(screen.getByLabelText(/^API key/), 'sk-new-key-12345');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const saved = upsertAIConnection.mock.calls.at(-1)?.[0];
    expect(saved.provider).toBe('openai');
    for (const key of ['baseUrl', 'gatewayFormat', 'authHeader', 'authScheme', 'requestPath', 'maxTokensField', 'extraHeaders']) {
      expect(saved[key], key).toBeUndefined();
    }
  });

  it('stops at the limit, with a hint, instead of saving a connection that would vanish on reload', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: `c${i}`, name: `Conn ${i}`, provider: 'gateway' as const, baseUrl: `https://c${i}.example.com/v1` }));
    mount({ ...base, connections: many });
    expect((screen.getByRole('button', { name: 'Add connection' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/up to 20 connections/)).toBeTruthy();
  });

  it('has no Edit or Remove for the default row (it is edited above)', () => {
    mount({ ...base, connections: [ollama] });
    expect(within(row('OpenAI ChatGPT')).queryByRole('button', { name: /Edit|Remove/ })).toBeNull();
  });
});

describe('capability chips', () => {
  it('shows Images and Live only for a connection that was checked for them', () => {
    mount({ ...base, connections: [{ ...company, capabilities: ['json', 'vision', 'streaming'] }, ollama] });
    expect(within(row('Company gateway')).getByText('Images: ok')).toBeTruthy();
    expect(within(row('Company gateway')).getByText('Live: ok')).toBeTruthy();
    expect(within(row('Ollama')).queryByText('Images: ok')).toBeNull();
    expect(within(row('Ollama')).queryByText('Live: ok')).toBeNull();
  });
});

describe('editing one connection at a time', () => {
  it('while a connection is being edited, the other Edit buttons are off, so unsaved edits are never swapped away', () => {
    mount({ ...base, connections: [company, ollama] });
    fireEvent.click(screen.getByRole('button', { name: 'Edit Company gateway' }));
    expect((screen.getByRole('button', { name: 'Edit Ollama' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect((screen.getByRole('button', { name: 'Edit Ollama' }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('JSON override', () => {
  const probed = '2026-10-24T09:00:00.000Z';
  const unreliable = { ...ollama, probedAt: probed };

  it('is offered only for a connection the JSON check found unreliable, and writes through the right action', () => {
    mount({ ...base, defaultMeta: { probedAt: probed }, connections: [unreliable, { ...company, capabilities: ['json'], probedAt: probed }] });
    expect(within(row('Company gateway')).queryByRole('checkbox', { name: /Use .* for JSON tasks anyway/ })).toBeNull();
    const forDefault = within(row('OpenAI ChatGPT')).getByRole('checkbox', { name: /Use OpenAI ChatGPT for JSON tasks anyway/ });
    fireEvent.click(forDefault);
    expect(lastPatch().defaultMeta).toEqual({ jsonOverride: true });
    fireEvent.click(within(row('Ollama')).getByRole('checkbox', { name: /Use Ollama for JSON tasks anyway/ }));
    expect(patchAIConnection).toHaveBeenCalledWith('c-ollama', { jsonOverride: true });
  });

  it('is not offered before any check ran, and the chip says when the user allowed it', () => {
    mount({ ...base, connections: [ollama] });
    expect(screen.queryByRole('checkbox', { name: /for JSON tasks anyway/ })).toBeNull();
    cleanup();
    mount({ ...base, connections: [{ ...unreliable, jsonOverride: true }] });
    expect(within(row('Ollama')).getByText('JSON: allowed by you')).toBeTruthy();
    expect((within(row('Ollama')).getByRole('checkbox', { name: /for JSON tasks anyway/ }) as HTMLInputElement).checked).toBe(true);
  });
});

describe('feature routing', () => {
  const content = () => screen.getByLabelText('Notes and tasks') as HTMLSelectElement;
  const people = () => screen.getByLabelText(/^People data/) as HTMLSelectElement;

  it('offers the default and every extra, and writes the choice', () => {
    mount({ ...base, connections: [company, ollama] });
    expect(Array.from(content().options).map((o) => o.textContent)).toEqual(['Default (OpenAI ChatGPT)', 'Company gateway', 'Ollama']);
    expect(content().value).toBe('default');
    fireEvent.change(people(), { target: { value: 'c-ollama' } });
    expect(setAIRoute).toHaveBeenLastCalledWith('people', 'c-ollama');
    fireEvent.change(content(), { target: { value: 'c-company' } });
    expect(setAIRoute).toHaveBeenLastCalledWith('content', 'c-company');
  });

  it('choosing Default asks for that route to be cleared (the action keeps the others)', () => {
    mount({ ...base, connections: [company], routing: { content: 'c-company', people: 'c-company' } });
    fireEvent.change(content(), { target: { value: 'default' } });
    expect(setAIRoute).toHaveBeenLastCalledWith('content', 'default');
  });

  it('shows the default and says so when the routed connection no longer exists', () => {
    mount({ ...base, routing: { content: 'gone' } });
    expect(content().value).toBe('default');
    expect(screen.getByText(/no longer exists/i)).toBeTruthy();
  });

  it('the people route is disabled when the organization turned people data off', () => {
    flags = { ai: true, aiPeople: false, aiFocusNote: true };
    mount({ ...base, connections: [ollama] });
    expect(people().disabled).toBe(true);
    expect(content().disabled).toBe(false);
  });
});

describe('privacy and previous instructions', () => {
  it('has no prompt or instructions text box anywhere', () => {
    mount({ ...base, systemPrompt: 'old prompt', extractionGuidance: 'old guidance' });
    expect(screen.queryByRole('textbox', { name: /prompt|instruction|guidance/i })).toBeNull();
  });

  it('shows previous instructions only when they exist, read-only', () => {
    mount(base);
    expect(screen.queryByText('Previous instructions')).toBeNull();
    cleanup();
    mount({ ...base, systemPrompt: 'Always answer in Turkish', extractionGuidance: 'Only this week' });
    expect(screen.getByText('Previous instructions')).toBeTruthy();
    expect(screen.getByText('Always answer in Turkish')).toBeTruthy();
    expect(screen.getByText('Only this week')).toBeTruthy();
    expect(screen.getByText(/still applied as a short focus note/i)).toBeTruthy();
  });

  it('copies one (and says so) and removes one without touching the other', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });
    mount({ ...base, systemPrompt: 'Always answer in Turkish', extractionGuidance: 'Only this week' });
    fireEvent.click(screen.getByRole('button', { name: 'Copy system instructions' }));
    expect(writeText).toHaveBeenCalledWith('Always answer in Turkish');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Copy system instructions' }).textContent).toBe('Copied'));
    fireEvent.click(screen.getByRole('button', { name: 'Remove extraction instructions' }));
    await waitFor(() => expect(lastPatch()).toEqual({ extractionGuidance: '' }));
  });

  it('asks before removing text the user wrote, and keeps it when they decline', async () => {
    mount({ ...base, extractionGuidance: 'Only this week' });
    confirm.mockResolvedValueOnce(false);
    fireEvent.click(screen.getByRole('button', { name: 'Remove extraction instructions' }));
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(updateAISettings).not.toHaveBeenCalled();
  });

  it('says when copying did not work', async () => {
    Object.assign(navigator, { clipboard: { writeText: () => Promise.reject(new Error('denied')) } });
    mount({ ...base, systemPrompt: 'Always answer in Turkish' });
    fireEvent.click(screen.getByRole('button', { name: 'Copy system instructions' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Copy system instructions' }).textContent).toBe('Could not copy'));
  });

  it('says they are not applied when the organization turned focus notes off', () => {
    flags = { ai: true, aiPeople: true, aiFocusNote: false };
    mount({ ...base, systemPrompt: 'Always answer in Turkish' });
    expect(screen.getByText(/turned off by your organization/i)).toBeTruthy();
  });
});

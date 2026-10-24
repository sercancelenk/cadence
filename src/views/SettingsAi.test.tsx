import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AISettings } from '../model';
import { STORAGE_PREFIX } from '../lib/appBranding';
import { updateAISettings as realUpdateAISettings } from '../core/actions';
import { emptyData } from '../core/model';
import { legacyParseAISettings } from '../core/model/legacyAiParser.testutil';

const updateAISettings = vi.fn();
const askAI = vi.hoisted(() => vi.fn());
vi.mock('../lib/ai', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/ai')>()), askAI }));
const confirm = vi.fn(async () => true);
let aiSettings: AISettings | undefined;

vi.mock('../AppDataContext', () => ({
  useAppData: () => ({ data: { aiSettings }, updateAISettings }),
}));
vi.mock('../components/ui/ConfirmProvider', () => ({
  useConfirm: () => ({ confirm }),
}));

import { AISettingsSection } from './Settings';

function mount(saved?: AISettings) {
  aiSettings = saved;
  window.localStorage.setItem(`${STORAGE_PREFIX}:settings:section:ai`, '1');
  return render(<AISettingsSection />);
}

const provider = () => screen.getByLabelText('Provider') as HTMLSelectElement;
const keyInput = () => screen.getByLabelText(/^API key/) as HTMLInputElement;
const modelInput = () => screen.getByLabelText(/^Model/) as HTMLInputElement;
const save = () => screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;
const testBtn = () => screen.getByRole('button', { name: /Test connection|Testing/ }) as HTMLButtonElement;
const baseUrl = () => screen.getByLabelText(/^Base URL/) as HTMLInputElement;
const choose = (value: string) => fireEvent.change(provider(), { target: { value } });
const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });

describe('Settings → AI assistant', () => {
  beforeEach(() => {
    updateAISettings.mockClear();
    confirm.mockClear();
    confirm.mockResolvedValue(true);
  });
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it('shows the info box for the chosen provider and changes it with the selection', () => {
    mount();
    expect(screen.getByRole('complementary', { name: 'About AI is off' })).toBeTruthy();
    choose('anthropic');
    expect(screen.getByRole('complementary', { name: 'About Anthropic Claude' })).toBeTruthy();
    choose('gateway');
    expect(screen.getByRole('complementary', { name: 'About Custom gateway' })).toBeTruthy();
  });

  describe('switching provider', () => {
    it('does not carry one provider’s key and model to another', () => {
      mount({ provider: 'openai', apiKey: 'sk-openai-secret', model: 'gpt-5.4-mini' });
      expect(keyInput().value).toBe('sk-openai-secret');
      choose('gateway');
      expect(keyInput().value).toBe('');
      expect(modelInput().value).toBe('');
      choose('anthropic');
      expect(keyInput().value).toBe('');
      expect(modelInput().value).toBe('');
    });

    it('brings the saved key and model back when returning to the saved provider', () => {
      mount({ provider: 'openai', apiKey: 'sk-openai-secret', model: 'gpt-5.4-mini' });
      choose('gateway');
      choose('openai');
      expect(keyInput().value).toBe('sk-openai-secret');
      expect(modelInput().value).toBe('gpt-5.4-mini');
    });
  });

  describe('saving', () => {
    it('hosted providers need a key of at least 8 characters', () => {
      mount();
      choose('openai');
      expect(save().disabled).toBe(true);
      type(keyInput(), 'short');
      expect(save().disabled).toBe(true);
      type(keyInput(), 'sk-long-enough-key');
      expect(save().disabled).toBe(false);
    });

    it('"— Disabled —" can be saved and clears the provider', () => {
      mount({ provider: 'openai', apiKey: 'sk-openai-secret', model: 'gpt-5.4-mini' });
      expect(save().disabled).toBe(true); // nothing changed yet
      choose('');
      expect(save().disabled).toBe(false);
      expect(testBtn().disabled).toBe(true); // nothing to test while AI is off
      fireEvent.click(save());
      expect(updateAISettings).toHaveBeenCalledTimes(1);
      expect(updateAISettings.mock.calls[0][0]).toMatchObject({ provider: '' });
    });

    it('a gateway needs a valid https/local address and a model; the key is optional', () => {
      mount();
      choose('gateway');
      expect(save().disabled).toBe(true);
      type(baseUrl(), 'http://example.com/v1'); // plain http to a public host
      type(modelInput(), 'qwen2.5:0.5b');
      expect(save().disabled).toBe(true);
      expect(screen.getByText(/Plain http:\/\/ is only allowed/)).toBeTruthy();
      type(baseUrl(), 'http://localhost:11434/v1');
      expect(save().disabled).toBe(false);
      fireEvent.click(save());
      expect(updateAISettings.mock.calls[0][0]).toMatchObject({
        provider: 'gateway',
        baseUrl: 'http://localhost:11434/v1',
        model: 'qwen2.5:0.5b',
        apiKey: '',
        gatewayFormat: '',
        extraHeaders: [],
      });
    });

    it('rejects a header written twice and a forbidden header', () => {
      mount();
      choose('gateway');
      type(baseUrl(), 'https://gw.example.com/v1');
      type(modelInput(), 'm');
      expect(save().disabled).toBe(false);
      const headers = screen.getByLabelText(/^Extra headers/) as HTMLTextAreaElement;
      type(headers, 'X-A: 1\nx-a: 2');
      expect(save().disabled).toBe(true);
      type(headers, 'Host: evil.com');
      expect(save().disabled).toBe(true);
      type(headers, 'x-tenant: team-42');
      expect(save().disabled).toBe(false);
    });

    it('a path that carries the key needs a key, and the preview never prints the real key', () => {
      mount();
      choose('gateway');
      type(baseUrl(), 'https://gw.example.com/v1beta');
      type(modelInput(), 'gemini-3.8-flash');
      type(screen.getByLabelText(/^Request path/), '/models/{model}:generateContent?key={apiKey}');
      expect(save().disabled).toBe(true); // key required by the path
      type(keyInput(), 'AIza-real-secret-key');
      expect(save().disabled).toBe(false);
      expect(screen.queryByText(/AIza-real-secret-key/)).toBeNull();
      expect(screen.getByText(/key=YOUR_API_KEY/)).toBeTruthy();
    });
  });

  describe('templates', () => {
    it('lists templates by API format, none tied to a product or to this computer', () => {
      mount();
      choose('gateway');
      const labels = Array.from((screen.getByLabelText(/^Start from a template/) as HTMLSelectElement).options)
        .slice(1)
        .map((o) => o.textContent?.split(' — ')[0]);
      expect(labels).toEqual(['OpenAI-compatible', 'OpenAI Responses', 'Anthropic Claude', 'OpenAI', 'Google Gemini']);
    });

    it('fills the gateway fields from a template without saving', async () => {
      mount();
      choose('gateway');
      fireEvent.change(screen.getByLabelText(/^Start from a template/), { target: { value: 'anthropic' } });
      await waitFor(() => expect((baseUrl() as HTMLInputElement).value).toBe('https://api.anthropic.com/v1'));
      expect(confirm).not.toHaveBeenCalled(); // empty form: nothing to overwrite
      expect(updateAISettings).not.toHaveBeenCalled();
    });

    it('a generic template sets only the API format and leaves the address for you', async () => {
      mount();
      choose('gateway');
      fireEvent.change(screen.getByLabelText(/^Start from a template/), { target: { value: 'openai-responses' } });
      await waitFor(() =>
        expect((screen.getByLabelText(/^API format/) as HTMLSelectElement).value).toBe('openai-responses'),
      );
      expect((baseUrl() as HTMLInputElement).value).toBe('');
    });

    it('asks before replacing a filled form, and keeps it when declined', async () => {
      mount();
      choose('gateway');
      type(baseUrl(), 'https://gw.example.com/v1');
      confirm.mockResolvedValueOnce(false);
      fireEvent.change(screen.getByLabelText(/^Start from a template/), { target: { value: 'anthropic' } });
      await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
      expect((baseUrl() as HTMLInputElement).value).toBe('https://gw.example.com/v1');
    });

    it('the Gemini template puts the key in the path and sends no auth header', async () => {
      mount();
      choose('gateway');
      fireEvent.change(screen.getByLabelText(/^Start from a template/), { target: { value: 'gemini' } });
      await waitFor(() =>
        expect((screen.getByLabelText(/^Request path/) as HTMLInputElement).value).toBe(
          '/models/{model}:generateContent?key={apiKey}',
        ),
      );
      expect((screen.getByLabelText(/^How the key is written/) as HTMLSelectElement).value).toBe('none');
    });
  });

  describe('Remove', () => {
    it('clears the provider, the key and every saved gateway field, including headers', async () => {
      mount({
        provider: 'gateway',
        baseUrl: 'https://gw.example.com/v1',
        model: 'm',
        apiKey: 'sk-gw-secret',
        extraHeaders: [{ name: 'x-tenant', value: 'team-token-12345' }],
      });
      fireEvent.click(screen.getByRole('button', { name: /Remove AI settings/ }));
      await waitFor(() => expect(updateAISettings).toHaveBeenCalledTimes(1));
      expect(updateAISettings.mock.calls[0][0]).toMatchObject({
        provider: '',
        apiKey: '',
        model: '',
        baseUrl: '',
        extraHeaders: [],
        gatewayFormat: '',
        authHeader: '',
        authScheme: '',
        requestPath: '',
        maxTokensField: '',
      });
    });

    it('also clears leftover gateway fields when the saved provider is a hosted one', async () => {
      mount({
        provider: 'openai',
        apiKey: 'sk-openai-secret',
        baseUrl: 'https://old-gateway.example.com/v1',
        extraHeaders: [{ name: 'x-tenant', value: 'team-token-12345' }],
      });
      fireEvent.click(screen.getByRole('button', { name: /Remove AI settings/ }));
      await waitFor(() => expect(updateAISettings).toHaveBeenCalledTimes(1));
      expect(updateAISettings.mock.calls[0][0]).toMatchObject({ provider: '', baseUrl: '', extraHeaders: [] });
    });

    it('with only a hosted key saved it removes just the key and the provider', async () => {
      mount({ provider: 'openai', apiKey: 'sk-openai-secret', model: 'gpt-5.4-mini' });
      fireEvent.click(screen.getByRole('button', { name: 'Remove key' }));
      await waitFor(() => expect(updateAISettings).toHaveBeenCalledTimes(1));
      const patch = updateAISettings.mock.calls[0][0];
      expect(patch).toMatchObject({ provider: '', apiKey: '', model: '' });
      expect('baseUrl' in patch).toBe(false);
    });

    it('does nothing when the user declines', async () => {
      mount({ provider: 'openai', apiKey: 'sk-openai-secret' });
      confirm.mockResolvedValueOnce(false);
      fireEvent.click(screen.getByRole('button', { name: 'Remove key' }));
      await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
      expect(updateAISettings).not.toHaveBeenCalled();
    });
  });

  it('shows the one-click fix for a retired Gemini model, using the current default', () => {
    mount({ provider: 'gemini', apiKey: 'AIza-secret-key', model: 'gemini-2.0-flash' });
    // The model suggestions list and the retired-model warning both offer it; the warning comes last.
    const offers = screen.getAllByRole('button', { name: 'gemini-3.8-flash' });
    fireEvent.click(offers[offers.length - 1]);
    expect(modelInput().value).toBe('gemini-3.8-flash');
  });

  describe('Test connection and the JSON capability', () => {
    const testBtnEnabled = () => screen.getByRole('button', { name: /Test connection/ });
    const answers = (connection: string, probe: string) => {
      askAI.mockReset();
      askAI.mockResolvedValueOnce({ text: connection, stopReason: 'stop' }).mockResolvedValueOnce({ text: probe, stopReason: 'stop' });
    };
    const saved: AISettings = { provider: 'gateway', baseUrl: 'http://localhost:11434/v1', model: 'llama3' };

    it('shows "JSON replies: ok" and remembers it for a saved connection', async () => {
      answers('ok', '{"ok":true}');
      mount(saved);
      fireEvent.click(testBtnEnabled());
      await waitFor(() => expect(screen.getByText(/JSON replies: ok/)).toBeTruthy());
      const patch = updateAISettings.mock.calls.at(-1)?.[0];
      expect(patch.defaultMeta.capabilities).toEqual(['json']);
      expect(typeof patch.defaultMeta.probedAt).toBe('string');
    });

    it('shows "unreliable" and remembers that a probe ran when JSON failed', async () => {
      answers('ok', 'sure thing');
      mount(saved);
      fireEvent.click(testBtnEnabled());
      await waitFor(() => expect(screen.getByText(/JSON replies: unreliable/)).toBeTruthy());
      const patch = updateAISettings.mock.calls.at(-1)?.[0];
      expect(patch.defaultMeta.capabilities).toEqual([]);
      expect(typeof patch.defaultMeta.probedAt).toBe('string');
    });

    it('shows the result but saves nothing while the form has unsaved changes', async () => {
      answers('ok', '{"ok":true}');
      mount(saved);
      type(modelInput(), 'another-model');
      fireEvent.click(testBtnEnabled());
      await waitFor(() => expect(screen.getByText(/JSON replies: ok/)).toBeTruthy());
      expect(screen.getByText(/Not saved: save the connection, then test again/)).toBeTruthy();
      expect(updateAISettings).not.toHaveBeenCalled();
    });

    it('does not probe when the connection test itself failed', async () => {
      askAI.mockReset();
      askAI.mockRejectedValueOnce(new Error('HTTP 401'));
      mount(saved);
      fireEvent.click(testBtnEnabled());
      await waitFor(() => expect(screen.getByText(/HTTP 401/)).toBeTruthy());
      expect(askAI).toHaveBeenCalledTimes(1);
      expect(screen.queryByText(/JSON replies/)).toBeNull();
    });
  });

  describe('the default connection: consent and probe belong to a destination', () => {
    const meta = { allowPeopleData: true, capabilities: ['json' as const], probedAt: '2026-10-24T10:00:00.000Z', name: 'Mine' };
    const saved: AISettings = { provider: 'gateway', baseUrl: 'http://localhost:11434/v1', model: 'llama3', defaultMeta: meta };
    const patchOf = () => updateAISettings.mock.calls.at(-1)?.[0];

    it('a new address clears the people-data permission and the probe result, and keeps the name', () => {
      mount(saved);
      type(screen.getByLabelText(/^Base URL/), 'https://remote.example.com/v1');
      fireEvent.click(save());
      expect(patchOf().defaultMeta).toEqual({ allowPeopleData: undefined, capabilities: [], probedAt: undefined });
    });

    it('a different provider clears them too', () => {
      mount(saved);
      choose('openai');
      type(keyInput(), 'sk-new-key-12345');
      fireEvent.click(save());
      expect(patchOf().defaultMeta).toMatchObject({ allowPeopleData: undefined, capabilities: [], probedAt: undefined });
    });

    it('a new model clears only the probe result: the permission is for the destination, not the model', () => {
      mount(saved);
      type(modelInput(), 'llama3:70b');
      fireEvent.click(save());
      expect(patchOf().defaultMeta).toEqual({ capabilities: [], probedAt: undefined });
    });

    it('changing only the API key leaves both alone', () => {
      mount(saved);
      type(keyInput(), 'sk-rotated-key-1234');
      fireEvent.click(save());
      expect('defaultMeta' in patchOf()).toBe(false);
    });
  });

  it('removing the default connection keeps the "Previous instructions" the UI says are kept', async () => {
    mount({ provider: 'openai', apiKey: 'sk-openai-secret', systemPrompt: 'Always answer in Turkish', extractionGuidance: 'Only this week' });
    fireEvent.click(screen.getByRole('button', { name: 'Remove key' }));
    await waitFor(() => expect(updateAISettings).toHaveBeenCalledTimes(1));
    const patch = updateAISettings.mock.calls[0][0];
    expect('systemPrompt' in patch).toBe(false);
    expect('extractionGuidance' in patch).toBe(false);
  });

  describe('removing the default connection while extra connections exist', () => {
    const company = { id: 'c-company', name: 'Company gateway', provider: 'gateway' as const, baseUrl: 'https://ai.corp.example.com/v1', model: 'team/x', apiKey: 'sk-corp-key-12345' };
    const withExtras: AISettings = { provider: 'openai', apiKey: 'sk-openai-secret', model: 'gpt-5.4-mini', connections: [company], routing: { content: 'c-company' } };

    it('leaves the extras and routing, and the result still survives an older build\'s load and save', async () => {
      mount(withExtras);
      fireEvent.click(screen.getByRole('button', { name: 'Remove key' }));
      await waitFor(() => expect(updateAISettings).toHaveBeenCalledTimes(1));
      const patch = updateAISettings.mock.calls[0][0];
      const after = realUpdateAISettings({ ...emptyData(), aiSettings: withExtras }, patch).aiSettings;
      expect(after?.provider).toBeUndefined();
      expect(after?.connections).toEqual([company]);
      expect(after?.routing).toEqual({ content: 'c-company' });
      // What an older build would do with it:
      const older = legacyParseAISettings(JSON.parse(JSON.stringify(after))) as Record<string, unknown> | undefined;
      expect(older?.connections).toEqual([company]);
      expect(older?.routing).toEqual({ content: 'c-company' });
    });

    it('with nothing else left, the card offers no Remove button for an empty default', () => {
      mount({ gatewayFormat: 'openai-chat', connections: [company] });
      // (The connection list has its own "Remove <name>" buttons; the default form has none.)
      expect(screen.queryByRole('button', { name: 'Remove key' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Remove AI settings' })).toBeNull();
    });
  });
});

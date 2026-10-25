import { useEffect, useMemo, useRef, useState } from 'react';
import { useCopy } from '../../lib/clipboard';
import { Button } from '../ui/Button';
import { IcRefresh, IcTrash } from '../icons';
import { useConfirm } from '../ui/ConfirmProvider';
import { AiProviderInfo } from './AiProviderInfo';
import { askAI, AIError, defaultModel } from '../../lib/ai';
import { mergeCapabilities, probeJsonCapability, probeStreamingCapability, probeVisionCapability } from '../../lib/ai/capabilities';
import { GATEWAY_TEMPLATES } from '../../lib/aiPresets';
import {
  formatHeaderLines,
  gatewayFormatDefaults,
  normalizeGatewayBaseUrl,
  parseHeaderLines,
  resolveGatewayRequest,
} from '../../lib/aiGatewayUrl';
import type { AICapability, AIProvider, AISettings, GatewayAuthScheme, GatewayFormat, GatewayTokenField } from '../../model';
import { AI_PROVIDER_OPTIONS, GATEWAY_FORMAT_OPTIONS } from '../../model';
import type { AISettingsPatch } from '../../core/actions';

/** The fields a connection form edits. The default connection is the top-level `aiSettings`. */
export type ConnectionFormSaved = Partial<
  Pick<
    AISettings,
    | 'provider'
    | 'apiKey'
    | 'model'
    | 'baseUrl'
    | 'gatewayFormat'
    | 'authHeader'
    | 'authScheme'
    | 'requestPath'
    | 'maxTokensField'
    | 'embeddingModel'
    | 'extraHeaders'
  >
>;

export type ConnectionFormProps = {
  saved: ConnectionFormSaved | undefined;
  savedCapabilities?: AICapability[];
  /** Same patch shape `updateAISettings` takes; an empty string clears a field. */
  onSave: (patch: AISettingsPatch) => void;
  /** What to clear when the user removes this connection (the caller decides what that means). */
  onRemove: (patch: AISettingsPatch) => void;
  /** A capability probe ran for the saved form. */
  onProbed: (meta: { capabilities: AICapability[]; probedAt?: string }) => void;
  /** Show the Remove button regardless of what is saved (extra connections). */
  canRemove?: boolean;
  removeCopy?: { title: string; description: string; button: string };
  /** The default connection can be turned off ("— Disabled —"); an extra one cannot. Default true. */
  allowDisabled?: boolean;
  /** Something outside the form (for example a missing name) blocks saving. */
  saveBlocked?: boolean;
  /** Something outside the form changed (for example the name), so Save is meaningful. */
  extraDirty?: boolean;
};

/** What a JSON check is about: if any of this changes, an earlier check no longer describes the connection. */
function identityOf(s: ConnectionFormSaved | undefined): string {
  return JSON.stringify([s?.provider ?? '', s?.baseUrl ?? '', s?.model ?? '', s?.gatewayFormat ?? '']);
}

/**
 * Provider, key, model and the gateway fields, with the info box, templates, preview,
 * Test connection and the JSON probe. Used for the default connection and for every extra one.
 */
export function ConnectionForm({
  saved,
  savedCapabilities,
  onSave,
  onRemove,
  onProbed,
  canRemove,
  removeCopy,
  allowDisabled = true,
  saveBlocked = false,
  extraDirty = false,
}: ConnectionFormProps) {
  const { confirm } = useConfirm();
  const ai = saved;
  const [provider, setProvider] = useState<AIProvider | ''>(ai?.provider ?? '');
  const [apiKey, setApiKey] = useState(ai?.apiKey ?? '');
  const [model, setModel] = useState(ai?.model ?? '');
  const [embeddingModel, setEmbeddingModel] = useState(ai?.embeddingModel ?? '');
  const [baseUrl, setBaseUrl] = useState(ai?.baseUrl ?? '');
  const [gatewayFormat, setGatewayFormat] = useState<GatewayFormat>(ai?.gatewayFormat ?? 'openai-chat');
  const [authHeader, setAuthHeader] = useState(ai?.authHeader ?? '');
  const [authScheme, setAuthScheme] = useState<GatewayAuthScheme | ''>(ai?.authScheme ?? '');
  const [requestPath, setRequestPath] = useState(ai?.requestPath ?? '');
  const [maxTokensField, setMaxTokensField] = useState<GatewayTokenField | ''>(ai?.maxTokensField ?? '');
  const savedHeadersText = formatHeaderLines(ai?.extraHeaders);
  const [headersText, setHeadersText] = useState(savedHeadersText);
  const [showKey, setShowKey] = useState(false);
  const [jsonProbe, setJsonProbe] = useState<{ state: 'ok' | 'no-json' | 'unknown'; remembered: boolean } | null>(null);
  const [savedAt, setSavedAt] = useState<string>('');
  const { copy, statusOf } = useCopy();
  const [testStatus, setTestStatus] = useState<{
    kind: 'idle' | 'running' | 'ok' | 'error';
    message?: string;
    diagnostic?: string;
  }>({
    kind: 'idle',
  });

  // Re-sync local state when the underlying AppData changes (e.g. after replaceAll on import).
  useEffect(() => {
    setProvider(ai?.provider ?? '');
    setApiKey(ai?.apiKey ?? '');
    setModel(ai?.model ?? '');
    setBaseUrl(ai?.baseUrl ?? '');
    setGatewayFormat(ai?.gatewayFormat ?? 'openai-chat');
    setAuthHeader(ai?.authHeader ?? '');
    setAuthScheme(ai?.authScheme ?? '');
    setRequestPath(ai?.requestPath ?? '');
    setMaxTokensField(ai?.maxTokensField ?? '');
    setEmbeddingModel(ai?.embeddingModel ?? '');
    setHeadersText(savedHeadersText);
  }, [
    ai?.provider,
    ai?.apiKey,
    ai?.model,
    ai?.baseUrl,
    ai?.gatewayFormat,
    ai?.authHeader,
    ai?.authScheme,
    ai?.requestPath,
    ai?.maxTokensField,
    ai?.embeddingModel,
    // A string, not the array: normalizeData builds a new array on every load,
    // which would reset unsaved drafts even when nothing changed.
    savedHeadersText,
  ]);

  const placeholderModel = useMemo(() => (provider ? defaultModel(provider) : ''), [provider]);
  const modelExamples = useMemo(
    () => (provider ? AI_PROVIDER_OPTIONS.find((p) => p.value === provider)?.modelExamples ?? [] : []),
    [provider],
  );
  // Gemini 1.x was retired from v1beta in late 2025; surface a one-click fix
  // for users who still have the old name saved.
  const modelIsRetiredGemini = provider === 'gemini' && /^gemini-(1\.|2\.0)/i.test(model.trim());
  const isGateway = provider === 'gateway';
  const savedIsGateway = ai?.provider === 'gateway';
  /** Gateway settings can linger in the saved data after switching to a hosted provider. */
  const hasSavedGatewayFields = !!(
    ai?.baseUrl ||
    // `openai-chat` is the default format; it is also kept as a compatibility marker (see the
    // default connection's Remove), so on its own it is not a "saved gateway field".
    (ai?.gatewayFormat && ai.gatewayFormat !== 'openai-chat') ||
    ai?.authHeader ||
    ai?.authScheme ||
    ai?.requestPath ||
    ai?.maxTokensField ||
    ai?.extraHeaders?.length
  );
  /**
   * Changing the provider starts the key and model from what is saved for THAT provider, or
   * empty. Carrying them over would send one provider's key to another (for example an OpenAI
   * key to a gateway) and save a model name the new provider does not know.
   */
  const selectProvider = (next: AIProvider | '') => {
    const same = next === (ai?.provider ?? '');
    setProvider(next);
    setApiKey(same ? (ai?.apiKey ?? '') : '');
    setModel(same ? (ai?.model ?? '') : '');
    setEmbeddingModel(same ? (ai?.embeddingModel ?? '') : '');
    setTestStatus({ kind: 'idle' });
  };
  const gatewayUrl = isGateway ? normalizeGatewayBaseUrl(baseUrl) : null;
  const parsedHeaders = isGateway ? parseHeaderLines(headersText) : null;
  const gatewaySettings = {
    baseUrl: gatewayUrl?.ok ? gatewayUrl.url : undefined,
    gatewayFormat: gatewayFormat === 'openai-chat' ? undefined : gatewayFormat,
    authHeader: authHeader.trim() || undefined,
    authScheme: authScheme || undefined,
    requestPath: requestPath.trim() || undefined,
    maxTokensField: maxTokensField || undefined,
    extraHeaders: parsedHeaders?.ok && parsedHeaders.headers.length ? parsedHeaders.headers : undefined,
  };
  // Resolving the request here validates the whole gateway configuration (URL,
  // path, header names and values). The preview uses a stand-in key so the real
  // one is never printed on screen when the path carries it.
  const gatewayCheck = isGateway
    ? resolveGatewayRequest(gatewaySettings, model.trim() || 'MODEL', apiKey.trim())
    : null;
  const gatewayPreview = isGateway
    ? resolveGatewayRequest(gatewaySettings, model.trim() || 'MODEL', 'YOUR_API_KEY')
    : null;
  const gatewayDefaults = gatewayFormatDefaults(gatewayFormat);
  /** Fills the gateway form from a template. Nothing is saved until Save is pressed. */
  const applyTemplate = async (id: string) => {
    const t = GATEWAY_TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    const hasDraft =
      baseUrl.trim() !== '' ||
      authHeader.trim() !== '' ||
      authScheme !== '' ||
      requestPath.trim() !== '' ||
      headersText.trim() !== '' ||
      maxTokensField !== '' ||
      gatewayFormat !== 'openai-chat';
    if (
      hasDraft &&
      !(await confirm({
        title: `Fill the form from the ${t.label} template?`,
        description:
          'The address, format, authentication, headers and path currently in the form will be replaced. Nothing is saved until you press Save.',
        confirmLabel: 'Replace',
      }))
    ) {
      return;
    }
    const c = t.connection;
    setBaseUrl(c.baseUrl ?? '');
    setGatewayFormat(c.gatewayFormat ?? 'openai-chat');
    setAuthHeader(c.authHeader ?? '');
    setAuthScheme(c.authScheme ?? '');
    setRequestPath(c.requestPath ?? '');
    setMaxTokensField(c.maxTokensField ?? '');
    setHeadersText(formatHeaderLines(c.extraHeaders));
    if (!model.trim() && t.modelExample) setModel(t.modelExample);
    setTestStatus({ kind: 'idle' });
  };
  const gatewayDirty =
    isGateway &&
    ((ai?.baseUrl ?? '') !== (gatewayUrl?.ok ? gatewayUrl.url : baseUrl.trim()) ||
      (ai?.gatewayFormat ?? 'openai-chat') !== gatewayFormat ||
      (ai?.authHeader ?? '') !== authHeader.trim() ||
      (ai?.authScheme ?? '') !== authScheme ||
      (ai?.requestPath ?? '') !== requestPath.trim() ||
      (ai?.maxTokensField ?? '') !== maxTokensField ||
      savedHeadersText !== (parsedHeaders?.ok ? formatHeaderLines(parsedHeaders.headers) : headersText.trim()));
  // What a test result is about. Edit any of it and the result no longer describes the form.
  const draftKey = JSON.stringify([provider, apiKey, model, baseUrl, gatewayFormat, authHeader, authScheme, requestPath, maxTokensField, headersText]);
  const testedKeyRef = useRef(draftKey);
  useEffect(() => {
    if (testStatus.kind !== 'ok' && testStatus.kind !== 'error') return;
    if (draftKey === testedKeyRef.current) return;
    setTestStatus({ kind: 'idle' });
    setJsonProbe(null);
  }, [draftKey, testStatus.kind]);
  const dirty =
    (ai?.provider ?? '') !== provider ||
    (ai?.apiKey ?? '') !== apiKey.trim() ||
    (ai?.model ?? '') !== model.trim() ||
    (ai?.embeddingModel ?? '') !== embeddingModel.trim() ||
    gatewayDirty;
  // A gateway needs a valid configuration and a model (it has no default one);
  // its key is optional. Hosted providers need a key.
  // Choosing "— Disabled —" is a valid thing to save: it turns AI off.
  const canSave = isGateway
    ? !!gatewayCheck?.ok && !!parsedHeaders?.ok && model.trim().length > 0
    : provider === ''
      ? allowDisabled
      : apiKey.trim().length >= 8;

  const save = () => {
    onSave({
      provider,
      apiKey: apiKey.trim(),
      model: model.trim(),
      embeddingModel: embeddingModel.trim(),
      // Only touched for a gateway; another provider leaves any saved gateway
      // configuration alone.
      ...(isGateway && gatewayUrl?.ok && parsedHeaders?.ok
        ? {
            baseUrl: gatewayUrl.url,
            gatewayFormat: gatewayFormat === 'openai-chat' ? '' : gatewayFormat,
            authHeader: authHeader.trim(),
            authScheme,
            requestPath: requestPath.trim(),
            maxTokensField,
            extraHeaders: parsedHeaders.headers,
          }
        : {}),
    });
    setSavedAt(new Date().toLocaleTimeString());
    setTestStatus({ kind: 'idle' });
  };

  const remove = async () => {
    if (
      !(await confirm({
        title:
          removeCopy?.title ?? (savedIsGateway || hasSavedGatewayFields ? 'Remove AI settings?' : 'Remove API key?'),
        description:
          removeCopy?.description ??
          (savedIsGateway || hasSavedGatewayFields
            ? 'The provider, API key, model and the saved gateway settings (address, headers, path) will be removed from this device.'
            : 'The stored API key will be removed from this device.'),
        confirmLabel: 'Remove',
        danger: true,
      }))
    ) {
      return;
    }
    onRemove({
      provider: '',
      apiKey: '',
      model: '',
      embeddingModel: '',
      // Gateway settings are cleared whenever any are saved, matching the dialog above
      // (they can hold tokens in headers, so they must not linger after Remove).
      ...(savedIsGateway || hasSavedGatewayFields
        ? {
            baseUrl: '',
            gatewayFormat: '',
            authHeader: '',
            authScheme: '',
            requestPath: '',
            maxTokensField: '',
            extraHeaders: [],
          }
        : {}),
    });
    setProvider('');
    setApiKey('');
    setModel('');
    setBaseUrl('');
    setGatewayFormat('openai-chat');
    setAuthHeader('');
    setAuthScheme('');
    setRequestPath('');
    setMaxTokensField('');
    setHeadersText('');
    setSavedAt('');
    setTestStatus({ kind: 'idle' });
  };

  // The newest saved identity, unsaved-edit state and capabilities, for async code that outlives a render.
  const latestRef = useRef({ identity: identityOf(ai), dirty: false, capabilities: savedCapabilities });
  latestRef.current = { identity: identityOf(ai), dirty, capabilities: savedCapabilities };

  const test = async () => {
    if (!provider || !canSave) return;
    testedKeyRef.current = draftKey;
    setTestStatus({ kind: 'running' });
    setJsonProbe(null);
    // Test connection takes seconds. What was tested is stored only if, when it finishes, the saved
    // configuration is still the one tested and the form has no unsaved edits.
    const testedIdentity = identityOf(ai);
    const draftSettings = {
      provider: provider as AIProvider,
      apiKey: apiKey.trim(),
      model: model.trim(),
      ...(isGateway ? gatewaySettings : {}),
    };
    try {
      const result = await askAI({
        settings: draftSettings,
        messages: [
          {
            role: 'user',
            content: 'Reply with the single word "ok" so I can confirm the connection works.',
          },
        ],
        // Newer models may spend part of the limit on hidden reasoning, so a tiny limit can
        // come back empty; this is a connection check, not a cost concern.
        maxOutputTokens: 256,
        dataClass: 'content',
      });
      setTestStatus({
        kind: 'ok',
        message: `Connection works. Provider answered: "${result.text.replace(/\s+/g, ' ').slice(0, 80)}"`,
      });
      // Which tasks a connection can serve depends on whether it returns reliable JSON.
      const verdict = await probeJsonCapability(draftSettings);
      if (verdict === 'unknown') {
        // A failed request says nothing about JSON; never record it.
        setJsonProbe({ state: 'unknown', remembered: false });
      } else {
        const latest = latestRef.current;
        const remembered = !latest.dirty && latest.identity === testedIdentity;
        setJsonProbe({ state: verdict, remembered });
        if (remembered) {
          onProbed({
            capabilities: mergeCapabilities(latest.capabilities, { json: verdict === 'ok' }),
            probedAt: new Date().toISOString(),
          });
        }
      }
    } catch (err) {
      const message = err instanceof AIError ? err.message : (err as Error)?.message ?? String(err);
      setTestStatus({
        kind: 'error',
        message,
        diagnostic: err instanceof AIError ? err.diagnostic : undefined,
      });
    }
  };

  const [capCheck, setCapCheck] = useState<{
    kind: 'vision' | 'streaming';
    state: 'running' | 'ok' | 'no' | 'unknown';
    remembered: boolean;
  } | null>(null);

  /** Same rules as the JSON check: stored only if the saved connection is still the one checked and nothing is unsaved. */
  const checkCapability = async (kind: 'vision' | 'streaming') => {
    if (!provider || !canSave) return;
    setCapCheck({ kind, state: 'running', remembered: false });
    const checkedIdentity = identityOf(ai);
    const draft = {
      provider: provider as AIProvider,
      apiKey: apiKey.trim(),
      model: model.trim(),
      ...(isGateway ? gatewaySettings : {}),
    };
    const verdict = kind === 'vision' ? await probeVisionCapability(draft) : await probeStreamingCapability(draft);
    if (verdict === 'unknown') {
      setCapCheck({ kind, state: 'unknown', remembered: false });
      return;
    }
    const latest = latestRef.current;
    const remembered = !latest.dirty && latest.identity === checkedIdentity;
    setCapCheck({ kind, state: verdict, remembered });
    if (remembered) {
      onProbed({ capabilities: mergeCapabilities(latest.capabilities, { [kind]: verdict === 'ok' }) });
    }
  };

  const isDesktop = typeof window !== 'undefined' && !!window.cadence;

  return (
    <>
      <label className="field">
        <span>Provider</span>
        <select
          className="input"
          value={provider}
          onChange={(e) => selectProvider(e.target.value as AIProvider | '')}
        >
          {allowDisabled ? (
            <option value="">— Disabled —</option>
          ) : (
            <option value="" disabled>
              Choose a provider…
            </option>
          )}
          {AI_PROVIDER_OPTIONS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </label>

      <AiProviderInfo provider={provider} />

      {isGateway ? (
        <label className="field">
          <span>Start from a template</span>
          <select className="input" value="" onChange={(e) => void applyTemplate(e.target.value)}>
            <option value="">Choose a template to fill the fields below…</option>
            {GATEWAY_TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label} — {t.hint}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {isGateway ? (
        <label className="field">
          <span>Base URL</span>
          <input
            className="input"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="http://localhost:20128/v1"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
          <span className="muted small" style={{ marginTop: 4, display: 'block' }}>
            Include the version segment (usually <code>/v1</code>). Plain <code>http://</code> is only accepted for
            localhost and private-network addresses; use <code>https://</code> for anything remote.
            {isDesktop ? '' : ' In the web build the gateway must allow browser (CORS) requests.'}
          </span>
          {baseUrl.trim() && gatewayUrl && !gatewayUrl.ok ? (
            <span className="small" style={{ marginTop: 4, display: 'block', color: 'var(--danger)' }}>
              {gatewayUrl.error}
            </span>
          ) : null}
        </label>
      ) : null}

      {isGateway ? (
        <>
          <label className="field">
            <span>API format</span>
            <select
              className="input"
              value={gatewayFormat}
              onChange={(e) => setGatewayFormat(e.target.value as GatewayFormat)}
            >
              {GATEWAY_FORMAT_OPTIONS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
            <span className="muted small" style={{ marginTop: 4, display: 'block' }}>
              The request format your gateway expects. If you configure other coding tools against it, the provider
              type they use (OpenAI-compatible, Anthropic, Gemini) tells you which one to pick.
            </span>
          </label>

          <details className="field">
            <summary className="small" style={{ cursor: 'pointer' }}>
              Advanced: authentication, extra headers, request path
            </summary>
            <label className="field" style={{ marginTop: 8 }}>
              <span>
                Auth header <em className="muted">(default: {gatewayDefaults.authHeader})</em>
              </span>
              <input
                className="input"
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder={gatewayDefaults.authHeader}
                value={authHeader}
                onChange={(e) => setAuthHeader(e.target.value)}
              />
            </label>
            <label className="field">
              <span>How the key is written</span>
              <select
                className="input"
                value={authScheme}
                onChange={(e) => setAuthScheme(e.target.value as GatewayAuthScheme | '')}
              >
                <option value="">Automatic (Bearer for Authorization, the key alone otherwise)</option>
                <option value="bearer">Bearer &lt;key&gt;</option>
                <option value="raw">The key alone</option>
                <option value="none">No auth header (the key is in the request path)</option>
              </select>
            </label>
            {gatewayFormat === 'openai-chat' ? (
              <label className="field">
                <span>Token limit field</span>
                <select
                  className="input"
                  value={maxTokensField}
                  onChange={(e) => setMaxTokensField(e.target.value as GatewayTokenField | '')}
                >
                  <option value="">max_tokens (works almost everywhere)</option>
                  <option value="max_completion_tokens">max_completion_tokens (OpenAI reasoning models)</option>
                </select>
              </label>
            ) : null}
            <label className="field">
              <span>
                Request path <em className="muted">(default: {gatewayDefaults.path})</em>
              </span>
              <input
                className="input"
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder={gatewayDefaults.path}
                value={requestPath}
                onChange={(e) => setRequestPath(e.target.value)}
              />
              <span className="muted small" style={{ marginTop: 4, display: 'block' }}>
                Appended to the base URL; may end in a <code>?query</code>. <code>{'{model}'}</code> and{' '}
                <code>{'{apiKey}'}</code> are replaced by the model name and your API key.
              </span>
            </label>
            <label className="field">
              <span>Extra headers</span>
              <textarea
                className="input"
                rows={3}
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder={'x-tenant: my-team'}
                value={headersText}
                onChange={(e) => setHeadersText(e.target.value)}
                style={{ fontFamily: 'var(--mono, monospace)' }}
              />
              <span className="muted small" style={{ marginTop: 4, display: 'block' }}>
                One <code>Name: value</code> per line. Stored with your other settings, encrypted on desktop.
              </span>
            </label>
          </details>

          {parsedHeaders && !parsedHeaders.ok ? (
            <span className="small" style={{ display: 'block', color: 'var(--danger)' }}>
              {parsedHeaders.error}
            </span>
          ) : gatewayCheck && !gatewayCheck.ok && gatewayUrl?.ok ? (
            <span className="small" style={{ display: 'block', color: 'var(--danger)' }}>
              {gatewayCheck.error}
            </span>
          ) : gatewayPreview?.ok ? (
            <span className="muted small" style={{ display: 'block', wordBreak: 'break-all' }}>
              Requests go to <code>POST {gatewayPreview.url}</code>
            </span>
          ) : null}
        </>
      ) : null}

      <label className="field">
        <span>
          API key {isGateway ? <em className="muted">(optional — leave empty if your gateway needs none)</em> : null}
        </span>
        <div className="row" style={{ gap: 6 }}>
          <input
            className="input"
            type={showKey ? 'text' : 'password'}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="sk-…   /   AIza…"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            style={{ flex: 1 }}
          />
          <Button
            type="button"
            variant="ghost"
            aria-pressed={showKey}
            aria-label={showKey ? 'Hide API key' : 'Show API key'}
            onClick={() => setShowKey((v) => !v)}
          >
            {showKey ? 'Hide' : 'Show'}
          </Button>
        </div>
      </label>

      <label className="field">
        <span>Model {placeholderModel ? <em className="muted">(default: {placeholderModel})</em> : null}</span>
        <input
          className="input"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder={
            isGateway ? 'Model name as your gateway lists it, e.g. if/kimi-k2-thinking' : placeholderModel || 'Choose a provider first'
          }
          value={model}
          onChange={(e) => setModel(e.target.value)}
        />
        {modelExamples.length > 0 ? (
          <span className="muted small" style={{ marginTop: 4, display: 'block' }}>
            Suggested: {modelExamples.map((m, i) => (
              <span key={m}>
                <button
                  type="button"
                  className="auth-link auth-link--inline"
                  onClick={() => setModel(m)}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                >
                  {m}
                </button>
                {i < modelExamples.length - 1 ? ', ' : ''}
              </span>
            ))}
          </span>
        ) : null}
        {modelIsRetiredGemini ? (
          <span
            className="small"
            style={{
              marginTop: 6,
              display: 'block',
              padding: '6px 10px',
              borderRadius: 6,
              background: 'rgba(220, 38, 38, 0.08)',
              border: '1px solid var(--danger)',
              color: 'var(--text)',
            }}
          >
            Heads up: Google retired Gemini 1.x (late 2025) and gemini-2.0-flash (2026-06-01); they return HTTP 404. Click{' '}
            <button
              type="button"
              className="auth-link auth-link--inline"
              onClick={() => setModel(defaultModel('gemini'))}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 600 }}
            >
              {defaultModel('gemini')}
            </button>{' '}
            to switch to a current model.
          </span>
        ) : null}
      </label>

      {provider && provider !== 'anthropic' && !(isGateway && gatewayFormat === 'anthropic') ? (
        <label className="field">
          <span>
            Embedding model <em className="muted">(optional, for search by meaning)</em>
          </span>
          <input
            className="input"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder={
              provider === 'openai' ? 'text-embedding-3-small' : provider === 'gemini' ? 'gemini-embedding-001' : 'Embedding model your gateway offers'
            }
            value={embeddingModel}
            onChange={(e) => setEmbeddingModel(e.target.value)}
          />
        </label>
      ) : null}

      <div className="row" style={{ marginTop: 12, flexWrap: 'wrap' }}>
        <Button type="button" variant="primary" disabled={!canSave || saveBlocked || (!dirty && !extraDirty)} onClick={save}>
          Save
        </Button>
        <Button
          type="button"
          variant="secondary"
          icon={<IcRefresh size={16} />}
          disabled={!provider || !canSave || testStatus.kind === 'running'}
          onClick={test}
        >
          {testStatus.kind === 'running' ? 'Testing…' : 'Test connection'}
        </Button>
        {(canRemove ?? (ai?.apiKey || ai?.provider === 'gateway' || hasSavedGatewayFields)) ? (
          <Button type="button" variant="ghost" icon={<IcTrash size={16} />} onClick={() => void remove()}>
            {removeCopy?.button ?? (savedIsGateway || hasSavedGatewayFields ? 'Remove AI settings' : 'Remove key')}
          </Button>
        ) : null}
        {savedAt ? <span className="muted small">Saved at {savedAt}</span> : null}
      </div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        <Button type="button" variant="ghost" disabled={!provider || !canSave || capCheck?.state === 'running'} onClick={() => void checkCapability('vision')}>
          Check images
        </Button>
        <Button type="button" variant="ghost" disabled={!provider || !canSave || capCheck?.state === 'running'} onClick={() => void checkCapability('streaming')}>
          Check live replies
        </Button>
      </div>
      {capCheck && capCheck.state !== 'running' ? (
        <p className="muted small" role="status" style={{ marginTop: 4 }}>
          {capCheck.kind === 'vision' ? 'Images' : 'Live replies'}:{' '}
          {capCheck.state === 'ok' ? 'ok' : capCheck.state === 'no' ? 'not supported' : 'could not be checked (try again)'}
          {capCheck.state !== 'unknown' && !capCheck.remembered ? ' · Not saved: save the connection, then check again.' : ''}
        </p>
      ) : null}

      {testStatus.kind === 'ok' && testStatus.message ? (
        <p className="muted small" role="status" style={{ marginTop: 8, color: 'var(--ok)' }}>
          {testStatus.message}
        </p>
      ) : null}
      {testStatus.kind === 'ok' && jsonProbe ? (
        <p className="muted small" role="status" style={{ marginTop: 4 }}>
          JSON replies:{' '}
          {jsonProbe.state === 'ok'
            ? 'ok'
            : jsonProbe.state === 'no-json'
              ? 'unreliable'
              : 'could not be checked (try Test connection again)'}
          {jsonProbe.state !== 'unknown' && !jsonProbe.remembered ? ' · Not saved: save the connection, then test again.' : ''}
        </p>
      ) : null}
      {testStatus.kind === 'error' && testStatus.message ? (
        <pre
          className="pre"
          role="alert"
          style={{
            marginTop: 8,
            padding: 8,
            borderRadius: 8,
            background: 'color-mix(in srgb, var(--danger) 14%, transparent)',
            color: 'var(--danger)',
            whiteSpace: 'pre-wrap',
            maxHeight: 160,
            overflow: 'auto',
          }}
        >
          {testStatus.message}
        </pre>
      ) : null}
      {testStatus.kind === 'error' && testStatus.diagnostic ? (
        <details style={{ marginTop: 8 }}>
          <summary className="small" style={{ cursor: 'pointer' }}>
            Diagnostic details (header values and your key are hidden)
          </summary>
          <pre className="pre small" style={{ marginTop: 6, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {testStatus.diagnostic}
          </pre>
          <Button type="button" variant="ghost" onClick={() => void copy('diagnostic', testStatus.diagnostic ?? '')}>
            {statusOf('diagnostic') === 'copied'
              ? 'Copied'
              : statusOf('diagnostic') === 'failed'
                ? 'Could not copy: select the text above'
                : 'Copy diagnostic'}
          </Button>
        </details>
      ) : null}
    </>
  );
}

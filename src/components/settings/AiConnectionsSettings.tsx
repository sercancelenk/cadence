import { useState } from 'react';
import { useAppData } from '../../AppDataContext';
import { useFeatures } from '../../lib/features';
import { listConnections, type ConnectionView } from '../../lib/ai/connections';
import { AI_PROVIDER_OPTIONS, DEFAULT_CONNECTION_ID, MAX_AI_CONNECTIONS } from '../../model';
import type { AIConnection, AIRouting } from '../../model';
import type { AISettingsPatch } from '../../core/actions';
import { Button } from '../ui/Button';
import { IcTrash } from '../icons';
import { useConfirm } from '../ui/ConfirmProvider';
import { ConnectionForm } from './ConnectionForm';

const providerLabel = (p: string) => AI_PROVIDER_OPTIONS.find((o) => o.value === p)?.label ?? p;

function hostOf(baseUrl: string | undefined): string {
  try {
    return baseUrl ? new URL(baseUrl).host : '';
  } catch {
    return '';
  }
}

const GATEWAY_KEYS = ['baseUrl', 'gatewayFormat', 'authHeader', 'authScheme', 'requestPath', 'maxTokensField'] as const;

/** Applies what ConnectionForm saves (the `updateAISettings` patch shape) to an extra connection. */
function connectionFromPatch(
  existing: AIConnection | undefined,
  id: string,
  name: string,
  patch: AISettingsPatch,
): AIConnection {
  const next: AIConnection = {
    ...(existing ?? { id, name, provider: 'gateway' }),
    id,
    name,
    provider: patch.provider || existing?.provider || 'gateway',
    apiKey: patch.apiKey?.trim() || undefined,
    model: patch.model?.trim() || undefined,
  };
  // Gateway fields are only in the patch when a gateway is selected; otherwise they stay as they were.
  for (const key of GATEWAY_KEYS) {
    if (key in patch) (next as unknown as Record<string, unknown>)[key] = (patch as Record<string, unknown>)[key] || undefined;
  }
  if ('extraHeaders' in patch) next.extraHeaders = patch.extraHeaders?.length ? patch.extraHeaders : undefined;
  // A hosted provider has no address, headers or path of its own; leftovers from a gateway would
  // only show up as a misleading host in the list and keep tokens that nothing uses.
  if (next.provider !== 'gateway') {
    for (const key of GATEWAY_KEYS) delete (next as unknown as Record<string, unknown>)[key];
    delete next.extraHeaders;
  }
  // A probe describes the connection as it was; if what it talks to changed, it is stale.
  const changed =
    !existing ||
    existing.provider !== next.provider ||
    existing.model !== next.model ||
    existing.baseUrl !== next.baseUrl ||
    existing.gatewayFormat !== next.gatewayFormat;
  if (changed) {
    next.capabilities = undefined;
    next.probedAt = undefined;
  }
  // Permission to receive people data was given to a specific destination. If the provider or
  // the address changes, it is a different destination and the user is asked again (the switch).
  if (existing && (existing.provider !== next.provider || existing.baseUrl !== next.baseUrl)) {
    next.allowPeopleData = undefined;
  }
  return next;
}

function jsonChip(view: ConnectionView): string {
  if (!view.probed) return 'JSON: untested';
  return view.capabilities.includes('json') ? 'JSON: ok' : 'JSON: unreliable';
}

/**
 * Connections, which connection each kind of task uses, and what AI is allowed to see.
 * The default connection itself is edited in the form above this component.
 */
export function AiConnectionsSettings() {
  const { data, updateAISettings, upsertAIConnection, patchAIConnection, removeAIConnection } = useAppData();
  const { features } = useFeatures();
  const { confirm } = useConfirm();
  const ai = data.aiSettings;
  const views = listConnections(ai);
  const extras = ai?.connections ?? [];
  const defaultView = views.find((v) => v.isDefault);

  /** `null` = closed, `'new'` = adding, otherwise the id being edited. */
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [name, setName] = useState('');

  const startEdit = (id: string | 'new') => {
    setEditing(id);
    setName(id === 'new' ? '' : (extras.find((c) => c.id === id)?.name ?? ''));
  };
  const editingConnection = editing && editing !== 'new' ? extras.find((c) => c.id === editing) : undefined;

  const saveConnection = (patch: AISettingsPatch) => {
    const id = editingConnection?.id ?? globalThis.crypto.randomUUID();
    const next = connectionFromPatch(editingConnection, id, name.trim(), patch);
    upsertAIConnection(next);
    setEditing(null);
  };

  const setPeopleAllowed = (view: ConnectionView, allowed: boolean) => {
    if (view.isDefault) updateAISettings({ defaultMeta: { allowPeopleData: allowed } });
    else patchAIConnection(view.id, { allowPeopleData: allowed });
  };

  const removeConnection = async (view: ConnectionView) => {
    const ok = await confirm({
      title: 'Remove connection?',
      description: `“${view.name}” and its saved key will be removed from this device. Anything routed to it goes back to the default connection.`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    // The action works on the latest data and also removes any routing that pointed here.
    removeAIConnection(view.id);
    if (editing === view.id) setEditing(null);
  };

  const setRoute = (key: 'content' | 'people', id: string) => {
    const next: AIRouting = { ...(ai?.routing ?? {}) };
    if (id === DEFAULT_CONNECTION_ID) delete next[key];
    else next[key] = id;
    updateAISettings({ routing: next });
  };

  const routeSelect = (key: 'content' | 'people', label: string, disabled: boolean) => {
    const routed = ai?.routing?.[key];
    const exists = !routed || views.some((v) => v.id === routed);
    return (
      <div className="field">
        <label>
          <span>{label}</span>
          <select
            className="input"
            value={routed && exists ? routed : DEFAULT_CONNECTION_ID}
            disabled={disabled}
            onChange={(e) => setRoute(key, e.target.value)}
          >
            <option value={DEFAULT_CONNECTION_ID}>
              {defaultView ? `Default (${defaultView.name})` : 'Default'}
            </option>
            {views
              .filter((v) => !v.isDefault)
              .map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
          </select>
        </label>
        {!exists ? (
          <span className="muted small" style={{ display: 'block', marginTop: 4 }}>
            The connection selected here no longer exists; the default is used.
          </span>
        ) : null}
      </div>
    );
  };

  const legacy = [
    { key: 'systemPrompt' as const, label: 'System instructions', copy: 'Copy system instructions', remove: 'Remove system instructions', text: ai?.systemPrompt?.trim() },
    { key: 'extractionGuidance' as const, label: 'Extraction instructions', copy: 'Copy extraction instructions', remove: 'Remove extraction instructions', text: ai?.extractionGuidance?.trim() },
  ].filter((l) => l.text);

  return (
    <div className="ai-connections">
      <h4 className="ai-section-title">Connections</h4>
      {views.length > 0 ? (
        <ul className="ai-conn-list" aria-label="Connections">
          {views.map((view) => (
            <li key={view.id} className="ai-conn" aria-label={view.name}>
              <div className="ai-conn__main">
                <strong>{view.name}</strong>
                <span className="muted small">
                  {providerLabel(view.settings.provider ?? '')}
                  {hostOf(view.settings.baseUrl) ? ` · ${hostOf(view.settings.baseUrl)}` : ''}
                  {view.isDefault ? ' · edited above' : ''}
                </span>
              </div>
              <span className="ai-conn__chip">{jsonChip(view)}</span>
              <label className="ai-conn__switch">
                <input
                  type="checkbox"
                  aria-label={`Allow people data on ${view.name}`}
                  checked={view.allowsPeopleData}
                  disabled={!features.aiPeople}
                  onChange={(e) => setPeopleAllowed(view, e.target.checked)}
                />
                <span className="small">Allow people data</span>
              </label>
              {!view.isDefault ? (
                <div className="ai-conn__actions">
                  <Button type="button" variant="ghost" aria-label={`Edit ${view.name}`} onClick={() => startEdit(view.id)}>
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    icon={<IcTrash size={16} />}
                    aria-label={`Remove ${view.name}`}
                    onClick={() => void removeConnection(view)}
                  >
                    Remove
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {editing ? (
        <div className="ai-conn-editor">
          <label className="field">
            <span>Connection name</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="For example: Company gateway" />
          </label>
          <ConnectionForm
            key={editing}
            saved={editingConnection}
            savedCapabilities={editingConnection?.capabilities}
            allowDisabled={false}
            canRemove={false}
            saveBlocked={!name.trim()}
            extraDirty={!!editingConnection && name.trim() !== editingConnection.name}
            onSave={saveConnection}
            onRemove={() => {}}
            onProbed={(meta) => {
              // A probe finishes seconds after it started; patching by id on the latest data means
              // it can never bring back a connection that was removed meanwhile.
              if (editingConnection) patchAIConnection(editingConnection.id, meta);
            }}
          />
          <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
            Cancel
          </Button>
        </div>
      ) : (
        <>
          <Button
            type="button"
            variant="secondary"
            disabled={extras.length >= MAX_AI_CONNECTIONS}
            onClick={() => startEdit('new')}
          >
            Add connection
          </Button>
          {extras.length >= MAX_AI_CONNECTIONS ? (
            <span className="muted small"> You can keep up to {MAX_AI_CONNECTIONS} connections.</span>
          ) : null}
        </>
      )}

      <h4 className="ai-section-title">Feature routing</h4>
      <p className="muted small">Choose which connection serves each kind of AI task.</p>
      {routeSelect('content', 'Notes and tasks', false)}
      {routeSelect('people', 'People data (1:1, feedback, a person\'s tasks)', !features.aiPeople)}

      <h4 className="ai-section-title">Privacy</h4>
      <p className="muted small">
        AI only sees what you start it on, and each result shows what was read and what was sent. 1:1 notes and
        feedback only go to connections you allow; a model running on this computer is allowed by default.
      </p>
      {!features.aiPeople ? (
        <p className="small">Your organization turned off AI for 1:1 notes and feedback.</p>
      ) : null}
      {legacy.length > 0 ? (
        <div className="ai-legacy">
          <h5 className="ai-legacy__title">Previous instructions</h5>
          <p className="muted small">
            {features.aiFocusNote
              ? 'Older versions let you type your own instructions. They are kept and still applied as a short focus note (plain text, up to 200 characters) for Ask AI and Extract tasks. Remove them if you no longer want that.'
              : 'Older versions let you type your own instructions. They are kept, but focus notes are turned off by your organization, so they are not applied.'}
          </p>
          {legacy.map((l) => (
            <div key={l.key} className="ai-legacy__item">
              <div className="small">{l.label}</div>
              <pre className="ai-legacy__text">{l.text}</pre>
              <Button
                type="button"
                variant="ghost"
                aria-label={l.copy}
                onClick={() => {
                  try {
                    void navigator.clipboard.writeText(l.text ?? '');
                  } catch {
                    // Clipboard unavailable; the text above can be selected by hand.
                  }
                }}
              >
                Copy
              </Button>
              <Button type="button" variant="ghost" aria-label={l.remove} onClick={() => updateAISettings({ [l.key]: '' })}>
                Remove
              </Button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

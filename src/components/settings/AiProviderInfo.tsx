import { AI_LIMITS, PROVIDER_INFO } from '../../lib/aiPresets';
import type { AIProvider } from '../../model';

/**
 * What the chosen AI provider is, where requests go, how they are
 * authenticated, what is sent and what the integration cannot do. Shown under
 * the provider dropdown and changes with it.
 */
export function AiProviderInfo({ provider }: { provider: AIProvider | '' }) {
  const info = PROVIDER_INFO[provider || 'none'];
  return (
    <aside className="ai-info" aria-label={`About ${info.title}`}>
      <h4 className="ai-info__title">{info.title}</h4>
      <p className="ai-info__summary">{info.summary}</p>
      {info.facts.length > 0 ? (
        <dl className="ai-info__facts">
          {info.facts.map(([label, value]) => (
            <div key={label} className="ai-info__fact">
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {info.notes.length > 0 ? (
        <ul className="ai-info__notes">
          {info.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
      {provider ? (
        <details className="ai-info__limits">
          <summary>Limits</summary>
          <ul>
            {AI_LIMITS.map((limit) => (
              <li key={limit}>{limit}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </aside>
  );
}

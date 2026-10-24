export type AiContextChip = {
  label: string;
  detail?: string;
  /** The exact text sent for this chip. When present the chip can be opened ("What was sent"). */
  sent?: string;
};

/**
 * What an AI request read, as small chips. This is what the user sees instead of a
 * prompt: the scope of the data, with the sent text one click away.
 */
export function AiContextChips({ chips }: { chips: AiContextChip[] }) {
  if (chips.length === 0) return null;
  return (
    <ul className="ai-chips" aria-label="What the AI read">
      {chips.map((chip) => (
        <li key={`${chip.label}:${chip.detail ?? ''}`} className="ai-chips__item">
          {chip.sent ? (
            <details className="ai-chip ai-chip--expandable">
              <summary>
                <span className="ai-chip__label">{chip.label}</span>
                {chip.detail ? <span className="ai-chip__detail"> · {chip.detail}</span> : null}
              </summary>
              <div className="ai-chip__sent">
                <div className="ai-chip__sent-title">What was sent</div>
                <pre>{chip.sent}</pre>
              </div>
            </details>
          ) : (
            <span className="ai-chip">
              <span className="ai-chip__label">{chip.label}</span>
              {chip.detail ? <span className="ai-chip__detail"> · {chip.detail}</span> : null}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

import { useMemo, useState } from 'react';
import { CopyButton } from '../../features/utilityTools/CopyButton';
import { RegexFlagsField } from '../../features/utilityTools/RegexFlagsField';
import { convertAllCases } from '../../lib/utilityTools/stringCase';
import { generateUuids, MAX_UUID_BATCH } from '../../lib/utilityTools/uuidBatch';
import { testRegex } from '../../lib/utilityTools/regexTester';

export function UtilitiesToolsTextPage() {
  const [uuidCount, setUuidCount] = useState(5);
  const [uuids, setUuids] = useState<string[]>([]);
  const [caseIn, setCaseIn] = useState('hello_worldExample');
  const [pattern, setPattern] = useState(String.raw`\b\w+\b`);
  const [flags, setFlags] = useState('gi');
  const [haystack, setHaystack] = useState('The quick brown fox jumps over the lazy dog.');

  const cases = useMemo(() => convertAllCases(caseIn), [caseIn]);
  const regex = useMemo(() => testRegex(pattern, haystack, flags), [pattern, haystack, flags]);

  const highlighted = useMemo(() => {
    if (!regex.ok || regex.matches.length === 0) return null;
    const parts: Array<{ text: string; hit: boolean }> = [];
    let cursor = 0;
    for (const m of regex.matches) {
      if (m.index > cursor) parts.push({ text: haystack.slice(cursor, m.index), hit: false });
      parts.push({ text: m.text, hit: true });
      cursor = m.index + m.text.length;
    }
    if (cursor < haystack.length) parts.push({ text: haystack.slice(cursor), hit: false });
    return parts;
  }, [regex, haystack]);

  return (
    <div className="utilities-tools-panels">
      <section className="utilities-tools-panel">
        <header className="utilities-tools-panel__head">
          <h2>UUID generator</h2>
        </header>
        <div className="utilities-tools-inline">
          <label className="utilities-tools-field utilities-tools-field--inline">
            <span>Count (max {MAX_UUID_BATCH})</span>
            <input
              type="number"
              min={1}
              max={MAX_UUID_BATCH}
              value={uuidCount}
              onChange={(e) => setUuidCount(Number(e.target.value) || 1)}
            />
          </label>
          <button
            type="button"
            className="btn btn--primary btn--small"
            onClick={() => setUuids(generateUuids(uuidCount))}
          >
            Generate
          </button>
          <CopyButton text={uuids.join('\n')} label="Copy all" />
        </div>
        <pre className="utilities-tools-pre">{uuids.length ? uuids.join('\n') : '—'}</pre>
      </section>

      <section className="utilities-tools-panel">
        <header className="utilities-tools-panel__head">
          <h2>String case converter</h2>
        </header>
        <label className="utilities-tools-field">
          <span>Input</span>
          <input
            className="utilities-tools-input"
            value={caseIn}
            onChange={(e) => setCaseIn(e.target.value)}
            spellCheck={false}
          />
        </label>
        <ul className="utilities-tools-case-list">
          {(
            [
              ['camelCase', cases.camel],
              ['snake_case', cases.snake],
              ['kebab-case', cases.kebab],
              ['PascalCase', cases.pascal],
              ['CONSTANT_CASE', cases.constant],
            ] as const
          ).map(([label, value]) => (
            <li key={label}>
              <div className="utilities-tools-panel__actions">
                <strong className="small">{label}</strong>
                <CopyButton text={value} />
              </div>
              <pre className="utilities-tools-pre">{value || '—'}</pre>
            </li>
          ))}
        </ul>
      </section>

      <section className="utilities-tools-panel">
        <header className="utilities-tools-panel__head">
          <h2>Regex tester</h2>
          <p className="muted small">Matches are highlighted below. Pattern and input length are capped.</p>
        </header>
        <div className="utilities-tools-inline">
          <label className="utilities-tools-field utilities-tools-field--grow">
            <span>Pattern</span>
            <input
              className="utilities-tools-input"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              spellCheck={false}
            />
          </label>
        </div>
        <RegexFlagsField value={flags} onChange={setFlags} />
        <label className="utilities-tools-field">
          <span>Test string</span>
          <textarea
            className="utilities-tools-textarea"
            rows={4}
            value={haystack}
            onChange={(e) => setHaystack(e.target.value)}
            spellCheck={false}
          />
        </label>
        {!regex.ok ? (
          <p className="utilities-tools-error" role="alert">
            {regex.error}
          </p>
        ) : (
          <>
            <p className="muted small">
              {regex.matches.length} match{regex.matches.length === 1 ? '' : 'es'}
              {regex.truncated ? ' (truncated)' : ''} · flags {regex.flags}
            </p>
            <pre className="utilities-tools-pre utilities-tools-pre--highlight">
              {highlighted
                ? highlighted.map((p, i) =>
                    p.hit ? (
                      <mark key={i} className="utilities-tools-mark">
                        {p.text}
                      </mark>
                    ) : (
                      <span key={i}>{p.text}</span>
                    ),
                  )
                : haystack || '—'}
            </pre>
          </>
        )}
      </section>
    </div>
  );
}

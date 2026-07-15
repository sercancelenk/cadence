import { useEffect, useState } from 'react';
import { CopyButton } from '../../features/utilityTools/CopyButton';
import { digestAllHashes, type HashDigestResult } from '../../lib/utilityTools/hashDigest';

const EMPTY: HashDigestResult = { md5: '', sha1: '', sha256: '', sha512: '' };

export function UtilitiesToolsHashPage() {
  const [input, setInput] = useState('');
  const [hashes, setHashes] = useState<HashDigestResult>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const next = await digestAllHashes(input);
        if (!cancelled) {
          setHashes(next);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setHashes(EMPTY);
          setError(err instanceof Error ? err.message : 'Could not compute digests.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [input]);

  const rows: Array<{ label: string; value: string }> = [
    { label: 'MD5', value: hashes.md5 },
    { label: 'SHA-1', value: hashes.sha1 },
    { label: 'SHA-256', value: hashes.sha256 },
    { label: 'SHA-512', value: hashes.sha512 },
  ];

  return (
    <div className="utilities-tools-panels">
      <section className="utilities-tools-panel">
        <header className="utilities-tools-panel__head">
          <h2>Hash generator</h2>
          <p className="muted small">All digests update as you type. Computed entirely on-device.</p>
        </header>
        <label className="utilities-tools-field">
          <span>Input</span>
          <textarea
            className="utilities-tools-textarea"
            rows={5}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Text to hash…"
            spellCheck={false}
          />
        </label>
        {error ? (
          <p className="utilities-tools-error" role="alert">
            {error}
          </p>
        ) : null}
        <ul className="utilities-tools-hash-list">
          {rows.map((r) => (
            <li key={r.label} className="utilities-tools-hash-row">
              <div className="utilities-tools-panel__actions">
                <strong className="small">{r.label}</strong>
                <CopyButton text={r.value} />
              </div>
              <pre className="utilities-tools-pre utilities-tools-pre--mono">{r.value || '—'}</pre>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

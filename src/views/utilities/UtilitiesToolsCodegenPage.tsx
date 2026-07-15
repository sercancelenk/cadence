import { useMemo, useState } from 'react';
import { CopyButton } from '../../features/utilityTools/CopyButton';
import { curlToCode, type CurlCodeTarget } from '../../lib/utilityTools/curlToCode';
import { jsonToCode, type JsonCodeLang } from '../../lib/utilityTools/jsonToTs';

const CURL_SAMPLE = `curl -X POST 'https://api.example.com/v1/items' \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer TOKEN' \\
  -d '{"name":"Cadence"}'`;

const JSON_LANGS: Array<{ id: JsonCodeLang; label: string }> = [
  { id: 'typescript', label: 'TypeScript' },
  { id: 'java', label: 'Java' },
  { id: 'go', label: 'Go' },
];

const CURL_TARGETS: Array<{ id: CurlCodeTarget; label: string }> = [
  { id: 'fetch', label: 'Fetch' },
  { id: 'axios', label: 'Axios' },
  { id: 'python', label: 'Python' },
  { id: 'java', label: 'Java' },
  { id: 'spring', label: 'Spring' },
  { id: 'go', label: 'Go' },
];

export function UtilitiesToolsCodegenPage() {
  const [jsonIn, setJsonIn] = useState('{\n  "id": 1,\n  "name": "Ada",\n  "tags": ["dev"]\n}');
  const [rootName, setRootName] = useState('Root');
  const [jsonLang, setJsonLang] = useState<JsonCodeLang>('typescript');
  const [curlIn, setCurlIn] = useState(CURL_SAMPLE);
  const [target, setTarget] = useState<CurlCodeTarget>('fetch');

  const generated = useMemo(() => jsonToCode(jsonIn, jsonLang, rootName), [jsonIn, jsonLang, rootName]);
  const code = useMemo(() => curlToCode(curlIn, target), [curlIn, target]);

  return (
    <div className="utilities-tools-panels">
      <section className="utilities-tools-panel">
        <header className="utilities-tools-panel__head">
          <h2>JSON → types</h2>
          <p className="muted small">
            Infers TypeScript interfaces, Java classes, or Go structs from a JSON sample.
          </p>
        </header>
        <div className="utilities-tools-inline">
          <label className="utilities-tools-field utilities-tools-field--narrow">
            <span>Root name</span>
            <input
              className="utilities-tools-input"
              value={rootName}
              onChange={(e) => setRootName(e.target.value)}
              spellCheck={false}
            />
          </label>
        </div>
        <div className="utilities-tools-inline" role="tablist" aria-label="JSON language">
          {JSON_LANGS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={jsonLang === t.id}
              className={`btn btn--small ${jsonLang === t.id ? 'btn--primary' : 'btn--ghost'}`}
              onClick={() => setJsonLang(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <label className="utilities-tools-field">
          <span>JSON</span>
          <textarea
            className="utilities-tools-textarea"
            rows={8}
            value={jsonIn}
            onChange={(e) => setJsonIn(e.target.value)}
            spellCheck={false}
          />
        </label>
        {!generated.ok ? (
          <p className="utilities-tools-error" role="alert">
            {generated.error}
          </p>
        ) : (
          <>
            <div className="utilities-tools-panel__actions">
              <strong className="small">Output</strong>
              <CopyButton text={generated.code} />
            </div>
            <pre className="utilities-tools-pre utilities-tools-pre--mono">{generated.code}</pre>
          </>
        )}
      </section>

      <section className="utilities-tools-panel">
        <header className="utilities-tools-panel__head">
          <h2>cURL → code</h2>
          <p className="muted small">
            Supports common flags: <code>-X</code>, <code>-H</code>, <code>-d</code>/<code>--data*</code>,
            URL, <code>-A</code>. Exotic curl options are skipped.
          </p>
        </header>
        <label className="utilities-tools-field">
          <span>cURL</span>
          <textarea
            className="utilities-tools-textarea"
            rows={8}
            value={curlIn}
            onChange={(e) => setCurlIn(e.target.value)}
            spellCheck={false}
          />
        </label>
        <div className="utilities-tools-inline" role="tablist" aria-label="Code target">
          {CURL_TARGETS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={target === t.id}
              className={`btn btn--small ${target === t.id ? 'btn--primary' : 'btn--ghost'}`}
              onClick={() => setTarget(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        {!code.ok ? (
          <p className="utilities-tools-error" role="alert">
            {code.error}
          </p>
        ) : (
          <>
            <p className="muted small">
              {code.method} · {code.url}
            </p>
            <div className="utilities-tools-panel__actions">
              <strong className="small">Output</strong>
              <CopyButton text={code.code} />
            </div>
            <pre className="utilities-tools-pre utilities-tools-pre--mono">{code.code}</pre>
          </>
        )}
      </section>
    </div>
  );
}

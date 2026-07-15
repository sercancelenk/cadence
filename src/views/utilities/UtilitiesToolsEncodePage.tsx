import { useMemo, useState } from 'react';
import { CopyButton } from '../../features/utilityTools/CopyButton';
import { decodeBase64Utf8, encodeBase64Utf8 } from '../../lib/utilityTools/base64';
import { decodeJwt } from '../../lib/utilityTools/jwtDecode';
import { decodeUrlComponent, encodeUrlComponent } from '../../lib/utilityTools/urlCodec';

export function UtilitiesToolsEncodePage() {
  const [b64In, setB64In] = useState('');
  const [urlIn, setUrlIn] = useState('');
  const [jwtIn, setJwtIn] = useState('');

  const b64Encoded = useMemo(() => encodeBase64Utf8(b64In), [b64In]);
  const b64Decoded = useMemo(() => decodeBase64Utf8(b64In), [b64In]);
  const urlEncoded = useMemo(() => encodeUrlComponent(urlIn), [urlIn]);
  const urlDecoded = useMemo(() => decodeUrlComponent(urlIn), [urlIn]);
  const jwt = useMemo(() => decodeJwt(jwtIn), [jwtIn]);

  return (
    <div className="utilities-tools-panels">
      <section className="utilities-tools-panel">
        <header className="utilities-tools-panel__head">
          <h2>Base64</h2>
          <p className="muted small">
            UTF-8 text encode / decode. Accepts standard and URL-safe Base64 (−/_).
          </p>
        </header>
        <label className="utilities-tools-field">
          <span>Input</span>
          <textarea
            className="utilities-tools-textarea"
            rows={4}
            value={b64In}
            onChange={(e) => setB64In(e.target.value)}
            placeholder="Plain text or Base64…"
          />
        </label>
        <div className="utilities-tools-split">
          <div>
            <div className="utilities-tools-panel__actions">
              <strong className="small">Encoded</strong>
              <CopyButton text={b64Encoded} />
            </div>
            <pre className="utilities-tools-pre">{b64Encoded || '—'}</pre>
          </div>
          <div>
            <div className="utilities-tools-panel__actions">
              <strong className="small">Decoded as UTF-8</strong>
              <CopyButton text={b64Decoded.ok ? b64Decoded.text : ''} />
            </div>
            {b64Decoded.ok ? (
              <pre className="utilities-tools-pre">{b64Decoded.text || '—'}</pre>
            ) : (
              <p className="utilities-tools-error" role="alert">
                {b64Decoded.error}
              </p>
            )}
          </div>
        </div>
        <label className="utilities-tools-field">
          <span>Image → Base64 (payload only, max 2 MB)</span>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              if (file.size > 2 * 1024 * 1024) {
                window.alert('Image is too large (max 2 MB).');
                return;
              }
              const reader = new FileReader();
              reader.onload = () => {
                const result = typeof reader.result === 'string' ? reader.result : '';
                const comma = result.indexOf(',');
                // Strip data:…;base64, so Decode works on the payload.
                setB64In(comma >= 0 ? result.slice(comma + 1) : result);
              };
              reader.onerror = () => window.alert('Could not read that image.');
              reader.readAsDataURL(file);
            }}
          />
        </label>
      </section>

      <section className="utilities-tools-panel">
        <header className="utilities-tools-panel__head">
          <h2>URL encode / decode</h2>
        </header>
        <label className="utilities-tools-field">
          <span>Input</span>
          <textarea
            className="utilities-tools-textarea"
            rows={3}
            value={urlIn}
            onChange={(e) => setUrlIn(e.target.value)}
            placeholder="Query fragment or percent-encoded string…"
          />
        </label>
        <div className="utilities-tools-split">
          <div>
            <div className="utilities-tools-panel__actions">
              <strong className="small">Encoded</strong>
              <CopyButton text={urlEncoded} />
            </div>
            <pre className="utilities-tools-pre">{urlEncoded || '—'}</pre>
          </div>
          <div>
            <div className="utilities-tools-panel__actions">
              <strong className="small">Decoded</strong>
              <CopyButton text={urlDecoded.ok ? urlDecoded.text : ''} />
            </div>
            {urlDecoded.ok ? (
              <pre className="utilities-tools-pre">{urlDecoded.text || '—'}</pre>
            ) : (
              <p className="utilities-tools-error" role="alert">
                {urlDecoded.error}
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="utilities-tools-panel">
        <header className="utilities-tools-panel__head">
          <h2>JWT decoder</h2>
          <p className="muted small">
            Display only — signature is <strong>not</strong> verified. Never paste production secrets
            into shared screens.
          </p>
        </header>
        <label className="utilities-tools-field">
          <span>Token</span>
          <textarea
            className="utilities-tools-textarea"
            rows={4}
            value={jwtIn}
            onChange={(e) => setJwtIn(e.target.value)}
            placeholder="eyJhbGciOi…"
            spellCheck={false}
          />
        </label>
        {!jwt.ok && jwtIn.trim() ? (
          <p className="utilities-tools-error" role="alert">
            {jwt.error}
          </p>
        ) : null}
        {jwt.ok ? (
          <div className="utilities-tools-split utilities-tools-split--3">
            <div>
              <div className="utilities-tools-panel__actions">
                <strong className="small">Header</strong>
                <CopyButton text={JSON.stringify(jwt.header, null, 2)} />
              </div>
              <pre className="utilities-tools-pre">{JSON.stringify(jwt.header, null, 2)}</pre>
            </div>
            <div>
              <div className="utilities-tools-panel__actions">
                <strong className="small">Payload</strong>
                <CopyButton text={JSON.stringify(jwt.payload, null, 2)} />
              </div>
              <pre className="utilities-tools-pre">{JSON.stringify(jwt.payload, null, 2)}</pre>
            </div>
            <div>
              <div className="utilities-tools-panel__actions">
                <strong className="small">Signature (raw)</strong>
                <CopyButton text={jwt.signature} />
              </div>
              <pre className="utilities-tools-pre">{jwt.signature || '—'}</pre>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

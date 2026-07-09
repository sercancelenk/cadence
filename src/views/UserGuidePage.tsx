import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import guideMd from '../../docs/USER-GUIDE.md?raw';

/** In-app user guide — same content as docs/USER-GUIDE.md (single source of truth). */
export function UserGuidePage() {
  return (
    <div className="page guide-page">
      <header className="page-head guide-page__head">
        <h1>User guide</h1>
        <p className="muted">
          Daily workflow, backups, and recovery codes — everything stays on your device unless you export a backup.
        </p>
      </header>
      <article className="guide-page__body markdown-body">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{guideMd}</ReactMarkdown>
      </article>
    </div>
  );
}

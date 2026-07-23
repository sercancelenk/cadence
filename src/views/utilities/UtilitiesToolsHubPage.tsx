import { Link } from 'react-router-dom';
import {
  PATH_UTILITIES_STRUCTURED,
  PATH_UTILITIES_TOOLS_CODEGEN,
  PATH_UTILITIES_TOOLS_ENCODE,
  PATH_UTILITIES_TOOLS_ERD,
  PATH_UTILITIES_TOOLS_HASH,
  PATH_UTILITIES_TOOLS_SKETCH,
  PATH_UTILITIES_TOOLS_TEXT,
  PATH_UTILITIES_TOOLS_TIME,
} from '../../lib/routes';

const CARDS: Array<{ to: string; title: string; blurb: string }> = [
  {
    to: PATH_UTILITIES_TOOLS_ENCODE,
    title: 'Encode / Decode',
    blurb: 'Base64, URL encoding, and JWT decoder (display only).',
  },
  {
    to: PATH_UTILITIES_TOOLS_HASH,
    title: 'Hash',
    blurb: 'MD5, SHA-1, SHA-256, and SHA-512 digests from one input.',
  },
  {
    to: PATH_UTILITIES_TOOLS_TEXT,
    title: 'Text & Generators',
    blurb: 'UUID batches, case conversion, and a live regex tester.',
  },
  {
    to: PATH_UTILITIES_TOOLS_TIME,
    title: 'Time',
    blurb: 'Duration units, Unix epoch converter, and cron expression explainer.',
  },
  {
    to: PATH_UTILITIES_TOOLS_CODEGEN,
    title: 'Codegen',
    blurb: 'JSON → TypeScript / Java / Go, and cURL → fetch, axios, Python, Java, Spring, Go.',
  },
  {
    to: PATH_UTILITIES_TOOLS_ERD,
    title: 'ER diagram',
    blurb: 'Lite visual ERD — tables, columns, FK edges. Save named copies to your workspace, or Export.',
  },
  {
    to: PATH_UTILITIES_TOOLS_SKETCH,
    title: 'Sketch',
    blurb: 'Excalidraw-style whiteboard. Save named boards to your workspace, or Export JSON / PNG.',
  },
];

export function UtilitiesToolsHubPage() {
  return (
    <div className="utilities-tools-hub">
      <p className="muted utilities-tools-hub__intro">
        Pick a tool below. Most inputs stay in this session only. ERD and Sketch can Save named copies
        to your workspace. For large JSON or YAML paste buffers with format and diff, use{' '}
        <Link to={PATH_UTILITIES_STRUCTURED}>JSON / YAML</Link>.
      </p>
      <ul className="utilities-tools-hub__grid">
        {CARDS.map((c) => (
          <li key={c.to}>
            <Link to={c.to} className="utilities-tools-hub__card">
              <h2 className="utilities-tools-hub__card-title">{c.title}</h2>
              <p className="muted small">{c.blurb}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

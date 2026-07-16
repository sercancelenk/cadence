import { NavLink, Outlet } from 'react-router-dom';
import {
  PATH_UTILITIES_TOOLS,
  PATH_UTILITIES_TOOLS_CODEGEN,
  PATH_UTILITIES_TOOLS_ENCODE,
  PATH_UTILITIES_TOOLS_ERD,
  PATH_UTILITIES_TOOLS_HASH,
  PATH_UTILITIES_TOOLS_SKETCH,
  PATH_UTILITIES_TOOLS_TEXT,
  PATH_UTILITIES_TOOLS_TIME,
} from '../../lib/routes';

const TABS: Array<{ to: string; end?: boolean; label: string }> = [
  { to: PATH_UTILITIES_TOOLS, end: true, label: 'Overview' },
  { to: PATH_UTILITIES_TOOLS_ENCODE, label: 'Encode' },
  { to: PATH_UTILITIES_TOOLS_HASH, label: 'Hash' },
  { to: PATH_UTILITIES_TOOLS_TEXT, label: 'Text' },
  { to: PATH_UTILITIES_TOOLS_TIME, label: 'Time' },
  { to: PATH_UTILITIES_TOOLS_CODEGEN, label: 'Codegen' },
  { to: PATH_UTILITIES_TOOLS_ERD, label: 'ERD' },
  { to: PATH_UTILITIES_TOOLS_SKETCH, label: 'Sketch' },
];

/**
 * Shared chrome for Utilities → Tools.
 * Most tools are ephemeral; ERD / Sketch can Save named copies to the workspace.
 */
export function UtilitiesToolsLayout() {
  return (
    <div className="page page--wide utilities-tools-page">
      <header className="utilities-doc-page__head">
        <div>
          <h1 className="utilities-doc-page__title">Tools</h1>
          <p className="utilities-doc-page__lead muted">
            Developer utilities. Encode/hash/text stay ephemeral; ERD and Sketch can Save named
            copies to your workspace.
          </p>
        </div>
      </header>

      <nav className="utilities-tools-tabs" aria-label="Utility tools">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              `utilities-tools-tabs__link${isActive ? ' utilities-tools-tabs__link--active' : ''}`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>

      <div className="utilities-tools-page__body">
        <Outlet />
      </div>
    </div>
  );
}

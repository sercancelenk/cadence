import { NavLink } from 'react-router-dom';
import { IcCalendar, IcListTodo, IcMenu, IcStickyNote } from './icons';
import { PATH_AGENDA, PATH_NOTES, PATH_TODOS } from '../lib/routes';

type Props = {
  /** Toggles the existing slide-in navigation drawer (the "More" target). */
  onToggleMore: () => void;
  /** Whether the drawer is currently open — highlights the More tab. */
  moreActive: boolean;
};

const tabCls = ({ isActive }: { isActive: boolean }) =>
  `mobile-tabbar__tab${isActive ? ' mobile-tabbar__tab--active' : ''}`;

/**
 * Bottom tab bar for the mobile companion surface. Surfaces the three
 * primary daily-loop destinations (To-dos, Agenda, Notes) as large,
 * thumb-reachable targets, plus a "More" tab that reuses the existing
 * navigation drawer for everything else (Planning, Profile, Settings,
 * and — on a narrow desktop window — Home/Teams/Utilities/Analytics).
 *
 * Rendered only on the mobile viewport (see `Layout`); the drawer stays
 * the fallback navigation on every surface.
 */
export function MobileTabBar({ onToggleMore, moreActive }: Props) {
  return (
    <nav className="mobile-tabbar" aria-label="Primary">
      <NavLink to={PATH_TODOS} className={tabCls} title="To-dos">
        <span className="mobile-tabbar__ic" aria-hidden>
          <IcListTodo size={20} />
        </span>
        <span className="mobile-tabbar__label">To-dos</span>
      </NavLink>
      <NavLink to={PATH_AGENDA} className={tabCls} title="Agenda">
        <span className="mobile-tabbar__ic" aria-hidden>
          <IcCalendar size={20} />
        </span>
        <span className="mobile-tabbar__label">Agenda</span>
      </NavLink>
      <NavLink to={PATH_NOTES} className={tabCls} title="Notes">
        <span className="mobile-tabbar__ic" aria-hidden>
          <IcStickyNote size={20} />
        </span>
        <span className="mobile-tabbar__label">Notes</span>
      </NavLink>
      <button
        type="button"
        className={`mobile-tabbar__tab mobile-tabbar__tab--more${
          moreActive ? ' mobile-tabbar__tab--active' : ''
        }`}
        aria-haspopup="menu"
        aria-expanded={moreActive}
        title="More"
        onClick={onToggleMore}
      >
        <span className="mobile-tabbar__ic" aria-hidden>
          <IcMenu size={20} />
        </span>
        <span className="mobile-tabbar__label">More</span>
      </button>
    </nav>
  );
}

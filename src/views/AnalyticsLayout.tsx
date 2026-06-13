import { NavLink, Outlet } from 'react-router-dom';
import { PATH_ANALYTICS, PATH_ANALYTICS_ACTIVITY } from '../lib/routes';

const tabCls = ({ isActive }: { isActive: boolean }) =>
  `analytics-tabs__tab${isActive ? ' analytics-tabs__tab--active' : ''}`;

export function AnalyticsLayout() {
  return (
    <div className="analytics-shell">
      <nav className="analytics-tabs" aria-label="Analytics views">
        <NavLink to={PATH_ANALYTICS} end className={tabCls} title="Overview">
          Overview
        </NavLink>
        <NavLink to={PATH_ANALYTICS_ACTIVITY} className={tabCls} title="Activity">
          Activity
        </NavLink>
      </nav>
      <Outlet />
    </div>
  );
}

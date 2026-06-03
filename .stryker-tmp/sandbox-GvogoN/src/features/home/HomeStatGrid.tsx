// @ts-nocheck
import { Link } from 'react-router-dom';
import { IcArrowRight } from '../../components/icons';
import type { HomeStat } from './useHomeDashboard';

type Props = {
  stats: HomeStat[];
};

export function HomeStatGrid({ stats }: Props) {
  return (
    <div className="home-page__stats" role="list">
      {stats.map((stat) => (
        <Link key={stat.id} className="home-page__stat" to={stat.to} role="listitem">
          <span className="home-page__stat-value">{stat.value}</span>
          <span className="home-page__stat-label">{stat.label}</span>
          {stat.hint ? <span className="home-page__stat-hint muted small">{stat.hint}</span> : null}
          <span className="home-page__stat-arrow" aria-hidden>
            <IcArrowRight size={16} />
          </span>
        </Link>
      ))}
    </div>
  );
}

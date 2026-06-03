import { Link } from 'react-router-dom';
import { IcArrowRight, IcLayoutGrid } from '../../components/icons';
import { teamBase } from '../../lib/teamPaths';
import type { HomeContinueTarget } from './useHomeDashboard';

type Props = {
  target: HomeContinueTarget;
  isLastVisited: boolean;
};

export function HomeContinueCard({ target, isLastVisited }: Props) {
  const { team, openTasks, memberCount } = target;

  return (
    <section className="home-page__section home-page__continue" aria-labelledby="home-continue-title">
      <div className="home-page__section-head">
        <h2 id="home-continue-title" className="home-page__section-title">
          Continue
        </h2>
      </div>
      <Link className="home-continue-card" to={teamBase(team.id)}>
        <span className="home-continue-card__icon" aria-hidden>
          <IcLayoutGrid size={22} />
        </span>
        <span className="home-continue-card__body">
          <span className="home-continue-card__eyebrow muted small">
            {isLastVisited ? 'Last team' : 'Suggested team'}
          </span>
          <span className="home-continue-card__title">{team.name}</span>
          <span className="home-continue-card__meta muted small">
            {openTasks} open task{openTasks === 1 ? '' : 's'} · {memberCount}{' '}
            {memberCount === 1 ? 'member' : 'members'}
          </span>
        </span>
        <span className="home-continue-card__arrow" aria-hidden>
          <IcArrowRight size={18} />
        </span>
      </Link>
    </section>
  );
}

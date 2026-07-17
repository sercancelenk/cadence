import { Link } from 'react-router-dom';
import { PlanningTaskMeta } from '../planning/PlanningTaskMeta';
import { PLANNING_FOCUS_MAX } from '../../lib/planningMatrix';
import { PATH_PLANNING, PATH_TODOS } from '../../lib/routes';
import type { TodoGroup, TodoItem } from '../../model';

type Props = {
  items: TodoItem[];
  groups: TodoGroup[];
};

/** Home surface for Planning “today focus” pins (max 3). */
export function HomePlanningFocus({ items, groups }: Props) {
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const visible = items.slice(0, PLANNING_FOCUS_MAX);

  return (
    <section className="home-page__section home-page__planning-focus" aria-labelledby="home-focus-title">
      <div className="home-page__section-head">
        <h2 id="home-focus-title" className="home-page__section-title">
          Today focus
        </h2>
        <Link className="home-page__section-link small" to={PATH_PLANNING}>
          Open Planning
        </Link>
      </div>
      <div className="home-page__panel">
        {visible.length === 0 ? (
          <p className="home-today-empty muted">
            No focus tasks pinned.{' '}
            <Link to={PATH_PLANNING} className="home-page__inline-link">
              Star up to 3 in Planning
            </Link>
          </p>
        ) : (
          <ul className="home-focus-list">
            {visible.map((item) => (
              <li key={item.id}>
                <Link
                  className="home-focus-row"
                  to={`${PATH_TODOS}?focus=${encodeURIComponent(item.id)}`}
                >
                  <span className="home-focus-row__main">
                    <span className="home-focus-row__title">{item.title}</span>
                    <span className="home-focus-row__meta muted small">
                      {groupById.get(item.groupId)?.name ?? 'List'}
                    </span>
                    <PlanningTaskMeta item={item} />
                  </span>
                  <span className="home-focus-row__star" aria-hidden>
                    ★
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

import { Link } from 'react-router-dom';
import { PATH_TEAMS, PATH_TODOS } from '../../lib/routes';
import { teamBase } from '../../lib/teamPaths';
import type { Team } from '../../model';

type Props = {
  teams: Team[];
  peopleByTeamId: Map<string, number>;
};

export function HomeTeamsSection({ teams, peopleByTeamId }: Props) {
  if (teams.length === 0) {
    return (
      <section className="home-page__section home-page__teams-empty" aria-labelledby="home-teams-title">
        <div className="home-page__section-head">
          <h2 id="home-teams-title" className="home-page__section-title">
            Your teams
          </h2>
        </div>
        <div className="home-page__panel home-empty-cta">
          <p className="home-empty-cta__lead">
            Create a team to track 1:1 follow-ups, shared tasks and people in one workspace.
          </p>
          <div className="home-empty-cta__actions">
            <Link className="btn btn--primary" to={PATH_TEAMS}>
              Create your first team
            </Link>
            <Link className="btn btn--secondary" to={PATH_TODOS}>
              Start with personal to-dos
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const visible = teams.slice(0, 6);

  return (
    <section className="home-page__section" aria-labelledby="home-teams-title">
      <div className="home-page__section-head">
        <h2 id="home-teams-title" className="home-page__section-title">
          Your teams
        </h2>
        {teams.length > 6 ? (
          <Link className="home-page__section-link small" to={PATH_TEAMS}>
            View all
          </Link>
        ) : null}
      </div>
      <ul className="home-page__team-chips home-page__panel">
        {visible.map((team) => {
          const memberCount = peopleByTeamId.get(team.id) ?? 0;
          return (
            <li key={team.id}>
              <Link className="home-team-chip" to={teamBase(team.id)}>
                <span className={`team-dot team-dot--${team.status ?? 'active'}`} aria-hidden />
                <span className="home-team-chip__name">{team.name}</span>
                <span className="home-team-chip__meta muted small">
                  {memberCount} {memberCount === 1 ? 'member' : 'members'}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {teams.length > 6 ? (
        <p className="muted small home-page__more">
          +{teams.length - 6} more — <Link to={PATH_TEAMS}>view all</Link>
        </p>
      ) : null}
    </section>
  );
}

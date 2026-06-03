// @ts-nocheck
import { Link } from 'react-router-dom';
import {
  IcArrowRight,
  IcCalendar,
  IcFolder,
  IcListTodo,
  IcStickyNote,
} from '../../components/icons';
import { PATH_AGENDA, PATH_NOTES, PATH_TEAMS, PATH_TODOS } from '../../lib/routes';

const TILES = [
  {
    to: PATH_AGENDA,
    title: 'Agenda',
    description: 'Today and the week ahead — reminders and due dates.',
    icon: IcCalendar,
  },
  {
    to: PATH_TODOS,
    title: 'To-dos',
    description: 'Personal lists, independent from any team.',
    icon: IcListTodo,
  },
  {
    to: PATH_TEAMS,
    title: 'Teams',
    description: 'Manage teams, members and 1:1 follow-ups.',
    icon: IcFolder,
  },
  {
    to: PATH_NOTES,
    title: 'Notes',
    description: 'Capture ideas and meeting notes in one place.',
    icon: IcStickyNote,
  },
] as const;

export function HomeQuickAccess() {
  return (
    <section className="home-page__section" aria-labelledby="home-quick-title">
      <div className="home-page__section-head">
        <h2 id="home-quick-title" className="home-page__section-title">
          Quick access
        </h2>
      </div>
      <div className="home-page__tiles">
        {TILES.map(({ to, title, description, icon: Icon }) => (
          <Link key={to} className="home-tile" to={to}>
            <span className="home-tile__ic">
              <Icon size={22} />
            </span>
            <span className="home-tile__title">{title}</span>
            <span className="home-tile__desc">{description}</span>
            <span className="home-tile__arrow" aria-hidden>
              <IcArrowRight size={18} />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

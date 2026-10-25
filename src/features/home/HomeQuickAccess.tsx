import { Link } from 'react-router-dom';
import { useAppData } from '../../AppDataContext';
import {
  IcArrowRight,
  IcCalendar,
  IcFolder,
  IcListTodo,
  IcSparkles,
  IcStickyNote,
  IcTarget,
} from '../../components/icons';
import { hasUsableConnection } from '../../lib/ai/connections';
import { openAiTool } from '../../lib/ai/launcher';
import { useFeatures } from '../../lib/features';
import { isWeekEnd } from './weekEnd';
import { PATH_AGENDA, PATH_NOTES, PATH_PLANNING, PATH_TEAMS, PATH_TODOS } from '../../lib/routes';

const TILES = [
  {
    to: PATH_AGENDA,
    title: 'Agenda',
    tone: 'coral',
    description: 'Today and the week ahead — reminders and due dates.',
    icon: IcCalendar,
  },
  {
    to: PATH_PLANNING,
    title: 'Planning',
    tone: 'orange',
    description: 'Eisenhower matrix and up to three focus tasks for today.',
    icon: IcTarget,
  },
  {
    to: PATH_TODOS,
    title: 'To-dos',
    tone: 'green',
    description: 'Personal lists, independent from any team.',
    icon: IcListTodo,
  },
  {
    to: PATH_TEAMS,
    title: 'Teams',
    tone: 'violet',
    description: 'Manage teams, members and 1:1 follow-ups.',
    icon: IcFolder,
  },
  {
    to: PATH_NOTES,
    title: 'Notes',
    tone: 'blue',
    description: 'Capture ideas and meeting notes in one place.',
    icon: IcStickyNote,
  },
] as const;

/** `now` is a prop only so a test can pin the day. */
export function HomeQuickAccess({ now }: { now?: Date } = {}) {
  const { data } = useAppData();
  const { features } = useFeatures();
  const aiEnabled = features.ai && hasUsableConnection(data.aiSettings);
  const weekEnd = isWeekEnd(now ?? new Date());
  return (
    <section className="home-page__section" aria-labelledby="home-quick-title">
      <div className="home-page__section-head">
        <h2 id="home-quick-title" className="home-page__section-title">
          Quick access
        </h2>
      </div>
      <div className="home-page__tiles">
        {TILES.map(({ to, title, tone, description, icon: Icon }) => (
          <Link key={to} className="home-tile" to={to}>
            <span className="home-tile__ic" data-tone={tone}>
              <Icon size={22} />
            </span>
            <span className="home-tile__title">{title}</span>
            <span className="home-tile__desc">{description}</span>
            <span className="home-tile__arrow" aria-hidden>
              <IcArrowRight size={18} />
            </span>
          </Link>
        ))}
        {aiEnabled ? (
          <button type="button" className="home-tile" onClick={() => openAiTool('weekly-digest')}>
            <span className="home-tile__ic" data-tone="ai">
              <IcSparkles size={22} />
            </span>
            <span className="home-tile__title">Weekly digest</span>
            <span className="home-tile__desc">
              {weekEnd
                ? "It's the end of the week: write your retrospective, or a status update for your leader."
                : 'A retrospective or a status update, written from your week.'}
            </span>
            <span className="home-tile__arrow" aria-hidden>
              <IcArrowRight size={18} />
            </span>
          </button>
        ) : null}
      </div>
    </section>
  );
}

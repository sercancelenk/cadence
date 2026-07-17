import {
  HomeContinueCard,
  HomeDashboardHeader,
  HomePlanningFocus,
  HomeQuickAccess,
  HomeStatGrid,
  HomeTeamsSection,
  HomeTodaySection,
  useHomeDashboard,
} from '../features/home';
import { usePlanningFocusDayRollover } from '../features/planning';

export function HomePage() {
  usePlanningFocusDayRollover();

  const {
    profile,
    user,
    teamsSorted,
    stats,
    activitySummary,
    overdueCount,
    todayPreview,
    todayTotal,
    continueTarget,
    continueIsLastVisited,
    peopleCountByTeamId,
    agendaHref,
    planningFocusItems,
    todoGroups,
  } = useHomeDashboard();

  return (
    <div className="page page--wide home-page">
      <HomeDashboardHeader
        displayName={profile.displayName}
        email={user?.email}
        activitySummary={activitySummary}
      />

      <HomeStatGrid stats={stats} />

      <div className="home-page__body">
        <div className="home-page__primary">
          {continueTarget ? (
            <HomeContinueCard target={continueTarget} isLastVisited={continueIsLastVisited} />
          ) : null}
          <HomePlanningFocus items={planningFocusItems} groups={todoGroups} />
          <HomeTodaySection
            overdueCount={overdueCount}
            todayPreview={todayPreview}
            todayTotal={todayTotal}
            agendaHref={agendaHref}
          />
        </div>

        <aside className="home-page__aside" aria-label="Shortcuts and teams">
          <HomeQuickAccess />
          <HomeTeamsSection teams={teamsSorted} peopleByTeamId={peopleCountByTeamId} />
        </aside>
      </div>
    </div>
  );
}

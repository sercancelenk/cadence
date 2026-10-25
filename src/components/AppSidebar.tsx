import { memo, useId, useMemo, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useMatch } from 'react-router-dom';
import {
  IcCalendar,
  IcChartBar,
  IcChevronDown,
  IcClock,
  IcFileText,
  IcBraces,
  IcFolder,
  IcHome,
  IcLayoutGrid,
  IcListTodo,
  IcPencil,
  IcSettings,
  IcSearch,
  IcSliders,
  IcSparkles,
  IcStickyNote,
  IcTarget,
  IcUser,
  IcUsers,
} from './icons';
import { useAccount } from '../AccountContext';
import { useAppDataSelector } from '../AppDataContext';
import { hasUsableConnection } from '../lib/ai/connections';
import { openAiTool, type AiToolId } from '../lib/ai/launcher';
import { useFeatures } from '../lib/features';
import { isNoteEffectivelyArchived } from '../model';
import { brandIconUrl } from '../lib/appBranding';
import { useMobileWeb } from '../lib/runtime';
import {
  PATH_AGENDA,
  PATH_ANALYTICS,
  PATH_HOME,
  PATH_NOTES,
  PATH_PLANNING,
  PATH_PROFILE,
  PATH_SETTINGS,
  PATH_TEAMS,
  PATH_TODOS,
  PATH_UTILITIES_DOCUMENT,
  PATH_UTILITIES_STRUCTURED,
  PATH_UTILITIES_TOOLS,
  PATH_UTILITIES_TOOLS_ERD,
  PATH_UTILITIES_TOOLS_SKETCH,
  PATH_UTILITIES_TOOLS_TIME,
} from '../lib/routes';
import {
  teamLeader,
  teamMe,
  teamPeople as teamPeopleRoute,
  teamBase,
  teamSkipLevel,
} from '../lib/teamPaths';
import { AppSidebarFooter } from './AppSidebarFooter';
import { useSidebarGroups } from './useSidebarGroups';

const linkCls = ({ isActive }: { isActive: boolean }) => `app-sidebar__link${isActive ? ' app-sidebar__link--active' : ''}`;

const underPath = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`);

/** Tool pages that have their own menu item; every other page under /utilities/tools belongs to "Others". */
const OWN_TOOL_PATHS = [PATH_UTILITIES_TOOLS_TIME, PATH_UTILITIES_TOOLS_ERD, PATH_UTILITIES_TOOLS_SKETCH];

type Tone = 'amber' | 'coral' | 'orange' | 'green' | 'blue' | 'pink' | 'violet' | 'teal' | 'slate' | 'ai';

type NavItemProps = { to: string; label: string; title: string; icon: ReactNode; tone: Tone; collapsed: boolean; end?: boolean; badge?: ReactNode };

function NavItem({ to, label, title, icon, tone, collapsed, end, badge }: NavItemProps) {
  return (
    <NavLink to={to} end={end} className={linkCls} title={title}>
      <span className="app-sidebar__ic" data-tone={tone}>
        {icon}
      </span>
      {!collapsed ? <span>{label}</span> : null}
      {!collapsed ? badge : null}
    </NavLink>
  );
}

type ToolItemProps = { tool: AiToolId; label: string; title: string; icon: ReactNode; collapsed: boolean };

/** An AI tool that needs no selection, started from the menu; it opens in the app-wide launcher. */
function ToolItem({ tool, label, title, icon, collapsed }: ToolItemProps) {
  return (
    <button type="button" className="app-sidebar__link app-sidebar__link--button" title={title} aria-label={label} onClick={() => openAiTool(tool)}>
      <span className="app-sidebar__ic" data-tone="ai">
        {icon}
        {/* The topic icon says what the tool does; the sparkle says it is AI. */}
        <span className="app-sidebar__ai-mark" aria-hidden>
          <IcSparkles size={14} />
        </span>
      </span>
      {!collapsed ? <span>{label}</span> : null}
    </button>
  );
}

type GroupProps = {
  id: string;
  label: string;
  /** The page being viewed lives in this group, so it stays open whatever was saved. */
  containsActive: boolean;
  /** The icon-only sidebar has no headers, so every item stays reachable. */
  iconOnly: boolean;
  isCollapsed: boolean;
  onToggle: (id: string) => void;
  children: ReactNode;
};

function SidebarGroup({ id, label, containsActive, iconOnly, isCollapsed, onToggle, children }: GroupProps) {
  const bodyId = useId();
  if (iconOnly) return <div className="app-sidebar__section">{children}</div>;
  const open = containsActive || !isCollapsed;
  return (
    <div className="app-sidebar__section">
      <button
        type="button"
        className="app-sidebar__section-label app-sidebar__section-toggle"
        aria-expanded={open}
        aria-controls={bodyId}
        aria-disabled={containsActive || undefined}
        onClick={() => {
          if (!containsActive) onToggle(id);
        }}
      >
        <span
          className={`app-sidebar__section-chevron${open ? '' : ' app-sidebar__section-chevron--closed'}`}
          aria-hidden
        >
          <IcChevronDown size={12} />
        </span>
        {label}
      </button>
      <div id={bodyId} className="app-sidebar__group-items" hidden={!open}>
        {open ? children : null}
      </div>
    </div>
  );
}

type Props = { collapsed: boolean };

/**
 * `memo` because the sidebar sits next to the editor in the app shell: without
 * it, every parent render re-runs the badge scans over every note and todo.
 * Its only prop is a boolean, so the comparison is always cheap.
 */
export const AppSidebar = memo(function AppSidebar({ collapsed }: Props) {
  const mobileWeb = useMobileWeb();
  const { pathname } = useLocation();
  const { user } = useAccount();
  const { collapsed: collapsedGroups, toggle } = useSidebarGroups(user?.id ?? '');
  const { features } = useFeatures();
  const m = useMatch({ path: '/teams/:teamId/*', end: false });
  const teamId = m?.params.teamId;
  const sidebarData = useAppDataSelector(
    (d) => ({
      teams: d.teams,
      todoGroups: d.todoGroups,
      todoItems: d.todoItems,
      notes: d.notes,
      noteGroups: d.noteGroups,
      aiSettings: d.aiSettings,
    }),
    (a, b) =>
      a.teams === b.teams &&
      a.todoGroups === b.todoGroups &&
      a.todoItems === b.todoItems &&
      a.notes === b.notes &&
      a.noteGroups === b.noteGroups &&
      a.aiSettings === b.aiSettings,
  );
  const aiConnected = hasUsableConnection(sidebarData.aiSettings);
  const team = teamId ? sidebarData.teams.find((t) => t.id === teamId) : undefined;

  // Compute small badges for nav links that have a "hidden by filter"
  // failure mode. The point is to make data presence obvious from the
  // sidebar so a user who walks into an "empty" Todos / Notes page can
  // tell at a glance that the data is on disk and just filtered out.
  //
  // - Todos: open-todo count by default, plus an "(N archived)" hint
  //   when every todo group has been archived (the exact failure mode
  //   the user reported). Showing it in the sidebar means the user sees
  //   the warning even before they click into the page.
  // - Notes: locked vs unlocked split, again only when relevant.
  //
  // Both scans are keyed on the array references, so a keystroke in the editor
  // (which replaces one note object and therefore the `notes` array) re-counts
  // notes but leaves the todo counts alone.
  const todoSummary = useMemo(() => {
    const totalGroups = sidebarData.todoGroups.length;
    const archivedGroups = sidebarData.todoGroups.filter((g) => g.archived).length;
    const openTodos = sidebarData.todoItems.filter(
      (t) => t.status !== 'done' && t.status !== 'cancelled' && t.archived !== true,
    ).length;
    const allArchived = totalGroups > 0 && archivedGroups === totalGroups;
    return { openTodos, allArchived, archivedGroups, totalGroups };
  }, [sidebarData.todoGroups, sidebarData.todoItems]);
  const notesSummary = useMemo(() => {
    let total = 0;
    let locked = 0;
    for (const n of sidebarData.notes) {
      if (isNoteEffectivelyArchived(n, sidebarData.noteGroups)) continue;
      total += 1;
      if (n.locked) locked += 1;
    }
    return { total, locked };
  }, [sidebarData.notes, sidebarData.noteGroups]);

  return (
    <aside className="app-sidebar" aria-label="Main navigation">
      <div className="app-sidebar__brand">
        <img className="app-sidebar__logo" src={brandIconUrl()} alt="" aria-hidden />
        {!collapsed ? (
          <div className="app-sidebar__brand-text">
            <span className="app-sidebar__title">Cadence</span>
            <span className="app-sidebar__subtitle">Leadership workspace</span>
          </div>
        ) : null}
      </div>

      <nav className="app-sidebar__nav">
        {/* Home stays first and ungrouped. After it come the day-to-day Workspace, Insights and
            Utilities, then People and Account, which start folded. Each group folds away; the
            one holding the current page never does. */}
        {!mobileWeb ? (
          <div className="app-sidebar__section">
            <NavItem to={PATH_HOME} end label="Home" title="Home" icon={<IcHome size={18} />} tone="amber" collapsed={collapsed} />
          </div>
        ) : null}

        <SidebarGroup
          id="workspace"
          label="Workspace"
          containsActive={[PATH_AGENDA, PATH_PLANNING, PATH_TODOS, PATH_NOTES].some((p) => underPath(pathname, p))}
          iconOnly={collapsed}
          isCollapsed={collapsedGroups.has('workspace')}
          onToggle={toggle}
        >
          <NavItem to={PATH_AGENDA} label="Agenda" title="Agenda" icon={<IcCalendar size={18} />} tone="coral" collapsed={collapsed} />
          <NavItem to={PATH_PLANNING} label="Planning" title="Planning — personal Eisenhower matrix" icon={<IcTarget size={18} />} tone="orange" collapsed={collapsed} />
          <NavItem
            to={PATH_TODOS}
            label="To-dos"
            title={
              todoSummary.allArchived
                ? `To-dos — all ${todoSummary.archivedGroups} lists archived (${todoSummary.openTodos} open todos hidden)`
                : `To-dos — ${todoSummary.openTodos} open`
            }
            icon={<IcListTodo size={18} />}
            tone="green" collapsed={collapsed}
            badge={
              todoSummary.openTodos > 0 || todoSummary.allArchived ? (
                <span
                  className={`app-sidebar__badge${todoSummary.allArchived ? ' app-sidebar__badge--warn' : ''}`}
                  aria-label={
                    todoSummary.allArchived
                      ? `${todoSummary.openTodos} open todos hidden in archived lists`
                      : `${todoSummary.openTodos} open todos`
                  }
                >
                  {todoSummary.allArchived ? `${todoSummary.openTodos} ⚠` : todoSummary.openTodos}
                </span>
              ) : null
            }
          />
          <NavItem
            to={PATH_NOTES}
            label="Notes"
            title={
              notesSummary.locked > 0
                ? `Notes — ${notesSummary.total} total (${notesSummary.locked} locked)`
                : `Notes — ${notesSummary.total} total`
            }
            icon={<IcStickyNote size={18} />}
            tone="blue" collapsed={collapsed}
            badge={notesSummary.total > 0 ? <span className="app-sidebar__badge">{notesSummary.total}</span> : null}
          />
        </SidebarGroup>

        {features.ai ? (
          <SidebarGroup
            id="ai"
            label="AI"
            containsActive={false}
            iconOnly={collapsed}
            isCollapsed={collapsedGroups.has('ai')}
            onToggle={toggle}
          >
            {aiConnected ? (
              <>
                <ToolItem tool="ask-workspace" icon={<IcSearch size={18} />} label="Ask your workspace" title="Ask your workspace — answers from your notes and tasks, with sources" collapsed={collapsed} />
                <ToolItem tool="weekly-digest" icon={<IcFileText size={18} />} label="Weekly digest" title="Weekly digest — a retrospective or a status update" collapsed={collapsed} />
                <ToolItem tool="screenshot-to-diagram" icon={<IcLayoutGrid size={18} />} label="Diagram from a screenshot" title="Diagram from a screenshot — Mermaid or HTML" collapsed={collapsed} />
                <ToolItem tool="draw-from-description" icon={<IcPencil size={18} />} label="Draw from a description" title="Draw from a description — a Mermaid note or a Sketch board" collapsed={collapsed} />
              </>
            ) : (
              // A plain Link: NavLink would also mark Settings current.
              <Link to={`${PATH_SETTINGS}#ai`} className={linkCls({ isActive: false })} title="Connect an AI provider in Settings">
                <span className="app-sidebar__ic" data-tone="ai">
                  <IcSparkles size={18} />
                </span>
                {!collapsed ? <span>Set up AI</span> : null}
              </Link>
            )}
          </SidebarGroup>
        ) : null}

        {!mobileWeb ? (
          <SidebarGroup
            id="insights"
            label="Insights"
            containsActive={underPath(pathname, PATH_ANALYTICS)}
            iconOnly={collapsed}
            isCollapsed={collapsedGroups.has('insights')}
            onToggle={toggle}
          >
            <NavItem to={PATH_ANALYTICS} label="Analytics" title="Analytics" icon={<IcChartBar size={18} />} tone="pink" collapsed={collapsed} />
          </SidebarGroup>
        ) : null}

        {!mobileWeb ? (
          <SidebarGroup
            id="utilities"
            label="Utilities"
            containsActive={underPath(pathname, '/utilities')}
            iconOnly={collapsed}
            isCollapsed={collapsedGroups.has('utilities')}
            onToggle={toggle}
          >
            <NavItem to={PATH_UTILITIES_DOCUMENT} label="Document" title="Document — scratch pad" icon={<IcFileText size={18} />} tone="blue" collapsed={collapsed} />
            <NavItem to={PATH_UTILITIES_TOOLS_SKETCH} label="Sketch" title="Sketch — whiteboard" icon={<IcPencil size={18} />} tone="violet" collapsed={collapsed} />
            <NavItem to={PATH_UTILITIES_TOOLS_TIME} label="Time" title="Time — durations, epoch, cron" icon={<IcClock size={18} />} tone="teal" collapsed={collapsed} />
            <NavItem to={PATH_UTILITIES_TOOLS_ERD} label="ER diagram" title="ER diagram" icon={<IcLayoutGrid size={18} />} tone="green" collapsed={collapsed} />
            <NavItem to={PATH_UTILITIES_STRUCTURED} label="JSON / YAML" title="JSON / YAML editor" icon={<IcBraces size={18} />} tone="amber" collapsed={collapsed} />
            {/* A plain Link: NavLink would also mark "Others" current on the Time, ER and Sketch pages. */}
            <Link
              to={PATH_UTILITIES_TOOLS}
              className={linkCls({
                isActive: underPath(pathname, PATH_UTILITIES_TOOLS) && !OWN_TOOL_PATHS.some((p) => underPath(pathname, p)),
              })}
              aria-current={
                underPath(pathname, PATH_UTILITIES_TOOLS) && !OWN_TOOL_PATHS.some((p) => underPath(pathname, p))
                  ? 'page'
                  : undefined
              }
              title="Other developer tools — encode, hash, text, codegen"
            >
              <span className="app-sidebar__ic" data-tone="slate">
                <IcSliders size={18} />
              </span>
              {!collapsed ? <span>Others</span> : null}
            </Link>
          </SidebarGroup>
        ) : null}

        {!mobileWeb ? (
          <SidebarGroup
            id="people"
            label="People"
            containsActive={underPath(pathname, PATH_TEAMS)}
            iconOnly={collapsed}
            isCollapsed={collapsedGroups.has('people')}
            onToggle={toggle}
          >
            <NavItem to={PATH_TEAMS} end label="Teams" title="Teams" icon={<IcFolder size={18} />} tone="violet" collapsed={collapsed} />
            {teamId && team ? (
              <div className="app-sidebar__team">
                {!collapsed ? <div className="app-sidebar__team-name">{team.name}</div> : null}
                <NavItem to={teamBase(teamId)} end label="Overview" title="Overview" icon={<IcLayoutGrid size={18} />} tone="blue" collapsed={collapsed} />
                <NavItem to={teamMe(teamId)} label="Me" title="Me" icon={<IcUser size={18} />} tone="teal" collapsed={collapsed} />
                <NavItem to={teamLeader(teamId)} label="My leader" title="My leader" icon={<IcTarget size={18} />} tone="orange" collapsed={collapsed} />
                <NavItem to={teamSkipLevel(teamId)} label="Skip-level" title="Skip-level leader" icon={<IcChartBar size={18} />} tone="pink" collapsed={collapsed} />
                <NavItem to={teamPeopleRoute(teamId)} label="Members" title="Team members" icon={<IcUsers size={18} />} tone="green" collapsed={collapsed} />
              </div>
            ) : null}
          </SidebarGroup>
        ) : null}

        <SidebarGroup
          id="account"
          label="Account"
          containsActive={[PATH_PROFILE, PATH_SETTINGS].some((p) => underPath(pathname, p))}
          iconOnly={collapsed}
          isCollapsed={collapsedGroups.has('account')}
          onToggle={toggle}
        >
          <NavItem to={PATH_PROFILE} label="Profile" title="Profile" icon={<IcUser size={18} />} tone="teal" collapsed={collapsed} />
          <NavItem to={PATH_SETTINGS} label="Settings" title="Settings" icon={<IcSettings size={18} />} tone="slate" collapsed={collapsed} />
        </SidebarGroup>
      </nav>

      <AppSidebarFooter collapsed={collapsed} />
    </aside>
  );
});

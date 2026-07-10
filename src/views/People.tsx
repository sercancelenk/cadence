import {
  FormEvent,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  IcCalendar,
  IcCheck,
  IcChevronDown,
  IcClock,
  IcPencil,
  IcPlus,
  IcSave,
  IcSparkles,
  IcTrash,
  IcUndo,
  IcX,
} from '../components/icons';
// Lazy-loaded: only fetched the first time the user clicks "Ask AI" on a note.
const AIAssistantDialog = lazy(() =>
  import('../components/AIAssistantDialog').then((m) => ({ default: m.AIAssistantDialog })),
);
import { AutoResizeTextarea } from '../components/ui/AutoResizeTextarea';
import { Button } from '../components/ui/Button';
import { MarkdownEditor, MarkdownView } from '../components/ui/MarkdownEditor';
import { SchedulePopover } from '../components/ui/SchedulePopover';
import { isAIConfigured } from '../lib/ai';
import { useFeatures } from '../lib/features';
import { useAppData, useAppDataActions, useAppDataSelector } from '../AppDataContext';
import { distinctCategoriesForTeam, SUGGESTED_CATEGORIES } from '../lib/categories';
import { schedulePatchToItemPatch } from '../features/people/schedulePatch';
import { useItemFocus } from '../features/people/useItemFocus';
import { fromLocalDatetimeValue, formatDateShort, formatShort, formatTimeOnly, isPast, toLocalDatetimeValue } from '../lib/datetime';
import { kindLabel } from '../lib/labels';
import { isSafeRichTextPreviewHref } from '../lib/richTextPreviewLinks';
import { teamLeader, teamMe, teamPeople as teamPeoplePath, teamSkipLevel } from '../lib/teamPaths';
import { PATH_TEAMS } from '../lib/routes';
import { SYNC_BEFORE_APPLY } from '../lib/syncApplyGuard';
import type { FeedbackKind, GoalStatus, Item, ItemKind, Person } from '../model';
import {
  FEEDBACK_KIND_OPTIONS,
  GOAL_STATUS_OPTIONS,
  getLeaderPerson,
  getSelfPerson,
  getSkipLevelPerson,
  isLeaderPerson,
  isSelfPerson,
  isSkipLevelPerson,
  teamPeople,
} from '../model';

function goalStatusLabel(gs?: GoalStatus): string {
  return GOAL_STATUS_OPTIONS.find((o) => o.value === gs)?.label ?? '—';
}

function feedbackLabel(fk?: FeedbackKind): string {
  return FEEDBACK_KIND_OPTIONS.find((o) => o.value === fk)?.label ?? 'Feedback';
}

function feedbackTone(fk?: FeedbackKind): string {
  return FEEDBACK_KIND_OPTIONS.find((o) => o.value === fk)?.tone ?? 'info';
}

function personInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]!.slice(0, 1)}${parts[parts.length - 1]!.slice(0, 1)}`.toUpperCase();
}

function personRoleBadge(isSelf: boolean, isLeader: boolean, isSkipLevel: boolean): string | null {
  if (isSelf) return 'You';
  if (isLeader) return 'Leader';
  if (isSkipLevel) return 'Skip-level';
  return null;
}

function workspaceSubtitle(isSelf: boolean, isLeader: boolean, isSkipLevel: boolean): string {
  if (isSkipLevel) return 'Skip-level follow-ups and career themes';
  if (isLeader) return 'Manager relationship — goals, feedback, talking points';
  if (isSelf) return 'Your workspace in this team';
  return 'Follow-ups, goals and 1:1 notes';
}

/**
 * Buffers item-body markdown locally and flushes on blur or when the user
 * switches to preview mode. Avoids one persist round-trip per keystroke
 * while still preserving cursor position.
 */
function ItemBodyField({ initial, onCommit }: { initial: string; onCommit: (next: string) => void }) {
  const [value, setValue] = useState(initial);
  const lastCommitted = useRef(initial);
  const valueRef = useRef(value);
  valueRef.current = value;
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  const commitPending = useCallback(() => {
    if (valueRef.current !== lastCommitted.current) {
      onCommitRef.current(valueRef.current);
      lastCommitted.current = valueRef.current;
    }
  }, []);

  useEffect(() => {
    if (initial !== lastCommitted.current && value === lastCommitted.current) {
      setValue(initial);
      lastCommitted.current = initial;
    }
  }, [initial, value]);

  useEffect(() => {
    const onBeforeSync = () => commitPending();
    window.addEventListener(SYNC_BEFORE_APPLY, onBeforeSync);
    return () => {
      window.removeEventListener(SYNC_BEFORE_APPLY, onBeforeSync);
      commitPending();
    };
  }, [commitPending]);

  return (
    <MarkdownEditor
      value={value}
      onChange={setValue}
      onBlur={commitPending}
      placeholder="Write the body in markdown…"
      rows={6}
    />
  );
}

export function TeamMePage() {
  const { teamId } = useParams();
  const { data } = useAppData();
  const self = teamId ? getSelfPerson(data, teamId) : undefined;
  if (!teamId) return <Navigate to={PATH_TEAMS} replace />;
  if (!self) return <Navigate to={PATH_TEAMS} replace />;
  return <PersonWorkspace personId={self.id} />;
}

export function TeamLeaderPage() {
  const { teamId } = useParams();
  const { data } = useAppData();
  const leader = teamId ? getLeaderPerson(data, teamId) : undefined;
  if (!teamId) return <Navigate to={PATH_TEAMS} replace />;
  if (!leader) return <Navigate to={PATH_TEAMS} replace />;
  return <PersonWorkspace personId={leader.id} />;
}

export function TeamSkipLevelPage() {
  const { teamId } = useParams();
  const { data } = useAppData();
  const skipLevel = teamId ? getSkipLevelPerson(data, teamId) : undefined;
  if (!teamId) return <Navigate to={PATH_TEAMS} replace />;
  if (!skipLevel) return <Navigate to={PATH_TEAMS} replace />;
  return <PersonWorkspace personId={skipLevel.id} />;
}

export function People() {
  const { teamId } = useParams();
  const { addPerson, removePerson } = useAppDataActions();
  const teamBundle = useAppDataSelector((d) => {
    if (!teamId) return null;
    const team = d.teams.find((t) => t.id === teamId);
    if (!team) return null;
    return {
      team,
      members: teamPeople(d, teamId),
      self: getSelfPerson(d, teamId),
      leader: getLeaderPerson(d, teamId),
      skipLevel: getSkipLevelPerson(d, teamId),
    };
  });
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');

  if (!teamBundle) return <Navigate to={PATH_TEAMS} replace />;
  const { team, members, self, leader, skipLevel } = teamBundle;
  const resolvedTeamId = team.id;

  if (!self) return <Navigate to={PATH_TEAMS} replace />;

  return (
    <div className="page page--wide">
      <header className="page-head">
        <h1>Team members · {team.name}</h1>
        <p className="muted">Each person has their own workspace with tasks, goals, structured notes and a free-form scratchpad.</p>
      </header>

      <section className="card">
        <h2 className="card__title">Team members</h2>
        <p className="muted small">
          Your personal &quot;Me&quot; space, your leader and skip-level leader, plus everyone you added. Open a card to
          jump into that person&apos;s workspace.
        </p>
        <div className="tiles" style={{ marginTop: 12 }}>
          <div className="tile member-tile">
            <Link className="tile__link" to={teamMe(resolvedTeamId)} title="Open Me workspace">
              <div className="tile__name">
                {self.name}
                <span className="pill" style={{ marginLeft: 6 }}>You</span>
              </div>
              <div className="muted small">{self.title || 'Your personal workspace'}</div>
            </Link>
          </div>

          {leader ? (
            <div className="tile member-tile">
              <Link className="tile__link" to={teamLeader(resolvedTeamId)} title="Open My leader workspace">
                <div className="tile__name">
                  {leader.name}
                  <span className="pill" style={{ marginLeft: 6 }}>Leader</span>
                </div>
                <div className="muted small">{leader.title || 'Your manager'}</div>
              </Link>
            </div>
          ) : null}

          {skipLevel ? (
            <div className="tile member-tile">
              <Link className="tile__link" to={teamSkipLevel(resolvedTeamId)} title="Open Skip-level leader workspace">
                <div className="tile__name">
                  {skipLevel.name}
                  <span className="pill" style={{ marginLeft: 6 }}>Skip-level</span>
                </div>
                <div className="muted small">{skipLevel.title || 'Your skip-level leader'}</div>
              </Link>
            </div>
          ) : null}

          {members.map((p) => (
            <div key={p.id} className="tile member-tile">
              <Link
                to={`${teamPeoplePath(resolvedTeamId)}/${p.id}`}
                className="tile__link"
                title={`Open ${p.name}'s workspace`}
              >
                <div className="tile__name">{p.name}</div>
                <div className="muted small">{p.title || 'Open workspace'}</div>
              </Link>
              <div className="member-tile__actions row" style={{ marginTop: 8 }}>
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  icon={<IcTrash size={16} />}
                  onClick={() => removePerson(p.id)}
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2 className="card__title">Add person</h2>
        <form
          className="row"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (!name.trim()) return;
            addPerson(resolvedTeamId, name.trim(), title.trim() || undefined);
            setName('');
            setTitle('');
          }}
        >
          <input className="input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <input
            className="input input--grow"
            placeholder="Role (optional)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Button type="submit" variant="primary" icon={<IcPlus size={18} />}>
            Add
          </Button>
        </form>
      </section>
    </div>
  );
}

export function PersonRoute() {
  const { personId, teamId } = useParams();
  const location = useLocation();
  const { data } = useAppData();
  if (!teamId || !personId) return <Navigate to={PATH_TEAMS} replace />;
  const p = data.people.find((x) => x.id === personId);
  if (!p || p.teamId !== teamId) return <Navigate to={teamPeoplePath(teamId)} replace />;
  // Preserve ?focus= / ?tab= so reminder and agenda deep links survive the redirect.
  const search = location.search;
  if (isSelfPerson(p)) {
    return <Navigate to={{ pathname: teamMe(teamId), search }} replace />;
  }
  if (isLeaderPerson(p)) {
    return <Navigate to={{ pathname: teamLeader(teamId), search }} replace />;
  }
  if (isSkipLevelPerson(p)) {
    return <Navigate to={{ pathname: teamSkipLevel(teamId), search }} replace />;
  }
  return <PersonWorkspace personId={personId} />;
}

type WorkspaceTab = 'workspace' | 'timeline' | 'meeting';

export function PersonWorkspace({ personId }: { personId: string }) {
  const { teamId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { data, updatePerson, addItem, updateItem, toggleItemDone, removeItem } = useAppData();
  const person = data.people.find((p) => p.id === personId);
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [scratchpad, setScratchpad] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [tab, setTab] = useState<WorkspaceTab>('workspace');

  const items = useMemo(() => data.items.filter((i) => i.personId === personId), [data.items, personId]);

  useItemFocus(location.search, location.pathname, navigate, items, setOpenId, setTab);

  const categoryHints = useMemo(() => {
    if (!teamId) return [...SUGGESTED_CATEGORIES];
    return [...new Set([...SUGGESTED_CATEGORIES, ...distinctCategoriesForTeam(data, teamId)])];
  }, [data, teamId]);

  const scratchpadDirty = person ? scratchpad !== (person.scratchpad ?? '') : false;
  const profileDirty = person
    ? name.trim() !== person.name.trim() || title !== (person.title ?? '')
    : false;
  const scratchpadRef = useRef(scratchpad);
  const scratchpadDirtyRef = useRef(scratchpadDirty);
  const profileDirtyRef = useRef(profileDirty);
  const nameRef = useRef(name);
  const titleRef = useRef(title);
  scratchpadRef.current = scratchpad;
  scratchpadDirtyRef.current = scratchpadDirty;
  profileDirtyRef.current = profileDirty;
  nameRef.current = name;
  titleRef.current = title;

  useEffect(() => {
    if (!person) {
      setName('');
      setTitle('');
      setScratchpad('');
      return;
    }
    setName(person.name);
    setTitle(person.title ?? '');
    setScratchpad(person.scratchpad ?? '');
  }, [person?.id]);

  useEffect(() => {
    if (!person) return;
    if (!profileDirty) {
      setName(person.name);
      setTitle(person.title ?? '');
    }
    if (!scratchpadDirty) {
      setScratchpad(person.scratchpad ?? '');
    }
  }, [person?.name, person?.title, person?.scratchpad, profileDirty, scratchpadDirty]);

  useEffect(() => {
    if (!person || !scratchpadDirty) return;
    const personId = person.id;
    const timer = window.setTimeout(() => {
      updatePerson(personId, { scratchpad });
    }, 800);
    return () => clearTimeout(timer);
  }, [person?.id, scratchpad, scratchpadDirty, updatePerson]);

  useEffect(() => {
    const personId = person?.id;
    return () => {
      if (!personId) return;
      if (profileDirtyRef.current) {
        updatePerson(personId, {
          name: nameRef.current.trim() || 'Unnamed',
          title: titleRef.current,
          scratchpad: scratchpadRef.current,
        });
      } else if (scratchpadDirtyRef.current) {
        updatePerson(personId, { scratchpad: scratchpadRef.current });
      }
    };
  }, [person?.id, updatePerson]);

  useEffect(() => {
    const onBeforeSync = () => {
      if (!person) return;
      if (profileDirty) {
        updatePerson(person.id, {
          name: name.trim() || person.name,
          title,
          scratchpad,
        });
      } else if (scratchpadDirty) {
        updatePerson(person.id, { scratchpad });
      }
    };
    window.addEventListener(SYNC_BEFORE_APPLY, onBeforeSync);
    return () => {
      window.removeEventListener(SYNC_BEFORE_APPLY, onBeforeSync);
      onBeforeSync();
    };
  }, [person?.id, name, title, scratchpad, profileDirty, scratchpadDirty, updatePerson]);

  if (!teamId) {
    return (
      <div className="page">
        <p className="muted">No team context.</p>
        <Link to={PATH_TEAMS}>Back to Teams</Link>
      </div>
    );
  }

  if (!person) {
    return (
      <div className="page">
        <p>Person not found.</p>
        <Link to={teamPeoplePath(teamId)}>Back to team members</Link>
      </div>
    );
  }

  const isSelf = isSelfPerson(person);
  const isLeader = isLeaderPerson(person);
  const isSkipLevel = isSkipLevelPerson(person);
  const roleBadge = personRoleBadge(isSelf, isLeader, isSkipLevel);
  const openTasks = items.filter((i) => i.kind === 'task' && !i.done).length;
  const openGoals = items.filter((i) => i.kind === 'goal' && !i.done).length;
  const overdueCount = items.filter(
    (i) => (i.kind === 'task' || i.kind === 'goal') && !i.done && !!i.dueAt && isPast(i.dueAt),
  ).length;
  const displayTitle = title.trim() || person.title?.trim() || '';

  return (
    <div className="page page--wide">
      <header className="page-head">
        <div className="person-workspace__head">
          <div className="person-workspace__identity">
            <div className="person-workspace__avatar" aria-hidden>
              {personInitials(person.name)}
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="person-workspace__title-row">
                <h1>{person.name}</h1>
                {roleBadge ? <span className="pill">{roleBadge}</span> : null}
              </div>
              <p className="person-workspace__role">
                {displayTitle || workspaceSubtitle(isSelf, isLeader, isSkipLevel)}
              </p>
              <div className="person-workspace__stats" aria-label="Workspace summary">
                <span className="person-workspace__stat">
                  {openTasks} open {openTasks === 1 ? 'task' : 'tasks'}
                </span>
                <span className="person-workspace__stat">
                  {openGoals} {openGoals === 1 ? 'goal' : 'goals'}
                </span>
                {overdueCount > 0 ? (
                  <span className="person-workspace__stat person-workspace__stat--warn">
                    {overdueCount} overdue
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <div className="person-workspace__head-actions">
            <Button type="button" variant="secondary" size="sm" onClick={() => setTab('meeting')}>
              1:1 Mode
            </Button>
            <Link className="btn btn--ghost btn--small" to={teamPeoplePath(teamId)}>
              Members
            </Link>
          </div>
        </div>
        <nav className="tabs" role="tablist" aria-label="Person workspace tabs">
          <button
            type="button"
            className={`tabs__tab${tab === 'workspace' ? ' tabs__tab--active' : ''}`}
            role="tab"
            aria-selected={tab === 'workspace'}
            title="Workspace"
            onClick={() => setTab('workspace')}
          >
            Workspace
          </button>
          <button
            type="button"
            className={`tabs__tab${tab === 'timeline' ? ' tabs__tab--active' : ''}`}
            role="tab"
            aria-selected={tab === 'timeline'}
            title="Timeline"
            onClick={() => setTab('timeline')}
          >
            Timeline
          </button>
          <button
            type="button"
            className={`tabs__tab${tab === 'meeting' ? ' tabs__tab--active' : ''}`}
            role="tab"
            aria-selected={tab === 'meeting'}
            title="1:1 Mode"
            onClick={() => setTab('meeting')}
          >
            1:1 Mode
          </button>
        </nav>
      </header>

      {tab === 'timeline' ? (
        <PersonTimeline items={items} />
      ) : tab === 'meeting' ? (
        <PersonMeetingMode person={person} items={items} addItem={addItem} updatePerson={updatePerson} />
      ) : (
        <PersonWorkspaceTabContent
          person={person}
          name={name}
          setName={setName}
          title={title}
          setTitle={setTitle}
          scratchpad={scratchpad}
          setScratchpad={setScratchpad}
          updatePerson={updatePerson}
          isSelf={isSelf}
          isLeader={isLeader}
          isSkipLevel={isSkipLevel}
          items={items}
          categoryHints={categoryHints}
          teamId={teamId}
          openId={openId}
          setOpenId={setOpenId}
          personId={personId}
          addItem={addItem}
          updateItem={updateItem}
          toggleItemDone={toggleItemDone}
          removeItem={removeItem}
        />
      )}
    </div>
  );
}

function PersonWorkspaceTabContent(props: {
  person: Person;
  name: string;
  setName: (v: string) => void;
  title: string;
  setTitle: (v: string) => void;
  scratchpad: string;
  setScratchpad: (v: string) => void;
  updatePerson: ReturnType<typeof useAppData>['updatePerson'];
  isSelf: boolean;
  isLeader: boolean;
  isSkipLevel: boolean;
  items: Item[];
  categoryHints: string[];
  teamId: string;
  openId: string | null;
  setOpenId: (id: string | null) => void;
  personId: string;
  addItem: ReturnType<typeof useAppData>['addItem'];
  updateItem: ReturnType<typeof useAppData>['updateItem'];
  toggleItemDone: ReturnType<typeof useAppData>['toggleItemDone'];
  removeItem: ReturnType<typeof useAppData>['removeItem'];
}) {
  const {
    person,
    name,
    setName,
    title,
    setTitle,
    scratchpad,
    setScratchpad,
    updatePerson,
    isSelf,
    isLeader,
    isSkipLevel,
    items,
    categoryHints,
    teamId,
    openId,
    setOpenId,
    personId,
    addItem,
    updateItem,
    toggleItemDone,
    removeItem,
  } = props;
  const [profileOpen, setProfileOpen] = useState(false);
  const [scratchOpen, setScratchOpen] = useState(() => !!(person.scratchpad ?? '').trim());
  const scratchpadDirty = scratchpad !== (person.scratchpad ?? '');

  useEffect(() => {
    setProfileOpen(false);
    setScratchOpen(!!(person.scratchpad ?? '').trim());
  }, [person.id]);

  return (
    <>
      <section className="card">
        <div className="person-card__head">
          <h2 className="card__title">Profile</h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            icon={<IcPencil size={15} />}
            onClick={() => setProfileOpen((v) => !v)}
          >
            {profileOpen ? 'Done' : 'Edit'}
          </Button>
        </div>
        {profileOpen ? (
          <>
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const nextName = String(fd.get('name') ?? '').trim() || person.name;
                const nextTitle = String(fd.get('title') ?? '');
                setName(nextName);
                setTitle(nextTitle);
                updatePerson(person.id, {
                  name: nextName,
                  title: nextTitle,
                  scratchpad,
                });
                setProfileOpen(false);
              }}
            >
              {/*
                Uncontrolled while the edit form is open so Save always reflects
                the fields the user typed (FormData), not a stale React buffer.
                Remount via key when opening so defaultValue tracks the latest person.
              */}
              <input
                key={`name-${person.id}-${profileOpen}`}
                className="input"
                name="name"
                defaultValue={name}
                placeholder="Name"
                aria-label="Name"
                onChange={(e) => setName(e.target.value)}
              />
              <input
                key={`title-${person.id}-${profileOpen}`}
                className="input input--grow"
                name="title"
                defaultValue={title}
                placeholder="Role / title"
                aria-label="Role / title"
                onChange={(e) => setTitle(e.target.value)}
              />
              <Button type="submit" variant="primary" size="sm" icon={<IcSave size={16} />}>
                Save
              </Button>
            </form>
            {isSelf || isLeader || isSkipLevel ? (
              <p className="muted small person-card__hint" style={{ marginTop: 8 }}>
                {isSelf
                  ? 'Rename the Me label for this team if you like.'
                  : isLeader
                    ? 'Replace "My leader" with your manager\'s real name — entries stay on this workspace.'
                    : 'Replace "Skip-level leader" with their real name — entries stay on this workspace.'}
              </p>
            ) : null}
          </>
        ) : (
          <p className="muted small" style={{ margin: 0 }}>
            {person.title?.trim()
              ? person.title
              : isSelf || isLeader || isSkipLevel
                ? 'Tap Edit to set a display name or role.'
                : 'No role set — tap Edit to add one.'}
          </p>
        )}
      </section>

      <section className="card person-scratchpad">
        <div className="person-card__head">
          <h2 className="card__title">
            Scratchpad{' '}
            {scratchpad.trim() ? <span className="pill">notes</span> : null}
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            iconRight={<IcChevronDown size={14} />}
            onClick={() => setScratchOpen((v) => !v)}
            aria-expanded={scratchOpen}
          >
            {scratchOpen ? 'Collapse' : 'Expand'}
          </Button>
        </div>
        {!scratchOpen ? (
          <p className="muted small" style={{ margin: 0 }}>
            {scratchpad.trim()
              ? scratchpad.trim().split('\n')[0]!.slice(0, 120) +
                (scratchpad.trim().length > 120 ? '…' : '')
              : 'Quick notes and talking points — expands when you need them.'}
          </p>
        ) : (
          <>
            <p className="muted small person-card__hint">Autosaves as you type.</p>
            <MarkdownEditor
              value={scratchpad}
              onChange={setScratchpad}
              onBlur={() =>
                person && scratchpad !== (person.scratchpad ?? '') && updatePerson(person.id, { scratchpad })
              }
              placeholder="Talking points, drafts, reminders…"
              rows={6}
            />
            {scratchpadDirty ? (
              <div className="row" style={{ marginTop: 8 }}>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  icon={<IcSave size={15} />}
                  onClick={() => updatePerson(person.id, { scratchpad })}
                >
                  Save now
                </Button>
              </div>
            ) : null}
          </>
        )}
      </section>

      <KindSection
        title="Tasks"
        kind="task"
        categoryHints={categoryHints}
        teamId={teamId}
        items={items}
        openId={openId}
        setOpenId={setOpenId}
        onAdd={(fields) => addItem(personId, 'task', fields)}
        onUpdate={updateItem}
        onToggle={toggleItemDone}
        onRemove={removeItem}
      />
      <KindSection
        title="Goals"
        kind="goal"
        categoryHints={categoryHints}
        teamId={teamId}
        items={items}
        openId={openId}
        setOpenId={setOpenId}
        onAdd={(fields) => addItem(personId, 'goal', fields)}
        onUpdate={updateItem}
        onToggle={toggleItemDone}
        onRemove={removeItem}
      />
      <KindSection
        title="Notes (structured)"
        kind="note"
        categoryHints={categoryHints}
        teamId={teamId}
        items={items}
        openId={openId}
        setOpenId={setOpenId}
        onAdd={(fields) => addItem(personId, 'note', fields)}
        onUpdate={updateItem}
        onToggle={toggleItemDone}
        onRemove={removeItem}
      />
      <KindSection
        title="Feedback log"
        kind="feedback"
        categoryHints={categoryHints}
        teamId={teamId}
        items={items}
        openId={openId}
        setOpenId={setOpenId}
        onAdd={(fields) => addItem(personId, 'feedback', fields)}
        onUpdate={updateItem}
        onToggle={toggleItemDone}
        onRemove={removeItem}
      />
      <KindSection
        title="Documents"
        kind="document"
        categoryHints={categoryHints}
        teamId={teamId}
        items={items}
        openId={openId}
        setOpenId={setOpenId}
        onAdd={(fields) => addItem(personId, 'document', fields)}
        onUpdate={updateItem}
        onToggle={toggleItemDone}
        onRemove={removeItem}
      />
    </>
  );
}

function ItemScheduleField({
  item,
  label,
  onUpdate,
  compact = false,
}: {
  item: Item;
  label?: string;
  onUpdate: (
    id: string,
    patch: Partial<Pick<Item, 'dueAt' | 'remindAt' | 'remindRepeat'>>,
  ) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const overdue = !!item.dueAt && isPast(item.dueAt) && !item.done;
  const reminderArmed = !!item.remindAt && !item.done;

  const trigger = (
    <div className={`people-item-sched${compact ? ' people-item-sched--compact' : ''}`}>
      <button
        ref={triggerRef}
        type="button"
        className={`people-item-sched__trigger${item.dueAt ? ' people-item-sched__trigger--set' : ''}${
          overdue ? ' people-item-sched__trigger--warn' : ''
        }${reminderArmed ? ' people-item-sched__trigger--reminder' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={
          item.dueAt
            ? `Scheduled for ${formatDateShort(item.dueAt)} ${formatTimeOnly(item.dueAt)}${
                reminderArmed ? ' · reminder set' : ''
              } — click to change`
            : 'Schedule a due date and optional desktop reminder'
        }
        onClick={() => setOpen((v) => !v)}
      >
        <span className="people-item-sched__ic" aria-hidden>
          <IcCalendar size={14} />
        </span>
        {item.dueAt ? (
          <>
            <span>
              {formatDateShort(item.dueAt)}
              {formatTimeOnly(item.dueAt) ? ` · ${formatTimeOnly(item.dueAt)}` : ''}
            </span>
            {reminderArmed ? (
              <span className="people-item-sched__ic people-item-sched__ic--muted" aria-hidden title="Reminder set">
                <IcClock size={13} />
              </span>
            ) : null}
          </>
        ) : (
          <span>{compact ? 'Date' : 'Schedule'}</span>
        )}
      </button>
      {open ? (
        <SchedulePopover
          anchorRef={triggerRef}
          itemId={item.id}
          dueAt={item.dueAt}
          remindAt={item.remindAt}
          remindRepeat={item.remindRepeat}
          onPatch={(patch) => onUpdate(item.id, schedulePatchToItemPatch(patch))}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );

  if (compact) return trigger;

  return (
    <div className="field">
      <span>{label ?? 'Due date & reminder'}</span>
      {trigger}
      <span className="muted small">Due dates appear on Agenda. Reminders fire a desktop notification.</span>
    </div>
  );
}

function KindSection({
  title,
  kind,
  categoryHints,
  teamId,
  items,
  openId,
  setOpenId,
  onAdd,
  onUpdate,
  onToggle,
  onRemove,
}: {
  title: string;
  kind: ItemKind;
  categoryHints: string[];
  teamId: string;
  items: Item[];
  openId: string | null;
  setOpenId: (id: string | null) => void;
  onAdd: (
    fields: Partial<
      Pick<
        Item,
        'title' | 'body' | 'dueAt' | 'startAt' | 'remindAt' | 'remindRepeat' | 'url' | 'category' | 'goalStatus' | 'feedbackKind'
      >
    >,
  ) => void;
  onUpdate: (
    id: string,
    patch: Partial<
      Pick<
        Item,
        | 'title'
        | 'body'
        | 'dueAt'
        | 'startAt'
        | 'remindAt'
        | 'remindRepeat'
        | 'url'
        | 'done'
        | 'category'
        | 'goalStatus'
        | 'feedbackKind'
      >
    >,
  ) => void;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const list = useMemo(() => items.filter((i) => i.kind === kind).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [items, kind]);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftUrl, setDraftUrl] = useState('');
  const [draftCategory, setDraftCategory] = useState('');
  const [draftStartAt, setDraftStartAt] = useState('');
  const [draftDueAt, setDraftDueAt] = useState('');
  const [draftGoalStatus, setDraftGoalStatus] = useState<GoalStatus>('planned');
  const [draftFeedbackKind, setDraftFeedbackKind] = useState<FeedbackKind>('coaching');
  const [aiTarget, setAiTarget] = useState<Item | null>(null);
  const { data } = useAppData();
  // Hide AI affordances entirely when the active policy/preset disables AI
  // (e.g. work-strict). Otherwise fall back to the per-account API-key gate.
  const { features: appFeatures } = useFeatures();
  const aiEnabled = appFeatures.ai && isAIConfigured(data.aiSettings);
  const listId = `cat-${teamId}-${kind}`;
  const submittingRef = useRef(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const titleInputRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);

  useEffect(() => {
    if (!composerOpen) return;
    const id = window.requestAnimationFrame(() => titleInputRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [composerOpen]);

  const resetDraft = () => {
    setDraftTitle('');
    setDraftUrl('');
    setDraftCategory('');
    setDraftStartAt('');
    setDraftDueAt('');
    setDraftGoalStatus('planned');
    setDraftFeedbackKind('coaching');
  };

  const submitComposer = (e: FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;
    if (!draftTitle.trim() && kind !== 'document') return;
    if (kind === 'document' && !draftTitle.trim() && !draftUrl.trim()) return;
    submittingRef.current = true;
    try {
      if (kind === 'document') {
        onAdd({ title: draftTitle.trim() || 'Document', url: draftUrl.trim(), category: draftCategory.trim() || undefined });
      } else if (kind === 'goal') {
        onAdd({
          title: draftTitle.trim(),
          category: draftCategory.trim() || undefined,
          startAt: draftStartAt ? fromLocalDatetimeValue(draftStartAt) : undefined,
          dueAt: draftDueAt ? fromLocalDatetimeValue(draftDueAt) : undefined,
          goalStatus: draftGoalStatus,
        });
      } else if (kind === 'feedback') {
        onAdd({
          title: draftTitle.trim(),
          category: draftCategory.trim() || undefined,
          feedbackKind: draftFeedbackKind,
        });
      } else {
        onAdd({ title: draftTitle.trim(), category: draftCategory.trim() || undefined });
      }
      resetDraft();
      setComposerOpen(false);
    } finally {
      submittingRef.current = false;
    }
  };

  return (
    <section className="card">
      <div className="person-card__head">
        <h2 className="card__title">
          {title} <span className="pill">{list.length}</span>
        </h2>
        <Button
          type="button"
          variant={composerOpen ? 'ghost' : 'secondary'}
          size="sm"
          icon={composerOpen ? <IcX size={15} /> : <IcPlus size={15} />}
          onClick={() => {
            if (composerOpen) {
              setComposerOpen(false);
              resetDraft();
            } else {
              setComposerOpen(true);
            }
          }}
        >
          {composerOpen ? 'Cancel' : 'Add'}
        </Button>
      </div>

      {composerOpen ? (
        <form
          className={`person-kind__composer${kind === 'goal' ? ' kind-form kind-form--goal' : ''}`}
          onSubmit={submitComposer}
        >
          {kind === 'goal' ? (
            <label className="field" style={{ marginTop: 0 }}>
              <span>Goal</span>
              <textarea
                ref={titleInputRef as RefObject<HTMLTextAreaElement>}
                className="textarea textarea--goal-title"
                rows={3}
                placeholder="Describe the goal…"
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
              />
            </label>
          ) : kind === 'task' ? (
            <label className="field" style={{ marginTop: 0 }}>
              <span>Task</span>
              <AutoResizeTextarea
                className="textarea textarea--task-title"
                minRows={2}
                maxRows={8}
                placeholder="What needs to be done?"
                value={draftTitle}
                onChange={setDraftTitle}
                ariaLabel="Task title"
                autoFocus
              />
            </label>
          ) : (
            <input
              ref={titleInputRef as RefObject<HTMLInputElement>}
              className="input input--grow"
              placeholder={kind === 'document' ? 'Title (optional)' : 'Title'}
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
            />
          )}
          <div className="row" style={{ flexWrap: 'wrap', marginTop: 8 }}>
            <input
              className="input"
              style={{ minWidth: 130 }}
              placeholder="Category"
              value={draftCategory}
              onChange={(e) => setDraftCategory(e.target.value)}
              list={listId}
            />
            <datalist id={listId}>
              {categoryHints.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            {kind === 'goal' ? (
              <>
                <label className="field" style={{ minWidth: 180, marginTop: 0 }}>
                  <span className="small">Start</span>
                  <input type="datetime-local" className="input" value={draftStartAt} onChange={(e) => setDraftStartAt(e.target.value)} />
                </label>
                <label className="field" style={{ minWidth: 180, marginTop: 0 }}>
                  <span className="small">Deadline</span>
                  <input type="datetime-local" className="input" value={draftDueAt} onChange={(e) => setDraftDueAt(e.target.value)} />
                </label>
                <label className="field" style={{ minWidth: 140, marginTop: 0 }}>
                  <span className="small">Status</span>
                  <select className="select" value={draftGoalStatus} onChange={(e) => setDraftGoalStatus(e.target.value as GoalStatus)}>
                    {GOAL_STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : null}
            {kind === 'feedback' ? (
              <label className="field" style={{ minWidth: 140, marginTop: 0 }}>
                <span className="small">Type</span>
                <select
                  className="select"
                  value={draftFeedbackKind}
                  onChange={(e) => setDraftFeedbackKind(e.target.value as FeedbackKind)}
                >
                  {FEEDBACK_KIND_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {kind === 'document' ? (
              <input className="input input--grow" placeholder="https://…" value={draftUrl} onChange={(e) => setDraftUrl(e.target.value)} />
            ) : null}
            <Button type="submit" variant="primary" size="sm" icon={<IcPlus size={16} />}>
              Add
            </Button>
          </div>
        </form>
      ) : null}

      {list.length === 0 ? (
        <div className="person-kind__empty">
          <p className="muted" style={{ margin: 0 }}>
            No {title.toLowerCase()} yet.
          </p>
          {!composerOpen ? (
            <Button type="button" variant="ghost" size="sm" icon={<IcPlus size={15} />} onClick={() => setComposerOpen(true)}>
              Add first
            </Button>
          ) : null}
        </div>
      ) : (
        <ul className="list">
          {list.map((it) => (
            <li key={it.id} className="list__block person-item" data-item-id={it.id}>
              <div className="person-item__main">
                <div className="person-item__body">
                  <div className={`list__title${kind === 'goal' ? ' list__title--multiline' : ''}`}>
                    {it.kind === 'document' && it.url && isSafeRichTextPreviewHref(it.url) ? (
                      <a href={it.url} target="_blank" rel="noreferrer">
                        {it.title || it.url}
                      </a>
                    ) : (
                      it.title || it.url || ''
                    )}{' '}
                    {it.done ? <span className="pill pill--ok">done</span> : null}
                    {it.kind === 'goal' ? <span className="pill">{goalStatusLabel(it.goalStatus)}</span> : null}
                    {it.kind === 'feedback' ? (
                      <span className={`pill pill--${feedbackTone(it.feedbackKind)}`}>
                        {feedbackLabel(it.feedbackKind)}
                      </span>
                    ) : null}
                  </div>
                  <div className="person-item__meta">
                    <span className="person-item__meta-text">
                      {it.category ? it.category : kindLabel(it.kind)}
                      {it.kind === 'goal' && it.startAt ? ` · start ${formatShort(it.startAt)}` : ''}
                      {it.dueAt ? ` · due ${formatShort(it.dueAt)}` : ''}
                      {it.remindAt ? ` · reminder ${formatShort(it.remindAt)}` : ''}
                    </span>
                    {it.dueAt && isPast(it.dueAt) && !it.done ? (
                      <span className="person-item__overdue">overdue</span>
                    ) : null}
                    {(it.kind === 'task' || it.kind === 'goal') && openId !== it.id ? (
                      <ItemScheduleField item={it} onUpdate={onUpdate} compact />
                    ) : null}
                  </div>
                </div>
                <div className="person-item__actions">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    icon={openId === it.id ? <IcX size={16} /> : <IcPencil size={16} />}
                    onClick={() => setOpenId(openId === it.id ? null : it.id)}
                  >
                    {openId === it.id ? 'Close' : 'Edit'}
                  </Button>
                  {aiEnabled && (it.kind === 'task' || it.kind === 'goal') ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      icon={<IcSparkles size={16} />}
                      title="Ask AI"
                      onClick={() => setAiTarget(it)}
                    >
                      Ask AI
                    </Button>
                  ) : null}
                  {it.kind === 'task' || it.kind === 'goal' ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      icon={it.done ? <IcUndo size={16} /> : <IcCheck size={16} />}
                      onClick={() => onToggle(it.id)}
                    >
                      {it.done ? 'Reopen' : 'Done'}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="danger"
                    size="icon"
                    icon={<IcTrash size={16} />}
                    onClick={() => onRemove(it.id)}
                  >
                    Delete
                  </Button>
                </div>
              </div>

              {openId === it.id ? (
                <div className="editor">
                  <label className="field">
                    <span>{it.kind === 'goal' ? 'Goal description' : it.kind === 'task' ? 'Task' : 'Title'}</span>
                    {it.kind === 'goal' ? (
                      <textarea
                        className="textarea textarea--goal-title"
                        rows={5}
                        defaultValue={it.title}
                        key={`t-${it.id}-${it.updatedAt}`}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v && v !== it.title) onUpdate(it.id, { title: v });
                        }}
                      />
                    ) : it.kind === 'task' ? (
                      <textarea
                        className="textarea textarea--task-title"
                        rows={2}
                        defaultValue={it.title}
                        key={`t-${it.id}-${it.updatedAt}`}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v && v !== it.title) onUpdate(it.id, { title: v });
                        }}
                      />
                    ) : (
                      <input
                        className="input"
                        defaultValue={it.title}
                        key={`t-${it.id}-${it.updatedAt}`}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v && v !== it.title) onUpdate(it.id, { title: v });
                        }}
                      />
                    )}
                  </label>
                  {it.kind === 'document' ? (
                    <label className="field">
                      <span>URL</span>
                      <input
                        className="input"
                        defaultValue={it.url ?? ''}
                        key={`u-${it.id}-${it.updatedAt}`}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v !== (it.url ?? '')) onUpdate(it.id, { url: v });
                        }}
                      />
                    </label>
                  ) : null}
                  <label className="field">
                    <span>Category (optional)</span>
                    <input
                      className="input"
                      defaultValue={it.category ?? ''}
                      key={`c-${it.id}-${it.updatedAt}`}
                      list={`${listId}-edit-${it.id}`}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v !== (it.category ?? '')) onUpdate(it.id, { category: v });
                      }}
                    />
                    <datalist id={`${listId}-edit-${it.id}`}>
                      {categoryHints.map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                  </label>
                  {it.kind === 'goal' ? (
                    <label className="field">
                      <span>Status</span>
                      <select
                        className="select"
                        defaultValue={it.goalStatus ?? 'planned'}
                        key={`gs-${it.id}-${it.updatedAt}-${it.goalStatus ?? ''}`}
                        onChange={(e) => onUpdate(it.id, { goalStatus: e.target.value as GoalStatus })}
                      >
                        {GOAL_STATUS_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  {it.kind === 'feedback' ? (
                    <label className="field">
                      <span>Feedback type</span>
                      <select
                        className="select"
                        defaultValue={it.feedbackKind ?? 'coaching'}
                        key={`fk-${it.id}-${it.updatedAt}-${it.feedbackKind ?? ''}`}
                        onChange={(e) => onUpdate(it.id, { feedbackKind: e.target.value as FeedbackKind })}
                      >
                        {FEEDBACK_KIND_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <div className="field">
                    <span>Content (markdown)</span>
                    <ItemBodyField
                      key={`b-${it.id}-${it.updatedAt}`}
                      initial={it.body}
                      onCommit={(v) => onUpdate(it.id, { body: v })}
                    />
                  </div>
                  {it.kind === 'goal' ? (
                    <label className="field">
                      <span>Start</span>
                      <input
                        type="datetime-local"
                        className="input"
                        defaultValue={toLocalDatetimeValue(it.startAt)}
                        key={`s-${it.id}-${it.updatedAt}`}
                        onChange={(e) => {
                          const next = fromLocalDatetimeValue(e.target.value);
                          if (next === it.startAt) return;
                          onUpdate(it.id, { startAt: next });
                        }}
                      />
                    </label>
                  ) : null}
                  {it.kind === 'task' || it.kind === 'goal' ? (
                    <ItemScheduleField
                      item={it}
                      label={it.kind === 'goal' ? 'Deadline & reminder' : 'Due date & reminder'}
                      onUpdate={onUpdate}
                    />
                  ) : null}
                </div>
              ) : it.body ? (
                <div className="list__body-preview">
                  <MarkdownView value={it.body} />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {aiTarget ? (
        <Suspense fallback={null}>
          <AIAssistantDialog
            open={!!aiTarget}
            onClose={() => setAiTarget(null)}
            task={{ title: aiTarget.title, body: aiTarget.body }}
            onAppendToBody={(markdown) => {
              const t = aiTarget;
              const next = `${t.body ? `${t.body}\n\n` : ''}---\n**AI suggestions**\n\n${markdown}`;
              onUpdate(t.id, { body: next });
              setAiTarget(null);
            }}
          />
        </Suspense>
      ) : null}
    </section>
  );
}

/* ============================================================
   Person timeline
   A chronological feed of every item attached to a person.
   Grouped by day, filterable by kind.
   ============================================================ */

type TimelineFilter = 'all' | ItemKind;

const TIMELINE_FILTERS: { value: TimelineFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'task', label: 'Tasks' },
  { value: 'goal', label: 'Goals' },
  { value: 'note', label: 'Notes' },
  { value: 'feedback', label: 'Feedback' },
  { value: 'document', label: 'Documents' },
];

function PersonTimeline({ items }: { items: Item[] }) {
  const [filter, setFilter] = useState<TimelineFilter>('all');

  const filtered = useMemo(() => {
    const base = filter === 'all' ? items : items.filter((i) => i.kind === filter);
    return [...base].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [items, filter]);

  const groups = useMemo(() => groupByDay(filtered), [filtered]);

  return (
    <section className="card">
      <h2 className="card__title">Timeline</h2>
      <p className="muted small">A chronological feed of every interaction. Useful for performance reviews and growth conversations.</p>

      <div className="timeline__filters" role="tablist" aria-label="Timeline filters">
        {TIMELINE_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            className={`timeline__filter${filter === f.value ? ' timeline__filter--active' : ''}`}
            title={f.label}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {groups.length === 0 ? (
        <div className="timeline__empty">No matching entries.</div>
      ) : (
        <div className="timeline">
          {groups.map((g) => (
            <div className="timeline__group" key={g.key}>
              <p className="timeline__date">{g.label}</p>
              {g.items.map((it) => (
                <article className="timeline__entry" key={it.id} data-kind={it.kind}>
                  <div className="timeline__head">
                    <span className="timeline__title">{it.title || '(untitled)'}</span>
                    <span className="pill">{kindLabel(it.kind)}</span>
                    {it.done ? <span className="pill pill--ok">done</span> : null}
                    {it.kind === 'goal' ? <span className="pill">{goalStatusLabel(it.goalStatus)}</span> : null}
                    {it.kind === 'feedback' ? (
                      <span className={`pill pill--${feedbackTone(it.feedbackKind)}`}>
                        {feedbackLabel(it.feedbackKind)}
                      </span>
                    ) : null}
                    {it.category ? <span className="pill">{it.category}</span> : null}
                  </div>
                  <div className="timeline__meta">
                    Updated {formatShort(it.updatedAt)}
                    {it.dueAt ? ` · due ${formatShort(it.dueAt)}` : ''}
                  </div>
                  {it.body ? (
                    <div className="timeline__body">
                      <MarkdownView value={it.body} />
                    </div>
                  ) : null}
                  {it.kind === 'document' && it.url ? (
                    <div className="timeline__body">
                      {isSafeRichTextPreviewHref(it.url) ? (
                        <a href={it.url} target="_blank" rel="noreferrer">
                          {it.url}
                        </a>
                      ) : (
                        <span>{it.url}</span>
                      )}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function groupByDay(items: Item[]): { key: string; label: string; items: Item[] }[] {
  const map = new Map<string, Item[]>();
  for (const it of items) {
    const d = new Date(it.updatedAt);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(it);
  }
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
  return Array.from(map.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, list]) => ({
      key,
      label: key === todayKey ? 'Today' : key === yKey ? 'Yesterday' : friendlyDay(key),
      items: list,
    }));
}

function friendlyDay(key: string): string {
  const [y, m, d] = key.split('-').map((n) => parseInt(n, 10));
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

/* ============================================================
   1:1 Mode
   - Persistent agenda (markdown) on the person record
   - "Archive meeting" turns the agenda into a dated note item
     and starts a fresh agenda with carry-over checkboxes
   ============================================================ */

function PersonMeetingMode({
  person,
  items,
  addItem,
  updatePerson,
}: {
  person: Person;
  items: Item[];
  addItem: ReturnType<typeof useAppData>['addItem'];
  updatePerson: ReturnType<typeof useAppData>['updatePerson'];
}) {
  const [agenda, setAgenda] = useState<string>(person.agenda ?? defaultAgenda());
  const agendaDirty = agenda !== (person.agenda ?? defaultAgenda());
  const agendaRef = useRef(agenda);
  const agendaDirtyRef = useRef(agendaDirty);
  agendaRef.current = agenda;
  agendaDirtyRef.current = agendaDirty;

  useEffect(() => {
    setAgenda(person.agenda ?? defaultAgenda());
  }, [person.id]);

  useEffect(() => {
    if (!agendaDirty) {
      setAgenda(person.agenda ?? defaultAgenda());
    }
  }, [person.agenda, agendaDirty]);

  useEffect(() => {
    if (!agendaDirty) return;
    const personId = person.id;
    const timer = window.setTimeout(() => {
      updatePerson(personId, { agenda });
    }, 800);
    return () => clearTimeout(timer);
  }, [person.id, agenda, agendaDirty, updatePerson]);

  useEffect(() => {
    const personId = person.id;
    return () => {
      if (agendaDirtyRef.current) {
        updatePerson(personId, { agenda: agendaRef.current });
      }
    };
  }, [person.id, updatePerson]);

  useEffect(() => {
    const onBeforeSync = () => {
      if (agendaDirty) {
        updatePerson(person.id, { agenda });
      }
    };
    window.addEventListener(SYNC_BEFORE_APPLY, onBeforeSync);
    return () => {
      window.removeEventListener(SYNC_BEFORE_APPLY, onBeforeSync);
      onBeforeSync();
    };
  }, [person.id, agenda, agendaDirty, updatePerson]);

  const meetings = useMemo(
    () =>
      items
        .filter((i) => i.kind === 'note' && i.category === '1:1')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [items],
  );

  function save() {
    updatePerson(person.id, { agenda });
  }

  function archive() {
    if (!agenda.trim()) return;
    const today = new Date();
    const title = `1:1 · ${today.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;
    addItem(person.id, 'note', { title, body: agenda, category: '1:1' });
    const carryOver = extractCarryOver(agenda);
    const next = `${defaultAgenda()}${carryOver ? `\n\n## Carry-over from last meeting\n${carryOver}` : ''}`;
    setAgenda(next);
    updatePerson(person.id, { agenda: next });
  }

  return (
    <>
      <section className="card">
        <h2 className="card__title">Current 1:1 agenda</h2>
        <p className="muted small">
          A persistent agenda for your next 1:1. Use `- [ ]` for action items — unchecked ones carry over when you
          archive the meeting.
        </p>
        <MarkdownEditor
          value={agenda}
          onChange={setAgenda}
          onBlur={() => agendaDirty && updatePerson(person.id, { agenda })}
          placeholder="Plan your next 1:1…"
          rows={14}
        />
        <div className="row" style={{ marginTop: 10 }}>
          <Button type="button" variant="secondary" icon={<IcSave size={17} />} onClick={save}>
            Save agenda
          </Button>
          <Button type="button" variant="primary" icon={<IcCheck size={17} />} onClick={archive}>
            Archive meeting
          </Button>
        </div>
      </section>

      <section className="card">
        <h2 className="card__title">Past meetings <span className="pill">{meetings.length}</span></h2>
        {meetings.length === 0 ? (
          <p className="muted">No archived meetings yet.</p>
        ) : (
          <ul className="list">
            {meetings.map((m) => (
              <li key={m.id} className="list__block">
                <div className="list__title">{m.title}</div>
                <div className="muted small">Archived {formatShort(m.createdAt)}</div>
                {m.body ? (
                  <div className="list__body-preview">
                    <MarkdownView value={m.body} />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function defaultAgenda(): string {
  return [
    '## Wins',
    '- ',
    '',
    '## Blockers',
    '- ',
    '',
    '## Action items',
    '- [ ] ',
    '',
    '## Notes',
    '',
  ].join('\n');
}

function extractCarryOver(agenda: string): string {
  // Pull lines that are unchecked checklist items.
  const lines = agenda.split('\n');
  const open = lines.filter((l) => /^\s*-\s*\[\s\]\s*\S/.test(l));
  return open.join('\n').trim();
}

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
  IcFileText,
  IcHelpCircle,
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
import { useAccount } from '../AccountContext';
import { AutoResizeTextarea } from '../components/ui/AutoResizeTextarea';
import { Button } from '../components/ui/Button';
import { useConfirm } from '../components/ui/ConfirmProvider';
import { SchedulePopover } from '../components/ui/SchedulePopover';
import { OneOnOneHelpDialog } from '../features/people/OneOnOneHelpDialog';
import { isAIConfigured } from '../lib/ai';
import { useFeatures } from '../lib/features';
import {
  carryOverHeading,
  defaultAgenda,
  extractCarryOver,
  readOneOnOneLang,
  writeOneOnOneLang,
  type OneOnOneLang,
} from '../lib/people/oneOnOneAgenda';
import { useAppData, useAppDataActions, useAppDataSelector } from '../AppDataContext';
import { distinctCategoriesForTeam, SUGGESTED_CATEGORIES } from '../lib/categories';
import { schedulePatchToItemPatch } from '../features/people/schedulePatch';
import { registerBeforeFlushHook } from '../lib/pendingSaveFlush';
import { useItemFocus } from '../features/people/useItemFocus';
import { fromLocalDatetimeValue, formatDateShort, formatShort, formatTimeOnly, isPast, toLocalDatetimeValue } from '../lib/datetime';
import { kindLabel } from '../lib/labels';
import {
  appendPlainTextToBodyFields,
  plainTextFromBodyFields,
  richBodyFieldsFromPayload,
  type RichTextBodyFields,
} from '../lib/richTextBody';
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

const RichTextEditor = lazy(() =>
  import('../components/ui/RichTextEditor').then((m) => ({ default: m.RichTextEditor })),
);

function emptyRichFields(): RichTextBodyFields {
  return { body: '', bodyFormat: undefined, bodyPlainText: undefined };
}

function richFieldsEqual(a: RichTextBodyFields, b: RichTextBodyFields): boolean {
  return (
    (a.body ?? '') === (b.body ?? '') &&
    (a.bodyFormat ?? undefined) === (b.bodyFormat ?? undefined) &&
    (a.bodyPlainText ?? undefined) === (b.bodyPlainText ?? undefined)
  );
}

function personScratchpadFields(person: Person): RichTextBodyFields {
  return {
    body: person.scratchpad ?? '',
    bodyFormat: person.scratchpadFormat,
    bodyPlainText: person.scratchpadPlainText,
  };
}

function personAgendaFields(person: Person): RichTextBodyFields {
  return {
    body: person.agenda ?? '',
    bodyFormat: person.agendaFormat,
    bodyPlainText: person.agendaPlainText,
  };
}

function scratchpadPatchFromFields(
  fields: RichTextBodyFields,
): Pick<Person, 'scratchpad' | 'scratchpadFormat' | 'scratchpadPlainText'> {
  return {
    scratchpad: fields.body,
    scratchpadFormat: fields.bodyFormat,
    scratchpadPlainText: fields.bodyPlainText,
  };
}

function agendaPatchFromFields(
  fields: RichTextBodyFields,
): Pick<Person, 'agenda' | 'agendaFormat' | 'agendaPlainText'> {
  return {
    agenda: fields.body,
    agendaFormat: fields.bodyFormat,
    agendaPlainText: fields.bodyPlainText,
  };
}

function itemBodyPatchFromFields(
  fields: RichTextBodyFields,
): Pick<Item, 'body' | 'bodyFormat' | 'bodyPlainText'> {
  return {
    body: fields.body,
    bodyFormat: fields.bodyFormat,
    bodyPlainText: fields.bodyPlainText,
  };
}

function itemHasRichBody(item: Pick<Item, 'body' | 'bodyFormat' | 'bodyPlainText'>): boolean {
  return !!plainTextFromBodyFields(item).trim() || !!(item.bodyFormat === 'prosemirror' && item.body?.trim());
}

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
 * Buffers item-body rich text locally and flushes on blur / unmount / sync.
 * Same TipTap editor as Notes and Todos.
 */
function ItemBodyField({
  initial,
  itemId,
  attachmentUserId,
  onCommit,
}: {
  initial: RichTextBodyFields;
  itemId: string;
  attachmentUserId: string;
  onCommit: (next: RichTextBodyFields) => void;
}) {
  const [fields, setFields] = useState(initial);
  const lastCommitted = useRef(initial);
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  const applyFields = useCallback((next: RichTextBodyFields) => {
    // Sync ref before setState so unmount flush (after child editor flush) sees
    // the latest payload — setState alone would leave fieldsRef stale until render.
    fieldsRef.current = next;
    setFields(next);
  }, []);

  const commitPending = useCallback(() => {
    if (!richFieldsEqual(fieldsRef.current, lastCommitted.current)) {
      onCommitRef.current(fieldsRef.current);
      lastCommitted.current = fieldsRef.current;
    }
  }, []);

  useEffect(() => {
    if (!richFieldsEqual(initial, lastCommitted.current) && richFieldsEqual(fields, lastCommitted.current)) {
      fieldsRef.current = initial;
      setFields(initial);
      lastCommitted.current = initial;
    }
  }, [initial, fields]);

  useEffect(() => registerBeforeFlushHook(() => commitPending()), [commitPending]);

  useEffect(() => {
    const onBeforeSync = () => commitPending();
    window.addEventListener(SYNC_BEFORE_APPLY, onBeforeSync);
    return () => {
      window.removeEventListener(SYNC_BEFORE_APPLY, onBeforeSync);
      commitPending();
    };
  }, [commitPending]);

  return (
    <Suspense fallback={<div className="muted small">Loading editor…</div>}>
      <RichTextEditor
        value={fields.body}
        valueFormat={fields.bodyFormat ?? 'auto'}
        onChange={(payload) => applyFields(richBodyFieldsFromPayload(payload))}
        onBlur={commitPending}
        placeholder="Write details — paste screenshots with ⌘V, add tables, dates…"
        minHeight={160}
        attachmentScope={{ documentKind: 'item', documentId: itemId }}
        attachmentUserId={attachmentUserId}
      />
    </Suspense>
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
  const { user } = useAccount();
  const attachmentUserId = user?.id ?? 'anonymous';
  const { data, updatePerson, addItem, updateItem, toggleItemDone, removeItem } = useAppData();
  const person = data.people.find((p) => p.id === personId);
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [scratchpad, setScratchpad] = useState<RichTextBodyFields>(emptyRichFields);
  const [openId, setOpenId] = useState<string | null>(null);
  const [tab, setTab] = useState<WorkspaceTab>('workspace');

  const items = useMemo(() => data.items.filter((i) => i.personId === personId), [data.items, personId]);

  useItemFocus(location.search, location.pathname, navigate, items, setOpenId, setTab);

  const categoryHints = useMemo(() => {
    if (!teamId) return [...SUGGESTED_CATEGORIES];
    return [...new Set([...SUGGESTED_CATEGORIES, ...distinctCategoriesForTeam(data, teamId)])];
  }, [data, teamId]);

  const scratchpadDirty = person ? !richFieldsEqual(scratchpad, personScratchpadFields(person)) : false;
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

  /** Keep refs in lockstep with editor onChange (before React re-renders). */
  const applyScratchpad = useCallback((next: RichTextBodyFields) => {
    scratchpadRef.current = next;
    scratchpadDirtyRef.current = true;
    setScratchpad(next);
  }, []);

  const flushPersonLocal = useCallback(() => {
    const pid = person?.id;
    if (!pid) return;
    if (profileDirtyRef.current) {
      updatePerson(pid, {
        name: nameRef.current.trim() || 'Unnamed',
        title: titleRef.current,
        ...scratchpadPatchFromFields(scratchpadRef.current),
      });
      profileDirtyRef.current = false;
      scratchpadDirtyRef.current = false;
    } else if (scratchpadDirtyRef.current) {
      updatePerson(pid, scratchpadPatchFromFields(scratchpadRef.current));
      scratchpadDirtyRef.current = false;
    }
  }, [person?.id, updatePerson]);

  useEffect(() => registerBeforeFlushHook(() => flushPersonLocal()), [flushPersonLocal]);

  useEffect(() => {
    if (!person) {
      setName('');
      setTitle('');
      setScratchpad(emptyRichFields());
      return;
    }
    setName(person.name);
    setTitle(person.title ?? '');
    setScratchpad(personScratchpadFields(person));
  }, [person?.id]);

  useEffect(() => {
    if (!person) return;
    if (!profileDirty) {
      setName(person.name);
      setTitle(person.title ?? '');
    }
    if (!scratchpadDirty) {
      setScratchpad(personScratchpadFields(person));
    }
  }, [
    person?.name,
    person?.title,
    person?.scratchpad,
    person?.scratchpadFormat,
    person?.scratchpadPlainText,
    profileDirty,
    scratchpadDirty,
    person,
  ]);

  useEffect(() => {
    if (!person || !scratchpadDirty) return;
    const pid = person.id;
    const timer = window.setTimeout(() => {
      updatePerson(pid, scratchpadPatchFromFields(scratchpadRef.current));
      scratchpadDirtyRef.current = false;
    }, 800);
    return () => clearTimeout(timer);
  }, [person?.id, scratchpad, scratchpadDirty, updatePerson]);

  useEffect(() => {
    const pid = person?.id;
    return () => {
      if (!pid) return;
      if (profileDirtyRef.current) {
        updatePerson(pid, {
          name: nameRef.current.trim() || 'Unnamed',
          title: titleRef.current,
          ...scratchpadPatchFromFields(scratchpadRef.current),
        });
      } else if (scratchpadDirtyRef.current) {
        updatePerson(pid, scratchpadPatchFromFields(scratchpadRef.current));
      }
    };
  }, [person?.id, updatePerson]);

  useEffect(() => {
    const onBeforeSync = () => flushPersonLocal();
    window.addEventListener(SYNC_BEFORE_APPLY, onBeforeSync);
    return () => {
      window.removeEventListener(SYNC_BEFORE_APPLY, onBeforeSync);
      onBeforeSync();
    };
  }, [flushPersonLocal]);

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
        <PersonTimeline items={items} attachmentUserId={attachmentUserId} />
      ) : tab === 'meeting' ? (
        <PersonMeetingMode
          person={person}
          items={items}
          addItem={addItem}
          updatePerson={updatePerson}
          attachmentUserId={attachmentUserId}
        />
      ) : (
        <PersonWorkspaceTabContent
          person={person}
          name={name}
          setName={setName}
          title={title}
          setTitle={setTitle}
          scratchpad={scratchpad}
          setScratchpad={applyScratchpad}
          flushScratchpad={flushPersonLocal}
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
          attachmentUserId={attachmentUserId}
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
  scratchpad: RichTextBodyFields;
  setScratchpad: (v: RichTextBodyFields) => void;
  flushScratchpad: () => void;
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
  attachmentUserId: string;
}) {
  const {
    person,
    name,
    setName,
    title,
    setTitle,
    scratchpad,
    setScratchpad,
    flushScratchpad,
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
    attachmentUserId,
  } = props;
  const [profileOpen, setProfileOpen] = useState(false);
  const scratchPreview = plainTextFromBodyFields(scratchpad);
  const [scratchOpen, setScratchOpen] = useState(() => !!scratchPreview.trim());
  const scratchpadDirty = !richFieldsEqual(scratchpad, personScratchpadFields(person));

  useEffect(() => {
    setProfileOpen(false);
    setScratchOpen(!!plainTextFromBodyFields(personScratchpadFields(person)).trim());
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
                  ...scratchpadPatchFromFields(scratchpad),
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
            {scratchPreview.trim() ? <span className="pill">notes</span> : null}
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
            {scratchPreview.trim()
              ? scratchPreview.trim().split('\n')[0]!.slice(0, 120) +
                (scratchPreview.trim().length > 120 ? '…' : '')
              : 'Quick notes and talking points — expands when you need them.'}
          </p>
        ) : (
          <>
            <p className="muted small person-card__hint">Autosaves as you type.</p>
            <Suspense fallback={<div className="muted small">Loading editor…</div>}>
              <RichTextEditor
                value={scratchpad.body}
                valueFormat={scratchpad.bodyFormat ?? 'auto'}
                onChange={(payload) => setScratchpad(richBodyFieldsFromPayload(payload))}
                onBlur={flushScratchpad}
                placeholder="Talking points, drafts, reminders…"
                minHeight={140}
                attachmentScope={{ documentKind: 'person', documentId: `${person.id}-scratchpad` }}
                attachmentUserId={attachmentUserId}
              />
            </Suspense>
            {scratchpadDirty ? (
              <div className="row" style={{ marginTop: 8 }}>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  icon={<IcSave size={15} />}
                  onClick={flushScratchpad}
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
        attachmentUserId={attachmentUserId}
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
        attachmentUserId={attachmentUserId}
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
        attachmentUserId={attachmentUserId}
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
        attachmentUserId={attachmentUserId}
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
        attachmentUserId={attachmentUserId}
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
  attachmentUserId,
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
        | 'title'
        | 'body'
        | 'bodyFormat'
        | 'bodyPlainText'
        | 'dueAt'
        | 'startAt'
        | 'remindAt'
        | 'remindRepeat'
        | 'url'
        | 'category'
        | 'goalStatus'
        | 'feedbackKind'
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
        | 'bodyFormat'
        | 'bodyPlainText'
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
  attachmentUserId: string;
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
                    <span>Content</span>
                    <ItemBodyField
                      key={`b-${it.id}-${it.updatedAt}`}
                      initial={{
                        body: it.body,
                        bodyFormat: it.bodyFormat,
                        bodyPlainText: it.bodyPlainText,
                      }}
                      itemId={it.id}
                      attachmentUserId={attachmentUserId}
                      onCommit={(v) => onUpdate(it.id, itemBodyPatchFromFields(v))}
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
              ) : itemHasRichBody(it) ? (
                <div className="list__body-preview">
                  <Suspense fallback={<div className="muted small">Loading preview…</div>}>
                    <RichTextEditor
                      value={it.body}
                      valueFormat={it.bodyFormat ?? 'auto'}
                      editable={false}
                      toolbar={false}
                      minHeight={72}
                      attachmentScope={{ documentKind: 'item', documentId: it.id }}
                      attachmentUserId={attachmentUserId}
                    />
                  </Suspense>
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
            task={{
              title: aiTarget.title,
              body: plainTextFromBodyFields(aiTarget) || undefined,
            }}
            onAppendToBody={(markdown) => {
              const t = aiTarget;
              const next = appendPlainTextToBodyFields(
                {
                  body: t.body,
                  bodyFormat: t.bodyFormat,
                  bodyPlainText: t.bodyPlainText,
                },
                markdown,
              );
              onUpdate(t.id, itemBodyPatchFromFields(next));
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

function PersonTimeline({
  items,
  attachmentUserId,
}: {
  items: Item[];
  attachmentUserId: string;
}) {
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
                  {itemHasRichBody(it) ? (
                    <div className="timeline__body">
                      <Suspense fallback={<div className="muted small">Loading preview…</div>}>
                        <RichTextEditor
                          value={it.body}
                          valueFormat={it.bodyFormat ?? 'auto'}
                          editable={false}
                          toolbar={false}
                          minHeight={72}
                          attachmentScope={{ documentKind: 'item', documentId: it.id }}
                          attachmentUserId={attachmentUserId}
                        />
                      </Suspense>
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
   - Persistent agenda (rich text / legacy markdown) on the person record
   - "Archive meeting" turns the agenda into a dated note item
     and starts a fresh agenda with carry-over checkboxes
   ============================================================ */

function PersonMeetingMode({
  person,
  items,
  addItem,
  updatePerson,
  attachmentUserId,
}: {
  person: Person;
  items: Item[];
  addItem: ReturnType<typeof useAppData>['addItem'];
  updatePerson: ReturnType<typeof useAppData>['updatePerson'];
  attachmentUserId: string;
}) {
  const { confirm } = useConfirm();
  const [lang, setLang] = useState<OneOnOneLang>(() => readOneOnOneLang());
  const [helpOpen, setHelpOpen] = useState(false);
  // Empty is intentional — do not auto-seed a template into AppData.
  const [agenda, setAgenda] = useState<RichTextBodyFields>(() => personAgendaFields(person));
  const agendaDirty = !richFieldsEqual(agenda, personAgendaFields(person));
  const agendaRef = useRef(agenda);
  const agendaDirtyRef = useRef(agendaDirty);
  agendaRef.current = agenda;
  agendaDirtyRef.current = agendaDirty;

  const applyAgenda = useCallback((next: RichTextBodyFields) => {
    // Sync refs before setState so leave/unmount flush sees the latest editor
    // payload (child RichTextEditor flushes into onChange, then parent cleanup runs).
    agendaRef.current = next;
    agendaDirtyRef.current = true;
    setAgenda(next);
  }, []);

  const flushAgenda = useCallback(() => {
    if (!agendaDirtyRef.current) return;
    updatePerson(person.id, agendaPatchFromFields(agendaRef.current));
    agendaDirtyRef.current = false;
  }, [person.id, updatePerson]);

  useEffect(() => registerBeforeFlushHook(() => flushAgenda()), [flushAgenda]);

  useEffect(() => {
    const next = personAgendaFields(person);
    agendaRef.current = next;
    setAgenda(next);
  }, [person.id]);

  useEffect(() => {
    if (!agendaDirty) {
      const next = personAgendaFields(person);
      agendaRef.current = next;
      setAgenda(next);
    }
  }, [person.agenda, person.agendaFormat, person.agendaPlainText, agendaDirty, person]);

  useEffect(() => {
    if (!agendaDirty) return;
    const personId = person.id;
    const timer = window.setTimeout(() => {
      updatePerson(personId, agendaPatchFromFields(agendaRef.current));
      agendaDirtyRef.current = false;
    }, 800);
    return () => clearTimeout(timer);
  }, [person.id, agenda, agendaDirty, updatePerson]);

  useEffect(() => {
    const personId = person.id;
    return () => {
      if (agendaDirtyRef.current) {
        updatePerson(personId, agendaPatchFromFields(agendaRef.current));
      }
    };
  }, [person.id, updatePerson]);

  useEffect(() => {
    const onBeforeSync = () => flushAgenda();
    window.addEventListener(SYNC_BEFORE_APPLY, onBeforeSync);
    return () => {
      window.removeEventListener(SYNC_BEFORE_APPLY, onBeforeSync);
      onBeforeSync();
    };
  }, [flushAgenda]);

  const meetings = useMemo(
    () =>
      items
        .filter((i) => i.kind === 'note' && i.category === '1:1')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [items],
  );

  function save() {
    flushAgenda();
  }

  function changeLang(next: OneOnOneLang) {
    writeOneOnOneLang(next);
    setLang(next);
  }

  async function insertTemplate() {
    const nextBody = defaultAgenda(person.name, lang);
    const nextFields: RichTextBodyFields = {
      body: nextBody,
      bodyFormat: 'markdown',
      bodyPlainText: nextBody,
    };
    if (plainTextFromBodyFields(agendaRef.current).trim()) {
      const ok = await confirm({
        title: lang === 'tr' ? 'Şablonu uygula?' : 'Apply starter template?',
        description:
          lang === 'tr'
            ? 'Mevcut gündem metninin üzerine yazılır. Arşivlenmemiş içerik kaybolur.'
            : 'This replaces the current agenda text. Unarchived content will be lost.',
        confirmLabel: lang === 'tr' ? 'Şablonu uygula' : 'Apply template',
        danger: true,
      });
      if (!ok) return;
    }
    applyAgenda(nextFields);
    updatePerson(person.id, agendaPatchFromFields(nextFields));
    agendaDirtyRef.current = false;
  }

  function archive() {
    const current = agendaRef.current;
    const currentPlain = plainTextFromBodyFields(current);
    // Empty PM docs still serialize to a short JSON string — gate on plain text only.
    if (!currentPlain.trim()) return;
    const today = new Date();
    const title = `1:1 · ${today.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;
    addItem(person.id, 'note', {
      title,
      body: current.body,
      bodyFormat: current.bodyFormat,
      bodyPlainText: current.bodyPlainText,
      category: '1:1',
    });
    const carryOver = extractCarryOver(current.body, current.bodyFormat);
    const fresh = defaultAgenda(person.name, lang);
    const nextBody = `${fresh}${carryOver ? `\n\n${carryOverHeading(lang)}\n${carryOver}` : ''}`;
    const nextFields: RichTextBodyFields = {
      body: nextBody,
      bodyFormat: 'markdown',
      bodyPlainText: nextBody,
    };
    applyAgenda(nextFields);
    updatePerson(person.id, agendaPatchFromFields(nextFields));
    agendaDirtyRef.current = false;
  }

  return (
    <>
      <section className="card">
        <div className="one-on-one-agenda__head">
          <h2 className="card__title">Current 1:1 agenda</h2>
          <div className="one-on-one-agenda__head-actions">
            <div className="one-on-one-agenda__lang" role="group" aria-label="Template language">
              <button
                type="button"
                className={`one-on-one-agenda__lang-btn${lang === 'en' ? ' is-active' : ''}`}
                aria-pressed={lang === 'en'}
                onClick={() => changeLang('en')}
              >
                EN
              </button>
              <button
                type="button"
                className={`one-on-one-agenda__lang-btn${lang === 'tr' ? ' is-active' : ''}`}
                aria-pressed={lang === 'tr'}
                onClick={() => changeLang('tr')}
              >
                TR
              </button>
            </div>
            <Button
              type="button"
              variant="ghost"
              icon={<IcHelpCircle size={17} />}
              onClick={() => setHelpOpen(true)}
              aria-label={lang === 'tr' ? '1:1 çalışma çerçevesi' : '1:1 way of working'}
              title={lang === 'tr' ? '1:1 çalışma çerçevesi' : '1:1 way of working'}
            >
              {lang === 'tr' ? 'Rehber' : 'Guide'}
            </Button>
          </div>
        </div>
        <p className="muted small">
          {lang === 'tr'
            ? 'Bir sonraki 1:1 için ortak gündem. Aksiyonlar için görev listesi kullanın — arşivde işaretlenmeyenler taşınır.'
            : 'Shared agenda for the next 1:1. Use task checkboxes for actions — unchecked items carry over when you archive.'}
        </p>
        <p className="muted small person-card__hint">
          {lang === 'tr'
            ? 'Yazarken otomatik kaydedilir; başka sekmeye veya sayfaya geçseniz de korunur.'
            : 'Autosaves as you type — safe to switch tabs or leave this screen.'}
        </p>
        <div className="one-on-one-agenda__editor">
          <Suspense fallback={<div className="muted small">Loading editor…</div>}>
            <RichTextEditor
              value={agenda.body}
              valueFormat={agenda.bodyFormat ?? 'auto'}
              onChange={(payload) => applyAgenda(richBodyFieldsFromPayload(payload))}
              onBlur={flushAgenda}
              placeholder={
                lang === 'tr'
                  ? 'Gündemi yazın veya “Şablon uygula” ile başlayın…'
                  : 'Write the agenda, or apply the starter template…'
              }
              minHeight={280}
              attachmentScope={{ documentKind: 'person', documentId: `${person.id}-agenda` }}
              attachmentUserId={attachmentUserId}
            />
          </Suspense>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <Button type="button" variant="secondary" icon={<IcFileText size={17} />} onClick={() => void insertTemplate()}>
            {lang === 'tr' ? 'Şablon uygula' : 'Apply template'}
          </Button>
          <Button type="button" variant="secondary" icon={<IcSave size={17} />} onClick={save}>
            {lang === 'tr' ? 'Kaydet' : 'Save'}
          </Button>
          <Button type="button" variant="primary" icon={<IcCheck size={17} />} onClick={archive}>
            {lang === 'tr' ? 'Arşivle' : 'Archive'}
          </Button>
        </div>
      </section>

      <section className="card">
        <h2 className="card__title">
          {lang === 'tr' ? 'Geçmiş toplantılar' : 'Past meetings'}{' '}
          <span className="pill">{meetings.length}</span>
        </h2>
        {meetings.length === 0 ? (
          <p className="muted">{lang === 'tr' ? 'Henüz arşivlenmiş toplantı yok.' : 'No archived meetings yet.'}</p>
        ) : (
          <ul className="list">
            {meetings.map((m) => (
              <li key={m.id} className="list__block">
                <div className="list__title">{m.title}</div>
                <div className="muted small">
                  {lang === 'tr' ? 'Arşiv' : 'Archived'} {formatShort(m.createdAt)}
                </div>
                {itemHasRichBody(m) ? (
                  <div className="list__body-preview">
                    <Suspense fallback={<div className="muted small">Loading preview…</div>}>
                      <RichTextEditor
                        value={m.body}
                        valueFormat={m.bodyFormat ?? 'auto'}
                        editable={false}
                        toolbar={false}
                        minHeight={72}
                        attachmentScope={{ documentKind: 'item', documentId: m.id }}
                        attachmentUserId={attachmentUserId}
                      />
                    </Suspense>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {helpOpen ? (
        <OneOnOneHelpDialog lang={lang} onLangChange={changeLang} onClose={() => setHelpOpen(false)} />
      ) : null}
    </>
  );
}


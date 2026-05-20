import { FormEvent, lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { IcArrowRight, IcCheck, IcPencil, IcPlus, IcSave, IcSparkles, IcTrash, IcUndo, IcX } from '../components/icons';
// Lazy-loaded: only fetched the first time the user clicks "Ask AI" on a note.
const AIAssistantDialog = lazy(() =>
  import('../components/AIAssistantDialog').then((m) => ({ default: m.AIAssistantDialog })),
);
import { AutoResizeTextarea } from '../components/ui/AutoResizeTextarea';
import { Button } from '../components/ui/Button';
import { MarkdownEditor, MarkdownView } from '../components/ui/MarkdownEditor';
import { isAIConfigured } from '../lib/ai';
import { useFeatures } from '../lib/features';
import { useAppData } from '../AppDataContext';
import { distinctCategoriesForTeam, SUGGESTED_CATEGORIES } from '../lib/categories';
import { fromLocalDatetimeValue, formatShort, isPast, toLocalDatetimeValue } from '../lib/datetime';
import { kindLabel } from '../lib/labels';
import { teamLeader, teamMe, teamPeople as teamPeoplePath } from '../lib/teamPaths';
import { PATH_TEAMS } from '../lib/routes';
import type { FeedbackKind, GoalStatus, Item, ItemKind, Person, ReminderRepeat } from '../model';
import {
  FEEDBACK_KIND_OPTIONS,
  GOAL_STATUS_OPTIONS,
  REMIND_REPEAT_OPTIONS,
  getLeaderPerson,
  getSelfPerson,
  isLeaderPerson,
  isSelfPerson,
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

/**
 * Buffers item-body markdown locally and flushes on blur or when the user
 * switches to preview mode. Avoids one persist round-trip per keystroke
 * while still preserving cursor position.
 */
function ItemBodyField({ initial, onCommit }: { initial: string; onCommit: (next: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <MarkdownEditor
      value={value}
      onChange={setValue}
      onBlur={() => {
        if (value !== initial) onCommit(value);
      }}
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

export function People() {
  const { teamId } = useParams();
  const { data, addPerson, removePerson } = useAppData();
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');

  const team = teamId ? data.teams.find((t) => t.id === teamId) : undefined;
  const self = teamId ? getSelfPerson(data, teamId) : undefined;
  const members = useMemo(() => (teamId ? teamPeople(data, teamId) : []), [data, teamId]);

  if (!teamId || !team) return <Navigate to={PATH_TEAMS} replace />;

  return (
    <div className="page page--wide">
      <header className="page-head">
        <h1>Team members · {team.name}</h1>
        <p className="muted">Each person has their own workspace with tasks, goals, structured notes and a free-form scratchpad.</p>
      </header>

      <section className="card">
        <h2 className="card__title">Me</h2>
        <p className="muted small">Your personal workspace in this team. A separate &quot;Me&quot; record is created automatically for every team.</p>
        {self ? (
          <Link
            className="btn btn--primary btn--icon"
            to={teamMe(teamId)}
            title="Open Me workspace"
            aria-label="Open Me workspace"
          >
            <span className="btn__icon">
              <IcArrowRight size={17} />
            </span>
          </Link>
        ) : (
          <p className="muted">The Me record could not be found (data repair required).</p>
        )}
      </section>

      <section className="card">
        <h2 className="card__title">My leader</h2>
        <p className="muted small">
          A dedicated space for your manager: goals, feedback, talking points and notes. Keep it separate from team members and tag entries with categories.
        </p>
        <Link
          className="btn btn--primary btn--icon"
          to={teamLeader(teamId)}
          title="Open My leader workspace"
          aria-label="Open My leader workspace"
        >
          <span className="btn__icon">
            <IcArrowRight size={17} />
          </span>
        </Link>
      </section>

      <section className="card">
        <h2 className="card__title">Add person</h2>
        <form
          className="row"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (!name.trim()) return;
            addPerson(teamId, name.trim(), title.trim() || undefined);
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

      <section className="card">
        <h2 className="card__title">People</h2>
        {members.length === 0 ? (
          <p className="muted">No team members yet.</p>
        ) : (
          <div className="tiles">
            {members.map((p) => (
              <div key={p.id} className="tile">
                <Link to={`${teamPeoplePath(teamId)}/${p.id}`} className="tile__link">
                  <div className="tile__name">{p.name}</div>
                  {p.title ? <div className="muted small">{p.title}</div> : <div className="muted small">Open workspace</div>}
                </Link>
                <Button type="button" variant="danger" size="sm" icon={<IcTrash size={16} />} onClick={() => removePerson(p.id)}>
                  Remove
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export function PersonRoute() {
  const { personId, teamId } = useParams();
  const { data } = useAppData();
  if (!teamId || !personId) return <Navigate to={PATH_TEAMS} replace />;
  const p = data.people.find((x) => x.id === personId);
  if (!p || p.teamId !== teamId) return <Navigate to={teamPeoplePath(teamId)} replace />;
  if (isSelfPerson(p)) return <Navigate to={teamMe(teamId)} replace />;
  if (isLeaderPerson(p)) return <Navigate to={teamLeader(teamId)} replace />;
  return <PersonWorkspace personId={personId} />;
}

type WorkspaceTab = 'workspace' | 'timeline' | 'meeting';

export function PersonWorkspace({ personId }: { personId: string }) {
  const { teamId } = useParams();
  const { data, updatePerson, addItem, updateItem, toggleItemDone, removeItem } = useAppData();
  const person = data.people.find((p) => p.id === personId);
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [scratchpad, setScratchpad] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [tab, setTab] = useState<WorkspaceTab>('workspace');

  const items = useMemo(() => data.items.filter((i) => i.personId === personId), [data.items, personId]);

  const categoryHints = useMemo(() => {
    if (!teamId) return [...SUGGESTED_CATEGORIES];
    return [...new Set([...SUGGESTED_CATEGORIES, ...distinctCategoriesForTeam(data, teamId)])];
  }, [data, teamId]);

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
  }, [person?.id, person?.name, person?.title, person?.scratchpad]);

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

  return (
    <div className="page page--wide">
      <header className="page-head">
        <div className="row row--between">
          <div>
            <h1>{person.name}</h1>
            <p className="muted">
              {isLeader
                ? 'Your relationship with your manager: expectations, goals, talking points and initiative tracking — all in one place.'
                : isSelf
                  ? 'Your personal leadership space for this team: tasks, notes, goals and links. Use optional categories to separate initiatives.'
                  : 'Keep every follow-up about this person in one place.'}
            </p>
          </div>
          <Link className="btn btn--ghost" to={teamPeoplePath(teamId)}>
            Team members
          </Link>
        </div>
        <nav className="tabs" role="tablist" aria-label="Person workspace tabs">
          <button
            type="button"
            className={`tabs__tab${tab === 'workspace' ? ' tabs__tab--active' : ''}`}
            role="tab"
            aria-selected={tab === 'workspace'}
            onClick={() => setTab('workspace')}
          >
            Workspace
          </button>
          <button
            type="button"
            className={`tabs__tab${tab === 'timeline' ? ' tabs__tab--active' : ''}`}
            role="tab"
            aria-selected={tab === 'timeline'}
            onClick={() => setTab('timeline')}
          >
            Timeline
          </button>
          <button
            type="button"
            className={`tabs__tab${tab === 'meeting' ? ' tabs__tab--active' : ''}`}
            role="tab"
            aria-selected={tab === 'meeting'}
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
  return (
    <>
      <section className="card">
        <h2 className="card__title">Profile</h2>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (!person) return;
            updatePerson(person.id, {
              name: name.trim() || person.name,
              title,
              scratchpad,
            });
          }}
        >
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
          <input
            className="input input--grow"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Role / note"
          />
          <Button type="submit" variant="primary" icon={<IcSave size={18} />}>
            Save
          </Button>
        </form>
        {isSelf ? (
          <p className="muted small" style={{ marginTop: 8 }}>
            You can rename the &quot;Me&quot; label for this team.
          </p>
        ) : isLeader ? (
          <p className="muted small" style={{ marginTop: 8 }}>
            You can replace &quot;My leader&quot; with your manager&apos;s real name; entries stay attached to the same workspace.
          </p>
        ) : null}
      </section>

      <section className="card">
        <h2 className="card__title">Scratchpad</h2>
        <p className="muted small">
          Free-form notes (markdown): 1:1 drafts, stream-of-thought, talking points. Saved alongside the profile.
        </p>
        <MarkdownEditor
          value={scratchpad}
          onChange={setScratchpad}
          placeholder="Write here…"
          rows={10}
        />
        <div className="row" style={{ marginTop: 10 }}>
          <Button type="button" variant="secondary" icon={<IcSave size={17} />} onClick={() => person && updatePerson(person.id, { scratchpad })}>
            Save note
          </Button>
        </div>
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

  return (
    <section className="card">
      <div className="row row--between">
        <h2 className="card__title">
          {title} <span className="pill">{list.length}</span>
        </h2>
      </div>

      <form
        className={kind === 'goal' ? 'kind-form kind-form--goal' : 'row'}
        style={{ marginBottom: 12, flexDirection: kind === 'goal' ? 'column' : undefined, alignItems: 'stretch' }}
        onSubmit={(e) => {
          e.preventDefault();
          if (!draftTitle.trim() && kind !== 'document') return;
          if (kind === 'document' && !draftTitle.trim() && !draftUrl.trim()) return;
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
          setDraftTitle('');
          setDraftUrl('');
          setDraftCategory('');
          setDraftStartAt('');
          setDraftDueAt('');
          setDraftGoalStatus('planned');
          setDraftFeedbackKind('coaching');
        }}
      >
        {kind === 'goal' ? (
          <label className="field" style={{ marginTop: 0 }}>
            <span>Goal (long form)</span>
            <textarea
              className="textarea textarea--goal-title"
              rows={4}
              placeholder="Describe your goal in detail…"
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
            />
          </label>
        ) : kind === 'task' ? (
          <label className="field" style={{ marginTop: 0 }}>
            <span>Task</span>
            <AutoResizeTextarea
              className="textarea textarea--task-title"
              minRows={3}
              maxRows={10}
              placeholder="What needs to be done? Use multiple lines if helpful."
              value={draftTitle}
              onChange={setDraftTitle}
              ariaLabel="Task title"
            />
          </label>
        ) : (
          <input
            className="input input--grow"
            placeholder={kind === 'document' ? 'Title (optional)' : 'Title'}
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
          />
        )}
        <div className="row" style={{ flexWrap: 'wrap', marginTop: kind === 'goal' ? 8 : 0 }}>
          <input
            className="input"
            style={{ minWidth: 130 }}
            placeholder="Category (optional)"
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
              <label className="field" style={{ minWidth: 200 }}>
                <span className="small">Start</span>
                <input type="datetime-local" className="input" value={draftStartAt} onChange={(e) => setDraftStartAt(e.target.value)} />
              </label>
              <label className="field" style={{ minWidth: 200 }}>
                <span className="small">Deadline</span>
                <input type="datetime-local" className="input" value={draftDueAt} onChange={(e) => setDraftDueAt(e.target.value)} />
              </label>
              <label className="field" style={{ minWidth: 160 }}>
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
            <label className="field" style={{ minWidth: 160 }}>
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
          <Button type="submit" variant="primary" icon={<IcPlus size={18} />}>
            Add
          </Button>
        </div>
      </form>

      {list.length === 0 ? (
        <p className="muted">No items yet.</p>
      ) : (
        <ul className="list">
          {list.map((it) => (
            <li key={it.id} className="list__block">
              <div className="row row--between">
                <div>
                  <div className={`list__title${kind === 'goal' ? ' list__title--multiline' : ''}`}>
                    {it.kind === 'document' && it.url ? (
                      <a href={it.url} target="_blank" rel="noreferrer">
                        {it.title || it.url}
                      </a>
                    ) : (
                      it.title
                    )}{' '}
                    {it.done ? <span className="pill pill--ok">done</span> : null}
                    {it.kind === 'goal' ? <span className="pill">{goalStatusLabel(it.goalStatus)}</span> : null}
                    {it.kind === 'feedback' ? (
                      <span className={`pill pill--${feedbackTone(it.feedbackKind)}`}>
                        {feedbackLabel(it.feedbackKind)}
                      </span>
                    ) : null}
                  </div>
                  <div className="muted small">
                    {kindLabel(it.kind)}
                    {it.category ? ` · ${it.category}` : ''}
                    {it.kind === 'goal' && it.startAt ? ` · start ${formatShort(it.startAt)}` : ''}
                    {it.dueAt ? ` · due ${formatShort(it.dueAt)}` : ''}
                    {it.dueAt && isPast(it.dueAt) && !it.done ? ' · overdue' : ''}
                    {it.remindAt ? ` · reminder ${formatShort(it.remindAt)}` : ''}
                  </div>
                </div>
                <div className="row">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    icon={openId === it.id ? <IcX size={16} /> : <IcPencil size={16} />}
                    onClick={() => setOpenId(openId === it.id ? null : it.id)}
                  >
                    {openId === it.id ? 'Close' : 'Edit'}
                  </Button>
                  {aiEnabled && (it.kind === 'task' || it.kind === 'goal') ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      icon={<IcSparkles size={16} />}
                      title="Ask AI for recommendations"
                      onClick={() => setAiTarget(it)}
                    >
                      Ask AI
                    </Button>
                  ) : null}
                  {it.kind === 'task' || it.kind === 'goal' ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      icon={it.done ? <IcUndo size={16} /> : <IcCheck size={16} />}
                      onClick={() => onToggle(it.id)}
                    >
                      {it.done ? 'Reopen' : 'Done'}
                    </Button>
                  ) : null}
                  <Button type="button" variant="danger" size="sm" icon={<IcTrash size={16} />} onClick={() => onRemove(it.id)}>
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
                      key={`b-${it.id}`}
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
                        onBlur={(e) => onUpdate(it.id, { startAt: fromLocalDatetimeValue(e.target.value) })}
                      />
                    </label>
                  ) : null}
                  {it.kind === 'task' || it.kind === 'goal' ? (
                    <label className="field">
                      <span>{it.kind === 'goal' ? 'Deadline' : 'Due'}</span>
                      <input
                        type="datetime-local"
                        className="input"
                        defaultValue={toLocalDatetimeValue(it.dueAt)}
                        key={`d-${it.id}-${it.updatedAt}`}
                        onBlur={(e) => onUpdate(it.id, { dueAt: fromLocalDatetimeValue(e.target.value) })}
                      />
                    </label>
                  ) : null}
                  <label className="field">
                    <span>Reminder (desktop notification)</span>
                    <input
                      type="datetime-local"
                      className="input"
                      defaultValue={toLocalDatetimeValue(it.remindAt)}
                      key={`r-${it.id}-${it.updatedAt}`}
                      onBlur={(e) => onUpdate(it.id, { remindAt: fromLocalDatetimeValue(e.target.value) })}
                    />
                  </label>
                  <label className="field">
                    <span>Repeat</span>
                    <select
                      className="select"
                      defaultValue={it.remindRepeat ?? ''}
                      key={`rr-${it.id}-${it.updatedAt}-${it.remindRepeat ?? ''}`}
                      onChange={(e) => {
                        const v = e.target.value;
                        onUpdate(it.id, { remindRepeat: (v ? (v as ReminderRepeat) : undefined) });
                      }}
                    >
                      {REMIND_REPEAT_OPTIONS.map((o) => (
                        <option key={o.value || 'none'} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
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
                      <a href={it.url} target="_blank" rel="noreferrer">
                        {it.url}
                      </a>
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

  useEffect(() => {
    setAgenda(person.agenda ?? defaultAgenda());
  }, [person.id, person.agenda]);

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
        <MarkdownEditor value={agenda} onChange={setAgenda} placeholder="Plan your next 1:1…" rows={14} />
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

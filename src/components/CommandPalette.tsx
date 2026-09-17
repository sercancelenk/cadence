import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDataSelector } from '../AppDataContext';
import { kindLabel } from '../lib/labels';
import {
  buildSnippet,
  foldForSearch,
  groupBy,
  labelMatchesTokens,
  matchCommands,
  submittedCommand,
  tokenizeQuery,
} from '../lib/commandPaletteSearch';
import {
  PATH_AGENDA,
  PATH_ANALYTICS,
  PATH_ANALYTICS_ACTIVITY,
  PATH_HOME,
  PATH_NOTES,
  PATH_PLANNING,
  PATH_PROFILE,
  PATH_GUIDE,
  PATH_SETTINGS,
  PATH_TEAMS,
  PATH_TODOS,
  PATH_UTILITIES_DOCUMENT,
  PATH_UTILITIES_STRUCTURED,
  PATH_UTILITIES_TOOLS,
} from '../lib/routes';
import { plainTextFromBodyFields } from '../lib/richTextBody';
import { teamBase, teamPeople, teamPersonWorkspacePath, withItemFocus } from '../lib/teamPaths';
import type { AppData, Item, Note, Person, Team, TodoItem } from '../model';
import { isNoteArchived, isTodoItemArchived } from '../model';
import { openQuickAdd, openQuickAddMenu } from '../lib/quickAddEvents';
import {
  IcArrowRight,
  IcBraces,
  IcCalendar,
  IcChartBar,
  IcFileText,
  IcFolder,
  IcHelpCircle,
  IcHome,
  IcListTodo,
  IcLock,
  IcPlus,
  IcSettings,
  IcSliders,
  IcStickyNote,
  IcTarget,
  IcUser,
  IcUsers,
} from './icons';

type Command = {
  id: string;
  group: 'Create' | 'Navigate' | 'Teams' | 'People' | 'Items' | 'To-dos' | 'Notes' | 'Help';
  label: string;
  hint?: string;
  /**
   * Additional text that participates in the match haystack but is NEVER
   * shown verbatim in the row. We use this to fold the **body / content**
   * of notes, items and 1:1 agendas into the search index — that's how a
   * query like "rollout plan" finds a note titled "Q3 review" whose body
   * happens to contain that phrase. When a result matches via this field
   * (and not the label/hint), we still surface a short snippet around the
   * match so the user can tell why the row showed up.
   *
   * Kept out of the rendered template on purpose so the visual layout
   * stays compact even for items with multi-kilobyte markdown bodies.
   */
  searchText?: string;
  icon: ReactNode;
  run: () => void;
};

/**
 * Custom DOM event listened to by the palette. Anything in the app can
 * fire this (e.g. a header search button) to pop the palette open
 * without needing to wire React state through a shared context.
 */
export const CMD_PALETTE_OPEN_EVENT = 'cmdp:open';

/**
 * Global ⌘K palette. Listens for Cmd/Ctrl+K and fuzzy-searches across
 * navigation targets, teams, people, items and to-dos.
 *
 * This outer shell deliberately holds nothing but the open flag and the
 * shortcut listener: it is mounted at the app root, so anything it subscribed
 * to would re-render on every keystroke typed anywhere in the app. The index
 * and the workspace subscription live in the dialog, which only exists while
 * the palette is open.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  // Read by the keydown listener, which is registered once. Kept in a ref
  // rather than resolved inside a `setOpen` updater: updaters must be pure, and
  // React may run them during a later render phase (or twice under StrictMode),
  // where `preventDefault()` is a no-op or fires more than once.
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isModK = (e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K');
      if (isModK) {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === 'Escape' && openRef.current) {
        e.preventDefault();
        setOpen(false);
      }
    }
    // Any other UI element can dispatch this event (see CMD_PALETTE_OPEN_EVENT)
    // — used by the top-bar search button so the palette is a single source
    // of truth for global search.
    function onOpenRequest() {
      setOpen(true);
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener(CMD_PALETTE_OPEN_EVENT, onOpenRequest);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(CMD_PALETTE_OPEN_EVENT, onOpenRequest);
    };
  }, []);

  const close = useCallback(() => setOpen(false), []);
  if (!open) return null;
  return <CommandPaletteDialog onClose={close} />;
}

function CommandPaletteDialog({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const navigate = useNavigate();
  const indexData = useAppDataSelector(selectPaletteData, paletteDataUnchanged);

  const commands = useMemo<Command[]>(
    () => buildCommands(indexData, navigate),
    [indexData, navigate],
  );

  // Typing stays responsive on large workspaces: the input paints with the new
  // character while the (potentially thousands of rows) match runs against the
  // slightly stale query.
  const deferredQuery = useDeferredValue(query);
  const tokens = useMemo(() => tokenizeQuery(deferredQuery), [deferredQuery]);
  const filtered = useMemo(() => matchCommands(commands, tokens), [commands, tokens]);

  useEffect(() => {
    const id = setTimeout(() => inputRef.current?.focus(), 10);
    return () => clearTimeout(id);
  }, []);

  // Keyed on the query, not on `filtered`: the index is rebuilt whenever any
  // workspace collection changes, and a background mutation (reminder tick,
  // sync apply) must not yank the highlight back to the first row while the
  // user is arrowing through results. Clamp when the list shrinks so a stale
  // cursor cannot sit past the last row (Enter would then be a silent no-op).
  useEffect(() => {
    setCursor(0);
  }, [deferredQuery]);

  useEffect(() => {
    setCursor((c) => Math.max(0, Math.min(c, Math.max(filtered.length - 1, 0))));
  }, [filtered.length]);

  const groups = groupBy(filtered, (c) => c.group);
  const indexByCommand = new Map(filtered.map((c, i) => [c, i]));

  function runCommand(c: Command | undefined) {
    if (!c) return;
    c.run();
    onClose();
  }

  function runSelected() {
    runCommand(submittedCommand(commands, { query, deferredQuery, filtered, cursor }));
  }

  return (
    <div className="cmdp" role="dialog" aria-modal="true" aria-label="Command palette" onClick={onClose}>
      <div className="cmdp__panel" onClick={(e) => e.stopPropagation()}>
        <div className="cmdp__input-wrap">
          <input
            ref={inputRef}
            type="text"
            className="cmdp__input"
            placeholder="Search teams, people, tasks, notes…  (Esc to close)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                // `Math.max(0, …)` for the empty list, where `length - 1` is -1.
                setCursor((c) => Math.max(0, Math.min(c + 1, filtered.length - 1)));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setCursor((c) => Math.max(c - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                runSelected();
              }
            }}
          />
          <span className="cmdp__kbd">↵</span>
        </div>
        <div className="cmdp__results" role="listbox">
          {filtered.length === 0 ? (
            <div className="cmdp__empty">No matches.</div>
          ) : (
            groups.map(([group, list]) => (
              <div className="cmdp__group" key={group}>
                <div className="cmdp__group-label">{group}</div>
                {list.map((c) => {
                  const idx = indexByCommand.get(c) ?? 0;
                  // Only build a snippet when there's actually a body/content
                  // hit — if the query is already visible in the label / hint
                  // showing the snippet underneath is just noise.
                  const snippet =
                    tokens.length > 0 && c.searchText && !labelMatchesTokens(c, tokens)
                      ? buildSnippet(c.searchText, tokens)
                      : null;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      role="option"
                      aria-selected={idx === cursor}
                      className={`cmdp__row${idx === cursor ? ' cmdp__row--active' : ''}`}
                      onMouseEnter={() => setCursor(idx)}
                      onClick={() => runCommand(c)}
                    >
                      <span className="cmdp__icon">{c.icon}</span>
                      <div className="cmdp__main">
                        <div className="cmdp__line">
                          <span className="cmdp__label">{highlight(c.label, tokens)}</span>
                          {c.hint ? (
                            <span className="cmdp__hint">{highlight(c.hint, tokens)}</span>
                          ) : null}
                        </div>
                        {snippet ? (
                          <div className="cmdp__snippet" aria-label="Match context">
                            {highlight(snippet, tokens)}
                          </div>
                        ) : null}
                      </div>
                      <IcArrowRight size={14} />
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
        <div className="cmdp__footer muted small">
          <span>↑↓ to navigate</span>
          <span>↵ to select</span>
          <span>esc to close</span>
        </div>
      </div>
    </div>
  );
}

/** The only collections the palette indexes. */
export type PaletteData = {
  teams: Team[];
  people: Person[];
  items: Item[];
  todoItems: TodoItem[];
  notes: Note[];
};

function selectPaletteData(d: AppData): PaletteData {
  return {
    teams: d.teams,
    people: d.people,
    items: d.items,
    todoItems: d.todoItems,
    notes: d.notes,
  };
}

function paletteDataUnchanged(a: PaletteData, b: PaletteData): boolean {
  return (
    a.teams === b.teams &&
    a.people === b.people &&
    a.items === b.items &&
    a.todoItems === b.todoItems &&
    a.notes === b.notes
  );
}

export function buildCommands(
  data: PaletteData,
  navigate: ReturnType<typeof useNavigate>,
): Command[] {
  // Resolving a person's team (and an item's person, then that person's team)
  // with `find` is O(items × people); with thousands of rows that lookup, not
  // the matching, dominates index build time.
  const teamById = new Map(data.teams.map((t) => [t.id, t]));
  const personById = new Map(data.people.map((p) => [p.id, p]));
  const cmds: Command[] = [
    {
      id: 'create-note',
      group: 'Create',
      label: 'New note',
      hint: 'Quick-add dialog',
      searchText: 'create write',
      icon: <IcStickyNote size={16} />,
      run: () => openQuickAdd('note'),
    },
    {
      id: 'create-task',
      group: 'Create',
      label: 'New task',
      hint: 'Quick-add dialog',
      searchText: 'create todo',
      icon: <IcListTodo size={16} />,
      run: () => openQuickAdd('task'),
    },
    {
      id: 'create-quick-add',
      group: 'Create',
      label: 'Open quick add menu',
      hint: 'Floating + menu',
      searchText: 'fab create',
      icon: <IcPlus size={16} />,
      run: () => openQuickAddMenu(),
    },
    {
      id: 'nav-home',
      group: 'Navigate',
      label: 'Go to Home',
      icon: <IcHome size={16} />,
      run: () => navigate(PATH_HOME),
    },
    {
      id: 'nav-teams',
      group: 'Navigate',
      label: 'Go to Teams',
      icon: <IcFolder size={16} />,
      run: () => navigate(PATH_TEAMS),
    },
    {
      id: 'nav-todos',
      group: 'Navigate',
      label: 'Go to To-dos',
      icon: <IcListTodo size={16} />,
      run: () => navigate(PATH_TODOS),
    },
    {
      id: 'nav-agenda',
      group: 'Navigate',
      label: 'Go to Agenda',
      icon: <IcCalendar size={16} />,
      run: () => navigate(PATH_AGENDA),
    },
    {
      id: 'nav-planning',
      group: 'Navigate',
      label: 'Go to Planning',
      icon: <IcTarget size={16} />,
      run: () => navigate(PATH_PLANNING),
    },
    {
      id: 'nav-notes',
      group: 'Navigate',
      label: 'Go to Notes',
      icon: <IcStickyNote size={16} />,
      run: () => navigate(PATH_NOTES),
    },
    {
      id: 'nav-utilities-document',
      group: 'Navigate',
      label: 'Go to Document (Utilities)',
      icon: <IcFileText size={16} />,
      run: () => navigate(PATH_UTILITIES_DOCUMENT),
    },
    {
      id: 'nav-utilities-structured',
      group: 'Navigate',
      label: 'Go to JSON / YAML (Utilities)',
      icon: <IcBraces size={16} />,
      run: () => navigate(PATH_UTILITIES_STRUCTURED),
    },
    {
      id: 'nav-utilities-tools',
      group: 'Navigate',
      label: 'Go to Tools (Utilities)',
      icon: <IcSliders size={16} />,
      run: () => navigate(PATH_UTILITIES_TOOLS),
    },
    {
      id: 'nav-analytics',
      group: 'Navigate',
      label: 'Go to Analytics',
      icon: <IcChartBar size={16} />,
      run: () => navigate(PATH_ANALYTICS),
    },
    {
      id: 'nav-activity',
      group: 'Navigate',
      label: 'Go to Activity report',
      hint: 'Completed, opened, and open tasks by period',
      icon: <IcChartBar size={16} />,
      run: () => navigate(PATH_ANALYTICS_ACTIVITY),
    },
    {
      id: 'nav-profile',
      group: 'Navigate',
      label: 'Go to Profile',
      icon: <IcUser size={16} />,
      run: () => navigate(PATH_PROFILE),
    },
    {
      id: 'nav-settings',
      group: 'Navigate',
      label: 'Go to Settings',
      icon: <IcSettings size={16} />,
      run: () => navigate(PATH_SETTINGS),
    },
    {
      id: 'nav-guide',
      group: 'Help',
      label: 'Open user guide',
      hint: 'Backups, recovery codes, daily workflow',
      icon: <IcHelpCircle size={16} />,
      run: () => navigate(PATH_GUIDE),
    },
  ];

  for (const t of data.teams) {
    cmds.push({
      id: `team-${t.id}`,
      group: 'Teams',
      label: t.name,
      hint: 'Open team',
      icon: <IcFolder size={16} />,
      run: () => navigate(teamBase(t.id)),
    });
    cmds.push({
      id: `team-people-${t.id}`,
      group: 'Teams',
      label: `${t.name} · People`,
      icon: <IcUsers size={16} />,
      run: () => navigate(teamPeople(t.id)),
    });
  }

  for (const p of data.people) {
    const team = teamById.get(p.teamId);
    cmds.push({
      id: `person-${p.id}`,
      group: 'People',
      label: p.name,
      hint: team ? team.name : undefined,
      // Index the per-person scratchpad and 1:1 agenda too. Users often
      // search for something they typed during a 1:1 ("told them about
      // the offsite") and expect to find the person row from that.
      searchText: [p.title, p.scratchpad, p.agenda].filter(Boolean).join(' '),
      icon: <IcUser size={16} />,
      run: () => navigate(teamPersonWorkspacePath(p.teamId, p)),
    });
  }

  for (const it of data.items) {
    if (!it.title) continue;
    const person = personById.get(it.personId);
    const team = person ? teamById.get(person.teamId) : undefined;
    if (!person || !team) continue;
    cmds.push({
      id: `item-${it.id}`,
      group: 'Items',
      label: it.title,
      hint: `${kindLabel(it.kind)} · ${team.name} · ${person.name}`,
      searchText: it.body,
      icon: <IcListTodo size={16} />,
      // `?focus=` is what makes the person's workspace expand and scroll to the
      // matched item. Without it the hit lands on the page and the user has to
      // find the row themselves — which, on a long agenda, reads as the search
      // simply not having worked.
      run: () => navigate(withItemFocus(teamPersonWorkspacePath(team.id, person), it.id)),
    });
  }

  for (const t of data.todoItems) {
    if (isTodoItemArchived(t)) continue;
    const bodyPlain = (plainTextFromBodyFields(t) || t.body || '').trim();
    const title = (t.title || '').trim();
    if (!title && !bodyPlain) continue;
    // Status hint mirrors the To-dos page label so the palette and the
    // page agree on phrasing. Fall back to "Open" for the default `todo`
    // status — that's the most natural one-word verb for "still pending".
    const hint =
      t.status === 'done'
        ? 'Done'
        : t.status === 'in_progress'
          ? 'In progress'
          : t.status === 'cancelled'
            ? 'Cancelled'
            : 'Open';
    cmds.push({
      id: `todo-${t.id}`,
      group: 'To-dos',
      label: title || (bodyPlain.length > 80 ? `${bodyPlain.slice(0, 77)}…` : bodyPlain) || 'Untitled task',
      hint,
      searchText: bodyPlain || undefined,
      icon: <IcListTodo size={16} />,
      run: () => navigate(`${PATH_TODOS}?focus=${encodeURIComponent(t.id)}`),
    });
  }

  // Notes search. Locked notes are intentionally limited to their title
  // — we can't search the body without the workspace passphrase, which
  // we don't have at this layer, and we very deliberately do not want
  // to expose decrypted bodies through the palette. Unlocked notes also
  // contribute their full body to `searchText` so a phrase the user
  // remembers typing finds the right note even when its title is generic.
  // Clicking a hit navigates to /notes?id=<id>; the NotesPage selects
  // that note on mount and strips the query so a refresh doesn't keep
  // re-selecting. To-do hits use /todos?focus=<id> for the same deep-link
  // scroll + highlight behaviour TodosPage already implements for backlinks.
  for (const n of data.notes) {
    if (isNoteArchived(n)) continue;
    const title = (n.title || '').trim();
    if (!title && n.locked) continue; // nothing to search/show
    cmds.push({
      id: `note-${n.id}`,
      group: 'Notes',
      label: title || 'Untitled note',
      hint: n.locked ? 'Locked' : undefined,
      searchText: n.locked ? undefined : plainTextFromBodyFields(n) || n.body,
      icon: n.locked ? <IcLock size={16} /> : <IcStickyNote size={16} />,
      run: () => navigate(`${PATH_NOTES}?id=${encodeURIComponent(n.id)}`),
    });
  }

  return cmds;
}

/**
 * Render `text` with every `tokens` occurrence wrapped in a `<mark>` for
 * highlighting. Case-insensitive, tokens are escaped so regex meta-chars
 * (`.`, `*`, etc.) the user typed don't blow up the matcher. When there
 * are no tokens (initial open) we just return the plain string for the
 * zero-allocation common case.
 */
function highlight(text: string, tokens: readonly string[]): ReactNode {
  if (!text || tokens.length === 0) return text;
  // Located with the same fold the matcher uses, so a row found via "istanbul"
  // also highlights the "İstanbul" that matched. A case-insensitive RegExp
  // cannot: ECMAScript canonicalisation keeps U+0130 distinct from `i`, so the
  // row would render with no mark at all. The fold is length-preserving, which
  // is what makes these indices valid in the original text.
  const hay = foldForSearch(text);
  const ranges: [number, number][] = [];
  for (const token of tokens) {
    for (let i = hay.indexOf(token); i !== -1; i = hay.indexOf(token, i + token.length)) {
      ranges.push([i, i + token.length]);
    }
  }
  if (ranges.length === 0) return text;
  ranges.sort((a, b) => a[0] - b[0]);

  const parts: ReactNode[] = [];
  let at = 0;
  for (const [start, end] of ranges) {
    // Tokens can overlap ("ali" and "alice"); keep the union, never re-emit.
    if (end <= at) continue;
    const from = Math.max(start, at);
    if (from > at) parts.push(text.slice(at, from));
    parts.push(
      <mark key={from} className="cmdp__mark">
        {text.slice(from, end)}
      </mark>,
    );
    at = end;
  }
  if (at < text.length) parts.push(text.slice(at));
  return parts;
}


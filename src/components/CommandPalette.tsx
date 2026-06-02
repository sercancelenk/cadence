import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppData } from '../AppDataContext';
import { kindLabel } from '../lib/labels';
import {
  PATH_AGENDA,
  PATH_HOME,
  PATH_NOTES,
  PATH_PROFILE,
  PATH_SETTINGS,
  PATH_TEAMS,
  PATH_TODOS,
} from '../lib/routes';
import { plainTextFromBodyFields } from '../lib/richTextBody';
import { teamBase, teamPeople, teamPerson } from '../lib/teamPaths';
import type { Item, Note, Person, Team, TodoItem } from '../model';
import {
  IcArrowRight,
  IcCalendar,
  IcFolder,
  IcHome,
  IcListTodo,
  IcLock,
  IcSettings,
  IcStickyNote,
  IcUser,
  IcUsers,
} from './icons';

type Command = {
  id: string;
  group: 'Navigate' | 'Teams' | 'People' | 'Items' | 'To-dos' | 'Notes';
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
 * Implementation notes:
 *  - Mounted at the root so the keyboard shortcut works from any page.
 *  - When closed, renders nothing (zero overhead while idle).
 *  - Filtering is plain substring (case-insensitive) for predictability.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const navigate = useNavigate();
  const { data } = useAppData();

  const commands = useMemo<Command[]>(() => buildCommands(data, navigate), [data, navigate]);

  /**
   * Tokenise the query on whitespace and require EVERY token to appear
   * somewhere in the haystack. That way "alice rollout" finds a note
   * containing both words even if they're separated by paragraphs, and
   * "  test " (with stray spaces) doesn't mysteriously return zero.
   */
  const tokens = useMemo(() => {
    return query
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 0);
  }, [query]);

  const filtered = useMemo(() => {
    if (tokens.length === 0) return commands.slice(0, 50);
    const matches: Command[] = [];
    for (const c of commands) {
      const hay = `${c.label} ${c.group} ${c.hint ?? ''} ${c.searchText ?? ''}`.toLowerCase();
      if (tokens.every((t) => hay.includes(t))) matches.push(c);
    }
    return matches.slice(0, 50);
  }, [commands, tokens]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isModK = (e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K');
      if (isModK) {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === 'Escape' && open) {
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
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  useEffect(() => {
    setCursor(0);
  }, [query]);

  if (!open) return null;

  const groups = groupBy(filtered, (c) => c.group);

  function runAt(idx: number) {
    const c = filtered[idx];
    if (!c) return;
    c.run();
    setOpen(false);
  }

  return (
    <div className="cmdp" role="dialog" aria-modal="true" aria-label="Command palette" onClick={() => setOpen(false)}>
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
                setCursor((c) => Math.min(c + 1, filtered.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setCursor((c) => Math.max(c - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                runAt(cursor);
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
                  const idx = filtered.indexOf(c);
                  // Only build a snippet when there's actually a body/content
                  // hit — if the query is already visible in the label / hint
                  // showing the snippet underneath is just noise.
                  const labelHit = tokens.some((t) =>
                    `${c.label} ${c.hint ?? ''}`.toLowerCase().includes(t),
                  );
                  const snippet =
                    tokens.length > 0 && c.searchText && !labelHit
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
                      onClick={() => runAt(idx)}
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

function buildCommands(
  data: ReturnType<typeof useAppData>['data'],
  navigate: ReturnType<typeof useNavigate>,
): Command[] {
  const cmds: Command[] = [
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
      id: 'nav-notes',
      group: 'Navigate',
      label: 'Go to Notes',
      icon: <IcStickyNote size={16} />,
      run: () => navigate(PATH_NOTES),
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
  ];

  for (const t of data.teams as Team[]) {
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

  for (const p of data.people as Person[]) {
    const team = data.teams.find((t) => t.id === p.teamId);
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
      run: () => navigate(teamPerson(p.teamId, p.id)),
    });
  }

  for (const it of data.items as Item[]) {
    if (!it.title) continue;
    const person = data.people.find((p) => p.id === it.personId);
    const team = person ? data.teams.find((t) => t.id === person.teamId) : undefined;
    if (!person || !team) continue;
    cmds.push({
      id: `item-${it.id}`,
      group: 'Items',
      label: it.title,
      hint: `${kindLabel(it.kind)} · ${team.name} · ${person.name}`,
      searchText: it.body,
      icon: <IcListTodo size={16} />,
      run: () => navigate(teamPerson(team.id, person.id)),
    });
  }

  for (const t of data.todoItems as TodoItem[]) {
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
  for (const n of data.notes as Note[]) {
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
function highlight(text: string, tokens: string[]): ReactNode {
  if (!text || tokens.length === 0) return text;
  const escaped = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`(${escaped.join('|')})`, 'gi');
  const parts = text.split(re);
  return parts.map((p, i) =>
    // `split` with a capturing group yields [non-match, match, non-match, …]
    // so odd indices are the highlighted chunks.
    i % 2 === 1 ? (
      <mark key={i} className="cmdp__mark">
        {p}
      </mark>
    ) : (
      p
    ),
  );
}

/**
 * Pull a short, single-line excerpt out of `body` around the first
 * matching token. Multi-line markdown gets flattened to single spaces so
 * the snippet renders cleanly on one row; we trim to ~140 chars of
 * context (≈ 60 chars on each side of the match) and prepend / append an
 * ellipsis when we sliced into the middle of the body.
 */
function buildSnippet(body: string, tokens: string[]): string | null {
  const flat = body.replace(/\s+/g, ' ').trim();
  if (!flat) return null;
  const lower = flat.toLowerCase();
  let bestIdx = -1;
  let bestLen = 0;
  for (const t of tokens) {
    const i = lower.indexOf(t);
    // Prefer the leftmost hit, but bias slightly towards longer tokens
    // when they tie — gives more meaningful context than a 1-char "a".
    if (i !== -1 && (bestIdx === -1 || i < bestIdx || (i === bestIdx && t.length > bestLen))) {
      bestIdx = i;
      bestLen = t.length;
    }
  }
  if (bestIdx === -1) return null;
  const CONTEXT = 60;
  const start = Math.max(0, bestIdx - CONTEXT);
  const end = Math.min(flat.length, bestIdx + bestLen + CONTEXT);
  const prefix = start > 0 ? '… ' : '';
  const suffix = end < flat.length ? ' …' : '';
  return `${prefix}${flat.slice(start, end)}${suffix}`;
}

function groupBy<T, K extends string>(items: T[], key: (item: T) => K): [K, T[]][] {
  const map = new Map<K, T[]>();
  for (const it of items) {
    const k = key(it);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(it);
  }
  return Array.from(map.entries());
}

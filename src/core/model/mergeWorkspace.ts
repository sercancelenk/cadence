/**
 * Additive, one-shot workspace merge ("import missing items from another
 * device") — the engine behind Settings → "Import items from paired device".
 *
 * Why this exists
 * ===============
 *
 * The steady-state sync (`useSyncAutoSync` / `runSyncCycle`) is a
 * whole-workspace SNAPSHOT REPLACE: a pull calls `replaceAll(remote)` and the
 * local document is overwritten. That converges two devices onto one shared
 * snapshot, but it is last-writer-wins at the document level — if a desktop
 * and a phone each created different notes while apart, replacing one with the
 * other drops the divergent items.
 *
 * This module implements the opposite, user-initiated operation: take the
 * peer's snapshot and APPEND only the entities this device does not already
 * have, never replacing, mutating or deleting anything that is already local.
 * Running it twice is a no-op (idempotent), so it is safe to repeat.
 *
 * Design contract (locked down by mergeWorkspace.test.ts)
 * ======================================================
 *
 *   1. ADDITIVE ONLY. Every local entity survives untouched. We only ever
 *      push NEW entities onto the end of each collection.
 *   2. NO OVERWRITE. If a remote entity shares an `id` with a local one, the
 *      LOCAL copy is kept verbatim and the remote copy is ignored. "Never
 *      replace" — even when the remote looks newer.
 *   3. DEDUPE BY CONTENT. For content entities (notes, todos, team items) a
 *      stable content signature is also checked, so the same logical item
 *      created independently on both devices (different `id`s, identical
 *      content) is not imported as a near-duplicate.
 *   4. NO DELETES. Tombstones do not exist in the model; a delete on one
 *      device has no effect on the other. Re-importing can resurrect a locally
 *      deleted item — that is the documented, accepted trade-off of an
 *      append-only transfer.
 *   5. SINGLETONS ARE LOCAL. Workspace-level config (`profile`, `aiSettings`,
 *      `notesLock`, `utilityDocument`, …, `lastTeamId`) is NEVER taken from the
 *      remote — overwriting it could change the active team or, worse, swap a
 *      notes passphrase verifier and lock the user out. Only list collections
 *      are appended to.
 *
 * The result is a structural union. The caller is expected to feed it to
 * `replaceAll`, which runs `normalizeData` to re-assert model invariants
 * (group reassignment, self/leader scaffolding, forward-compat extras). This
 * function deliberately does NOT normalise, so it stays pure and its output is
 * deterministic for tests.
 */

import type { AppData, Item, Note, NoteGroup, Person, Team, TodoGroup, TodoItem } from './index';

/** Per-collection count of entities appended from the remote workspace. */
export interface MergeAppendSummary {
  notes: number;
  noteGroups: number;
  todoItems: number;
  todoGroups: number;
  items: number;
  people: number;
  teams: number;
  notifiedReminderIds: number;
  /** Sum of every appended entity — the single number to show the user. */
  total: number;
}

export interface MergeAppendResult {
  data: AppData;
  summary: MergeAppendSummary;
}

const SEP = '\u0000';

/**
 * Stable content fingerprint for a note. Excludes volatile/identity fields
 * (`id`, timestamps, sort order, pin state) so the SAME note that lives on
 * two devices dedupes even when the ids diverged. Locked notes have no
 * plaintext to hash, so we fall back to the canonical locked-body signature,
 * then the ciphertext.
 */
function noteSignature(n: Note): string {
  const body = n.locked
    ? (n.lockedBodySignature ?? n.cipher?.cipherB64 ?? '')
    : (n.bodyPlainText ?? n.body ?? '');
  return ['note', (n.title ?? '').trim(), n.locked ? '1' : '0', body.trim()].join(SEP);
}

/** Content fingerprint for a personal to-do. Planning flags ride on the item
 *  itself and are intentionally not part of identity. */
function todoSignature(t: TodoItem): string {
  const body = t.bodyPlainText ?? t.body ?? '';
  return ['todo', (t.title ?? '').trim(), body.trim(), t.status, t.dueAt ?? ''].join(SEP);
}

/** Content fingerprint for a team item (task / note / goal / feedback / document). */
function itemSignature(it: Item): string {
  return ['item', it.kind, it.personId, (it.title ?? '').trim(), (it.body ?? '').trim(), it.dueAt ?? ''].join(
    SEP,
  );
}

/**
 * Append entities from `remote` that are absent in `local`, judged first by
 * `id` (never re-add or overwrite a known id) and then by an optional content
 * `signature` (skip independently-created duplicates). Local order and
 * contents are preserved exactly; new entities are appended in remote order.
 */
function appendMissing<T>(
  local: readonly T[],
  remote: readonly T[],
  idOf: (item: T) => string,
  signatureOf?: (item: T) => string,
): { merged: T[]; added: number } {
  const seenIds = new Set<string>();
  const seenSigs = new Set<string>();
  for (const item of local) {
    seenIds.add(idOf(item));
    if (signatureOf) seenSigs.add(signatureOf(item));
  }
  const merged = [...local];
  let added = 0;
  for (const item of remote) {
    const id = idOf(item);
    if (seenIds.has(id)) continue;
    if (signatureOf) {
      const sig = signatureOf(item);
      if (seenSigs.has(sig)) continue;
      seenSigs.add(sig);
    }
    seenIds.add(id);
    merged.push(item);
    added += 1;
  }
  return { merged, added };
}

/** Union two id-less string lists (e.g. `notifiedReminderIds`) additively. */
function appendMissingStrings(
  local: readonly string[],
  remote: readonly string[],
): { merged: string[]; added: number } {
  const seen = new Set(local);
  const merged = [...local];
  let added = 0;
  for (const value of remote) {
    if (seen.has(value)) continue;
    seen.add(value);
    merged.push(value);
    added += 1;
  }
  return { merged, added };
}

/**
 * Merge `remote` into `local` additively and return the new workspace plus a
 * summary of what was appended. Pure: neither argument is mutated.
 *
 * Groups, people and teams are deduped by `id` ONLY (not by name): when the
 * two devices share a workspace their ids already match, and when they do not
 * we would rather keep two same-named lists than risk re-pointing imported
 * items at the wrong group. Content entities also dedupe by signature.
 */
export function mergeAppendWorkspace(local: AppData, remote: AppData): MergeAppendResult {
  const idOf = (x: { id: string }): string => x.id;

  const notes = appendMissing<Note>(local.notes ?? [], remote.notes ?? [], idOf, noteSignature);
  const noteGroups = appendMissing<NoteGroup>(local.noteGroups ?? [], remote.noteGroups ?? [], idOf);
  const todoItems = appendMissing<TodoItem>(
    local.todoItems ?? [],
    remote.todoItems ?? [],
    idOf,
    todoSignature,
  );
  const todoGroups = appendMissing<TodoGroup>(local.todoGroups ?? [], remote.todoGroups ?? [], idOf);
  const items = appendMissing<Item>(local.items ?? [], remote.items ?? [], idOf, itemSignature);
  const people = appendMissing<Person>(local.people ?? [], remote.people ?? [], idOf);
  const teams = appendMissing<Team>(local.teams ?? [], remote.teams ?? [], idOf);
  const notified = appendMissingStrings(
    local.notifiedReminderIds ?? [],
    remote.notifiedReminderIds ?? [],
  );

  const summary: MergeAppendSummary = {
    notes: notes.added,
    noteGroups: noteGroups.added,
    todoItems: todoItems.added,
    todoGroups: todoGroups.added,
    items: items.added,
    people: people.added,
    teams: teams.added,
    notifiedReminderIds: notified.added,
    total:
      notes.added +
      noteGroups.added +
      todoItems.added +
      todoGroups.added +
      items.added +
      people.added +
      teams.added +
      notified.added,
  };

  // Singletons (profile, aiSettings, notesLock, utility*, lastTeamId, version)
  // are taken from LOCAL via the spread — the remote copies are intentionally
  // discarded so an import can never change this device's config or lock it.
  const data: AppData = {
    ...local,
    teams: teams.merged,
    people: people.merged,
    items: items.merged,
    notifiedReminderIds: notified.merged,
    todoGroups: todoGroups.merged,
    todoItems: todoItems.merged,
    notes: notes.merged,
    noteGroups: noteGroups.merged,
  };

  return { data, summary };
}

/** Compact one-line description for toasts / logs ("Added 3 notes, 2 to-dos"). */
export function describeMergeSummary(summary: MergeAppendSummary): string {
  if (summary.total === 0) return 'Already up to date — nothing new to import.';
  const parts: string[] = [];
  const push = (n: number, singular: string, plural: string): void => {
    if (n > 0) parts.push(`${n} ${n === 1 ? singular : plural}`);
  };
  push(summary.notes, 'note', 'notes');
  push(summary.todoItems, 'to-do', 'to-dos');
  push(summary.items, 'team item', 'team items');
  push(summary.noteGroups + summary.todoGroups, 'list', 'lists');
  push(summary.people, 'person', 'people');
  push(summary.teams, 'team', 'teams');
  return `Imported ${parts.join(', ')}.`;
}

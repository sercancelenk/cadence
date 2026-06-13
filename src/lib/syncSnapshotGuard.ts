/**
 * Defensive validation for snapshots arriving from a remote backend.
 *
 * Why this exists
 * ===============
 *
 * `model.normalizeData(raw)` is the canonical "make me an AppData from
 * whatever I pass" function. It's deliberately permissive — if the
 * input is junk it returns an `emptyData()` rather than throwing.
 *
 * That's perfect for local boot (corrupt user-data file → boot with
 * empty workspace and recover from a backup) but DANGEROUS for sync
 * pull. If the remote payload happens to be `{}` or some other
 * shape-wrong blob, `normalizeData` happily returns an empty
 * workspace, the auto-sync hook calls `replaceAll(empty)` and the
 * user's local data evaporates.
 *
 * `parseRemoteSnapshot` adds a "looks plausible" gate BEFORE
 * normalisation. If the gate rejects, the auto-sync hook leaves
 * local data untouched and surfaces a clear error instead.
 *
 * The gate is intentionally lenient — we want to accept legitimate
 * snapshots from older Cadence versions too. Optional fields such as
 * `noteGroups` are not required; missing lists must not block import.
 * The criteria are:
 *
 *   - The input is a non-null object.
 *   - It has at least ONE of the recognised top-level collections
 *     (`teams`, `people`, `items`, `todoGroups`, `todoItems`, `notes`).
 *   - That collection is an array.
 *
 * Anything that passes is run through `normalizeData` and returned
 * as a clean AppData.
 */

import { normalizeData, type AppData } from '../model';

const KNOWN_COLLECTION_KEYS = ['teams', 'people', 'items', 'todoGroups', 'todoItems', 'notes'] as const;

/** Accept plain AppData exports and commit-envelope snapshots from rolling backups. */
function workspaceCandidate(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const o = raw as Record<string, unknown>;
  if (o.magic === 'CDNC1' && o.workspace != null && typeof o.workspace === 'object') {
    return o.workspace;
  }
  return raw;
}

export type SnapshotParseResult =
  | { kind: 'ok'; data: AppData }
  | { kind: 'invalid' };

export function parseRemoteSnapshot(raw: unknown): SnapshotParseResult {
  const candidate = workspaceCandidate(raw);
  if (!candidate || typeof candidate !== 'object') return { kind: 'invalid' };
  const o = candidate as Record<string, unknown>;
  let plausible = false;
  for (const key of KNOWN_COLLECTION_KEYS) {
    if (Array.isArray(o[key])) {
      plausible = true;
      break;
    }
  }
  if (!plausible) return { kind: 'invalid' };
  return { kind: 'ok', data: normalizeData(candidate) };
}

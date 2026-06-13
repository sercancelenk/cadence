import {
  BACKUP_ATTACHMENTS_DIR,
  BACKUP_BUNDLE_FORMAT,
  BACKUP_DATA_FILE,
  BACKUP_MANIFEST_FILE,
  type BackupManifest,
  type ParsedBackupBundle,
} from './types';

const ATTACHMENT_ID_RE = /^[a-zA-Z0-9_-]{8,128}$/;

/** Ignore macOS metadata and path traversal. */
export function isSafeBundleEntryPath(path: string): boolean {
  if (!path || path.includes('\\')) return false;
  if (path.startsWith('/') || path.includes('../') || path.includes('/../')) return false;
  if (path.startsWith('__MACOSX/') || path.includes('/__MACOSX/')) return false;
  if (path.startsWith('.')) return false;
  return true;
}

function normalizeEntryKey(key: string): string {
  return key.replace(/\\/g, '/').replace(/^\/+/, '');
}

/**
 * Detect `data.json` at archive root or inside a single top-level folder
 * (common when users zip the exported folder on macOS).
 */
export function resolveBundleRoot(entries: string[]): string {
  const safe = entries.filter(isSafeBundleEntryPath).map(normalizeEntryKey);
  if (safe.includes(BACKUP_DATA_FILE)) return '';
  const candidates = new Set<string>();
  for (const p of safe) {
    if (p.endsWith(`/${BACKUP_DATA_FILE}`)) {
      const prefix = p.slice(0, -(`/${BACKUP_DATA_FILE}`).length);
      if (prefix && !prefix.includes('/')) candidates.add(prefix);
    }
  }
  if (candidates.size === 1) return [...candidates][0] + '/';
  return '';
}

function parseManifest(raw: unknown): BackupManifest | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.format !== BACKUP_BUNDLE_FORMAT) return null;
  return {
    format: BACKUP_BUNDLE_FORMAT,
    exportedAt: typeof o.exportedAt === 'string' ? o.exportedAt : new Date().toISOString(),
    attachmentsPortable: o.attachmentsPortable === true,
    attachmentCount: typeof o.attachmentCount === 'number' ? o.attachmentCount : 0,
    attachmentMissing:
      typeof o.attachmentMissing === 'number' ? o.attachmentMissing : undefined,
  };
}

function workspaceCandidate(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const o = raw as Record<string, unknown>;
  if (o.magic === 'CDNC1' && o.workspace != null && typeof o.workspace === 'object') {
    return o.workspace;
  }
  return raw;
}

export function parseBundleEntries(files: Record<string, Uint8Array>): ParsedBackupBundle {
  const normalized: Record<string, Uint8Array> = {};
  for (const [k, v] of Object.entries(files)) {
    const key = normalizeEntryKey(k);
    if (isSafeBundleEntryPath(key)) normalized[key] = v;
  }

  const root = resolveBundleRoot(Object.keys(normalized));
  const dataKey = root + BACKUP_DATA_FILE;
  const dataBytes = normalized[dataKey];
  if (!dataBytes) {
    const hasNestedData = Object.keys(normalized).some((p) => p.endsWith(`/${BACKUP_DATA_FILE}`));
    if (hasNestedData) {
      throw new Error(
        'Backup ZIP has multiple folders — export again or zip only the inner backup folder (must contain data.json at the top level).',
      );
    }
    throw new Error('Backup is missing data.json.');
  }

  let workspaceRaw: unknown;
  try {
    workspaceRaw = JSON.parse(new TextDecoder().decode(dataBytes));
  } catch {
    throw new Error('data.json is not valid JSON.');
  }
  workspaceRaw = workspaceCandidate(workspaceRaw);

  const manifestKey = root + BACKUP_MANIFEST_FILE;
  let manifest: BackupManifest | null = null;
  if (normalized[manifestKey]) {
    try {
      manifest = parseManifest(JSON.parse(new TextDecoder().decode(normalized[manifestKey])));
    } catch {
      manifest = null;
    }
  }

  const attachments = new Map<string, Uint8Array>();
  const attPrefix = root + BACKUP_ATTACHMENTS_DIR + '/';
  for (const [path, bytes] of Object.entries(normalized)) {
    if (!path.startsWith(attPrefix)) continue;
    const rest = path.slice(attPrefix.length);
    if (rest.includes('/')) continue;
    const m = rest.match(/^(.+)\.(bin|cadenc)$/);
    if (!m) continue;
    const id = m[1];
    if (!ATTACHMENT_ID_RE.test(id)) continue;
    attachments.set(id, bytes);
  }

  return { workspaceRaw, manifest, attachments };
}

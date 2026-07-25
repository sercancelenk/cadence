/**
 * Settings Preferences shell navigation — categories map to existing
 * CollapsibleCard hash ids so deep links (`/settings#pin`) keep working.
 */

export type SettingsCategoryId =
  | 'appearance'
  | 'account'
  | 'data'
  | 'integrations'
  | 'about';

export type SettingsCategoryDef = {
  id: SettingsCategoryId;
  label: string;
  description: string;
  /** Card / section ids that belong here (also used as hash deep links). */
  hashes: readonly string[];
  /** Extra terms for the Preferences search box. */
  keywords: readonly string[];
};

export const SETTINGS_CATEGORIES: readonly SettingsCategoryDef[] = [
  {
    id: 'appearance',
    label: 'Appearance',
    description: 'Theme, app & menus size, and editor text on this device.',
    hashes: ['appearance'],
    keywords: [
      'theme',
      'dark',
      'light',
      'system',
      'font',
      'serif',
      'mono',
      'zoom',
      'scale',
      'size',
      'display',
      'menus',
      'editor',
      'chrome',
    ],
  },
  {
    id: 'account',
    label: 'Account & security',
    description: 'Sign-in, recovery codes, and PIN lock on this device.',
    hashes: ['stay-signed-in', 'recovery-codes', 'pin'],
    keywords: ['password', 'session', 'lock', 'pin', 'recovery', 'security', 'login'],
  },
  {
    id: 'data',
    label: 'Data & backup',
    description: 'Snapshots, export, restore, and local storage.',
    hashes: ['backups', 'storage'],
    keywords: ['backup', 'export', 'import', 'restore', 'snapshot', 'cache', 'disk'],
  },
  {
    id: 'integrations',
    label: 'Integrations',
    description: 'AI assistant and OS reminders.',
    hashes: ['ai', 'reminders'],
    keywords: ['openai', 'anthropic', 'reminder', 'notification', 'api'],
  },
  {
    id: 'about',
    label: 'About',
    description: 'App profile, version, updates, and the user guide.',
    hashes: ['app-profile', 'version', 'user-guide', 'updates'],
    keywords: ['version', 'update', 'guide', 'help', 'preset', 'profile', 'personal', 'work'],
  },
] as const;

export function categoryIdForHash(hash: string): SettingsCategoryId | null {
  const h = hash.replace(/^#/, '').trim();
  if (!h) return null;
  for (const cat of SETTINGS_CATEGORIES) {
    if (cat.id === h || cat.hashes.includes(h)) return cat.id;
  }
  return null;
}

export function defaultHashForCategory(id: SettingsCategoryId): string {
  const cat = SETTINGS_CATEGORIES.find((c) => c.id === id);
  return cat?.hashes[0] ?? id;
}

export function categoryMatchesQuery(cat: SettingsCategoryDef, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (cat.label.toLowerCase().includes(q)) return true;
  if (cat.description.toLowerCase().includes(q)) return true;
  if (cat.hashes.some((h) => h.toLowerCase().includes(q))) return true;
  return cat.keywords.some((k) => k.includes(q) || q.includes(k));
}

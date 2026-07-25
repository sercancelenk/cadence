import { describe, expect, it } from 'vitest';
import {
  categoryIdForHash,
  categoryMatchesQuery,
  defaultHashForCategory,
  SETTINGS_CATEGORIES,
} from './settingsNav';

describe('settingsNav', () => {
  it('resolves card hashes to categories', () => {
    expect(categoryIdForHash('pin')).toBe('account');
    expect(categoryIdForHash('#backups')).toBe('data');
    expect(categoryIdForHash('appearance')).toBe('appearance');
    expect(categoryIdForHash('nope')).toBeNull();
    expect(categoryIdForHash('')).toBeNull();
    expect(categoryIdForHash('   ')).toBeNull();
  });

  it('default hash is the first card in the category', () => {
    expect(defaultHashForCategory('account')).toBe('stay-signed-in');
    expect(defaultHashForCategory('appearance')).toBe('appearance');
    // Unknown ids fall back to the id itself (defensive for stale hashes).
    expect(defaultHashForCategory('not-a-category' as 'account')).toBe('not-a-category');
  });

  it('search matches labels and keywords', () => {
    const appearance = SETTINGS_CATEGORIES[0]!;
    expect(categoryMatchesQuery(appearance, '')).toBe(true);
    expect(categoryMatchesQuery(appearance, 'theme')).toBe(true);
    expect(categoryMatchesQuery(appearance, 'ZOOM')).toBe(true);
    expect(categoryMatchesQuery(appearance, 'backup')).toBe(false);
    expect(categoryMatchesQuery(appearance, 'editor text')).toBe(true);
    expect(categoryMatchesQuery(appearance, 'appearance')).toBe(true);
  });
});

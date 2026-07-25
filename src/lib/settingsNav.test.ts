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
  });

  it('default hash is the first card in the category', () => {
    expect(defaultHashForCategory('account')).toBe('stay-signed-in');
    expect(defaultHashForCategory('appearance')).toBe('appearance');
  });

  it('search matches labels and keywords', () => {
    const appearance = SETTINGS_CATEGORIES[0]!;
    expect(categoryMatchesQuery(appearance, '')).toBe(true);
    expect(categoryMatchesQuery(appearance, 'theme')).toBe(true);
    expect(categoryMatchesQuery(appearance, 'ZOOM')).toBe(true);
    expect(categoryMatchesQuery(appearance, 'backup')).toBe(false);
  });
});

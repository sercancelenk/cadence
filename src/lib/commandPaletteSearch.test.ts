import { describe, expect, it } from 'vitest';
import {
  COMMAND_PALETTE_RESULT_LIMIT,
  buildSnippet,
  foldForSearch,
  groupBy,
  labelMatchesTokens,
  matchCommands,
  submittedCommand,
  tokenizeQuery,
} from './commandPaletteSearch';

describe('foldForSearch', () => {
  /**
   * `'İ'.toLowerCase()` is `i` + COMBINING DOT ABOVE, so the default fold makes
   * a Turkish note title unsearchable by the word the user typed. Pinning both
   * directions because both are how someone actually types.
   */
  it('folds the dotted capital I onto plain i', () => {
    expect(foldForSearch('İstanbul')).toBe('istanbul');
    expect('İstanbul'.toLowerCase().includes('istanbul')).toBe(false);
  });

  it('folds the dotless ı onto plain i so IŞIK and ışık meet', () => {
    expect(foldForSearch('IŞIK')).toBe(foldForSearch('ışık'));
  });

  /** `buildSnippet` and `highlight` index the folded text and slice the original. */
  it('never changes the length of the text', () => {
    for (const sample of ['İstanbul', 'ışık', 'IŞIK', 'Ünlü Şarkı', 'plain ascii', 'ÅÄÖ']) {
      expect(foldForSearch(sample)).toHaveLength(sample.length);
    }
  });
});

describe('tokenizeQuery', () => {
  it('splits on whitespace and lowercases', () => {
    expect(tokenizeQuery('  Alice   Rollout ')).toEqual(['alice', 'rollout']);
  });

  it('returns no tokens for a blank query', () => {
    expect(tokenizeQuery('   ')).toEqual([]);
  });

  it('folds Turkish dotted/dotless I in the query too', () => {
    expect(tokenizeQuery('İzmir')).toEqual(['izmir']);
  });
});

describe('matchCommands', () => {
  const commands = [
    { group: 'Notes', label: 'Q3 review', searchText: 'the rollout plan for alice' },
    { group: 'Notes', label: 'Rollout', hint: 'Locked' },
    { group: 'Teams', label: 'Platform' },
  ];

  it('requires every token to appear somewhere in the row', () => {
    expect(matchCommands(commands, ['alice', 'rollout']).map((c) => c.label)).toEqual([
      'Q3 review',
    ]);
  });

  it('matches on group and hint, not just label', () => {
    expect(matchCommands(commands, ['locked']).map((c) => c.label)).toEqual(['Rollout']);
    expect(matchCommands(commands, ['teams']).map((c) => c.label)).toEqual(['Platform']);
  });

  it('returns the head of the list when there is no query', () => {
    expect(matchCommands(commands, [])).toEqual(commands);
  });

  it('stops at the result limit instead of scanning the whole workspace', () => {
    const many = Array.from({ length: COMMAND_PALETTE_RESULT_LIMIT * 4 }, (_, i) => ({
      group: 'Notes',
      label: `Note ${i}`,
    }));
    expect(matchCommands(many, ['note'])).toHaveLength(COMMAND_PALETTE_RESULT_LIMIT);
  });

  it('finds a Turkish title from the query a user would type', () => {
    const turkish = [{ group: 'Notes', label: 'İstanbul toplantı notları' }];
    expect(matchCommands(turkish, tokenizeQuery('istanbul'))).toHaveLength(1);
    expect(matchCommands(turkish, tokenizeQuery('İSTANBUL'))).toHaveLength(1);
  });
});

describe('submittedCommand', () => {
  const commands = [
    { group: 'Actions', label: 'New note' },
    { group: 'Actions', label: 'Open settings' },
  ];

  it('runs the highlighted row once the deferred list has caught up', () => {
    expect(
      submittedCommand(commands, {
        query: '',
        deferredQuery: '',
        filtered: commands,
        cursor: 1,
      }),
    ).toBe(commands[1]);
  });

  /**
   * The regression: Enter arriving before the deferred render used to run
   * whatever the previous query had highlighted — here, "New note" for someone
   * who typed "settings".
   */
  it('matches the typed query, not the stale list, when the two disagree', () => {
    expect(
      submittedCommand(commands, {
        query: 'settings',
        deferredQuery: '',
        filtered: commands,
        cursor: 0,
      }),
    ).toBe(commands[1]);
  });

  it('runs nothing when the typed query has no match', () => {
    expect(
      submittedCommand(commands, {
        query: 'nothing matches this',
        deferredQuery: '',
        filtered: commands,
        cursor: 0,
      }),
    ).toBeUndefined();
  });
});

describe('labelMatchesTokens', () => {
  it('is false when the hit is only in the body', () => {
    expect(
      labelMatchesTokens({ group: 'Notes', label: 'Q3 review', searchText: 'rollout' }, ['rollout']),
    ).toBe(false);
  });

  it('is true when the hint carries the match', () => {
    expect(labelMatchesTokens({ group: 'Notes', label: 'Q3', hint: 'Locked' }, ['lock'])).toBe(true);
  });
});

describe('buildSnippet', () => {
  it('flattens newlines and centres the excerpt on the match', () => {
    const body = `${'a'.repeat(200)}\n\nneedle\n\n${'b'.repeat(200)}`;
    const snippet = buildSnippet(body, ['needle']);
    expect(snippet).toContain('needle');
    expect(snippet).not.toContain('\n');
    expect(snippet?.startsWith('… ')).toBe(true);
    expect(snippet?.endsWith(' …')).toBe(true);
  });

  it('returns null when no token is present', () => {
    expect(buildSnippet('nothing here', ['needle'])).toBeNull();
  });

  /**
   * The excerpt is located in the folded text and sliced out of the original,
   * so a fold that changed the length would slide the window off the match.
   * `'İ'.toLowerCase()` grows by one code point each time, which used to walk
   * the snippet clean past the word the user searched for.
   */
  it('stays aligned when the text before the match contains İ', () => {
    const body = `${'İ'.repeat(200)} needle ${'b'.repeat(200)}`;
    expect(buildSnippet(body, ['needle'])).toContain('needle');
  });
});

describe('groupBy', () => {
  it('keeps first-seen group order and row order within a group', () => {
    const rows = [
      { group: 'Notes', label: 'n1' },
      { group: 'Teams', label: 't1' },
      { group: 'Notes', label: 'n2' },
    ];
    expect(groupBy(rows, (r) => r.group)).toEqual([
      ['Notes', [rows[0], rows[2]]],
      ['Teams', [rows[1]]],
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseCadenceDeepLink, deepLinkToRendererPath, resolveTeamItemPath } = require('./deepLink.cjs');

describe('deepLink', () => {
  it('parses cadence todo links', () => {
    const parsed = parseCadenceDeepLink('cadence://todo/abc-123');
    expect(parsed).toEqual({ kind: 'todo', itemId: 'abc-123' });
    expect(deepLinkToRendererPath(parsed!)).toBe('/todos?focus=abc-123');
  });

  it('parses cadence team item links', () => {
    const parsed = parseCadenceDeepLink('cadence://item/item-1');
    expect(parsed).toEqual({ kind: 'team-item', itemId: 'item-1' });
  });

  it('resolves team item paths from app data', () => {
    const appData = {
      items: [{ id: 'item-1', personId: 'person-1', title: 'Follow up' }],
      people: [{ id: 'person-1', teamId: 'team-1', name: 'Alex' }],
    };
    expect(resolveTeamItemPath('item-1', appData)).toBe('/teams/team-1/people/person-1?focus=item-1');
    expect(deepLinkToRendererPath({ kind: 'team-item', itemId: 'item-1' }, appData)).toBe(
      '/teams/team-1/people/person-1?focus=item-1',
    );
  });

  it('rejects unknown schemes', () => {
    expect(parseCadenceDeepLink('https://example.com')).toBeNull();
  });
});

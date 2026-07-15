import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  carryOverHeading,
  defaultAgenda,
  extractCarryOver,
  oneOnOneWayOfWorking,
  readOneOnOneLang,
  writeOneOnOneLang,
  ONE_ON_ONE_LANG_STORAGE_KEY,
} from './oneOnOneAgenda';

describe('oneOnOneAgenda', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it('builds EN and TR starter templates with the person name', () => {
    const en = defaultAgenda('Ada', 'en');
    expect(en).toContain('## Check-in');
    expect(en).toContain('## Agenda — Ada');
    expect(en).toContain('## Agenda — me');
    expect(en).toContain('- [ ] **Me:**');
    expect(en).toContain('**Ada:**');
    expect(en).not.toMatch(/How are they feeling|Leader|Praise|Their agenda/i);

    const tr = defaultAgenda('Ada', 'tr');
    expect(tr).toMatch(/^## Check-in\n/m);
    expect(tr).toContain('## Gündem — Ada');
    expect(tr).toContain('## Gündem — ben');
    expect(tr).toContain('- [ ] **Ben:**');
    expect(tr).not.toMatch(/buz kırıcı|Nasıl hissediyor|Lider|Onun gündemi|Benim gündemim/i);
  });

  it('extracts unchecked checklist lines for carry-over', () => {
    const agenda = [
      '## Actions',
      '- [ ] Open item',
      '- [x] Done item',
      '- [ ] ',
      '- plain bullet',
    ].join('\n');
    expect(extractCarryOver(agenda)).toBe('- [ ] Open item');
  });

  it('returns bilingual way-of-working rules in a peer-neutral tone', () => {
    const en = oneOnOneWayOfWorking('en');
    expect(en.heading).toBe('1:1 way of working');
    expect(en.rules).toHaveLength(5);
    expect(en.intro).not.toMatch(/\bas the leader\b/i);
    expect(en.rules.some((r) => /leader/i.test(r.body))).toBe(false);

    const tr = oneOnOneWayOfWorking('tr');
    expect(tr.heading).toMatch(/1:1/);
    expect(tr.rules.some((r) => /liderin işi/i.test(r.body))).toBe(false);
    expect(carryOverHeading('tr')).toMatch(/Devreden/i);
  });

  it('persists language preference in localStorage', () => {
    expect(readOneOnOneLang()).toBe('en');
    writeOneOnOneLang('tr');
    expect(localStorage.getItem(ONE_ON_ONE_LANG_STORAGE_KEY)).toBe('tr');
    expect(readOneOnOneLang()).toBe('tr');
  });

  it('falls back to en when storage throws', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(readOneOnOneLang()).toBe('en');
    getItem.mockRestore();
  });
});

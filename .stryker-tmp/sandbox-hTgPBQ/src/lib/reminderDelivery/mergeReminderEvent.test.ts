// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { describe, expect, it } from 'vitest';
import { mergeReminderEventIntoAppData } from './mergeReminderEvent';
import type { AppData } from '../../model';
function base(overrides: Partial<AppData> = {}): AppData {
  if (stryMutAct_9fa48("3002")) {
    {}
  } else {
    stryCov_9fa48("3002");
    return {
      teams: [],
      people: [],
      items: [],
      todoGroups: [],
      todoItems: [],
      notes: [],
      notifiedReminderIds: [],
      ...overrides
    } as AppData;
  }
}
describe(stryMutAct_9fa48("3003") ? "" : (stryCov_9fa48("3003"), 'mergeReminderEventIntoAppData'), () => {
  if (stryMutAct_9fa48("3004")) {
    {}
  } else {
    stryCov_9fa48("3004");
    it(stryMutAct_9fa48("3005") ? "" : (stryCov_9fa48("3005"), 'merges reminder fields without overwriting local title edits'), () => {
      if (stryMutAct_9fa48("3006")) {
        {}
      } else {
        stryCov_9fa48("3006");
        const prev = base(stryMutAct_9fa48("3007") ? {} : (stryCov_9fa48("3007"), {
          todoItems: stryMutAct_9fa48("3008") ? [] : (stryCov_9fa48("3008"), [stryMutAct_9fa48("3009") ? {} : (stryCov_9fa48("3009"), {
            id: stryMutAct_9fa48("3010") ? "" : (stryCov_9fa48("3010"), 't1'),
            groupId: stryMutAct_9fa48("3011") ? "" : (stryCov_9fa48("3011"), 'g1'),
            title: stryMutAct_9fa48("3012") ? "" : (stryCov_9fa48("3012"), 'Local edit in progress'),
            status: stryMutAct_9fa48("3013") ? "" : (stryCov_9fa48("3013"), 'todo'),
            remindAt: stryMutAct_9fa48("3014") ? "" : (stryCov_9fa48("3014"), '2026-06-01T10:00:00.000Z'),
            createdAt: stryMutAct_9fa48("3015") ? "" : (stryCov_9fa48("3015"), '2026-01-01'),
            updatedAt: stryMutAct_9fa48("3016") ? "" : (stryCov_9fa48("3016"), '2026-01-01')
          })]),
          notifiedReminderIds: stryMutAct_9fa48("3017") ? ["Stryker was here"] : (stryCov_9fa48("3017"), [])
        }));
        const disk = base(stryMutAct_9fa48("3018") ? {} : (stryCov_9fa48("3018"), {
          todoItems: stryMutAct_9fa48("3019") ? [] : (stryCov_9fa48("3019"), [stryMutAct_9fa48("3020") ? {} : (stryCov_9fa48("3020"), {
            id: stryMutAct_9fa48("3021") ? "" : (stryCov_9fa48("3021"), 't1'),
            groupId: stryMutAct_9fa48("3022") ? "" : (stryCov_9fa48("3022"), 'g1'),
            title: stryMutAct_9fa48("3023") ? "" : (stryCov_9fa48("3023"), 'Stale title from disk'),
            status: stryMutAct_9fa48("3024") ? "" : (stryCov_9fa48("3024"), 'todo'),
            remindAt: stryMutAct_9fa48("3025") ? "" : (stryCov_9fa48("3025"), '2026-06-02T10:00:00.000Z'),
            remindRepeat: stryMutAct_9fa48("3026") ? "" : (stryCov_9fa48("3026"), 'daily'),
            createdAt: stryMutAct_9fa48("3027") ? "" : (stryCov_9fa48("3027"), '2026-01-01'),
            updatedAt: stryMutAct_9fa48("3028") ? "" : (stryCov_9fa48("3028"), '2026-06-02')
          })]),
          notifiedReminderIds: stryMutAct_9fa48("3029") ? [] : (stryCov_9fa48("3029"), [stryMutAct_9fa48("3030") ? "" : (stryCov_9fa48("3030"), 't1\u00012026-06-01T10:00:00.000Z')])
        }));
        const merged = mergeReminderEventIntoAppData(prev, disk);
        expect(merged.todoItems[0].title).toBe(stryMutAct_9fa48("3031") ? "" : (stryCov_9fa48("3031"), 'Local edit in progress'));
        expect(merged.todoItems[0].remindAt).toBe(stryMutAct_9fa48("3032") ? "" : (stryCov_9fa48("3032"), '2026-06-02T10:00:00.000Z'));
        expect(merged.todoItems[0].remindRepeat).toBe(stryMutAct_9fa48("3033") ? "" : (stryCov_9fa48("3033"), 'daily'));
        expect(merged.notifiedReminderIds).toEqual(disk.notifiedReminderIds);
      }
    });
    it(stryMutAct_9fa48("3034") ? "" : (stryCov_9fa48("3034"), 'merges people item reminder fields without touching other fields'), () => {
      if (stryMutAct_9fa48("3035")) {
        {}
      } else {
        stryCov_9fa48("3035");
        const prev = base(stryMutAct_9fa48("3036") ? {} : (stryCov_9fa48("3036"), {
          items: stryMutAct_9fa48("3037") ? [] : (stryCov_9fa48("3037"), [stryMutAct_9fa48("3038") ? {} : (stryCov_9fa48("3038"), {
            id: stryMutAct_9fa48("3039") ? "" : (stryCov_9fa48("3039"), 'p1'),
            personId: stryMutAct_9fa48("3040") ? "" : (stryCov_9fa48("3040"), 'person-1'),
            kind: stryMutAct_9fa48("3041") ? "" : (stryCov_9fa48("3041"), 'task'),
            title: stryMutAct_9fa48("3042") ? "" : (stryCov_9fa48("3042"), 'Local follow-up'),
            body: stryMutAct_9fa48("3043") ? "Stryker was here!" : (stryCov_9fa48("3043"), ''),
            done: stryMutAct_9fa48("3044") ? true : (stryCov_9fa48("3044"), false),
            remindAt: stryMutAct_9fa48("3045") ? "" : (stryCov_9fa48("3045"), '2026-06-01T09:00:00.000Z'),
            createdAt: stryMutAct_9fa48("3046") ? "" : (stryCov_9fa48("3046"), '2026-01-01'),
            updatedAt: stryMutAct_9fa48("3047") ? "" : (stryCov_9fa48("3047"), '2026-01-01')
          })])
        }));
        const disk = base(stryMutAct_9fa48("3048") ? {} : (stryCov_9fa48("3048"), {
          items: stryMutAct_9fa48("3049") ? [] : (stryCov_9fa48("3049"), [stryMutAct_9fa48("3050") ? {} : (stryCov_9fa48("3050"), {
            id: stryMutAct_9fa48("3051") ? "" : (stryCov_9fa48("3051"), 'p1'),
            personId: stryMutAct_9fa48("3052") ? "" : (stryCov_9fa48("3052"), 'person-1'),
            kind: stryMutAct_9fa48("3053") ? "" : (stryCov_9fa48("3053"), 'task'),
            title: stryMutAct_9fa48("3054") ? "" : (stryCov_9fa48("3054"), 'Disk title'),
            body: stryMutAct_9fa48("3055") ? "Stryker was here!" : (stryCov_9fa48("3055"), ''),
            done: stryMutAct_9fa48("3056") ? true : (stryCov_9fa48("3056"), false),
            remindAt: stryMutAct_9fa48("3057") ? "" : (stryCov_9fa48("3057"), '2026-06-02T09:00:00.000Z'),
            remindRepeat: stryMutAct_9fa48("3058") ? "" : (stryCov_9fa48("3058"), 'weekly'),
            createdAt: stryMutAct_9fa48("3059") ? "" : (stryCov_9fa48("3059"), '2026-01-01'),
            updatedAt: stryMutAct_9fa48("3060") ? "" : (stryCov_9fa48("3060"), '2026-06-02')
          })])
        }));
        const merged = mergeReminderEventIntoAppData(prev, disk);
        expect(merged.items[0].title).toBe(stryMutAct_9fa48("3061") ? "" : (stryCov_9fa48("3061"), 'Local follow-up'));
        expect(merged.items[0].remindAt).toBe(stryMutAct_9fa48("3062") ? "" : (stryCov_9fa48("3062"), '2026-06-02T09:00:00.000Z'));
        expect(merged.items[0].remindRepeat).toBe(stryMutAct_9fa48("3063") ? "" : (stryCov_9fa48("3063"), 'weekly'));
      }
    });
    it(stryMutAct_9fa48("3064") ? "" : (stryCov_9fa48("3064"), 'skips rows when reminder fields already match disk'), () => {
      if (stryMutAct_9fa48("3065")) {
        {}
      } else {
        stryCov_9fa48("3065");
        const todo = stryMutAct_9fa48("3066") ? {} : (stryCov_9fa48("3066"), {
          id: stryMutAct_9fa48("3067") ? "" : (stryCov_9fa48("3067"), 't1'),
          groupId: stryMutAct_9fa48("3068") ? "" : (stryCov_9fa48("3068"), 'g1'),
          title: stryMutAct_9fa48("3069") ? "" : (stryCov_9fa48("3069"), 'Same'),
          status: 'todo' as const,
          remindAt: stryMutAct_9fa48("3070") ? "" : (stryCov_9fa48("3070"), '2026-06-01T10:00:00.000Z'),
          remindRepeat: 'daily' as const,
          createdAt: stryMutAct_9fa48("3071") ? "" : (stryCov_9fa48("3071"), '2026-01-01'),
          updatedAt: stryMutAct_9fa48("3072") ? "" : (stryCov_9fa48("3072"), '2026-01-01')
        });
        const prev = base(stryMutAct_9fa48("3073") ? {} : (stryCov_9fa48("3073"), {
          todoItems: stryMutAct_9fa48("3074") ? [] : (stryCov_9fa48("3074"), [todo])
        }));
        const disk = base(stryMutAct_9fa48("3075") ? {} : (stryCov_9fa48("3075"), {
          todoItems: stryMutAct_9fa48("3076") ? [] : (stryCov_9fa48("3076"), [stryMutAct_9fa48("3077") ? {} : (stryCov_9fa48("3077"), {
            ...todo
          })])
        }));
        const merged = mergeReminderEventIntoAppData(prev, disk);
        expect(merged.todoItems[0]).toBe(prev.todoItems[0]);
      }
    });
    it(stryMutAct_9fa48("3078") ? "" : (stryCov_9fa48("3078"), 'leaves todos and items absent on disk unchanged'), () => {
      if (stryMutAct_9fa48("3079")) {
        {}
      } else {
        stryCov_9fa48("3079");
        const prev = base(stryMutAct_9fa48("3080") ? {} : (stryCov_9fa48("3080"), {
          todoItems: stryMutAct_9fa48("3081") ? [] : (stryCov_9fa48("3081"), [stryMutAct_9fa48("3082") ? {} : (stryCov_9fa48("3082"), {
            id: stryMutAct_9fa48("3083") ? "" : (stryCov_9fa48("3083"), 'only-local'),
            groupId: stryMutAct_9fa48("3084") ? "" : (stryCov_9fa48("3084"), 'g1'),
            title: stryMutAct_9fa48("3085") ? "" : (stryCov_9fa48("3085"), 'X'),
            status: stryMutAct_9fa48("3086") ? "" : (stryCov_9fa48("3086"), 'todo'),
            remindAt: stryMutAct_9fa48("3087") ? "" : (stryCov_9fa48("3087"), '2026-06-01T10:00:00.000Z'),
            createdAt: stryMutAct_9fa48("3088") ? "" : (stryCov_9fa48("3088"), '2026-01-01'),
            updatedAt: stryMutAct_9fa48("3089") ? "" : (stryCov_9fa48("3089"), '2026-01-01')
          })])
        }));
        const merged = mergeReminderEventIntoAppData(prev, base());
        expect(merged.todoItems[0].remindAt).toBe(stryMutAct_9fa48("3090") ? "" : (stryCov_9fa48("3090"), '2026-06-01T10:00:00.000Z'));
      }
    });
  }
});
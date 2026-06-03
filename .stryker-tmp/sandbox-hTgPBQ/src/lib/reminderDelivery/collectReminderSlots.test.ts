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
import { createRequire } from 'node:module';
import { collectFutureReminderSlots } from './collectReminderSlots';
import type { AppData } from '../../core/model';
import { reminderNotifyKey } from '../reminderNotify';
const require = createRequire(import.meta.url);
const {
  collectFutureSlots
} = require('../../../electron/reminder/collectDesiredSlots.cjs');
const NOW = Date.parse(stryMutAct_9fa48("2825") ? "" : (stryCov_9fa48("2825"), '2026-05-31T12:00:00.000Z'));
const FUTURE_REMIND = stryMutAct_9fa48("2826") ? "" : (stryCov_9fa48("2826"), '2026-05-31T14:00:00.000Z');
const FUTURE_DUE = stryMutAct_9fa48("2827") ? "" : (stryCov_9fa48("2827"), '2026-05-31T16:00:00.000Z');
function baseData(overrides: Partial<AppData> = {}): AppData {
  if (stryMutAct_9fa48("2828")) {
    {}
  } else {
    stryCov_9fa48("2828");
    return {
      version: 3,
      notifiedReminderIds: [],
      teams: [{
        id: 'team-1',
        name: 'Eng',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z'
      }],
      people: [{
        id: 'person-1',
        teamId: 'team-1',
        name: 'Alex',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z'
      }],
      todoGroups: [{
        id: 'grp-1',
        name: 'Inbox',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        priority: 'normal'
      }],
      items: [],
      todoItems: [],
      notes: [],
      lastTeamId: null,
      utilityDocument: {
        title: '',
        body: '',
        updatedAt: '2026-05-31T12:00:00.000Z'
      },
      utilityStructuredText: {
        title: '',
        body: '',
        updatedAt: '2026-05-31T12:00:00.000Z'
      },
      userProfile: {
        displayName: '',
        updatedAt: '2026-05-31T12:00:00.000Z'
      },
      aiSettings: {
        provider: 'none',
        updatedAt: '2026-05-31T12:00:00.000Z'
      },
      ...overrides
    } as AppData;
  }
}
function expectNoFutureSlots(data: AppData) {
  if (stryMutAct_9fa48("2829")) {
    {}
  } else {
    stryCov_9fa48("2829");
    expect(collectFutureReminderSlots(data, NOW)).toHaveLength(0);
    expect(collectFutureSlots(data, NOW)).toHaveLength(0);
  }
}
describe(stryMutAct_9fa48("2830") ? "" : (stryCov_9fa48("2830"), 'collectFutureReminderSlots — due vs remind isolation'), () => {
  if (stryMutAct_9fa48("2831")) {
    {}
  } else {
    stryCov_9fa48("2831");
    it(stryMutAct_9fa48("2832") ? "" : (stryCov_9fa48("2832"), 'does not schedule a todo that only has dueAt (regression: due must not notify)'), () => {
      if (stryMutAct_9fa48("2833")) {
        {}
      } else {
        stryCov_9fa48("2833");
        const data = baseData(stryMutAct_9fa48("2834") ? {} : (stryCov_9fa48("2834"), {
          todoItems: stryMutAct_9fa48("2835") ? [] : (stryCov_9fa48("2835"), [stryMutAct_9fa48("2836") ? {} : (stryCov_9fa48("2836"), {
            id: stryMutAct_9fa48("2837") ? "" : (stryCov_9fa48("2837"), 't-due-only'),
            groupId: stryMutAct_9fa48("2838") ? "" : (stryCov_9fa48("2838"), 'grp-1'),
            title: stryMutAct_9fa48("2839") ? "" : (stryCov_9fa48("2839"), 'Deadline only'),
            status: stryMutAct_9fa48("2840") ? "" : (stryCov_9fa48("2840"), 'todo'),
            dueAt: FUTURE_DUE,
            createdAt: stryMutAct_9fa48("2841") ? "" : (stryCov_9fa48("2841"), '2026-05-31T12:00:00.000Z'),
            updatedAt: stryMutAct_9fa48("2842") ? "" : (stryCov_9fa48("2842"), '2026-05-31T12:00:00.000Z')
          })])
        }));
        expectNoFutureSlots(data);
      }
    });
    it(stryMutAct_9fa48("2843") ? "" : (stryCov_9fa48("2843"), 'does not schedule a team item that only has dueAt'), () => {
      if (stryMutAct_9fa48("2844")) {
        {}
      } else {
        stryCov_9fa48("2844");
        const data = baseData(stryMutAct_9fa48("2845") ? {} : (stryCov_9fa48("2845"), {
          items: stryMutAct_9fa48("2846") ? [] : (stryCov_9fa48("2846"), [stryMutAct_9fa48("2847") ? {} : (stryCov_9fa48("2847"), {
            id: stryMutAct_9fa48("2848") ? "" : (stryCov_9fa48("2848"), 'i-due-only'),
            personId: stryMutAct_9fa48("2849") ? "" : (stryCov_9fa48("2849"), 'person-1'),
            kind: stryMutAct_9fa48("2850") ? "" : (stryCov_9fa48("2850"), 'task'),
            title: stryMutAct_9fa48("2851") ? "" : (stryCov_9fa48("2851"), 'Team deadline'),
            body: stryMutAct_9fa48("2852") ? "Stryker was here!" : (stryCov_9fa48("2852"), ''),
            dueAt: FUTURE_DUE,
            done: stryMutAct_9fa48("2853") ? true : (stryCov_9fa48("2853"), false),
            createdAt: stryMutAct_9fa48("2854") ? "" : (stryCov_9fa48("2854"), '2026-05-31T12:00:00.000Z'),
            updatedAt: stryMutAct_9fa48("2855") ? "" : (stryCov_9fa48("2855"), '2026-05-31T12:00:00.000Z')
          })])
        }));
        expectNoFutureSlots(data);
      }
    });
    it(stryMutAct_9fa48("2856") ? "" : (stryCov_9fa48("2856"), 'schedules a todo with remindAt'), () => {
      if (stryMutAct_9fa48("2857")) {
        {}
      } else {
        stryCov_9fa48("2857");
        const data = baseData(stryMutAct_9fa48("2858") ? {} : (stryCov_9fa48("2858"), {
          todoItems: stryMutAct_9fa48("2859") ? [] : (stryCov_9fa48("2859"), [stryMutAct_9fa48("2860") ? {} : (stryCov_9fa48("2860"), {
            id: stryMutAct_9fa48("2861") ? "" : (stryCov_9fa48("2861"), 't1'),
            groupId: stryMutAct_9fa48("2862") ? "" : (stryCov_9fa48("2862"), 'grp-1'),
            title: stryMutAct_9fa48("2863") ? "" : (stryCov_9fa48("2863"), 'Buy milk'),
            status: stryMutAct_9fa48("2864") ? "" : (stryCov_9fa48("2864"), 'todo'),
            remindAt: FUTURE_REMIND,
            createdAt: stryMutAct_9fa48("2865") ? "" : (stryCov_9fa48("2865"), '2026-05-31T12:00:00.000Z'),
            updatedAt: stryMutAct_9fa48("2866") ? "" : (stryCov_9fa48("2866"), '2026-05-31T12:00:00.000Z')
          })])
        }));
        const tsSlots = collectFutureReminderSlots(data, NOW);
        const cjsSlots = collectFutureSlots(data, NOW);
        expect(tsSlots).toHaveLength(1);
        expect(cjsSlots).toHaveLength(1);
        expect(tsSlots[0].slotKey).toBe(reminderNotifyKey(stryMutAct_9fa48("2867") ? "" : (stryCov_9fa48("2867"), 't1'), FUTURE_REMIND));
        expect(tsSlots[0].deepLinkPath).toBe(stryMutAct_9fa48("2868") ? "" : (stryCov_9fa48("2868"), '/todos?focus=t1'));
        expect(tsSlots.map(stryMutAct_9fa48("2869") ? () => undefined : (stryCov_9fa48("2869"), s => s.slotKey))).toEqual(cjsSlots.map(stryMutAct_9fa48("2870") ? () => undefined : (stryCov_9fa48("2870"), (s: {
          slotKey: string;
        }) => s.slotKey)));
      }
    });
    it(stryMutAct_9fa48("2871") ? "" : (stryCov_9fa48("2871"), 'schedules a team item with remindAt even when dueAt differs'), () => {
      if (stryMutAct_9fa48("2872")) {
        {}
      } else {
        stryCov_9fa48("2872");
        const data = baseData(stryMutAct_9fa48("2873") ? {} : (stryCov_9fa48("2873"), {
          items: stryMutAct_9fa48("2874") ? [] : (stryCov_9fa48("2874"), [stryMutAct_9fa48("2875") ? {} : (stryCov_9fa48("2875"), {
            id: stryMutAct_9fa48("2876") ? "" : (stryCov_9fa48("2876"), 'i1'),
            personId: stryMutAct_9fa48("2877") ? "" : (stryCov_9fa48("2877"), 'person-1'),
            kind: stryMutAct_9fa48("2878") ? "" : (stryCov_9fa48("2878"), 'task'),
            title: stryMutAct_9fa48("2879") ? "" : (stryCov_9fa48("2879"), 'Follow up'),
            body: stryMutAct_9fa48("2880") ? "Stryker was here!" : (stryCov_9fa48("2880"), ''),
            remindAt: FUTURE_REMIND,
            dueAt: FUTURE_DUE,
            done: stryMutAct_9fa48("2881") ? true : (stryCov_9fa48("2881"), false),
            createdAt: stryMutAct_9fa48("2882") ? "" : (stryCov_9fa48("2882"), '2026-05-31T12:00:00.000Z'),
            updatedAt: stryMutAct_9fa48("2883") ? "" : (stryCov_9fa48("2883"), '2026-05-31T12:00:00.000Z')
          })])
        }));
        const tsSlots = collectFutureReminderSlots(data, NOW);
        const cjsSlots = collectFutureSlots(data, NOW);
        expect(tsSlots).toHaveLength(1);
        expect(cjsSlots).toHaveLength(1);
        expect(tsSlots[0].slotKey).toBe(reminderNotifyKey(stryMutAct_9fa48("2884") ? "" : (stryCov_9fa48("2884"), 'i1'), FUTURE_REMIND));
        expect(tsSlots[0].source).toBe(stryMutAct_9fa48("2885") ? "" : (stryCov_9fa48("2885"), 'team-item'));
        expect(tsSlots[0].title).toBe(stryMutAct_9fa48("2886") ? "" : (stryCov_9fa48("2886"), 'Task reminder'));
        expect(tsSlots.map(stryMutAct_9fa48("2887") ? () => undefined : (stryCov_9fa48("2887"), s => s.slotKey))).toEqual(cjsSlots.map(stryMutAct_9fa48("2888") ? () => undefined : (stryCov_9fa48("2888"), (s: {
          slotKey: string;
        }) => s.slotKey)));
      }
    });
    it(stryMutAct_9fa48("2889") ? "" : (stryCov_9fa48("2889"), 'skips done team items and todos without remindAt'), () => {
      if (stryMutAct_9fa48("2890")) {
        {}
      } else {
        stryCov_9fa48("2890");
        const data = baseData(stryMutAct_9fa48("2891") ? {} : (stryCov_9fa48("2891"), {
          items: stryMutAct_9fa48("2892") ? [] : (stryCov_9fa48("2892"), [stryMutAct_9fa48("2893") ? {} : (stryCov_9fa48("2893"), {
            id: stryMutAct_9fa48("2894") ? "" : (stryCov_9fa48("2894"), 'i-done'),
            personId: stryMutAct_9fa48("2895") ? "" : (stryCov_9fa48("2895"), 'person-1'),
            kind: stryMutAct_9fa48("2896") ? "" : (stryCov_9fa48("2896"), 'task'),
            title: stryMutAct_9fa48("2897") ? "" : (stryCov_9fa48("2897"), 'Done task'),
            body: stryMutAct_9fa48("2898") ? "Stryker was here!" : (stryCov_9fa48("2898"), ''),
            remindAt: FUTURE_REMIND,
            done: stryMutAct_9fa48("2899") ? false : (stryCov_9fa48("2899"), true),
            createdAt: stryMutAct_9fa48("2900") ? "" : (stryCov_9fa48("2900"), '2026-05-31T12:00:00.000Z'),
            updatedAt: stryMutAct_9fa48("2901") ? "" : (stryCov_9fa48("2901"), '2026-05-31T12:00:00.000Z')
          })]),
          todoItems: stryMutAct_9fa48("2902") ? [] : (stryCov_9fa48("2902"), [stryMutAct_9fa48("2903") ? {} : (stryCov_9fa48("2903"), {
            id: stryMutAct_9fa48("2904") ? "" : (stryCov_9fa48("2904"), 't-done'),
            groupId: stryMutAct_9fa48("2905") ? "" : (stryCov_9fa48("2905"), 'grp-1'),
            title: stryMutAct_9fa48("2906") ? "" : (stryCov_9fa48("2906"), 'Done todo'),
            status: stryMutAct_9fa48("2907") ? "" : (stryCov_9fa48("2907"), 'done'),
            remindAt: FUTURE_REMIND,
            createdAt: stryMutAct_9fa48("2908") ? "" : (stryCov_9fa48("2908"), '2026-05-31T12:00:00.000Z'),
            updatedAt: stryMutAct_9fa48("2909") ? "" : (stryCov_9fa48("2909"), '2026-05-31T12:00:00.000Z')
          })])
        }));
        expectNoFutureSlots(data);
      }
    });
  }
});
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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { postReminderCancelItem, postReminderSyncToServiceWorker } from './pwaReminderSync';
import type { ReminderSlot } from './types';
describe(stryMutAct_9fa48("3276") ? "" : (stryCov_9fa48("3276"), 'pwaReminderSync'), () => {
  if (stryMutAct_9fa48("3277")) {
    {}
  } else {
    stryCov_9fa48("3277");
    const postMessage = vi.fn();
    let ready: Promise<{
      active: {
        postMessage: typeof postMessage;
      } | null;
    }>;
    beforeEach(() => {
      if (stryMutAct_9fa48("3278")) {
        {}
      } else {
        stryCov_9fa48("3278");
        postMessage.mockClear();
        ready = Promise.resolve(stryMutAct_9fa48("3279") ? {} : (stryCov_9fa48("3279"), {
          active: stryMutAct_9fa48("3280") ? {} : (stryCov_9fa48("3280"), {
            postMessage
          })
        }));
        Object.defineProperty(navigator, stryMutAct_9fa48("3281") ? "" : (stryCov_9fa48("3281"), 'serviceWorker'), stryMutAct_9fa48("3282") ? {} : (stryCov_9fa48("3282"), {
          configurable: stryMutAct_9fa48("3283") ? false : (stryCov_9fa48("3283"), true),
          value: stryMutAct_9fa48("3284") ? {} : (stryCov_9fa48("3284"), {
            ready
          })
        }));
      }
    });
    afterEach(() => {
      if (stryMutAct_9fa48("3285")) {
        {}
      } else {
        stryCov_9fa48("3285");
        vi.restoreAllMocks();
      }
    });
    it(stryMutAct_9fa48("3286") ? "" : (stryCov_9fa48("3286"), 'postReminderSyncToServiceWorker sends REMINDER_SYNC with slots'), async () => {
      if (stryMutAct_9fa48("3287")) {
        {}
      } else {
        stryCov_9fa48("3287");
        const slots: ReminderSlot[] = stryMutAct_9fa48("3288") ? [] : (stryCov_9fa48("3288"), [stryMutAct_9fa48("3289") ? {} : (stryCov_9fa48("3289"), {
          slotKey: stryMutAct_9fa48("3290") ? "" : (stryCov_9fa48("3290"), 'k1'),
          itemId: stryMutAct_9fa48("3291") ? "" : (stryCov_9fa48("3291"), 't1'),
          source: stryMutAct_9fa48("3292") ? "" : (stryCov_9fa48("3292"), 'todo'),
          remindAt: stryMutAct_9fa48("3293") ? "" : (stryCov_9fa48("3293"), '2026-06-01T10:00:00.000Z'),
          title: stryMutAct_9fa48("3294") ? "" : (stryCov_9fa48("3294"), 'Task'),
          body: stryMutAct_9fa48("3295") ? "Stryker was here!" : (stryCov_9fa48("3295"), '')
        })]);
        await postReminderSyncToServiceWorker(slots);
        expect(postMessage).toHaveBeenCalledWith(stryMutAct_9fa48("3296") ? {} : (stryCov_9fa48("3296"), {
          type: stryMutAct_9fa48("3297") ? "" : (stryCov_9fa48("3297"), 'REMINDER_SYNC'),
          slots
        }));
      }
    });
    it(stryMutAct_9fa48("3298") ? "" : (stryCov_9fa48("3298"), 'postReminderCancelItem sends REMINDER_CANCEL_ITEM'), async () => {
      if (stryMutAct_9fa48("3299")) {
        {}
      } else {
        stryCov_9fa48("3299");
        await postReminderCancelItem(stryMutAct_9fa48("3300") ? "" : (stryCov_9fa48("3300"), 'item-42'));
        expect(postMessage).toHaveBeenCalledWith(stryMutAct_9fa48("3301") ? {} : (stryCov_9fa48("3301"), {
          type: stryMutAct_9fa48("3302") ? "" : (stryCov_9fa48("3302"), 'REMINDER_CANCEL_ITEM'),
          itemId: stryMutAct_9fa48("3303") ? "" : (stryCov_9fa48("3303"), 'item-42')
        }));
      }
    });
    it(stryMutAct_9fa48("3304") ? "" : (stryCov_9fa48("3304"), 'no-ops when service worker is not registered on navigator'), async () => {
      if (stryMutAct_9fa48("3305")) {
        {}
      } else {
        stryCov_9fa48("3305");
        vi.stubGlobal(stryMutAct_9fa48("3306") ? "" : (stryCov_9fa48("3306"), 'navigator'), {});
        await postReminderCancelItem(stryMutAct_9fa48("3307") ? "" : (stryCov_9fa48("3307"), 'x'));
        expect(postMessage).not.toHaveBeenCalled();
      }
    });
    it(stryMutAct_9fa48("3308") ? "" : (stryCov_9fa48("3308"), 'no-ops when ready rejects or active worker is missing'), async () => {
      if (stryMutAct_9fa48("3309")) {
        {}
      } else {
        stryCov_9fa48("3309");
        Object.defineProperty(navigator, stryMutAct_9fa48("3310") ? "" : (stryCov_9fa48("3310"), 'serviceWorker'), stryMutAct_9fa48("3311") ? {} : (stryCov_9fa48("3311"), {
          configurable: stryMutAct_9fa48("3312") ? false : (stryCov_9fa48("3312"), true),
          value: stryMutAct_9fa48("3313") ? {} : (stryCov_9fa48("3313"), {
            ready: Promise.reject(new Error(stryMutAct_9fa48("3314") ? "" : (stryCov_9fa48("3314"), 'offline')))
          })
        }));
        await postReminderSyncToServiceWorker(stryMutAct_9fa48("3315") ? ["Stryker was here"] : (stryCov_9fa48("3315"), []));
        expect(postMessage).not.toHaveBeenCalled();
        Object.defineProperty(navigator, stryMutAct_9fa48("3316") ? "" : (stryCov_9fa48("3316"), 'serviceWorker'), stryMutAct_9fa48("3317") ? {} : (stryCov_9fa48("3317"), {
          configurable: stryMutAct_9fa48("3318") ? false : (stryCov_9fa48("3318"), true),
          value: stryMutAct_9fa48("3319") ? {} : (stryCov_9fa48("3319"), {
            ready: Promise.resolve(stryMutAct_9fa48("3320") ? {} : (stryCov_9fa48("3320"), {
              active: null
            }))
          })
        }));
        await postReminderCancelItem(stryMutAct_9fa48("3321") ? "" : (stryCov_9fa48("3321"), 'y'));
        expect(postMessage).not.toHaveBeenCalled();
      }
    });
    it(stryMutAct_9fa48("3322") ? "" : (stryCov_9fa48("3322"), 'postReminderCancelItem no-ops for empty item id'), async () => {
      if (stryMutAct_9fa48("3323")) {
        {}
      } else {
        stryCov_9fa48("3323");
        await postReminderCancelItem(stryMutAct_9fa48("3324") ? "Stryker was here!" : (stryCov_9fa48("3324"), ''));
        expect(postMessage).not.toHaveBeenCalled();
      }
    });
  }
});
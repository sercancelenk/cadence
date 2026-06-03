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
const supportsPwaOsSchedule = vi.fn();
const postReminderCancelItem = vi.fn();
vi.mock(stryMutAct_9fa48("2738") ? "" : (stryCov_9fa48("2738"), './capabilities'), stryMutAct_9fa48("2739") ? () => undefined : (stryCov_9fa48("2739"), () => stryMutAct_9fa48("2740") ? {} : (stryCov_9fa48("2740"), {
  supportsPwaOsSchedule: stryMutAct_9fa48("2741") ? () => undefined : (stryCov_9fa48("2741"), () => supportsPwaOsSchedule())
})));
vi.mock(stryMutAct_9fa48("2742") ? "" : (stryCov_9fa48("2742"), './pwaReminderSync'), stryMutAct_9fa48("2743") ? () => undefined : (stryCov_9fa48("2743"), () => stryMutAct_9fa48("2744") ? {} : (stryCov_9fa48("2744"), {
  postReminderCancelItem: stryMutAct_9fa48("2745") ? () => undefined : (stryCov_9fa48("2745"), (id: string) => postReminderCancelItem(id))
})));
import { cancelPendingReminderSlots } from './cancelReminderSlots';
describe(stryMutAct_9fa48("2746") ? "" : (stryCov_9fa48("2746"), 'cancelPendingReminderSlots'), () => {
  if (stryMutAct_9fa48("2747")) {
    {}
  } else {
    stryCov_9fa48("2747");
    const cancelReminderSlots = vi.fn().mockResolvedValue(stryMutAct_9fa48("2748") ? {} : (stryCov_9fa48("2748"), {
      ok: stryMutAct_9fa48("2749") ? false : (stryCov_9fa48("2749"), true)
    }));
    beforeEach(() => {
      if (stryMutAct_9fa48("2750")) {
        {}
      } else {
        stryCov_9fa48("2750");
        vi.clearAllMocks();
        supportsPwaOsSchedule.mockReturnValue(stryMutAct_9fa48("2751") ? true : (stryCov_9fa48("2751"), false));
        window.cadence = {
          cancelReminderSlots
        } as typeof window.cadence;
      }
    });
    afterEach(() => {
      if (stryMutAct_9fa48("2752")) {
        {}
      } else {
        stryCov_9fa48("2752");
        delete window.cadence;
      }
    });
    it(stryMutAct_9fa48("2753") ? "" : (stryCov_9fa48("2753"), 'no-ops without item id'), () => {
      if (stryMutAct_9fa48("2754")) {
        {}
      } else {
        stryCov_9fa48("2754");
        cancelPendingReminderSlots(undefined);
        expect(cancelReminderSlots).not.toHaveBeenCalled();
        expect(postReminderCancelItem).not.toHaveBeenCalled();
      }
    });
    it(stryMutAct_9fa48("2755") ? "" : (stryCov_9fa48("2755"), 'calls window.cadence.cancelReminderSlots when present'), () => {
      if (stryMutAct_9fa48("2756")) {
        {}
      } else {
        stryCov_9fa48("2756");
        cancelPendingReminderSlots(stryMutAct_9fa48("2757") ? "" : (stryCov_9fa48("2757"), 'item-1'));
        expect(cancelReminderSlots).toHaveBeenCalledWith(stryMutAct_9fa48("2758") ? "" : (stryCov_9fa48("2758"), 'item-1'));
      }
    });
    it(stryMutAct_9fa48("2759") ? "" : (stryCov_9fa48("2759"), 'posts SW cancel when PWA OS schedule is supported'), () => {
      if (stryMutAct_9fa48("2760")) {
        {}
      } else {
        stryCov_9fa48("2760");
        supportsPwaOsSchedule.mockReturnValue(stryMutAct_9fa48("2761") ? false : (stryCov_9fa48("2761"), true));
        cancelPendingReminderSlots(stryMutAct_9fa48("2762") ? "" : (stryCov_9fa48("2762"), 'item-2'));
        expect(postReminderCancelItem).toHaveBeenCalledWith(stryMutAct_9fa48("2763") ? "" : (stryCov_9fa48("2763"), 'item-2'));
      }
    });
    it(stryMutAct_9fa48("2764") ? "" : (stryCov_9fa48("2764"), 'skips SW cancel when PWA OS schedule is unsupported'), () => {
      if (stryMutAct_9fa48("2765")) {
        {}
      } else {
        stryCov_9fa48("2765");
        supportsPwaOsSchedule.mockReturnValue(stryMutAct_9fa48("2766") ? true : (stryCov_9fa48("2766"), false));
        cancelPendingReminderSlots(stryMutAct_9fa48("2767") ? "" : (stryCov_9fa48("2767"), 'item-3'));
        expect(postReminderCancelItem).not.toHaveBeenCalled();
      }
    });
    it(stryMutAct_9fa48("2768") ? "" : (stryCov_9fa48("2768"), 'still posts SW cancel when cadence bridge is absent'), () => {
      if (stryMutAct_9fa48("2769")) {
        {}
      } else {
        stryCov_9fa48("2769");
        delete window.cadence;
        supportsPwaOsSchedule.mockReturnValue(stryMutAct_9fa48("2770") ? false : (stryCov_9fa48("2770"), true));
        cancelPendingReminderSlots(stryMutAct_9fa48("2771") ? "" : (stryCov_9fa48("2771"), 'item-4'));
        expect(postReminderCancelItem).toHaveBeenCalledWith(stryMutAct_9fa48("2772") ? "" : (stryCov_9fa48("2772"), 'item-4'));
      }
    });
  }
});
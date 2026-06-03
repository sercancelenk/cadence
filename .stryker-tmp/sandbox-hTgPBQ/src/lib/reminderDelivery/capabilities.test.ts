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
import { afterEach, describe, expect, it, vi } from 'vitest';
import { supportsPwaOsSchedule } from './capabilities';
describe(stryMutAct_9fa48("2782") ? "" : (stryCov_9fa48("2782"), 'supportsPwaOsSchedule'), () => {
  if (stryMutAct_9fa48("2783")) {
    {}
  } else {
    stryCov_9fa48("2783");
    afterEach(() => {
      if (stryMutAct_9fa48("2784")) {
        {}
      } else {
        stryCov_9fa48("2784");
        vi.unstubAllGlobals();
      }
    });
    it(stryMutAct_9fa48("2785") ? "" : (stryCov_9fa48("2785"), 'returns false when service worker is unavailable'), () => {
      if (stryMutAct_9fa48("2786")) {
        {}
      } else {
        stryCov_9fa48("2786");
        vi.stubGlobal(stryMutAct_9fa48("2787") ? "" : (stryCov_9fa48("2787"), 'navigator'), stryMutAct_9fa48("2788") ? {} : (stryCov_9fa48("2788"), {
          serviceWorker: undefined
        }));
        expect(supportsPwaOsSchedule()).toBe(stryMutAct_9fa48("2789") ? true : (stryCov_9fa48("2789"), false));
      }
    });
    it(stryMutAct_9fa48("2790") ? "" : (stryCov_9fa48("2790"), 'returns false when Notification is not on window'), () => {
      if (stryMutAct_9fa48("2791")) {
        {}
      } else {
        stryCov_9fa48("2791");
        vi.stubGlobal(stryMutAct_9fa48("2792") ? "" : (stryCov_9fa48("2792"), 'navigator'), stryMutAct_9fa48("2793") ? {} : (stryCov_9fa48("2793"), {
          serviceWorker: {}
        }));
        const prev = window.Notification;
        Reflect.deleteProperty(window, stryMutAct_9fa48("2794") ? "" : (stryCov_9fa48("2794"), 'Notification'));
        expect(supportsPwaOsSchedule()).toBe(stryMutAct_9fa48("2795") ? true : (stryCov_9fa48("2795"), false));
        window.Notification = prev;
      }
    });
    it(stryMutAct_9fa48("2796") ? "" : (stryCov_9fa48("2796"), 'returns false when showTrigger is missing from Notification.prototype'), () => {
      if (stryMutAct_9fa48("2797")) {
        {}
      } else {
        stryCov_9fa48("2797");
        vi.stubGlobal(stryMutAct_9fa48("2798") ? "" : (stryCov_9fa48("2798"), 'navigator'), stryMutAct_9fa48("2799") ? {} : (stryCov_9fa48("2799"), {
          serviceWorker: {}
        }));
        class FakeNotification {}
        vi.stubGlobal(stryMutAct_9fa48("2800") ? "" : (stryCov_9fa48("2800"), 'Notification'), FakeNotification);
        expect(supportsPwaOsSchedule()).toBe(stryMutAct_9fa48("2801") ? true : (stryCov_9fa48("2801"), false));
      }
    });
    it(stryMutAct_9fa48("2802") ? "" : (stryCov_9fa48("2802"), 'returns true when showTrigger is present (scheduled notifications)'), () => {
      if (stryMutAct_9fa48("2803")) {
        {}
      } else {
        stryCov_9fa48("2803");
        vi.stubGlobal(stryMutAct_9fa48("2804") ? "" : (stryCov_9fa48("2804"), 'navigator'), stryMutAct_9fa48("2805") ? {} : (stryCov_9fa48("2805"), {
          serviceWorker: {}
        }));
        class FakeNotification {}
        Object.defineProperty(FakeNotification.prototype, stryMutAct_9fa48("2806") ? "" : (stryCov_9fa48("2806"), 'showTrigger'), stryMutAct_9fa48("2807") ? {} : (stryCov_9fa48("2807"), {
          value: {}
        }));
        vi.stubGlobal(stryMutAct_9fa48("2808") ? "" : (stryCov_9fa48("2808"), 'Notification'), FakeNotification);
        expect(supportsPwaOsSchedule()).toBe(stryMutAct_9fa48("2809") ? false : (stryCov_9fa48("2809"), true));
      }
    });
  }
});
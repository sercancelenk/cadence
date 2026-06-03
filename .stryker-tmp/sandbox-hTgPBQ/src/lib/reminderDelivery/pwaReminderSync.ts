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
import type { ReminderSlot } from './types';
const REMINDER_SYNC = stryMutAct_9fa48("3325") ? "" : (stryCov_9fa48("3325"), 'REMINDER_SYNC');
const REMINDER_CANCEL_ITEM = stryMutAct_9fa48("3326") ? "" : (stryCov_9fa48("3326"), 'REMINDER_CANCEL_ITEM');
export async function postReminderSyncToServiceWorker(slots: ReminderSlot[]): Promise<void> {
  if (stryMutAct_9fa48("3327")) {
    {}
  } else {
    stryCov_9fa48("3327");
    if (stryMutAct_9fa48("3330") ? false : stryMutAct_9fa48("3329") ? true : stryMutAct_9fa48("3328") ? 'serviceWorker' in navigator : (stryCov_9fa48("3328", "3329", "3330"), !((stryMutAct_9fa48("3331") ? "" : (stryCov_9fa48("3331"), 'serviceWorker')) in navigator))) return;
    const reg = await navigator.serviceWorker.ready.catch(stryMutAct_9fa48("3332") ? () => undefined : (stryCov_9fa48("3332"), () => null));
    if (stryMutAct_9fa48("3335") ? false : stryMutAct_9fa48("3334") ? true : stryMutAct_9fa48("3333") ? reg?.active : (stryCov_9fa48("3333", "3334", "3335"), !(stryMutAct_9fa48("3336") ? reg.active : (stryCov_9fa48("3336"), reg?.active)))) return;
    reg.active.postMessage(stryMutAct_9fa48("3337") ? {} : (stryCov_9fa48("3337"), {
      type: REMINDER_SYNC,
      slots
    }));
  }
}
export async function postReminderCancelItem(itemId: string): Promise<void> {
  if (stryMutAct_9fa48("3338")) {
    {}
  } else {
    stryCov_9fa48("3338");
    if (stryMutAct_9fa48("3341") ? !itemId && !('serviceWorker' in navigator) : stryMutAct_9fa48("3340") ? false : stryMutAct_9fa48("3339") ? true : (stryCov_9fa48("3339", "3340", "3341"), (stryMutAct_9fa48("3342") ? itemId : (stryCov_9fa48("3342"), !itemId)) || (stryMutAct_9fa48("3343") ? 'serviceWorker' in navigator : (stryCov_9fa48("3343"), !((stryMutAct_9fa48("3344") ? "" : (stryCov_9fa48("3344"), 'serviceWorker')) in navigator))))) return;
    const reg = await navigator.serviceWorker.ready.catch(stryMutAct_9fa48("3345") ? () => undefined : (stryCov_9fa48("3345"), () => null));
    if (stryMutAct_9fa48("3348") ? false : stryMutAct_9fa48("3347") ? true : stryMutAct_9fa48("3346") ? reg?.active : (stryCov_9fa48("3346", "3347", "3348"), !(stryMutAct_9fa48("3349") ? reg.active : (stryCov_9fa48("3349"), reg?.active)))) return;
    reg.active.postMessage(stryMutAct_9fa48("3350") ? {} : (stryCov_9fa48("3350"), {
      type: REMINDER_CANCEL_ITEM,
      itemId
    }));
  }
}
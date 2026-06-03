/** Whether the PWA can schedule OS notifications via the service worker (Chrome-only today). */
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
export function supportsPwaOsSchedule(): boolean {
  if (stryMutAct_9fa48("2810")) {
    {}
  } else {
    stryCov_9fa48("2810");
    if (stryMutAct_9fa48("2813") ? typeof window !== 'undefined' : stryMutAct_9fa48("2812") ? false : stryMutAct_9fa48("2811") ? true : (stryCov_9fa48("2811", "2812", "2813"), typeof window === (stryMutAct_9fa48("2814") ? "" : (stryCov_9fa48("2814"), 'undefined')))) return stryMutAct_9fa48("2815") ? true : (stryCov_9fa48("2815"), false);
    if (stryMutAct_9fa48("2818") ? !('serviceWorker' in navigator) && !('Notification' in window) : stryMutAct_9fa48("2817") ? false : stryMutAct_9fa48("2816") ? true : (stryCov_9fa48("2816", "2817", "2818"), (stryMutAct_9fa48("2819") ? 'serviceWorker' in navigator : (stryCov_9fa48("2819"), !((stryMutAct_9fa48("2820") ? "" : (stryCov_9fa48("2820"), 'serviceWorker')) in navigator))) || (stryMutAct_9fa48("2821") ? 'Notification' in window : (stryCov_9fa48("2821"), !((stryMutAct_9fa48("2822") ? "" : (stryCov_9fa48("2822"), 'Notification')) in window))))) return stryMutAct_9fa48("2823") ? true : (stryCov_9fa48("2823"), false);
    return (stryMutAct_9fa48("2824") ? "" : (stryCov_9fa48("2824"), 'showTrigger')) in Notification.prototype;
  }
}
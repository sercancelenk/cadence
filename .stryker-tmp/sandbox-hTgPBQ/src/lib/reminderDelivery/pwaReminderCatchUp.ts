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
const TAG_PREFIX = stryMutAct_9fa48("3221") ? "" : (stryCov_9fa48("3221"), 'cadence:');

/** Parse SW notification tag back to item id + remindAt. */
export function parseReminderNotificationTag(tag: string): {
  itemId: string;
  remindAt: string;
} | null {
  if (stryMutAct_9fa48("3222")) {
    {}
  } else {
    stryCov_9fa48("3222");
    if (stryMutAct_9fa48("3225") ? false : stryMutAct_9fa48("3224") ? true : stryMutAct_9fa48("3223") ? tag.startsWith(TAG_PREFIX) : (stryCov_9fa48("3223", "3224", "3225"), !(stryMutAct_9fa48("3226") ? tag.endsWith(TAG_PREFIX) : (stryCov_9fa48("3226"), tag.startsWith(TAG_PREFIX))))) return null;
    const rest = stryMutAct_9fa48("3227") ? tag : (stryCov_9fa48("3227"), tag.slice(TAG_PREFIX.length));
    const sep = rest.indexOf(stryMutAct_9fa48("3228") ? "" : (stryCov_9fa48("3228"), '|'));
    if (stryMutAct_9fa48("3231") ? sep !== -1 : stryMutAct_9fa48("3230") ? false : stryMutAct_9fa48("3229") ? true : (stryCov_9fa48("3229", "3230", "3231"), sep === (stryMutAct_9fa48("3232") ? +1 : (stryCov_9fa48("3232"), -1)))) return null;
    const itemId = stryMutAct_9fa48("3233") ? rest : (stryCov_9fa48("3233"), rest.slice(0, sep));
    const remindAt = stryMutAct_9fa48("3234") ? rest : (stryCov_9fa48("3234"), rest.slice(stryMutAct_9fa48("3235") ? sep - 1 : (stryCov_9fa48("3235"), sep + 1)));
    if (stryMutAct_9fa48("3238") ? !itemId && !remindAt : stryMutAct_9fa48("3237") ? false : stryMutAct_9fa48("3236") ? true : (stryCov_9fa48("3236", "3237", "3238"), (stryMutAct_9fa48("3239") ? itemId : (stryCov_9fa48("3239"), !itemId)) || (stryMutAct_9fa48("3240") ? remindAt : (stryCov_9fa48("3240"), !remindAt)))) return null;
    return stryMutAct_9fa48("3241") ? {} : (stryCov_9fa48("3241"), {
      itemId,
      remindAt
    });
  }
}

/**
 * Mark reminder slots as notified when the SW already showed them (tab was closed).
 * Returns slot keys to merge into `notifiedReminderIds`.
 */
export async function collectPwaDeliveredSlotKeys(nowMs = Date.now()): Promise<string[]> {
  if (stryMutAct_9fa48("3242")) {
    {}
  } else {
    stryCov_9fa48("3242");
    if (stryMutAct_9fa48("3245") ? !('serviceWorker' in navigator) && !('Notification' in window) : stryMutAct_9fa48("3244") ? false : stryMutAct_9fa48("3243") ? true : (stryCov_9fa48("3243", "3244", "3245"), (stryMutAct_9fa48("3246") ? 'serviceWorker' in navigator : (stryCov_9fa48("3246"), !((stryMutAct_9fa48("3247") ? "" : (stryCov_9fa48("3247"), 'serviceWorker')) in navigator))) || (stryMutAct_9fa48("3248") ? 'Notification' in window : (stryCov_9fa48("3248"), !((stryMutAct_9fa48("3249") ? "" : (stryCov_9fa48("3249"), 'Notification')) in window))))) return stryMutAct_9fa48("3250") ? ["Stryker was here"] : (stryCov_9fa48("3250"), []);
    if (stryMutAct_9fa48("3253") ? Notification.permission === 'granted' : stryMutAct_9fa48("3252") ? false : stryMutAct_9fa48("3251") ? true : (stryCov_9fa48("3251", "3252", "3253"), Notification.permission !== (stryMutAct_9fa48("3254") ? "" : (stryCov_9fa48("3254"), 'granted')))) return stryMutAct_9fa48("3255") ? ["Stryker was here"] : (stryCov_9fa48("3255"), []);
    const reg = await navigator.serviceWorker.ready.catch(stryMutAct_9fa48("3256") ? () => undefined : (stryCov_9fa48("3256"), () => null));
    if (stryMutAct_9fa48("3259") ? false : stryMutAct_9fa48("3258") ? true : stryMutAct_9fa48("3257") ? reg : (stryCov_9fa48("3257", "3258", "3259"), !reg)) return stryMutAct_9fa48("3260") ? ["Stryker was here"] : (stryCov_9fa48("3260"), []);
    const notifications = await reg.getNotifications();
    const keys: string[] = stryMutAct_9fa48("3261") ? ["Stryker was here"] : (stryCov_9fa48("3261"), []);
    for (const n of notifications) {
      if (stryMutAct_9fa48("3262")) {
        {}
      } else {
        stryCov_9fa48("3262");
        if (stryMutAct_9fa48("3265") ? false : stryMutAct_9fa48("3264") ? true : stryMutAct_9fa48("3263") ? n.tag : (stryCov_9fa48("3263", "3264", "3265"), !n.tag)) continue;
        const parsed = parseReminderNotificationTag(n.tag);
        if (stryMutAct_9fa48("3268") ? false : stryMutAct_9fa48("3267") ? true : stryMutAct_9fa48("3266") ? parsed : (stryCov_9fa48("3266", "3267", "3268"), !parsed)) continue;
        const t = Date.parse(parsed.remindAt);
        if (stryMutAct_9fa48("3271") ? Number.isNaN(t) && t > nowMs : stryMutAct_9fa48("3270") ? false : stryMutAct_9fa48("3269") ? true : (stryCov_9fa48("3269", "3270", "3271"), Number.isNaN(t) || (stryMutAct_9fa48("3274") ? t <= nowMs : stryMutAct_9fa48("3273") ? t >= nowMs : stryMutAct_9fa48("3272") ? false : (stryCov_9fa48("3272", "3273", "3274"), t > nowMs)))) continue;
        keys.push(stryMutAct_9fa48("3275") ? `` : (stryCov_9fa48("3275"), `${parsed.itemId}\u0001${parsed.remindAt}`));
      }
    }
    return keys;
  }
}
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
const SEP = stryMutAct_9fa48("3351") ? "" : (stryCov_9fa48("3351"), '\u0001');

/** One notified reminder slot (task id + exact remindAt ISO). */
export function reminderNotifyKey(id: string, remindAt: string): string {
  if (stryMutAct_9fa48("3352")) {
    {}
  } else {
    stryCov_9fa48("3352");
    return stryMutAct_9fa48("3353") ? `` : (stryCov_9fa48("3353"), `${id}${SEP}${remindAt}`);
  }
}
export function reminderNotifyEntryId(entry: string): string {
  if (stryMutAct_9fa48("3354")) {
    {}
  } else {
    stryCov_9fa48("3354");
    const i = entry.indexOf(SEP);
    return (stryMutAct_9fa48("3357") ? i !== -1 : stryMutAct_9fa48("3356") ? false : stryMutAct_9fa48("3355") ? true : (stryCov_9fa48("3355", "3356", "3357"), i === (stryMutAct_9fa48("3358") ? +1 : (stryCov_9fa48("3358"), -1)))) ? entry : stryMutAct_9fa48("3359") ? entry : (stryCov_9fa48("3359"), entry.slice(0, i));
  }
}
export function isReminderSlotNotified(notifiedReminderIds: string[], id: string, remindAt: string): boolean {
  if (stryMutAct_9fa48("3360")) {
    {}
  } else {
    stryCov_9fa48("3360");
    if (stryMutAct_9fa48("3362") ? false : stryMutAct_9fa48("3361") ? true : (stryCov_9fa48("3361", "3362"), notifiedReminderIds.includes(reminderNotifyKey(id, remindAt)))) return stryMutAct_9fa48("3363") ? false : (stryCov_9fa48("3363"), true);
    // Legacy entries stored only the item id — treat as "already pinged" for past slots.
    if (stryMutAct_9fa48("3365") ? false : stryMutAct_9fa48("3364") ? true : (stryCov_9fa48("3364", "3365"), notifiedReminderIds.includes(id))) {
      if (stryMutAct_9fa48("3366")) {
        {}
      } else {
        stryCov_9fa48("3366");
        const t = Date.parse(remindAt);
        if (stryMutAct_9fa48("3369") ? !Number.isNaN(t) || t <= Date.now() : stryMutAct_9fa48("3368") ? false : stryMutAct_9fa48("3367") ? true : (stryCov_9fa48("3367", "3368", "3369"), (stryMutAct_9fa48("3370") ? Number.isNaN(t) : (stryCov_9fa48("3370"), !Number.isNaN(t))) && (stryMutAct_9fa48("3373") ? t > Date.now() : stryMutAct_9fa48("3372") ? t < Date.now() : stryMutAct_9fa48("3371") ? true : (stryCov_9fa48("3371", "3372", "3373"), t <= Date.now())))) return stryMutAct_9fa48("3374") ? false : (stryCov_9fa48("3374"), true);
      }
    }
    return stryMutAct_9fa48("3375") ? true : (stryCov_9fa48("3375"), false);
  }
}
export function clearReminderNotifyKeys(notifiedReminderIds: string[], id: string): string[] {
  if (stryMutAct_9fa48("3376")) {
    {}
  } else {
    stryCov_9fa48("3376");
    return stryMutAct_9fa48("3377") ? notifiedReminderIds : (stryCov_9fa48("3377"), notifiedReminderIds.filter(stryMutAct_9fa48("3378") ? () => undefined : (stryCov_9fa48("3378"), entry => stryMutAct_9fa48("3381") ? entry !== id || reminderNotifyEntryId(entry) !== id : stryMutAct_9fa48("3380") ? false : stryMutAct_9fa48("3379") ? true : (stryCov_9fa48("3379", "3380", "3381"), (stryMutAct_9fa48("3383") ? entry === id : stryMutAct_9fa48("3382") ? true : (stryCov_9fa48("3382", "3383"), entry !== id)) && (stryMutAct_9fa48("3385") ? reminderNotifyEntryId(entry) === id : stryMutAct_9fa48("3384") ? true : (stryCov_9fa48("3384", "3385"), reminderNotifyEntryId(entry) !== id))))));
  }
}
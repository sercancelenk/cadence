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
const SEP = stryMutAct_9fa48("0") ? "" : (stryCov_9fa48("0"), '\u0001');

/** One notified reminder slot (task id + exact remindAt ISO). */
export function reminderNotifyKey(id: string, remindAt: string): string {
  if (stryMutAct_9fa48("1")) {
    {}
  } else {
    stryCov_9fa48("1");
    return stryMutAct_9fa48("2") ? `` : (stryCov_9fa48("2"), `${id}${SEP}${remindAt}`);
  }
}
export function reminderNotifyEntryId(entry: string): string {
  if (stryMutAct_9fa48("3")) {
    {}
  } else {
    stryCov_9fa48("3");
    const i = entry.indexOf(SEP);
    return (stryMutAct_9fa48("6") ? i !== -1 : stryMutAct_9fa48("5") ? false : stryMutAct_9fa48("4") ? true : (stryCov_9fa48("4", "5", "6"), i === (stryMutAct_9fa48("7") ? +1 : (stryCov_9fa48("7"), -1)))) ? entry : stryMutAct_9fa48("8") ? entry : (stryCov_9fa48("8"), entry.slice(0, i));
  }
}
export function isReminderSlotNotified(notifiedReminderIds: string[], id: string, remindAt: string): boolean {
  if (stryMutAct_9fa48("9")) {
    {}
  } else {
    stryCov_9fa48("9");
    if (stryMutAct_9fa48("11") ? false : stryMutAct_9fa48("10") ? true : (stryCov_9fa48("10", "11"), notifiedReminderIds.includes(reminderNotifyKey(id, remindAt)))) return stryMutAct_9fa48("12") ? false : (stryCov_9fa48("12"), true);
    // Legacy entries stored only the item id — treat as "already pinged" for past slots.
    if (stryMutAct_9fa48("14") ? false : stryMutAct_9fa48("13") ? true : (stryCov_9fa48("13", "14"), notifiedReminderIds.includes(id))) {
      if (stryMutAct_9fa48("15")) {
        {}
      } else {
        stryCov_9fa48("15");
        const t = Date.parse(remindAt);
        if (stryMutAct_9fa48("18") ? !Number.isNaN(t) || t <= Date.now() : stryMutAct_9fa48("17") ? false : stryMutAct_9fa48("16") ? true : (stryCov_9fa48("16", "17", "18"), (stryMutAct_9fa48("19") ? Number.isNaN(t) : (stryCov_9fa48("19"), !Number.isNaN(t))) && (stryMutAct_9fa48("22") ? t > Date.now() : stryMutAct_9fa48("21") ? t < Date.now() : stryMutAct_9fa48("20") ? true : (stryCov_9fa48("20", "21", "22"), t <= Date.now())))) return stryMutAct_9fa48("23") ? false : (stryCov_9fa48("23"), true);
      }
    }
    return stryMutAct_9fa48("24") ? true : (stryCov_9fa48("24"), false);
  }
}
export function clearReminderNotifyKeys(notifiedReminderIds: string[], id: string): string[] {
  if (stryMutAct_9fa48("25")) {
    {}
  } else {
    stryCov_9fa48("25");
    return stryMutAct_9fa48("26") ? notifiedReminderIds : (stryCov_9fa48("26"), notifiedReminderIds.filter(stryMutAct_9fa48("27") ? () => undefined : (stryCov_9fa48("27"), entry => stryMutAct_9fa48("30") ? entry !== id || reminderNotifyEntryId(entry) !== id : stryMutAct_9fa48("29") ? false : stryMutAct_9fa48("28") ? true : (stryCov_9fa48("28", "29", "30"), (stryMutAct_9fa48("32") ? entry === id : stryMutAct_9fa48("31") ? true : (stryCov_9fa48("31", "32"), entry !== id)) && (stryMutAct_9fa48("34") ? reminderNotifyEntryId(entry) === id : stryMutAct_9fa48("33") ? true : (stryCov_9fa48("33", "34"), reminderNotifyEntryId(entry) !== id))))));
  }
}
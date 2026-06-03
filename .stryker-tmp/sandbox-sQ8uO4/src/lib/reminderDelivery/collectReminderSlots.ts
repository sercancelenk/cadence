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
import type { AppData } from '../../core/model';
import { isReminderSlotNotified, reminderNotifyKey } from '../reminderNotify';
import type { ReminderSlot } from './types';
function isTodoOpen(status: string | undefined): boolean {
  if (stryMutAct_9fa48("0")) {
    {}
  } else {
    stryCov_9fa48("0");
    return stryMutAct_9fa48("3") ? status !== 'done' || status !== 'cancelled' : stryMutAct_9fa48("2") ? false : stryMutAct_9fa48("1") ? true : (stryCov_9fa48("1", "2", "3"), (stryMutAct_9fa48("5") ? status === 'done' : stryMutAct_9fa48("4") ? true : (stryCov_9fa48("4", "5"), status !== (stryMutAct_9fa48("6") ? "" : (stryCov_9fa48("6"), 'done')))) && (stryMutAct_9fa48("8") ? status === 'cancelled' : stryMutAct_9fa48("7") ? true : (stryCov_9fa48("7", "8"), status !== (stryMutAct_9fa48("9") ? "" : (stryCov_9fa48("9"), 'cancelled')))));
  }
}

/** Future reminder slots for OS / service-worker scheduling. */
export function collectFutureReminderSlots(appData: AppData, nowMs = Date.now()): ReminderSlot[] {
  if (stryMutAct_9fa48("10")) {
    {}
  } else {
    stryCov_9fa48("10");
    const notified = appData.notifiedReminderIds;
    const peopleById = new Map(appData.people.map(stryMutAct_9fa48("11") ? () => undefined : (stryCov_9fa48("11"), p => stryMutAct_9fa48("12") ? [] : (stryCov_9fa48("12"), [p.id, p]))));
    const teamsById = new Map(appData.teams.map(stryMutAct_9fa48("13") ? () => undefined : (stryCov_9fa48("13"), t => stryMutAct_9fa48("14") ? [] : (stryCov_9fa48("14"), [t.id, t]))));
    const todoGroupsById = new Map(appData.todoGroups.map(stryMutAct_9fa48("15") ? () => undefined : (stryCov_9fa48("15"), g => stryMutAct_9fa48("16") ? [] : (stryCov_9fa48("16"), [g.id, g]))));
    const out: ReminderSlot[] = stryMutAct_9fa48("17") ? ["Stryker was here"] : (stryCov_9fa48("17"), []);
    for (const t of appData.todoItems) {
      if (stryMutAct_9fa48("18")) {
        {}
      } else {
        stryCov_9fa48("18");
        if (stryMutAct_9fa48("21") ? !t.remindAt && !isTodoOpen(t.status) : stryMutAct_9fa48("20") ? false : stryMutAct_9fa48("19") ? true : (stryCov_9fa48("19", "20", "21"), (stryMutAct_9fa48("22") ? t.remindAt : (stryCov_9fa48("22"), !t.remindAt)) || (stryMutAct_9fa48("23") ? isTodoOpen(t.status) : (stryCov_9fa48("23"), !isTodoOpen(t.status))))) continue;
        const ts = Date.parse(t.remindAt);
        if (stryMutAct_9fa48("26") ? Number.isNaN(ts) && ts <= nowMs : stryMutAct_9fa48("25") ? false : stryMutAct_9fa48("24") ? true : (stryCov_9fa48("24", "25", "26"), Number.isNaN(ts) || (stryMutAct_9fa48("29") ? ts > nowMs : stryMutAct_9fa48("28") ? ts < nowMs : stryMutAct_9fa48("27") ? false : (stryCov_9fa48("27", "28", "29"), ts <= nowMs)))) continue;
        if (stryMutAct_9fa48("31") ? false : stryMutAct_9fa48("30") ? true : (stryCov_9fa48("30", "31"), isReminderSlotNotified(notified, t.id, t.remindAt))) continue;
        const group = todoGroupsById.get(t.groupId);
        const label = stryMutAct_9fa48("34") ? group?.name && 'Todo' : stryMutAct_9fa48("33") ? false : stryMutAct_9fa48("32") ? true : (stryCov_9fa48("32", "33", "34"), (stryMutAct_9fa48("35") ? group.name : (stryCov_9fa48("35"), group?.name)) || (stryMutAct_9fa48("36") ? "" : (stryCov_9fa48("36"), 'Todo')));
        out.push(stryMutAct_9fa48("37") ? {} : (stryCov_9fa48("37"), {
          slotKey: reminderNotifyKey(t.id, t.remindAt),
          itemId: t.id,
          source: stryMutAct_9fa48("38") ? "" : (stryCov_9fa48("38"), 'todo'),
          remindAt: t.remindAt,
          title: stryMutAct_9fa48("39") ? "" : (stryCov_9fa48("39"), 'Todo reminder'),
          body: stryMutAct_9fa48("40") ? `` : (stryCov_9fa48("40"), `${label}: ${stryMutAct_9fa48("43") ? t.title?.trim() && '(untitled)' : stryMutAct_9fa48("42") ? false : stryMutAct_9fa48("41") ? true : (stryCov_9fa48("41", "42", "43"), (stryMutAct_9fa48("45") ? t.title.trim() : stryMutAct_9fa48("44") ? t.title : (stryCov_9fa48("44", "45"), t.title?.trim())) || (stryMutAct_9fa48("46") ? "" : (stryCov_9fa48("46"), '(untitled)')))}`),
          repeat: t.remindRepeat,
          deepLinkPath: stryMutAct_9fa48("47") ? `` : (stryCov_9fa48("47"), `/todos?focus=${encodeURIComponent(t.id)}`)
        }));
      }
    }
    for (const it of appData.items) {
      if (stryMutAct_9fa48("48")) {
        {}
      } else {
        stryCov_9fa48("48");
        if (stryMutAct_9fa48("51") ? !it.remindAt && it.done : stryMutAct_9fa48("50") ? false : stryMutAct_9fa48("49") ? true : (stryCov_9fa48("49", "50", "51"), (stryMutAct_9fa48("52") ? it.remindAt : (stryCov_9fa48("52"), !it.remindAt)) || it.done)) continue;
        const ts = Date.parse(it.remindAt);
        if (stryMutAct_9fa48("55") ? Number.isNaN(ts) && ts <= nowMs : stryMutAct_9fa48("54") ? false : stryMutAct_9fa48("53") ? true : (stryCov_9fa48("53", "54", "55"), Number.isNaN(ts) || (stryMutAct_9fa48("58") ? ts > nowMs : stryMutAct_9fa48("57") ? ts < nowMs : stryMutAct_9fa48("56") ? false : (stryCov_9fa48("56", "57", "58"), ts <= nowMs)))) continue;
        if (stryMutAct_9fa48("60") ? false : stryMutAct_9fa48("59") ? true : (stryCov_9fa48("59", "60"), isReminderSlotNotified(notified, it.id, it.remindAt))) continue;
        const person = peopleById.get(it.personId);
        const team = person ? teamsById.get(person.teamId) : undefined;
        const label = stryMutAct_9fa48("63") ? [team?.name, person?.name].filter(Boolean).join(' · ') && 'Item' : stryMutAct_9fa48("62") ? false : stryMutAct_9fa48("61") ? true : (stryCov_9fa48("61", "62", "63"), (stryMutAct_9fa48("64") ? [team?.name, person?.name].join(' · ') : (stryCov_9fa48("64"), (stryMutAct_9fa48("65") ? [] : (stryCov_9fa48("65"), [stryMutAct_9fa48("66") ? team.name : (stryCov_9fa48("66"), team?.name), stryMutAct_9fa48("67") ? person.name : (stryCov_9fa48("67"), person?.name)])).filter(Boolean).join(stryMutAct_9fa48("68") ? "" : (stryCov_9fa48("68"), ' · ')))) || (stryMutAct_9fa48("69") ? "" : (stryCov_9fa48("69"), 'Item')));
        const kindTitle = (stryMutAct_9fa48("72") ? it.kind !== 'task' : stryMutAct_9fa48("71") ? false : stryMutAct_9fa48("70") ? true : (stryCov_9fa48("70", "71", "72"), it.kind === (stryMutAct_9fa48("73") ? "" : (stryCov_9fa48("73"), 'task')))) ? stryMutAct_9fa48("74") ? "" : (stryCov_9fa48("74"), 'Task reminder') : stryMutAct_9fa48("75") ? "" : (stryCov_9fa48("75"), 'Reminder');
        const deepLinkPath = (stryMutAct_9fa48("78") ? person || person.teamId : stryMutAct_9fa48("77") ? false : stryMutAct_9fa48("76") ? true : (stryCov_9fa48("76", "77", "78"), person && person.teamId)) ? stryMutAct_9fa48("79") ? `` : (stryCov_9fa48("79"), `/teams/${person.teamId}/people/${person.id}?focus=${encodeURIComponent(it.id)}`) : null;
        out.push(stryMutAct_9fa48("80") ? {} : (stryCov_9fa48("80"), {
          slotKey: reminderNotifyKey(it.id, it.remindAt),
          itemId: it.id,
          source: stryMutAct_9fa48("81") ? "" : (stryCov_9fa48("81"), 'team-item'),
          remindAt: it.remindAt,
          title: kindTitle,
          body: stryMutAct_9fa48("82") ? `` : (stryCov_9fa48("82"), `${label}: ${stryMutAct_9fa48("85") ? it.title?.trim() && '(untitled)' : stryMutAct_9fa48("84") ? false : stryMutAct_9fa48("83") ? true : (stryCov_9fa48("83", "84", "85"), (stryMutAct_9fa48("87") ? it.title.trim() : stryMutAct_9fa48("86") ? it.title : (stryCov_9fa48("86", "87"), it.title?.trim())) || (stryMutAct_9fa48("88") ? "" : (stryCov_9fa48("88"), '(untitled)')))}`),
          repeat: it.remindRepeat,
          deepLinkPath
        }));
      }
    }
    stryMutAct_9fa48("89") ? out : (stryCov_9fa48("89"), out.sort(stryMutAct_9fa48("90") ? () => undefined : (stryCov_9fa48("90"), (a, b) => stryMutAct_9fa48("91") ? Date.parse(a.remindAt) + Date.parse(b.remindAt) : (stryCov_9fa48("91"), Date.parse(a.remindAt) - Date.parse(b.remindAt)))));
    return out;
  }
}
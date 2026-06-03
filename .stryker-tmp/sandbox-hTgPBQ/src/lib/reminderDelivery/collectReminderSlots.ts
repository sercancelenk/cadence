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
  if (stryMutAct_9fa48("2910")) {
    {}
  } else {
    stryCov_9fa48("2910");
    return stryMutAct_9fa48("2913") ? status !== 'done' || status !== 'cancelled' : stryMutAct_9fa48("2912") ? false : stryMutAct_9fa48("2911") ? true : (stryCov_9fa48("2911", "2912", "2913"), (stryMutAct_9fa48("2915") ? status === 'done' : stryMutAct_9fa48("2914") ? true : (stryCov_9fa48("2914", "2915"), status !== (stryMutAct_9fa48("2916") ? "" : (stryCov_9fa48("2916"), 'done')))) && (stryMutAct_9fa48("2918") ? status === 'cancelled' : stryMutAct_9fa48("2917") ? true : (stryCov_9fa48("2917", "2918"), status !== (stryMutAct_9fa48("2919") ? "" : (stryCov_9fa48("2919"), 'cancelled')))));
  }
}

/** Future reminder slots for OS / service-worker scheduling. */
export function collectFutureReminderSlots(appData: AppData, nowMs = Date.now()): ReminderSlot[] {
  if (stryMutAct_9fa48("2920")) {
    {}
  } else {
    stryCov_9fa48("2920");
    const notified = appData.notifiedReminderIds;
    const peopleById = new Map(appData.people.map(stryMutAct_9fa48("2921") ? () => undefined : (stryCov_9fa48("2921"), p => stryMutAct_9fa48("2922") ? [] : (stryCov_9fa48("2922"), [p.id, p]))));
    const teamsById = new Map(appData.teams.map(stryMutAct_9fa48("2923") ? () => undefined : (stryCov_9fa48("2923"), t => stryMutAct_9fa48("2924") ? [] : (stryCov_9fa48("2924"), [t.id, t]))));
    const todoGroupsById = new Map(appData.todoGroups.map(stryMutAct_9fa48("2925") ? () => undefined : (stryCov_9fa48("2925"), g => stryMutAct_9fa48("2926") ? [] : (stryCov_9fa48("2926"), [g.id, g]))));
    const out: ReminderSlot[] = stryMutAct_9fa48("2927") ? ["Stryker was here"] : (stryCov_9fa48("2927"), []);
    for (const t of appData.todoItems) {
      if (stryMutAct_9fa48("2928")) {
        {}
      } else {
        stryCov_9fa48("2928");
        if (stryMutAct_9fa48("2931") ? !t.remindAt && !isTodoOpen(t.status) : stryMutAct_9fa48("2930") ? false : stryMutAct_9fa48("2929") ? true : (stryCov_9fa48("2929", "2930", "2931"), (stryMutAct_9fa48("2932") ? t.remindAt : (stryCov_9fa48("2932"), !t.remindAt)) || (stryMutAct_9fa48("2933") ? isTodoOpen(t.status) : (stryCov_9fa48("2933"), !isTodoOpen(t.status))))) continue;
        const ts = Date.parse(t.remindAt);
        if (stryMutAct_9fa48("2936") ? Number.isNaN(ts) && ts <= nowMs : stryMutAct_9fa48("2935") ? false : stryMutAct_9fa48("2934") ? true : (stryCov_9fa48("2934", "2935", "2936"), Number.isNaN(ts) || (stryMutAct_9fa48("2939") ? ts > nowMs : stryMutAct_9fa48("2938") ? ts < nowMs : stryMutAct_9fa48("2937") ? false : (stryCov_9fa48("2937", "2938", "2939"), ts <= nowMs)))) continue;
        if (stryMutAct_9fa48("2941") ? false : stryMutAct_9fa48("2940") ? true : (stryCov_9fa48("2940", "2941"), isReminderSlotNotified(notified, t.id, t.remindAt))) continue;
        const group = todoGroupsById.get(t.groupId);
        const label = stryMutAct_9fa48("2944") ? group?.name && 'Todo' : stryMutAct_9fa48("2943") ? false : stryMutAct_9fa48("2942") ? true : (stryCov_9fa48("2942", "2943", "2944"), (stryMutAct_9fa48("2945") ? group.name : (stryCov_9fa48("2945"), group?.name)) || (stryMutAct_9fa48("2946") ? "" : (stryCov_9fa48("2946"), 'Todo')));
        out.push(stryMutAct_9fa48("2947") ? {} : (stryCov_9fa48("2947"), {
          slotKey: reminderNotifyKey(t.id, t.remindAt),
          itemId: t.id,
          source: stryMutAct_9fa48("2948") ? "" : (stryCov_9fa48("2948"), 'todo'),
          remindAt: t.remindAt,
          title: stryMutAct_9fa48("2949") ? "" : (stryCov_9fa48("2949"), 'Todo reminder'),
          body: stryMutAct_9fa48("2950") ? `` : (stryCov_9fa48("2950"), `${label}: ${stryMutAct_9fa48("2953") ? t.title?.trim() && '(untitled)' : stryMutAct_9fa48("2952") ? false : stryMutAct_9fa48("2951") ? true : (stryCov_9fa48("2951", "2952", "2953"), (stryMutAct_9fa48("2955") ? t.title.trim() : stryMutAct_9fa48("2954") ? t.title : (stryCov_9fa48("2954", "2955"), t.title?.trim())) || (stryMutAct_9fa48("2956") ? "" : (stryCov_9fa48("2956"), '(untitled)')))}`),
          repeat: t.remindRepeat,
          deepLinkPath: stryMutAct_9fa48("2957") ? `` : (stryCov_9fa48("2957"), `/todos?focus=${encodeURIComponent(t.id)}`)
        }));
      }
    }
    for (const it of appData.items) {
      if (stryMutAct_9fa48("2958")) {
        {}
      } else {
        stryCov_9fa48("2958");
        if (stryMutAct_9fa48("2961") ? !it.remindAt && it.done : stryMutAct_9fa48("2960") ? false : stryMutAct_9fa48("2959") ? true : (stryCov_9fa48("2959", "2960", "2961"), (stryMutAct_9fa48("2962") ? it.remindAt : (stryCov_9fa48("2962"), !it.remindAt)) || it.done)) continue;
        const ts = Date.parse(it.remindAt);
        if (stryMutAct_9fa48("2965") ? Number.isNaN(ts) && ts <= nowMs : stryMutAct_9fa48("2964") ? false : stryMutAct_9fa48("2963") ? true : (stryCov_9fa48("2963", "2964", "2965"), Number.isNaN(ts) || (stryMutAct_9fa48("2968") ? ts > nowMs : stryMutAct_9fa48("2967") ? ts < nowMs : stryMutAct_9fa48("2966") ? false : (stryCov_9fa48("2966", "2967", "2968"), ts <= nowMs)))) continue;
        if (stryMutAct_9fa48("2970") ? false : stryMutAct_9fa48("2969") ? true : (stryCov_9fa48("2969", "2970"), isReminderSlotNotified(notified, it.id, it.remindAt))) continue;
        const person = peopleById.get(it.personId);
        const team = person ? teamsById.get(person.teamId) : undefined;
        const label = stryMutAct_9fa48("2973") ? [team?.name, person?.name].filter(Boolean).join(' · ') && 'Item' : stryMutAct_9fa48("2972") ? false : stryMutAct_9fa48("2971") ? true : (stryCov_9fa48("2971", "2972", "2973"), (stryMutAct_9fa48("2974") ? [team?.name, person?.name].join(' · ') : (stryCov_9fa48("2974"), (stryMutAct_9fa48("2975") ? [] : (stryCov_9fa48("2975"), [stryMutAct_9fa48("2976") ? team.name : (stryCov_9fa48("2976"), team?.name), stryMutAct_9fa48("2977") ? person.name : (stryCov_9fa48("2977"), person?.name)])).filter(Boolean).join(stryMutAct_9fa48("2978") ? "" : (stryCov_9fa48("2978"), ' · ')))) || (stryMutAct_9fa48("2979") ? "" : (stryCov_9fa48("2979"), 'Item')));
        const kindTitle = (stryMutAct_9fa48("2982") ? it.kind !== 'task' : stryMutAct_9fa48("2981") ? false : stryMutAct_9fa48("2980") ? true : (stryCov_9fa48("2980", "2981", "2982"), it.kind === (stryMutAct_9fa48("2983") ? "" : (stryCov_9fa48("2983"), 'task')))) ? stryMutAct_9fa48("2984") ? "" : (stryCov_9fa48("2984"), 'Task reminder') : stryMutAct_9fa48("2985") ? "" : (stryCov_9fa48("2985"), 'Reminder');
        const deepLinkPath = (stryMutAct_9fa48("2988") ? person || person.teamId : stryMutAct_9fa48("2987") ? false : stryMutAct_9fa48("2986") ? true : (stryCov_9fa48("2986", "2987", "2988"), person && person.teamId)) ? stryMutAct_9fa48("2989") ? `` : (stryCov_9fa48("2989"), `/teams/${person.teamId}/people/${person.id}?focus=${encodeURIComponent(it.id)}`) : null;
        out.push(stryMutAct_9fa48("2990") ? {} : (stryCov_9fa48("2990"), {
          slotKey: reminderNotifyKey(it.id, it.remindAt),
          itemId: it.id,
          source: stryMutAct_9fa48("2991") ? "" : (stryCov_9fa48("2991"), 'team-item'),
          remindAt: it.remindAt,
          title: kindTitle,
          body: stryMutAct_9fa48("2992") ? `` : (stryCov_9fa48("2992"), `${label}: ${stryMutAct_9fa48("2995") ? it.title?.trim() && '(untitled)' : stryMutAct_9fa48("2994") ? false : stryMutAct_9fa48("2993") ? true : (stryCov_9fa48("2993", "2994", "2995"), (stryMutAct_9fa48("2997") ? it.title.trim() : stryMutAct_9fa48("2996") ? it.title : (stryCov_9fa48("2996", "2997"), it.title?.trim())) || (stryMutAct_9fa48("2998") ? "" : (stryCov_9fa48("2998"), '(untitled)')))}`),
          repeat: it.remindRepeat,
          deepLinkPath
        }));
      }
    }
    stryMutAct_9fa48("2999") ? out : (stryCov_9fa48("2999"), out.sort(stryMutAct_9fa48("3000") ? () => undefined : (stryCov_9fa48("3000"), (a, b) => stryMutAct_9fa48("3001") ? Date.parse(a.remindAt) + Date.parse(b.remindAt) : (stryCov_9fa48("3001"), Date.parse(a.remindAt) - Date.parse(b.remindAt)))));
    return out;
  }
}
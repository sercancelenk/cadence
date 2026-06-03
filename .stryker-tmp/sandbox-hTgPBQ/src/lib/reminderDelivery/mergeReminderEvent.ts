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
import type { AppData } from '../../model';

/**
 * Merge reminder-related fields from disk into in-memory AppData without
 * stomping unsaved local edits (title, body, status, etc.).
 *
 * Used when Electron main fires a reminder and pushes persisted state back
 * via `onReminderEvent` — a full `replaceAll` would discard pending edits
 * still in the renderer debounce window.
 */
export function mergeReminderEventIntoAppData(prev: AppData, disk: AppData): AppData {
  if (stryMutAct_9fa48("3091")) {
    {}
  } else {
    stryCov_9fa48("3091");
    const diskTodoById = new Map(disk.todoItems.map(stryMutAct_9fa48("3092") ? () => undefined : (stryCov_9fa48("3092"), t => stryMutAct_9fa48("3093") ? [] : (stryCov_9fa48("3093"), [t.id, t]))));
    const diskItemById = new Map(disk.items.map(stryMutAct_9fa48("3094") ? () => undefined : (stryCov_9fa48("3094"), i => stryMutAct_9fa48("3095") ? [] : (stryCov_9fa48("3095"), [i.id, i]))));
    return stryMutAct_9fa48("3096") ? {} : (stryCov_9fa48("3096"), {
      ...prev,
      notifiedReminderIds: disk.notifiedReminderIds,
      todoItems: prev.todoItems.map(t => {
        if (stryMutAct_9fa48("3097")) {
          {}
        } else {
          stryCov_9fa48("3097");
          const d = diskTodoById.get(t.id);
          if (stryMutAct_9fa48("3100") ? false : stryMutAct_9fa48("3099") ? true : stryMutAct_9fa48("3098") ? d : (stryCov_9fa48("3098", "3099", "3100"), !d)) return t;
          if (stryMutAct_9fa48("3103") ? t.remindAt === d.remindAt || t.remindRepeat === d.remindRepeat : stryMutAct_9fa48("3102") ? false : stryMutAct_9fa48("3101") ? true : (stryCov_9fa48("3101", "3102", "3103"), (stryMutAct_9fa48("3105") ? t.remindAt !== d.remindAt : stryMutAct_9fa48("3104") ? true : (stryCov_9fa48("3104", "3105"), t.remindAt === d.remindAt)) && (stryMutAct_9fa48("3107") ? t.remindRepeat !== d.remindRepeat : stryMutAct_9fa48("3106") ? true : (stryCov_9fa48("3106", "3107"), t.remindRepeat === d.remindRepeat)))) return t;
          return stryMutAct_9fa48("3108") ? {} : (stryCov_9fa48("3108"), {
            ...t,
            remindAt: d.remindAt,
            remindRepeat: d.remindRepeat
          });
        }
      }),
      items: prev.items.map(it => {
        if (stryMutAct_9fa48("3109")) {
          {}
        } else {
          stryCov_9fa48("3109");
          const d = diskItemById.get(it.id);
          if (stryMutAct_9fa48("3112") ? false : stryMutAct_9fa48("3111") ? true : stryMutAct_9fa48("3110") ? d : (stryCov_9fa48("3110", "3111", "3112"), !d)) return it;
          if (stryMutAct_9fa48("3115") ? it.remindAt === d.remindAt || it.remindRepeat === d.remindRepeat : stryMutAct_9fa48("3114") ? false : stryMutAct_9fa48("3113") ? true : (stryCov_9fa48("3113", "3114", "3115"), (stryMutAct_9fa48("3117") ? it.remindAt !== d.remindAt : stryMutAct_9fa48("3116") ? true : (stryCov_9fa48("3116", "3117"), it.remindAt === d.remindAt)) && (stryMutAct_9fa48("3119") ? it.remindRepeat !== d.remindRepeat : stryMutAct_9fa48("3118") ? true : (stryCov_9fa48("3118", "3119"), it.remindRepeat === d.remindRepeat)))) return it;
          return stryMutAct_9fa48("3120") ? {} : (stryCov_9fa48("3120"), {
            ...it,
            remindAt: d.remindAt,
            remindRepeat: d.remindRepeat
          });
        }
      })
    });
  }
}
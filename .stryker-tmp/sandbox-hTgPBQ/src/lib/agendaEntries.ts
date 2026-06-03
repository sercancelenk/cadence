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
import { isTodoOpen, type AppData, type Item, type TodoItem } from '../model';
import { PATH_AGENDA, PATH_TODOS } from './routes';
import { teamPerson } from './teamPaths';
export type AgendaItemScheduleKind = 'reminder' | 'due';
export type AgendaEntry = {
  kind: 'item';
  key: string;
  when: Date;
  scheduleKind: AgendaItemScheduleKind;
  item: Item;
  teamId?: string;
  teamName?: string;
  personName?: string;
} | {
  kind: 'todo';
  key: string;
  when: Date;
  todo: TodoItem;
  groupName?: string;
};
export type AgendaDayBucket = {
  key: string;
  label: string;
  subtitle: string;
  isToday: boolean;
  entries: AgendaEntry[];
};
export type CollectAgendaEntriesOptions = {
  showCompleted?: boolean;
};
export function startOfDay(d: Date): Date {
  if (stryMutAct_9fa48("2553")) {
    {}
  } else {
    stryCov_9fa48("2553");
    const x = new Date(d);
    stryMutAct_9fa48("2554") ? x.setMinutes(0, 0, 0, 0) : (stryCov_9fa48("2554"), x.setHours(0, 0, 0, 0));
    return x;
  }
}
export function dayKey(d: Date): string {
  if (stryMutAct_9fa48("2555")) {
    {}
  } else {
    stryCov_9fa48("2555");
    return stryMutAct_9fa48("2556") ? `` : (stryCov_9fa48("2556"), `${d.getFullYear()}-${String(stryMutAct_9fa48("2557") ? d.getMonth() - 1 : (stryCov_9fa48("2557"), d.getMonth() + 1)).padStart(2, stryMutAct_9fa48("2558") ? "" : (stryCov_9fa48("2558"), '0'))}-${String(d.getDate()).padStart(2, stryMutAct_9fa48("2559") ? "" : (stryCov_9fa48("2559"), '0'))}`);
  }
}

/** Unified agenda rows from team items (remind/due) and personal to-dos (due). */
export function collectAgendaEntries(data: AppData, {
  showCompleted = stryMutAct_9fa48("2560") ? true : (stryCov_9fa48("2560"), false)
}: CollectAgendaEntriesOptions = {}): AgendaEntry[] {
  if (stryMutAct_9fa48("2561")) {
    {}
  } else {
    stryCov_9fa48("2561");
    const out: AgendaEntry[] = stryMutAct_9fa48("2562") ? ["Stryker was here"] : (stryCov_9fa48("2562"), []);
    for (const it of data.items) {
      if (stryMutAct_9fa48("2563")) {
        {}
      } else {
        stryCov_9fa48("2563");
        if (stryMutAct_9fa48("2566") ? it.done || !showCompleted : stryMutAct_9fa48("2565") ? false : stryMutAct_9fa48("2564") ? true : (stryCov_9fa48("2564", "2565", "2566"), it.done && (stryMutAct_9fa48("2567") ? showCompleted : (stryCov_9fa48("2567"), !showCompleted)))) continue;
        const person = data.people.find(stryMutAct_9fa48("2568") ? () => undefined : (stryCov_9fa48("2568"), p => stryMutAct_9fa48("2571") ? p.id !== it.personId : stryMutAct_9fa48("2570") ? false : stryMutAct_9fa48("2569") ? true : (stryCov_9fa48("2569", "2570", "2571"), p.id === it.personId)));
        const team = person ? data.teams.find(stryMutAct_9fa48("2572") ? () => undefined : (stryCov_9fa48("2572"), t => stryMutAct_9fa48("2575") ? t.id !== person.teamId : stryMutAct_9fa48("2574") ? false : stryMutAct_9fa48("2573") ? true : (stryCov_9fa48("2573", "2574", "2575"), t.id === person.teamId))) : undefined;
        if (stryMutAct_9fa48("2577") ? false : stryMutAct_9fa48("2576") ? true : (stryCov_9fa48("2576", "2577"), it.remindAt)) {
          if (stryMutAct_9fa48("2578")) {
            {}
          } else {
            stryCov_9fa48("2578");
            const d = new Date(it.remindAt);
            if (stryMutAct_9fa48("2581") ? false : stryMutAct_9fa48("2580") ? true : stryMutAct_9fa48("2579") ? Number.isNaN(d.getTime()) : (stryCov_9fa48("2579", "2580", "2581"), !Number.isNaN(d.getTime()))) {
              if (stryMutAct_9fa48("2582")) {
                {}
              } else {
                stryCov_9fa48("2582");
                out.push(stryMutAct_9fa48("2583") ? {} : (stryCov_9fa48("2583"), {
                  kind: stryMutAct_9fa48("2584") ? "" : (stryCov_9fa48("2584"), 'item'),
                  key: stryMutAct_9fa48("2585") ? `` : (stryCov_9fa48("2585"), `${it.id}-r`),
                  when: d,
                  scheduleKind: stryMutAct_9fa48("2586") ? "" : (stryCov_9fa48("2586"), 'reminder'),
                  item: it,
                  teamId: stryMutAct_9fa48("2587") ? team.id : (stryCov_9fa48("2587"), team?.id),
                  teamName: stryMutAct_9fa48("2588") ? team.name : (stryCov_9fa48("2588"), team?.name),
                  personName: stryMutAct_9fa48("2589") ? person.name : (stryCov_9fa48("2589"), person?.name)
                }));
              }
            }
          }
        }
        if (stryMutAct_9fa48("2592") ? it.dueAt || it.dueAt !== it.remindAt : stryMutAct_9fa48("2591") ? false : stryMutAct_9fa48("2590") ? true : (stryCov_9fa48("2590", "2591", "2592"), it.dueAt && (stryMutAct_9fa48("2594") ? it.dueAt === it.remindAt : stryMutAct_9fa48("2593") ? true : (stryCov_9fa48("2593", "2594"), it.dueAt !== it.remindAt)))) {
          if (stryMutAct_9fa48("2595")) {
            {}
          } else {
            stryCov_9fa48("2595");
            const d = new Date(it.dueAt);
            if (stryMutAct_9fa48("2598") ? false : stryMutAct_9fa48("2597") ? true : stryMutAct_9fa48("2596") ? Number.isNaN(d.getTime()) : (stryCov_9fa48("2596", "2597", "2598"), !Number.isNaN(d.getTime()))) {
              if (stryMutAct_9fa48("2599")) {
                {}
              } else {
                stryCov_9fa48("2599");
                out.push(stryMutAct_9fa48("2600") ? {} : (stryCov_9fa48("2600"), {
                  kind: stryMutAct_9fa48("2601") ? "" : (stryCov_9fa48("2601"), 'item'),
                  key: stryMutAct_9fa48("2602") ? `` : (stryCov_9fa48("2602"), `${it.id}-d`),
                  when: d,
                  scheduleKind: stryMutAct_9fa48("2603") ? "" : (stryCov_9fa48("2603"), 'due'),
                  item: it,
                  teamId: stryMutAct_9fa48("2604") ? team.id : (stryCov_9fa48("2604"), team?.id),
                  teamName: stryMutAct_9fa48("2605") ? team.name : (stryCov_9fa48("2605"), team?.name),
                  personName: stryMutAct_9fa48("2606") ? person.name : (stryCov_9fa48("2606"), person?.name)
                }));
              }
            }
          }
        }
      }
    }
    for (const t of data.todoItems) {
      if (stryMutAct_9fa48("2607")) {
        {}
      } else {
        stryCov_9fa48("2607");
        if (stryMutAct_9fa48("2610") ? t.status !== 'cancelled' : stryMutAct_9fa48("2609") ? false : stryMutAct_9fa48("2608") ? true : (stryCov_9fa48("2608", "2609", "2610"), t.status === (stryMutAct_9fa48("2611") ? "" : (stryCov_9fa48("2611"), 'cancelled')))) continue;
        if (stryMutAct_9fa48("2614") ? !isTodoOpen(t.status) || !showCompleted : stryMutAct_9fa48("2613") ? false : stryMutAct_9fa48("2612") ? true : (stryCov_9fa48("2612", "2613", "2614"), (stryMutAct_9fa48("2615") ? isTodoOpen(t.status) : (stryCov_9fa48("2615"), !isTodoOpen(t.status))) && (stryMutAct_9fa48("2616") ? showCompleted : (stryCov_9fa48("2616"), !showCompleted)))) continue;
        if (stryMutAct_9fa48("2619") ? false : stryMutAct_9fa48("2618") ? true : stryMutAct_9fa48("2617") ? t.dueAt : (stryCov_9fa48("2617", "2618", "2619"), !t.dueAt)) continue;
        const d = new Date(t.dueAt);
        if (stryMutAct_9fa48("2621") ? false : stryMutAct_9fa48("2620") ? true : (stryCov_9fa48("2620", "2621"), Number.isNaN(d.getTime()))) continue;
        const group = data.todoGroups.find(stryMutAct_9fa48("2622") ? () => undefined : (stryCov_9fa48("2622"), g => stryMutAct_9fa48("2625") ? g.id !== t.groupId : stryMutAct_9fa48("2624") ? false : stryMutAct_9fa48("2623") ? true : (stryCov_9fa48("2623", "2624", "2625"), g.id === t.groupId)));
        out.push(stryMutAct_9fa48("2626") ? {} : (stryCov_9fa48("2626"), {
          kind: stryMutAct_9fa48("2627") ? "" : (stryCov_9fa48("2627"), 'todo'),
          key: t.id,
          when: d,
          todo: t,
          groupName: stryMutAct_9fa48("2628") ? group.name : (stryCov_9fa48("2628"), group?.name)
        }));
      }
    }
    return stryMutAct_9fa48("2629") ? out : (stryCov_9fa48("2629"), out.sort(stryMutAct_9fa48("2630") ? () => undefined : (stryCov_9fa48("2630"), (a, b) => stryMutAct_9fa48("2631") ? a.when.getTime() + b.when.getTime() : (stryCov_9fa48("2631"), a.when.getTime() - b.when.getTime()))));
  }
}
export function filterOverdueAgendaEntries(entries: AgendaEntry[], ref = new Date()): AgendaEntry[] {
  if (stryMutAct_9fa48("2632")) {
    {}
  } else {
    stryCov_9fa48("2632");
    const dayStart = startOfDay(ref).getTime();
    return stryMutAct_9fa48("2633") ? entries : (stryCov_9fa48("2633"), entries.filter(stryMutAct_9fa48("2634") ? () => undefined : (stryCov_9fa48("2634"), e => stryMutAct_9fa48("2637") ? e.when.getTime() < dayStart || (e.kind === 'item' ? !e.item.done : isTodoOpen(e.todo.status)) : stryMutAct_9fa48("2636") ? false : stryMutAct_9fa48("2635") ? true : (stryCov_9fa48("2635", "2636", "2637"), (stryMutAct_9fa48("2640") ? e.when.getTime() >= dayStart : stryMutAct_9fa48("2639") ? e.when.getTime() <= dayStart : stryMutAct_9fa48("2638") ? true : (stryCov_9fa48("2638", "2639", "2640"), e.when.getTime() < dayStart)) && ((stryMutAct_9fa48("2643") ? e.kind !== 'item' : stryMutAct_9fa48("2642") ? false : stryMutAct_9fa48("2641") ? true : (stryCov_9fa48("2641", "2642", "2643"), e.kind === (stryMutAct_9fa48("2644") ? "" : (stryCov_9fa48("2644"), 'item')))) ? stryMutAct_9fa48("2645") ? e.item.done : (stryCov_9fa48("2645"), !e.item.done) : isTodoOpen(e.todo.status))))));
  }
}
export function filterAgendaEntriesForDay(entries: AgendaEntry[], day: Date): AgendaEntry[] {
  if (stryMutAct_9fa48("2646")) {
    {}
  } else {
    stryCov_9fa48("2646");
    const dayStart = startOfDay(day);
    const dayEnd = new Date(dayStart);
    stryMutAct_9fa48("2647") ? dayEnd.setTime(dayEnd.getDate() + 1) : (stryCov_9fa48("2647"), dayEnd.setDate(stryMutAct_9fa48("2648") ? dayEnd.getDate() - 1 : (stryCov_9fa48("2648"), dayEnd.getDate() + 1)));
    return stryMutAct_9fa48("2649") ? entries : (stryCov_9fa48("2649"), entries.filter(stryMutAct_9fa48("2650") ? () => undefined : (stryCov_9fa48("2650"), e => stryMutAct_9fa48("2653") ? e.when >= dayStart || e.when < dayEnd : stryMutAct_9fa48("2652") ? false : stryMutAct_9fa48("2651") ? true : (stryCov_9fa48("2651", "2652", "2653"), (stryMutAct_9fa48("2656") ? e.when < dayStart : stryMutAct_9fa48("2655") ? e.when > dayStart : stryMutAct_9fa48("2654") ? true : (stryCov_9fa48("2654", "2655", "2656"), e.when >= dayStart)) && (stryMutAct_9fa48("2659") ? e.when >= dayEnd : stryMutAct_9fa48("2658") ? e.when <= dayEnd : stryMutAct_9fa48("2657") ? true : (stryCov_9fa48("2657", "2658", "2659"), e.when < dayEnd))))));
  }
}
export function buildAgendaWeekStrip(entries: AgendaEntry[], ref = new Date()): AgendaDayBucket[] {
  if (stryMutAct_9fa48("2660")) {
    {}
  } else {
    stryCov_9fa48("2660");
    const today = startOfDay(ref);
    const out: AgendaDayBucket[] = stryMutAct_9fa48("2661") ? ["Stryker was here"] : (stryCov_9fa48("2661"), []);
    for (let offset = 0; stryMutAct_9fa48("2664") ? offset >= 7 : stryMutAct_9fa48("2663") ? offset <= 7 : stryMutAct_9fa48("2662") ? false : (stryCov_9fa48("2662", "2663", "2664"), offset < 7); stryMutAct_9fa48("2665") ? offset-- : (stryCov_9fa48("2665"), offset++)) {
      if (stryMutAct_9fa48("2666")) {
        {}
      } else {
        stryCov_9fa48("2666");
        const dayStart = new Date(today);
        stryMutAct_9fa48("2667") ? dayStart.setTime(dayStart.getDate() + offset) : (stryCov_9fa48("2667"), dayStart.setDate(stryMutAct_9fa48("2668") ? dayStart.getDate() - offset : (stryCov_9fa48("2668"), dayStart.getDate() + offset)));
        const dayEnd = new Date(dayStart);
        stryMutAct_9fa48("2669") ? dayEnd.setTime(dayEnd.getDate() + 1) : (stryCov_9fa48("2669"), dayEnd.setDate(stryMutAct_9fa48("2670") ? dayEnd.getDate() - 1 : (stryCov_9fa48("2670"), dayEnd.getDate() + 1)));
        const bucket = stryMutAct_9fa48("2671") ? entries : (stryCov_9fa48("2671"), entries.filter(stryMutAct_9fa48("2672") ? () => undefined : (stryCov_9fa48("2672"), e => stryMutAct_9fa48("2675") ? e.when >= dayStart || e.when < dayEnd : stryMutAct_9fa48("2674") ? false : stryMutAct_9fa48("2673") ? true : (stryCov_9fa48("2673", "2674", "2675"), (stryMutAct_9fa48("2678") ? e.when < dayStart : stryMutAct_9fa48("2677") ? e.when > dayStart : stryMutAct_9fa48("2676") ? true : (stryCov_9fa48("2676", "2677", "2678"), e.when >= dayStart)) && (stryMutAct_9fa48("2681") ? e.when >= dayEnd : stryMutAct_9fa48("2680") ? e.when <= dayEnd : stryMutAct_9fa48("2679") ? true : (stryCov_9fa48("2679", "2680", "2681"), e.when < dayEnd))))));
        if (stryMutAct_9fa48("2684") ? offset > 0 || bucket.length === 0 : stryMutAct_9fa48("2683") ? false : stryMutAct_9fa48("2682") ? true : (stryCov_9fa48("2682", "2683", "2684"), (stryMutAct_9fa48("2687") ? offset <= 0 : stryMutAct_9fa48("2686") ? offset >= 0 : stryMutAct_9fa48("2685") ? true : (stryCov_9fa48("2685", "2686", "2687"), offset > 0)) && (stryMutAct_9fa48("2689") ? bucket.length !== 0 : stryMutAct_9fa48("2688") ? true : (stryCov_9fa48("2688", "2689"), bucket.length === 0)))) continue;
        out.push(stryMutAct_9fa48("2690") ? {} : (stryCov_9fa48("2690"), {
          key: dayKey(dayStart),
          label: (stryMutAct_9fa48("2693") ? offset !== 0 : stryMutAct_9fa48("2692") ? false : stryMutAct_9fa48("2691") ? true : (stryCov_9fa48("2691", "2692", "2693"), offset === 0)) ? stryMutAct_9fa48("2694") ? "" : (stryCov_9fa48("2694"), 'Today') : (stryMutAct_9fa48("2697") ? offset !== 1 : stryMutAct_9fa48("2696") ? false : stryMutAct_9fa48("2695") ? true : (stryCov_9fa48("2695", "2696", "2697"), offset === 1)) ? stryMutAct_9fa48("2698") ? "" : (stryCov_9fa48("2698"), 'Tomorrow') : dayStart.toLocaleDateString(undefined, stryMutAct_9fa48("2699") ? {} : (stryCov_9fa48("2699"), {
            weekday: stryMutAct_9fa48("2700") ? "" : (stryCov_9fa48("2700"), 'long')
          })),
          subtitle: dayStart.toLocaleDateString(undefined, stryMutAct_9fa48("2701") ? {} : (stryCov_9fa48("2701"), {
            day: stryMutAct_9fa48("2702") ? "" : (stryCov_9fa48("2702"), 'numeric'),
            month: stryMutAct_9fa48("2703") ? "" : (stryCov_9fa48("2703"), 'short')
          })),
          isToday: stryMutAct_9fa48("2706") ? offset !== 0 : stryMutAct_9fa48("2705") ? false : stryMutAct_9fa48("2704") ? true : (stryCov_9fa48("2704", "2705", "2706"), offset === 0),
          entries: bucket
        }));
      }
    }
    return out;
  }
}
export function agendaEntryTitle(entry: AgendaEntry): string {
  if (stryMutAct_9fa48("2707")) {
    {}
  } else {
    stryCov_9fa48("2707");
    if (stryMutAct_9fa48("2710") ? entry.kind !== 'item' : stryMutAct_9fa48("2709") ? false : stryMutAct_9fa48("2708") ? true : (stryCov_9fa48("2708", "2709", "2710"), entry.kind === (stryMutAct_9fa48("2711") ? "" : (stryCov_9fa48("2711"), 'item')))) {
      if (stryMutAct_9fa48("2712")) {
        {}
      } else {
        stryCov_9fa48("2712");
        return stryMutAct_9fa48("2715") ? entry.item.title && '(untitled)' : stryMutAct_9fa48("2714") ? false : stryMutAct_9fa48("2713") ? true : (stryCov_9fa48("2713", "2714", "2715"), entry.item.title || (stryMutAct_9fa48("2716") ? "" : (stryCov_9fa48("2716"), '(untitled)')));
      }
    }
    return stryMutAct_9fa48("2719") ? entry.todo.title && '(untitled)' : stryMutAct_9fa48("2718") ? false : stryMutAct_9fa48("2717") ? true : (stryCov_9fa48("2717", "2718", "2719"), entry.todo.title || (stryMutAct_9fa48("2720") ? "" : (stryCov_9fa48("2720"), '(untitled)')));
  }
}
export function agendaScheduleKindLabel(scheduleKind: AgendaItemScheduleKind): string {
  if (stryMutAct_9fa48("2721")) {
    {}
  } else {
    stryCov_9fa48("2721");
    return (stryMutAct_9fa48("2724") ? scheduleKind !== 'reminder' : stryMutAct_9fa48("2723") ? false : stryMutAct_9fa48("2722") ? true : (stryCov_9fa48("2722", "2723", "2724"), scheduleKind === (stryMutAct_9fa48("2725") ? "" : (stryCov_9fa48("2725"), 'reminder')))) ? stryMutAct_9fa48("2726") ? "" : (stryCov_9fa48("2726"), 'Reminder') : stryMutAct_9fa48("2727") ? "" : (stryCov_9fa48("2727"), 'Due');
  }
}
export function agendaEntryHref(entry: AgendaEntry): string {
  if (stryMutAct_9fa48("2728")) {
    {}
  } else {
    stryCov_9fa48("2728");
    if (stryMutAct_9fa48("2731") ? entry.kind !== 'todo' : stryMutAct_9fa48("2730") ? false : stryMutAct_9fa48("2729") ? true : (stryCov_9fa48("2729", "2730", "2731"), entry.kind === (stryMutAct_9fa48("2732") ? "" : (stryCov_9fa48("2732"), 'todo')))) {
      if (stryMutAct_9fa48("2733")) {
        {}
      } else {
        stryCov_9fa48("2733");
        return stryMutAct_9fa48("2734") ? `` : (stryCov_9fa48("2734"), `${PATH_TODOS}?focus=${encodeURIComponent(entry.todo.id)}`);
      }
    }
    if (stryMutAct_9fa48("2736") ? false : stryMutAct_9fa48("2735") ? true : (stryCov_9fa48("2735", "2736"), entry.teamId)) {
      if (stryMutAct_9fa48("2737")) {
        {}
      } else {
        stryCov_9fa48("2737");
        return teamPerson(entry.teamId, entry.item.personId);
      }
    }
    return PATH_AGENDA;
  }
}
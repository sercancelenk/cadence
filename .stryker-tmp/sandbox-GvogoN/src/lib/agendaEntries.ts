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
  if (stryMutAct_9fa48("0")) {
    {}
  } else {
    stryCov_9fa48("0");
    const x = new Date(d);
    stryMutAct_9fa48("1") ? x.setMinutes(0, 0, 0, 0) : (stryCov_9fa48("1"), x.setHours(0, 0, 0, 0));
    return x;
  }
}
export function dayKey(d: Date): string {
  if (stryMutAct_9fa48("2")) {
    {}
  } else {
    stryCov_9fa48("2");
    return stryMutAct_9fa48("3") ? `` : (stryCov_9fa48("3"), `${d.getFullYear()}-${String(stryMutAct_9fa48("4") ? d.getMonth() - 1 : (stryCov_9fa48("4"), d.getMonth() + 1)).padStart(2, stryMutAct_9fa48("5") ? "" : (stryCov_9fa48("5"), '0'))}-${String(d.getDate()).padStart(2, stryMutAct_9fa48("6") ? "" : (stryCov_9fa48("6"), '0'))}`);
  }
}

/** Unified agenda rows from team items (remind/due) and personal to-dos (due). */
export function collectAgendaEntries(data: AppData, {
  showCompleted = stryMutAct_9fa48("7") ? true : (stryCov_9fa48("7"), false)
}: CollectAgendaEntriesOptions = {}): AgendaEntry[] {
  if (stryMutAct_9fa48("8")) {
    {}
  } else {
    stryCov_9fa48("8");
    const out: AgendaEntry[] = stryMutAct_9fa48("9") ? ["Stryker was here"] : (stryCov_9fa48("9"), []);
    for (const it of data.items) {
      if (stryMutAct_9fa48("10")) {
        {}
      } else {
        stryCov_9fa48("10");
        if (stryMutAct_9fa48("13") ? it.done || !showCompleted : stryMutAct_9fa48("12") ? false : stryMutAct_9fa48("11") ? true : (stryCov_9fa48("11", "12", "13"), it.done && (stryMutAct_9fa48("14") ? showCompleted : (stryCov_9fa48("14"), !showCompleted)))) continue;
        const person = data.people.find(stryMutAct_9fa48("15") ? () => undefined : (stryCov_9fa48("15"), p => stryMutAct_9fa48("18") ? p.id !== it.personId : stryMutAct_9fa48("17") ? false : stryMutAct_9fa48("16") ? true : (stryCov_9fa48("16", "17", "18"), p.id === it.personId)));
        const team = person ? data.teams.find(stryMutAct_9fa48("19") ? () => undefined : (stryCov_9fa48("19"), t => stryMutAct_9fa48("22") ? t.id !== person.teamId : stryMutAct_9fa48("21") ? false : stryMutAct_9fa48("20") ? true : (stryCov_9fa48("20", "21", "22"), t.id === person.teamId))) : undefined;
        if (stryMutAct_9fa48("24") ? false : stryMutAct_9fa48("23") ? true : (stryCov_9fa48("23", "24"), it.remindAt)) {
          if (stryMutAct_9fa48("25")) {
            {}
          } else {
            stryCov_9fa48("25");
            const d = new Date(it.remindAt);
            if (stryMutAct_9fa48("28") ? false : stryMutAct_9fa48("27") ? true : stryMutAct_9fa48("26") ? Number.isNaN(d.getTime()) : (stryCov_9fa48("26", "27", "28"), !Number.isNaN(d.getTime()))) {
              if (stryMutAct_9fa48("29")) {
                {}
              } else {
                stryCov_9fa48("29");
                out.push(stryMutAct_9fa48("30") ? {} : (stryCov_9fa48("30"), {
                  kind: stryMutAct_9fa48("31") ? "" : (stryCov_9fa48("31"), 'item'),
                  key: stryMutAct_9fa48("32") ? `` : (stryCov_9fa48("32"), `${it.id}-r`),
                  when: d,
                  scheduleKind: stryMutAct_9fa48("33") ? "" : (stryCov_9fa48("33"), 'reminder'),
                  item: it,
                  teamId: stryMutAct_9fa48("34") ? team.id : (stryCov_9fa48("34"), team?.id),
                  teamName: stryMutAct_9fa48("35") ? team.name : (stryCov_9fa48("35"), team?.name),
                  personName: stryMutAct_9fa48("36") ? person.name : (stryCov_9fa48("36"), person?.name)
                }));
              }
            }
          }
        }
        if (stryMutAct_9fa48("39") ? it.dueAt || it.dueAt !== it.remindAt : stryMutAct_9fa48("38") ? false : stryMutAct_9fa48("37") ? true : (stryCov_9fa48("37", "38", "39"), it.dueAt && (stryMutAct_9fa48("41") ? it.dueAt === it.remindAt : stryMutAct_9fa48("40") ? true : (stryCov_9fa48("40", "41"), it.dueAt !== it.remindAt)))) {
          if (stryMutAct_9fa48("42")) {
            {}
          } else {
            stryCov_9fa48("42");
            const d = new Date(it.dueAt);
            if (stryMutAct_9fa48("45") ? false : stryMutAct_9fa48("44") ? true : stryMutAct_9fa48("43") ? Number.isNaN(d.getTime()) : (stryCov_9fa48("43", "44", "45"), !Number.isNaN(d.getTime()))) {
              if (stryMutAct_9fa48("46")) {
                {}
              } else {
                stryCov_9fa48("46");
                out.push(stryMutAct_9fa48("47") ? {} : (stryCov_9fa48("47"), {
                  kind: stryMutAct_9fa48("48") ? "" : (stryCov_9fa48("48"), 'item'),
                  key: stryMutAct_9fa48("49") ? `` : (stryCov_9fa48("49"), `${it.id}-d`),
                  when: d,
                  scheduleKind: stryMutAct_9fa48("50") ? "" : (stryCov_9fa48("50"), 'due'),
                  item: it,
                  teamId: stryMutAct_9fa48("51") ? team.id : (stryCov_9fa48("51"), team?.id),
                  teamName: stryMutAct_9fa48("52") ? team.name : (stryCov_9fa48("52"), team?.name),
                  personName: stryMutAct_9fa48("53") ? person.name : (stryCov_9fa48("53"), person?.name)
                }));
              }
            }
          }
        }
      }
    }
    for (const t of data.todoItems) {
      if (stryMutAct_9fa48("54")) {
        {}
      } else {
        stryCov_9fa48("54");
        if (stryMutAct_9fa48("57") ? t.status !== 'cancelled' : stryMutAct_9fa48("56") ? false : stryMutAct_9fa48("55") ? true : (stryCov_9fa48("55", "56", "57"), t.status === (stryMutAct_9fa48("58") ? "" : (stryCov_9fa48("58"), 'cancelled')))) continue;
        if (stryMutAct_9fa48("61") ? !isTodoOpen(t.status) || !showCompleted : stryMutAct_9fa48("60") ? false : stryMutAct_9fa48("59") ? true : (stryCov_9fa48("59", "60", "61"), (stryMutAct_9fa48("62") ? isTodoOpen(t.status) : (stryCov_9fa48("62"), !isTodoOpen(t.status))) && (stryMutAct_9fa48("63") ? showCompleted : (stryCov_9fa48("63"), !showCompleted)))) continue;
        if (stryMutAct_9fa48("66") ? false : stryMutAct_9fa48("65") ? true : stryMutAct_9fa48("64") ? t.dueAt : (stryCov_9fa48("64", "65", "66"), !t.dueAt)) continue;
        const d = new Date(t.dueAt);
        if (stryMutAct_9fa48("68") ? false : stryMutAct_9fa48("67") ? true : (stryCov_9fa48("67", "68"), Number.isNaN(d.getTime()))) continue;
        const group = data.todoGroups.find(stryMutAct_9fa48("69") ? () => undefined : (stryCov_9fa48("69"), g => stryMutAct_9fa48("72") ? g.id !== t.groupId : stryMutAct_9fa48("71") ? false : stryMutAct_9fa48("70") ? true : (stryCov_9fa48("70", "71", "72"), g.id === t.groupId)));
        out.push(stryMutAct_9fa48("73") ? {} : (stryCov_9fa48("73"), {
          kind: stryMutAct_9fa48("74") ? "" : (stryCov_9fa48("74"), 'todo'),
          key: t.id,
          when: d,
          todo: t,
          groupName: stryMutAct_9fa48("75") ? group.name : (stryCov_9fa48("75"), group?.name)
        }));
      }
    }
    return stryMutAct_9fa48("76") ? out : (stryCov_9fa48("76"), out.sort(stryMutAct_9fa48("77") ? () => undefined : (stryCov_9fa48("77"), (a, b) => stryMutAct_9fa48("78") ? a.when.getTime() + b.when.getTime() : (stryCov_9fa48("78"), a.when.getTime() - b.when.getTime()))));
  }
}
export function filterOverdueAgendaEntries(entries: AgendaEntry[], ref = new Date()): AgendaEntry[] {
  if (stryMutAct_9fa48("79")) {
    {}
  } else {
    stryCov_9fa48("79");
    const dayStart = startOfDay(ref).getTime();
    return stryMutAct_9fa48("80") ? entries : (stryCov_9fa48("80"), entries.filter(stryMutAct_9fa48("81") ? () => undefined : (stryCov_9fa48("81"), e => stryMutAct_9fa48("84") ? e.when.getTime() < dayStart || (e.kind === 'item' ? !e.item.done : isTodoOpen(e.todo.status)) : stryMutAct_9fa48("83") ? false : stryMutAct_9fa48("82") ? true : (stryCov_9fa48("82", "83", "84"), (stryMutAct_9fa48("87") ? e.when.getTime() >= dayStart : stryMutAct_9fa48("86") ? e.when.getTime() <= dayStart : stryMutAct_9fa48("85") ? true : (stryCov_9fa48("85", "86", "87"), e.when.getTime() < dayStart)) && ((stryMutAct_9fa48("90") ? e.kind !== 'item' : stryMutAct_9fa48("89") ? false : stryMutAct_9fa48("88") ? true : (stryCov_9fa48("88", "89", "90"), e.kind === (stryMutAct_9fa48("91") ? "" : (stryCov_9fa48("91"), 'item')))) ? stryMutAct_9fa48("92") ? e.item.done : (stryCov_9fa48("92"), !e.item.done) : isTodoOpen(e.todo.status))))));
  }
}
export function filterAgendaEntriesForDay(entries: AgendaEntry[], day: Date): AgendaEntry[] {
  if (stryMutAct_9fa48("93")) {
    {}
  } else {
    stryCov_9fa48("93");
    const dayStart = startOfDay(day);
    const dayEnd = new Date(dayStart);
    stryMutAct_9fa48("94") ? dayEnd.setTime(dayEnd.getDate() + 1) : (stryCov_9fa48("94"), dayEnd.setDate(stryMutAct_9fa48("95") ? dayEnd.getDate() - 1 : (stryCov_9fa48("95"), dayEnd.getDate() + 1)));
    return stryMutAct_9fa48("96") ? entries : (stryCov_9fa48("96"), entries.filter(stryMutAct_9fa48("97") ? () => undefined : (stryCov_9fa48("97"), e => stryMutAct_9fa48("100") ? e.when >= dayStart || e.when < dayEnd : stryMutAct_9fa48("99") ? false : stryMutAct_9fa48("98") ? true : (stryCov_9fa48("98", "99", "100"), (stryMutAct_9fa48("103") ? e.when < dayStart : stryMutAct_9fa48("102") ? e.when > dayStart : stryMutAct_9fa48("101") ? true : (stryCov_9fa48("101", "102", "103"), e.when >= dayStart)) && (stryMutAct_9fa48("106") ? e.when >= dayEnd : stryMutAct_9fa48("105") ? e.when <= dayEnd : stryMutAct_9fa48("104") ? true : (stryCov_9fa48("104", "105", "106"), e.when < dayEnd))))));
  }
}
export function buildAgendaWeekStrip(entries: AgendaEntry[], ref = new Date()): AgendaDayBucket[] {
  if (stryMutAct_9fa48("107")) {
    {}
  } else {
    stryCov_9fa48("107");
    const today = startOfDay(ref);
    const out: AgendaDayBucket[] = stryMutAct_9fa48("108") ? ["Stryker was here"] : (stryCov_9fa48("108"), []);
    for (let offset = 0; stryMutAct_9fa48("111") ? offset >= 7 : stryMutAct_9fa48("110") ? offset <= 7 : stryMutAct_9fa48("109") ? false : (stryCov_9fa48("109", "110", "111"), offset < 7); stryMutAct_9fa48("112") ? offset-- : (stryCov_9fa48("112"), offset++)) {
      if (stryMutAct_9fa48("113")) {
        {}
      } else {
        stryCov_9fa48("113");
        const dayStart = new Date(today);
        stryMutAct_9fa48("114") ? dayStart.setTime(dayStart.getDate() + offset) : (stryCov_9fa48("114"), dayStart.setDate(stryMutAct_9fa48("115") ? dayStart.getDate() - offset : (stryCov_9fa48("115"), dayStart.getDate() + offset)));
        const dayEnd = new Date(dayStart);
        stryMutAct_9fa48("116") ? dayEnd.setTime(dayEnd.getDate() + 1) : (stryCov_9fa48("116"), dayEnd.setDate(stryMutAct_9fa48("117") ? dayEnd.getDate() - 1 : (stryCov_9fa48("117"), dayEnd.getDate() + 1)));
        const bucket = stryMutAct_9fa48("118") ? entries : (stryCov_9fa48("118"), entries.filter(stryMutAct_9fa48("119") ? () => undefined : (stryCov_9fa48("119"), e => stryMutAct_9fa48("122") ? e.when >= dayStart || e.when < dayEnd : stryMutAct_9fa48("121") ? false : stryMutAct_9fa48("120") ? true : (stryCov_9fa48("120", "121", "122"), (stryMutAct_9fa48("125") ? e.when < dayStart : stryMutAct_9fa48("124") ? e.when > dayStart : stryMutAct_9fa48("123") ? true : (stryCov_9fa48("123", "124", "125"), e.when >= dayStart)) && (stryMutAct_9fa48("128") ? e.when >= dayEnd : stryMutAct_9fa48("127") ? e.when <= dayEnd : stryMutAct_9fa48("126") ? true : (stryCov_9fa48("126", "127", "128"), e.when < dayEnd))))));
        if (stryMutAct_9fa48("131") ? offset > 0 || bucket.length === 0 : stryMutAct_9fa48("130") ? false : stryMutAct_9fa48("129") ? true : (stryCov_9fa48("129", "130", "131"), (stryMutAct_9fa48("134") ? offset <= 0 : stryMutAct_9fa48("133") ? offset >= 0 : stryMutAct_9fa48("132") ? true : (stryCov_9fa48("132", "133", "134"), offset > 0)) && (stryMutAct_9fa48("136") ? bucket.length !== 0 : stryMutAct_9fa48("135") ? true : (stryCov_9fa48("135", "136"), bucket.length === 0)))) continue;
        out.push(stryMutAct_9fa48("137") ? {} : (stryCov_9fa48("137"), {
          key: dayKey(dayStart),
          label: (stryMutAct_9fa48("140") ? offset !== 0 : stryMutAct_9fa48("139") ? false : stryMutAct_9fa48("138") ? true : (stryCov_9fa48("138", "139", "140"), offset === 0)) ? stryMutAct_9fa48("141") ? "" : (stryCov_9fa48("141"), 'Today') : (stryMutAct_9fa48("144") ? offset !== 1 : stryMutAct_9fa48("143") ? false : stryMutAct_9fa48("142") ? true : (stryCov_9fa48("142", "143", "144"), offset === 1)) ? stryMutAct_9fa48("145") ? "" : (stryCov_9fa48("145"), 'Tomorrow') : dayStart.toLocaleDateString(undefined, stryMutAct_9fa48("146") ? {} : (stryCov_9fa48("146"), {
            weekday: stryMutAct_9fa48("147") ? "" : (stryCov_9fa48("147"), 'long')
          })),
          subtitle: dayStart.toLocaleDateString(undefined, stryMutAct_9fa48("148") ? {} : (stryCov_9fa48("148"), {
            day: stryMutAct_9fa48("149") ? "" : (stryCov_9fa48("149"), 'numeric'),
            month: stryMutAct_9fa48("150") ? "" : (stryCov_9fa48("150"), 'short')
          })),
          isToday: stryMutAct_9fa48("153") ? offset !== 0 : stryMutAct_9fa48("152") ? false : stryMutAct_9fa48("151") ? true : (stryCov_9fa48("151", "152", "153"), offset === 0),
          entries: bucket
        }));
      }
    }
    return out;
  }
}
export function agendaEntryTitle(entry: AgendaEntry): string {
  if (stryMutAct_9fa48("154")) {
    {}
  } else {
    stryCov_9fa48("154");
    if (stryMutAct_9fa48("157") ? entry.kind !== 'item' : stryMutAct_9fa48("156") ? false : stryMutAct_9fa48("155") ? true : (stryCov_9fa48("155", "156", "157"), entry.kind === (stryMutAct_9fa48("158") ? "" : (stryCov_9fa48("158"), 'item')))) {
      if (stryMutAct_9fa48("159")) {
        {}
      } else {
        stryCov_9fa48("159");
        return stryMutAct_9fa48("162") ? entry.item.title && '(untitled)' : stryMutAct_9fa48("161") ? false : stryMutAct_9fa48("160") ? true : (stryCov_9fa48("160", "161", "162"), entry.item.title || (stryMutAct_9fa48("163") ? "" : (stryCov_9fa48("163"), '(untitled)')));
      }
    }
    return stryMutAct_9fa48("166") ? entry.todo.title && '(untitled)' : stryMutAct_9fa48("165") ? false : stryMutAct_9fa48("164") ? true : (stryCov_9fa48("164", "165", "166"), entry.todo.title || (stryMutAct_9fa48("167") ? "" : (stryCov_9fa48("167"), '(untitled)')));
  }
}
export function agendaScheduleKindLabel(scheduleKind: AgendaItemScheduleKind): string {
  if (stryMutAct_9fa48("168")) {
    {}
  } else {
    stryCov_9fa48("168");
    return (stryMutAct_9fa48("171") ? scheduleKind !== 'reminder' : stryMutAct_9fa48("170") ? false : stryMutAct_9fa48("169") ? true : (stryCov_9fa48("169", "170", "171"), scheduleKind === (stryMutAct_9fa48("172") ? "" : (stryCov_9fa48("172"), 'reminder')))) ? stryMutAct_9fa48("173") ? "" : (stryCov_9fa48("173"), 'Reminder') : stryMutAct_9fa48("174") ? "" : (stryCov_9fa48("174"), 'Due');
  }
}
export function agendaEntryHref(entry: AgendaEntry): string {
  if (stryMutAct_9fa48("175")) {
    {}
  } else {
    stryCov_9fa48("175");
    if (stryMutAct_9fa48("178") ? entry.kind !== 'todo' : stryMutAct_9fa48("177") ? false : stryMutAct_9fa48("176") ? true : (stryCov_9fa48("176", "177", "178"), entry.kind === (stryMutAct_9fa48("179") ? "" : (stryCov_9fa48("179"), 'todo')))) {
      if (stryMutAct_9fa48("180")) {
        {}
      } else {
        stryCov_9fa48("180");
        return stryMutAct_9fa48("181") ? `` : (stryCov_9fa48("181"), `${PATH_TODOS}?focus=${encodeURIComponent(entry.todo.id)}`);
      }
    }
    if (stryMutAct_9fa48("183") ? false : stryMutAct_9fa48("182") ? true : (stryCov_9fa48("182", "183"), entry.teamId)) {
      if (stryMutAct_9fa48("184")) {
        {}
      } else {
        stryCov_9fa48("184");
        return teamPerson(entry.teamId, entry.item.personId);
      }
    }
    return PATH_AGENDA;
  }
}
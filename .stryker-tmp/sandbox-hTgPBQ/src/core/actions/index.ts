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
import { uuid } from '../../lib/uuid';
import { clearReminderNotifyKeys, reminderNotifyEntryId } from '../../lib/reminderNotify';
import type { AISettings, AppData, FeedbackKind, GoalStatus, Item, ItemKind, Note, NotesLock, Person, Priority, ReminderRepeat, Team, TodoGroup, TodoItem, TodoStatus, UserProfile, UtilityDocument, UtilityStructuredText } from '../model';
import { isLeaderPerson, isSelfPerson, nowIso, selfPersonIdForTeam, leaderPersonIdForTeam } from '../model';
export function addTeam(data: AppData, name: string): AppData {
  if (stryMutAct_9fa48("11")) {
    {}
  } else {
    stryCov_9fa48("11");
    const t = nowIso();
    const teamId = uuid();
    const selfId = selfPersonIdForTeam(teamId);
    const leaderId = leaderPersonIdForTeam(teamId);
    const team: Team = stryMutAct_9fa48("12") ? {} : (stryCov_9fa48("12"), {
      id: teamId,
      name: stryMutAct_9fa48("15") ? name.trim() && 'New team' : stryMutAct_9fa48("14") ? false : stryMutAct_9fa48("13") ? true : (stryCov_9fa48("13", "14", "15"), (stryMutAct_9fa48("16") ? name : (stryCov_9fa48("16"), name.trim())) || (stryMutAct_9fa48("17") ? "" : (stryCov_9fa48("17"), 'New team'))),
      createdAt: t,
      status: stryMutAct_9fa48("18") ? "" : (stryCov_9fa48("18"), 'active')
    });
    const self: Person = stryMutAct_9fa48("19") ? {} : (stryCov_9fa48("19"), {
      id: selfId,
      teamId,
      name: stryMutAct_9fa48("20") ? "" : (stryCov_9fa48("20"), 'Me'),
      isSelf: stryMutAct_9fa48("21") ? false : (stryCov_9fa48("21"), true),
      scratchpad: stryMutAct_9fa48("22") ? "Stryker was here!" : (stryCov_9fa48("22"), ''),
      createdAt: t
    });
    const leader: Person = stryMutAct_9fa48("23") ? {} : (stryCov_9fa48("23"), {
      id: leaderId,
      teamId,
      name: stryMutAct_9fa48("24") ? "" : (stryCov_9fa48("24"), 'My leader'),
      scratchpad: stryMutAct_9fa48("25") ? "Stryker was here!" : (stryCov_9fa48("25"), ''),
      createdAt: t
    });
    return stryMutAct_9fa48("26") ? {} : (stryCov_9fa48("26"), {
      ...data,
      teams: stryMutAct_9fa48("27") ? [] : (stryCov_9fa48("27"), [...data.teams, team]),
      people: stryMutAct_9fa48("28") ? [] : (stryCov_9fa48("28"), [...data.people, self, leader]),
      lastTeamId: teamId
    });
  }
}
export function updateTeam(data: AppData, teamId: string, patch: Partial<Pick<Team, 'name' | 'status'>>): AppData {
  if (stryMutAct_9fa48("29")) {
    {}
  } else {
    stryCov_9fa48("29");
    return stryMutAct_9fa48("30") ? {} : (stryCov_9fa48("30"), {
      ...data,
      teams: data.teams.map(stryMutAct_9fa48("31") ? () => undefined : (stryCov_9fa48("31"), x => (stryMutAct_9fa48("34") ? x.id !== teamId : stryMutAct_9fa48("33") ? false : stryMutAct_9fa48("32") ? true : (stryCov_9fa48("32", "33", "34"), x.id === teamId)) ? stryMutAct_9fa48("35") ? {} : (stryCov_9fa48("35"), {
        ...x,
        name: (stryMutAct_9fa48("38") ? patch.name === undefined : stryMutAct_9fa48("37") ? false : stryMutAct_9fa48("36") ? true : (stryCov_9fa48("36", "37", "38"), patch.name !== undefined)) ? stryMutAct_9fa48("41") ? patch.name.trim() && x.name : stryMutAct_9fa48("40") ? false : stryMutAct_9fa48("39") ? true : (stryCov_9fa48("39", "40", "41"), (stryMutAct_9fa48("42") ? patch.name : (stryCov_9fa48("42"), patch.name.trim())) || x.name) : x.name,
        status: (stryMutAct_9fa48("45") ? patch.status === undefined : stryMutAct_9fa48("44") ? false : stryMutAct_9fa48("43") ? true : (stryCov_9fa48("43", "44", "45"), patch.status !== undefined)) ? patch.status : x.status
      }) : x))
    });
  }
}
export function removeTeam(data: AppData, teamId: string): AppData {
  if (stryMutAct_9fa48("46")) {
    {}
  } else {
    stryCov_9fa48("46");
    const personIds = new Set(stryMutAct_9fa48("47") ? data.people.map(p => p.id) : (stryCov_9fa48("47"), data.people.filter(stryMutAct_9fa48("48") ? () => undefined : (stryCov_9fa48("48"), p => stryMutAct_9fa48("51") ? p.teamId !== teamId : stryMutAct_9fa48("50") ? false : stryMutAct_9fa48("49") ? true : (stryCov_9fa48("49", "50", "51"), p.teamId === teamId))).map(stryMutAct_9fa48("52") ? () => undefined : (stryCov_9fa48("52"), p => p.id))));
    const teams = stryMutAct_9fa48("53") ? data.teams : (stryCov_9fa48("53"), data.teams.filter(stryMutAct_9fa48("54") ? () => undefined : (stryCov_9fa48("54"), t => stryMutAct_9fa48("57") ? t.id === teamId : stryMutAct_9fa48("56") ? false : stryMutAct_9fa48("55") ? true : (stryCov_9fa48("55", "56", "57"), t.id !== teamId))));
    const people = stryMutAct_9fa48("58") ? data.people : (stryCov_9fa48("58"), data.people.filter(stryMutAct_9fa48("59") ? () => undefined : (stryCov_9fa48("59"), p => stryMutAct_9fa48("62") ? p.teamId === teamId : stryMutAct_9fa48("61") ? false : stryMutAct_9fa48("60") ? true : (stryCov_9fa48("60", "61", "62"), p.teamId !== teamId))));
    const items = stryMutAct_9fa48("63") ? data.items : (stryCov_9fa48("63"), data.items.filter(stryMutAct_9fa48("64") ? () => undefined : (stryCov_9fa48("64"), it => stryMutAct_9fa48("65") ? personIds.has(it.personId) : (stryCov_9fa48("65"), !personIds.has(it.personId)))));
    const lastTeamId = (stryMutAct_9fa48("68") ? data.lastTeamId !== teamId : stryMutAct_9fa48("67") ? false : stryMutAct_9fa48("66") ? true : (stryCov_9fa48("66", "67", "68"), data.lastTeamId === teamId)) ? stryMutAct_9fa48("69") ? teams[0].id : (stryCov_9fa48("69"), teams[0]?.id) : (stryMutAct_9fa48("72") ? data.lastTeamId || teams.some(t => t.id === data.lastTeamId) : stryMutAct_9fa48("71") ? false : stryMutAct_9fa48("70") ? true : (stryCov_9fa48("70", "71", "72"), data.lastTeamId && (stryMutAct_9fa48("73") ? teams.every(t => t.id === data.lastTeamId) : (stryCov_9fa48("73"), teams.some(stryMutAct_9fa48("74") ? () => undefined : (stryCov_9fa48("74"), t => stryMutAct_9fa48("77") ? t.id !== data.lastTeamId : stryMutAct_9fa48("76") ? false : stryMutAct_9fa48("75") ? true : (stryCov_9fa48("75", "76", "77"), t.id === data.lastTeamId))))))) ? data.lastTeamId : stryMutAct_9fa48("78") ? teams[0].id : (stryCov_9fa48("78"), teams[0]?.id);
    const profile = data.profile ? stryMutAct_9fa48("79") ? {} : (stryCov_9fa48("79"), {
      ...data.profile,
      favoriteTeamIds: stryMutAct_9fa48("80") ? data.profile.favoriteTeamIds : (stryCov_9fa48("80"), data.profile.favoriteTeamIds.filter(stryMutAct_9fa48("81") ? () => undefined : (stryCov_9fa48("81"), id => stryMutAct_9fa48("84") ? id === teamId : stryMutAct_9fa48("83") ? false : stryMutAct_9fa48("82") ? true : (stryCov_9fa48("82", "83", "84"), id !== teamId))))
    }) : stryMutAct_9fa48("85") ? {} : (stryCov_9fa48("85"), {
      displayName: stryMutAct_9fa48("86") ? "" : (stryCov_9fa48("86"), 'Me'),
      favoriteTeamIds: stryMutAct_9fa48("87") ? ["Stryker was here"] : (stryCov_9fa48("87"), [])
    });
    return stryMutAct_9fa48("88") ? {} : (stryCov_9fa48("88"), {
      ...data,
      teams,
      people,
      items,
      profile,
      notifiedReminderIds: stryMutAct_9fa48("89") ? data.notifiedReminderIds : (stryCov_9fa48("89"), data.notifiedReminderIds.filter(nid => {
        if (stryMutAct_9fa48("90")) {
          {}
        } else {
          stryCov_9fa48("90");
          const itemId = reminderNotifyEntryId(nid);
          const it = data.items.find(stryMutAct_9fa48("91") ? () => undefined : (stryCov_9fa48("91"), i => stryMutAct_9fa48("94") ? i.id !== itemId : stryMutAct_9fa48("93") ? false : stryMutAct_9fa48("92") ? true : (stryCov_9fa48("92", "93", "94"), i.id === itemId)));
          return stryMutAct_9fa48("97") ? !it && !personIds.has(it.personId) : stryMutAct_9fa48("96") ? false : stryMutAct_9fa48("95") ? true : (stryCov_9fa48("95", "96", "97"), (stryMutAct_9fa48("98") ? it : (stryCov_9fa48("98"), !it)) || (stryMutAct_9fa48("99") ? personIds.has(it.personId) : (stryCov_9fa48("99"), !personIds.has(it.personId))));
        }
      })),
      lastTeamId
    });
  }
}
export function addPerson(data: AppData, teamId: string, name: string, title?: string): AppData {
  if (stryMutAct_9fa48("100")) {
    {}
  } else {
    stryCov_9fa48("100");
    if (stryMutAct_9fa48("103") ? false : stryMutAct_9fa48("102") ? true : stryMutAct_9fa48("101") ? data.teams.some(t => t.id === teamId) : (stryCov_9fa48("101", "102", "103"), !(stryMutAct_9fa48("104") ? data.teams.every(t => t.id === teamId) : (stryCov_9fa48("104"), data.teams.some(stryMutAct_9fa48("105") ? () => undefined : (stryCov_9fa48("105"), t => stryMutAct_9fa48("108") ? t.id !== teamId : stryMutAct_9fa48("107") ? false : stryMutAct_9fa48("106") ? true : (stryCov_9fa48("106", "107", "108"), t.id === teamId))))))) return data;
    const t = nowIso();
    const p: Person = stryMutAct_9fa48("109") ? {} : (stryCov_9fa48("109"), {
      id: uuid(),
      teamId,
      name: stryMutAct_9fa48("112") ? name.trim() && 'Unnamed' : stryMutAct_9fa48("111") ? false : stryMutAct_9fa48("110") ? true : (stryCov_9fa48("110", "111", "112"), (stryMutAct_9fa48("113") ? name : (stryCov_9fa48("113"), name.trim())) || (stryMutAct_9fa48("114") ? "" : (stryCov_9fa48("114"), 'Unnamed'))),
      title: stryMutAct_9fa48("117") ? title?.trim() && undefined : stryMutAct_9fa48("116") ? false : stryMutAct_9fa48("115") ? true : (stryCov_9fa48("115", "116", "117"), (stryMutAct_9fa48("119") ? title.trim() : stryMutAct_9fa48("118") ? title : (stryCov_9fa48("118", "119"), title?.trim())) || undefined),
      scratchpad: stryMutAct_9fa48("120") ? "Stryker was here!" : (stryCov_9fa48("120"), ''),
      createdAt: t
    });
    return stryMutAct_9fa48("121") ? {} : (stryCov_9fa48("121"), {
      ...data,
      people: stryMutAct_9fa48("122") ? [] : (stryCov_9fa48("122"), [...data.people, p])
    });
  }
}
export function updatePerson(data: AppData, id: string, patch: Partial<Pick<Person, 'name' | 'title' | 'scratchpad' | 'agenda'>>): AppData {
  if (stryMutAct_9fa48("123")) {
    {}
  } else {
    stryCov_9fa48("123");
    return stryMutAct_9fa48("124") ? {} : (stryCov_9fa48("124"), {
      ...data,
      people: data.people.map(p => {
        if (stryMutAct_9fa48("125")) {
          {}
        } else {
          stryCov_9fa48("125");
          if (stryMutAct_9fa48("128") ? p.id === id : stryMutAct_9fa48("127") ? false : stryMutAct_9fa48("126") ? true : (stryCov_9fa48("126", "127", "128"), p.id !== id)) return p;
          if (stryMutAct_9fa48("131") ? isSelfPerson(p) && isLeaderPerson(p) : stryMutAct_9fa48("130") ? false : stryMutAct_9fa48("129") ? true : (stryCov_9fa48("129", "130", "131"), isSelfPerson(p) || isLeaderPerson(p))) {
            if (stryMutAct_9fa48("132")) {
              {}
            } else {
              stryCov_9fa48("132");
              return stryMutAct_9fa48("133") ? {} : (stryCov_9fa48("133"), {
                ...p,
                name: (stryMutAct_9fa48("135") ? patch.name.trim() : stryMutAct_9fa48("134") ? patch.name : (stryCov_9fa48("134", "135"), patch.name?.trim())) ? stryMutAct_9fa48("136") ? patch.name : (stryCov_9fa48("136"), patch.name.trim()) : p.name,
                title: (stryMutAct_9fa48("139") ? patch.title === undefined : stryMutAct_9fa48("138") ? false : stryMutAct_9fa48("137") ? true : (stryCov_9fa48("137", "138", "139"), patch.title !== undefined)) ? stryMutAct_9fa48("142") ? patch.title.trim() && undefined : stryMutAct_9fa48("141") ? false : stryMutAct_9fa48("140") ? true : (stryCov_9fa48("140", "141", "142"), (stryMutAct_9fa48("143") ? patch.title : (stryCov_9fa48("143"), patch.title.trim())) || undefined) : p.title,
                scratchpad: (stryMutAct_9fa48("146") ? patch.scratchpad === undefined : stryMutAct_9fa48("145") ? false : stryMutAct_9fa48("144") ? true : (stryCov_9fa48("144", "145", "146"), patch.scratchpad !== undefined)) ? patch.scratchpad : p.scratchpad,
                agenda: (stryMutAct_9fa48("149") ? patch.agenda === undefined : stryMutAct_9fa48("148") ? false : stryMutAct_9fa48("147") ? true : (stryCov_9fa48("147", "148", "149"), patch.agenda !== undefined)) ? patch.agenda : p.agenda
              });
            }
          }
          return stryMutAct_9fa48("150") ? {} : (stryCov_9fa48("150"), {
            ...p,
            name: (stryMutAct_9fa48("153") ? patch.name === undefined : stryMutAct_9fa48("152") ? false : stryMutAct_9fa48("151") ? true : (stryCov_9fa48("151", "152", "153"), patch.name !== undefined)) ? stryMutAct_9fa48("156") ? patch.name.trim() && p.name : stryMutAct_9fa48("155") ? false : stryMutAct_9fa48("154") ? true : (stryCov_9fa48("154", "155", "156"), (stryMutAct_9fa48("157") ? patch.name : (stryCov_9fa48("157"), patch.name.trim())) || p.name) : p.name,
            title: (stryMutAct_9fa48("160") ? patch.title === undefined : stryMutAct_9fa48("159") ? false : stryMutAct_9fa48("158") ? true : (stryCov_9fa48("158", "159", "160"), patch.title !== undefined)) ? stryMutAct_9fa48("163") ? patch.title.trim() && undefined : stryMutAct_9fa48("162") ? false : stryMutAct_9fa48("161") ? true : (stryCov_9fa48("161", "162", "163"), (stryMutAct_9fa48("164") ? patch.title : (stryCov_9fa48("164"), patch.title.trim())) || undefined) : p.title,
            scratchpad: (stryMutAct_9fa48("167") ? patch.scratchpad === undefined : stryMutAct_9fa48("166") ? false : stryMutAct_9fa48("165") ? true : (stryCov_9fa48("165", "166", "167"), patch.scratchpad !== undefined)) ? patch.scratchpad : p.scratchpad,
            agenda: (stryMutAct_9fa48("170") ? patch.agenda === undefined : stryMutAct_9fa48("169") ? false : stryMutAct_9fa48("168") ? true : (stryCov_9fa48("168", "169", "170"), patch.agenda !== undefined)) ? patch.agenda : p.agenda
          });
        }
      })
    });
  }
}
export function removePerson(data: AppData, id: string): AppData {
  if (stryMutAct_9fa48("171")) {
    {}
  } else {
    stryCov_9fa48("171");
    const p = data.people.find(stryMutAct_9fa48("172") ? () => undefined : (stryCov_9fa48("172"), x => stryMutAct_9fa48("175") ? x.id !== id : stryMutAct_9fa48("174") ? false : stryMutAct_9fa48("173") ? true : (stryCov_9fa48("173", "174", "175"), x.id === id)));
    if (stryMutAct_9fa48("178") ? (!p || isSelfPerson(p)) && isLeaderPerson(p) : stryMutAct_9fa48("177") ? false : stryMutAct_9fa48("176") ? true : (stryCov_9fa48("176", "177", "178"), (stryMutAct_9fa48("180") ? !p && isSelfPerson(p) : stryMutAct_9fa48("179") ? false : (stryCov_9fa48("179", "180"), (stryMutAct_9fa48("181") ? p : (stryCov_9fa48("181"), !p)) || isSelfPerson(p))) || isLeaderPerson(p))) return data;
    return stryMutAct_9fa48("182") ? {} : (stryCov_9fa48("182"), {
      ...data,
      people: stryMutAct_9fa48("183") ? data.people : (stryCov_9fa48("183"), data.people.filter(stryMutAct_9fa48("184") ? () => undefined : (stryCov_9fa48("184"), x => stryMutAct_9fa48("187") ? x.id === id : stryMutAct_9fa48("186") ? false : stryMutAct_9fa48("185") ? true : (stryCov_9fa48("185", "186", "187"), x.id !== id)))),
      items: stryMutAct_9fa48("188") ? data.items : (stryCov_9fa48("188"), data.items.filter(stryMutAct_9fa48("189") ? () => undefined : (stryCov_9fa48("189"), it => stryMutAct_9fa48("192") ? it.personId === id : stryMutAct_9fa48("191") ? false : stryMutAct_9fa48("190") ? true : (stryCov_9fa48("190", "191", "192"), it.personId !== id)))),
      notifiedReminderIds: stryMutAct_9fa48("193") ? data.notifiedReminderIds : (stryCov_9fa48("193"), data.notifiedReminderIds.filter(nid => {
        if (stryMutAct_9fa48("194")) {
          {}
        } else {
          stryCov_9fa48("194");
          const itemId = reminderNotifyEntryId(nid);
          const it = data.items.find(stryMutAct_9fa48("195") ? () => undefined : (stryCov_9fa48("195"), i => stryMutAct_9fa48("198") ? i.id !== itemId : stryMutAct_9fa48("197") ? false : stryMutAct_9fa48("196") ? true : (stryCov_9fa48("196", "197", "198"), i.id === itemId)));
          return stryMutAct_9fa48("201") ? !it && it.personId !== id : stryMutAct_9fa48("200") ? false : stryMutAct_9fa48("199") ? true : (stryCov_9fa48("199", "200", "201"), (stryMutAct_9fa48("202") ? it : (stryCov_9fa48("202"), !it)) || (stryMutAct_9fa48("204") ? it.personId === id : stryMutAct_9fa48("203") ? false : (stryCov_9fa48("203", "204"), it.personId !== id)));
        }
      }))
    });
  }
}
export function setLastTeamId(data: AppData, teamId: string | undefined): AppData {
  if (stryMutAct_9fa48("205")) {
    {}
  } else {
    stryCov_9fa48("205");
    if (stryMutAct_9fa48("208") ? teamId || !data.teams.some(t => t.id === teamId) : stryMutAct_9fa48("207") ? false : stryMutAct_9fa48("206") ? true : (stryCov_9fa48("206", "207", "208"), teamId && (stryMutAct_9fa48("209") ? data.teams.some(t => t.id === teamId) : (stryCov_9fa48("209"), !(stryMutAct_9fa48("210") ? data.teams.every(t => t.id === teamId) : (stryCov_9fa48("210"), data.teams.some(stryMutAct_9fa48("211") ? () => undefined : (stryCov_9fa48("211"), t => stryMutAct_9fa48("214") ? t.id !== teamId : stryMutAct_9fa48("213") ? false : stryMutAct_9fa48("212") ? true : (stryCov_9fa48("212", "213", "214"), t.id === teamId))))))))) return data;
    return stryMutAct_9fa48("215") ? {} : (stryCov_9fa48("215"), {
      ...data,
      lastTeamId: teamId
    });
  }
}
export function addItem(data: AppData, personId: string, kind: ItemKind, fields: Partial<Pick<Item, 'title' | 'body' | 'dueAt' | 'startAt' | 'remindAt' | 'remindRepeat' | 'url' | 'category' | 'goalStatus' | 'feedbackKind'>>): AppData {
  if (stryMutAct_9fa48("216")) {
    {}
  } else {
    stryCov_9fa48("216");
    if (stryMutAct_9fa48("219") ? false : stryMutAct_9fa48("218") ? true : stryMutAct_9fa48("217") ? data.people.some(p => p.id === personId) : (stryCov_9fa48("217", "218", "219"), !(stryMutAct_9fa48("220") ? data.people.every(p => p.id === personId) : (stryCov_9fa48("220"), data.people.some(stryMutAct_9fa48("221") ? () => undefined : (stryCov_9fa48("221"), p => stryMutAct_9fa48("224") ? p.id !== personId : stryMutAct_9fa48("223") ? false : stryMutAct_9fa48("222") ? true : (stryCov_9fa48("222", "223", "224"), p.id === personId))))))) return data;
    const t = nowIso();
    const allowedGoal: GoalStatus[] = stryMutAct_9fa48("225") ? [] : (stryCov_9fa48("225"), [stryMutAct_9fa48("226") ? "" : (stryCov_9fa48("226"), 'planned'), stryMutAct_9fa48("227") ? "" : (stryCov_9fa48("227"), 'active'), stryMutAct_9fa48("228") ? "" : (stryCov_9fa48("228"), 'completed'), stryMutAct_9fa48("229") ? "" : (stryCov_9fa48("229"), 'cancelled')]);
    const goalStatus: GoalStatus | undefined = (stryMutAct_9fa48("232") ? kind !== 'goal' : stryMutAct_9fa48("231") ? false : stryMutAct_9fa48("230") ? true : (stryCov_9fa48("230", "231", "232"), kind === (stryMutAct_9fa48("233") ? "" : (stryCov_9fa48("233"), 'goal')))) ? (stryMutAct_9fa48("236") ? fields.goalStatus || allowedGoal.includes(fields.goalStatus) : stryMutAct_9fa48("235") ? false : stryMutAct_9fa48("234") ? true : (stryCov_9fa48("234", "235", "236"), fields.goalStatus && allowedGoal.includes(fields.goalStatus))) ? fields.goalStatus : stryMutAct_9fa48("237") ? "" : (stryCov_9fa48("237"), 'planned') : undefined;
    const allowedFeedback: FeedbackKind[] = stryMutAct_9fa48("238") ? [] : (stryCov_9fa48("238"), [stryMutAct_9fa48("239") ? "" : (stryCov_9fa48("239"), 'praise'), stryMutAct_9fa48("240") ? "" : (stryCov_9fa48("240"), 'coaching'), stryMutAct_9fa48("241") ? "" : (stryCov_9fa48("241"), 'concern')]);
    const feedbackKind: FeedbackKind | undefined = (stryMutAct_9fa48("244") ? kind !== 'feedback' : stryMutAct_9fa48("243") ? false : stryMutAct_9fa48("242") ? true : (stryCov_9fa48("242", "243", "244"), kind === (stryMutAct_9fa48("245") ? "" : (stryCov_9fa48("245"), 'feedback')))) ? (stryMutAct_9fa48("248") ? fields.feedbackKind || allowedFeedback.includes(fields.feedbackKind) : stryMutAct_9fa48("247") ? false : stryMutAct_9fa48("246") ? true : (stryCov_9fa48("246", "247", "248"), fields.feedbackKind && allowedFeedback.includes(fields.feedbackKind))) ? fields.feedbackKind : stryMutAct_9fa48("249") ? "" : (stryCov_9fa48("249"), 'coaching') : undefined;
    const allowedRepeat: ReminderRepeat[] = stryMutAct_9fa48("250") ? [] : (stryCov_9fa48("250"), [stryMutAct_9fa48("251") ? "" : (stryCov_9fa48("251"), 'daily'), stryMutAct_9fa48("252") ? "" : (stryCov_9fa48("252"), 'weekly'), stryMutAct_9fa48("253") ? "" : (stryCov_9fa48("253"), 'monthly')]);
    const remindRepeat: ReminderRepeat | undefined = (stryMutAct_9fa48("256") ? fields.remindAt && fields.remindRepeat || allowedRepeat.includes(fields.remindRepeat) : stryMutAct_9fa48("255") ? false : stryMutAct_9fa48("254") ? true : (stryCov_9fa48("254", "255", "256"), (stryMutAct_9fa48("258") ? fields.remindAt || fields.remindRepeat : stryMutAct_9fa48("257") ? true : (stryCov_9fa48("257", "258"), fields.remindAt && fields.remindRepeat)) && allowedRepeat.includes(fields.remindRepeat))) ? fields.remindRepeat : undefined;
    const item: Item = stryMutAct_9fa48("259") ? {} : (stryCov_9fa48("259"), {
      id: uuid(),
      personId,
      kind,
      title: stryMutAct_9fa48("262") ? fields.title?.trim() && defaultTitle(kind) : stryMutAct_9fa48("261") ? false : stryMutAct_9fa48("260") ? true : (stryCov_9fa48("260", "261", "262"), (stryMutAct_9fa48("264") ? fields.title.trim() : stryMutAct_9fa48("263") ? fields.title : (stryCov_9fa48("263", "264"), fields.title?.trim())) || defaultTitle(kind)),
      body: stryMutAct_9fa48("267") ? fields.body?.trim() && '' : stryMutAct_9fa48("266") ? false : stryMutAct_9fa48("265") ? true : (stryCov_9fa48("265", "266", "267"), (stryMutAct_9fa48("269") ? fields.body.trim() : stryMutAct_9fa48("268") ? fields.body : (stryCov_9fa48("268", "269"), fields.body?.trim())) || (stryMutAct_9fa48("270") ? "Stryker was here!" : (stryCov_9fa48("270"), ''))),
      category: stryMutAct_9fa48("273") ? fields.category?.trim() && undefined : stryMutAct_9fa48("272") ? false : stryMutAct_9fa48("271") ? true : (stryCov_9fa48("271", "272", "273"), (stryMutAct_9fa48("275") ? fields.category.trim() : stryMutAct_9fa48("274") ? fields.category : (stryCov_9fa48("274", "275"), fields.category?.trim())) || undefined),
      dueAt: stryMutAct_9fa48("278") ? fields.dueAt && undefined : stryMutAct_9fa48("277") ? false : stryMutAct_9fa48("276") ? true : (stryCov_9fa48("276", "277", "278"), fields.dueAt || undefined),
      startAt: (stryMutAct_9fa48("281") ? kind === 'goal' || fields.startAt : stryMutAct_9fa48("280") ? false : stryMutAct_9fa48("279") ? true : (stryCov_9fa48("279", "280", "281"), (stryMutAct_9fa48("283") ? kind !== 'goal' : stryMutAct_9fa48("282") ? true : (stryCov_9fa48("282", "283"), kind === (stryMutAct_9fa48("284") ? "" : (stryCov_9fa48("284"), 'goal')))) && fields.startAt)) ? fields.startAt : undefined,
      goalStatus,
      feedbackKind,
      remindAt: stryMutAct_9fa48("287") ? fields.remindAt && undefined : stryMutAct_9fa48("286") ? false : stryMutAct_9fa48("285") ? true : (stryCov_9fa48("285", "286", "287"), fields.remindAt || undefined),
      remindRepeat,
      url: (stryMutAct_9fa48("290") ? kind !== 'document' : stryMutAct_9fa48("289") ? false : stryMutAct_9fa48("288") ? true : (stryCov_9fa48("288", "289", "290"), kind === (stryMutAct_9fa48("291") ? "" : (stryCov_9fa48("291"), 'document')))) ? stryMutAct_9fa48("294") ? fields.url?.trim() && undefined : stryMutAct_9fa48("293") ? false : stryMutAct_9fa48("292") ? true : (stryCov_9fa48("292", "293", "294"), (stryMutAct_9fa48("296") ? fields.url.trim() : stryMutAct_9fa48("295") ? fields.url : (stryCov_9fa48("295", "296"), fields.url?.trim())) || undefined) : undefined,
      done: (stryMutAct_9fa48("299") ? kind !== 'goal' : stryMutAct_9fa48("298") ? false : stryMutAct_9fa48("297") ? true : (stryCov_9fa48("297", "298", "299"), kind === (stryMutAct_9fa48("300") ? "" : (stryCov_9fa48("300"), 'goal')))) ? stryMutAct_9fa48("303") ? goalStatus !== 'completed' : stryMutAct_9fa48("302") ? false : stryMutAct_9fa48("301") ? true : (stryCov_9fa48("301", "302", "303"), goalStatus === (stryMutAct_9fa48("304") ? "" : (stryCov_9fa48("304"), 'completed'))) : stryMutAct_9fa48("305") ? true : (stryCov_9fa48("305"), false),
      createdAt: t,
      updatedAt: t
    });
    return stryMutAct_9fa48("306") ? {} : (stryCov_9fa48("306"), {
      ...data,
      items: stryMutAct_9fa48("307") ? [] : (stryCov_9fa48("307"), [item, ...data.items]),
      notifiedReminderIds: stryMutAct_9fa48("308") ? data.notifiedReminderIds : (stryCov_9fa48("308"), data.notifiedReminderIds.filter(stryMutAct_9fa48("309") ? () => undefined : (stryCov_9fa48("309"), x => stryMutAct_9fa48("312") ? x === item.id : stryMutAct_9fa48("311") ? false : stryMutAct_9fa48("310") ? true : (stryCov_9fa48("310", "311", "312"), x !== item.id))))
    });
  }
}
function defaultTitle(kind: ItemKind): string {
  if (stryMutAct_9fa48("313")) {
    {}
  } else {
    stryCov_9fa48("313");
    switch (kind) {
      case stryMutAct_9fa48("315") ? "" : (stryCov_9fa48("315"), 'task'):
        if (stryMutAct_9fa48("314")) {} else {
          stryCov_9fa48("314");
          return stryMutAct_9fa48("316") ? "" : (stryCov_9fa48("316"), 'New task');
        }
      case stryMutAct_9fa48("318") ? "" : (stryCov_9fa48("318"), 'note'):
        if (stryMutAct_9fa48("317")) {} else {
          stryCov_9fa48("317");
          return stryMutAct_9fa48("319") ? "" : (stryCov_9fa48("319"), 'New note');
        }
      case stryMutAct_9fa48("321") ? "" : (stryCov_9fa48("321"), 'goal'):
        if (stryMutAct_9fa48("320")) {} else {
          stryCov_9fa48("320");
          return stryMutAct_9fa48("322") ? "" : (stryCov_9fa48("322"), 'New goal');
        }
      case stryMutAct_9fa48("324") ? "" : (stryCov_9fa48("324"), 'document'):
        if (stryMutAct_9fa48("323")) {} else {
          stryCov_9fa48("323");
          return stryMutAct_9fa48("325") ? "" : (stryCov_9fa48("325"), 'New document');
        }
      case stryMutAct_9fa48("327") ? "" : (stryCov_9fa48("327"), 'feedback'):
        if (stryMutAct_9fa48("326")) {} else {
          stryCov_9fa48("326");
          return stryMutAct_9fa48("328") ? "" : (stryCov_9fa48("328"), 'New feedback');
        }
      default:
        if (stryMutAct_9fa48("329")) {} else {
          stryCov_9fa48("329");
          return stryMutAct_9fa48("330") ? "" : (stryCov_9fa48("330"), 'New item');
        }
    }
  }
}
export function updateItem(data: AppData, id: string, patch: Partial<Pick<Item, 'title' | 'body' | 'dueAt' | 'startAt' | 'remindAt' | 'remindRepeat' | 'url' | 'done' | 'category' | 'goalStatus' | 'feedbackKind'>>): AppData {
  if (stryMutAct_9fa48("331")) {
    {}
  } else {
    stryCov_9fa48("331");
    let clearedNotify = stryMutAct_9fa48("332") ? true : (stryCov_9fa48("332"), false);
    const items = data.items.map(it => {
      if (stryMutAct_9fa48("333")) {
        {}
      } else {
        stryCov_9fa48("333");
        if (stryMutAct_9fa48("336") ? it.id === id : stryMutAct_9fa48("335") ? false : stryMutAct_9fa48("334") ? true : (stryCov_9fa48("334", "335", "336"), it.id !== id)) return it;
        if (stryMutAct_9fa48("339") ? 'remindAt' in patch && patch.remindAt !== it.remindAt && 'remindRepeat' in patch && patch.remindRepeat !== it.remindRepeat : stryMutAct_9fa48("338") ? false : stryMutAct_9fa48("337") ? true : (stryCov_9fa48("337", "338", "339"), (stryMutAct_9fa48("341") ? 'remindAt' in patch || patch.remindAt !== it.remindAt : stryMutAct_9fa48("340") ? false : (stryCov_9fa48("340", "341"), (stryMutAct_9fa48("342") ? "" : (stryCov_9fa48("342"), 'remindAt')) in patch && (stryMutAct_9fa48("344") ? patch.remindAt === it.remindAt : stryMutAct_9fa48("343") ? true : (stryCov_9fa48("343", "344"), patch.remindAt !== it.remindAt)))) || (stryMutAct_9fa48("346") ? 'remindRepeat' in patch || patch.remindRepeat !== it.remindRepeat : stryMutAct_9fa48("345") ? false : (stryCov_9fa48("345", "346"), (stryMutAct_9fa48("347") ? "" : (stryCov_9fa48("347"), 'remindRepeat')) in patch && (stryMutAct_9fa48("349") ? patch.remindRepeat === it.remindRepeat : stryMutAct_9fa48("348") ? true : (stryCov_9fa48("348", "349"), patch.remindRepeat !== it.remindRepeat)))))) {
          if (stryMutAct_9fa48("350")) {
            {}
          } else {
            stryCov_9fa48("350");
            clearedNotify = stryMutAct_9fa48("351") ? false : (stryCov_9fa48("351"), true);
          }
        }
        const title = (stryMutAct_9fa48("354") ? patch.title === undefined : stryMutAct_9fa48("353") ? false : stryMutAct_9fa48("352") ? true : (stryCov_9fa48("352", "353", "354"), patch.title !== undefined)) ? stryMutAct_9fa48("357") ? patch.title.trim() && it.title : stryMutAct_9fa48("356") ? false : stryMutAct_9fa48("355") ? true : (stryCov_9fa48("355", "356", "357"), (stryMutAct_9fa48("358") ? patch.title : (stryCov_9fa48("358"), patch.title.trim())) || it.title) : it.title;
        const body = (stryMutAct_9fa48("361") ? patch.body === undefined : stryMutAct_9fa48("360") ? false : stryMutAct_9fa48("359") ? true : (stryCov_9fa48("359", "360", "361"), patch.body !== undefined)) ? patch.body : it.body;
        const dueAt = (stryMutAct_9fa48("364") ? patch.dueAt === undefined : stryMutAct_9fa48("363") ? false : stryMutAct_9fa48("362") ? true : (stryCov_9fa48("362", "363", "364"), patch.dueAt !== undefined)) ? stryMutAct_9fa48("367") ? patch.dueAt && undefined : stryMutAct_9fa48("366") ? false : stryMutAct_9fa48("365") ? true : (stryCov_9fa48("365", "366", "367"), patch.dueAt || undefined) : it.dueAt;
        const startAt = (stryMutAct_9fa48("370") ? it.kind !== 'goal' : stryMutAct_9fa48("369") ? false : stryMutAct_9fa48("368") ? true : (stryCov_9fa48("368", "369", "370"), it.kind === (stryMutAct_9fa48("371") ? "" : (stryCov_9fa48("371"), 'goal')))) ? (stryMutAct_9fa48("374") ? patch.startAt === undefined : stryMutAct_9fa48("373") ? false : stryMutAct_9fa48("372") ? true : (stryCov_9fa48("372", "373", "374"), patch.startAt !== undefined)) ? stryMutAct_9fa48("377") ? patch.startAt && undefined : stryMutAct_9fa48("376") ? false : stryMutAct_9fa48("375") ? true : (stryCov_9fa48("375", "376", "377"), patch.startAt || undefined) : it.startAt : undefined;
        const remindAt = (stryMutAct_9fa48("380") ? patch.remindAt === undefined : stryMutAct_9fa48("379") ? false : stryMutAct_9fa48("378") ? true : (stryCov_9fa48("378", "379", "380"), patch.remindAt !== undefined)) ? stryMutAct_9fa48("383") ? patch.remindAt && undefined : stryMutAct_9fa48("382") ? false : stryMutAct_9fa48("381") ? true : (stryCov_9fa48("381", "382", "383"), patch.remindAt || undefined) : it.remindAt;
        const remindRepeat = (stryMutAct_9fa48("386") ? patch.remindRepeat === undefined : stryMutAct_9fa48("385") ? false : stryMutAct_9fa48("384") ? true : (stryCov_9fa48("384", "385", "386"), patch.remindRepeat !== undefined)) ? stryMutAct_9fa48("389") ? patch.remindRepeat && undefined : stryMutAct_9fa48("388") ? false : stryMutAct_9fa48("387") ? true : (stryCov_9fa48("387", "388", "389"), patch.remindRepeat || undefined) : it.remindRepeat;
        const url = (stryMutAct_9fa48("392") ? patch.url === undefined : stryMutAct_9fa48("391") ? false : stryMutAct_9fa48("390") ? true : (stryCov_9fa48("390", "391", "392"), patch.url !== undefined)) ? stryMutAct_9fa48("395") ? patch.url && undefined : stryMutAct_9fa48("394") ? false : stryMutAct_9fa48("393") ? true : (stryCov_9fa48("393", "394", "395"), patch.url || undefined) : it.url;
        const category = (stryMutAct_9fa48("398") ? patch.category === undefined : stryMutAct_9fa48("397") ? false : stryMutAct_9fa48("396") ? true : (stryCov_9fa48("396", "397", "398"), patch.category !== undefined)) ? stryMutAct_9fa48("401") ? patch.category?.trim() && undefined : stryMutAct_9fa48("400") ? false : stryMutAct_9fa48("399") ? true : (stryCov_9fa48("399", "400", "401"), (stryMutAct_9fa48("403") ? patch.category.trim() : stryMutAct_9fa48("402") ? patch.category : (stryCov_9fa48("402", "403"), patch.category?.trim())) || undefined) : it.category;
        const feedbackKind = (stryMutAct_9fa48("406") ? it.kind !== 'feedback' : stryMutAct_9fa48("405") ? false : stryMutAct_9fa48("404") ? true : (stryCov_9fa48("404", "405", "406"), it.kind === (stryMutAct_9fa48("407") ? "" : (stryCov_9fa48("407"), 'feedback')))) ? (stryMutAct_9fa48("410") ? patch.feedbackKind === undefined : stryMutAct_9fa48("409") ? false : stryMutAct_9fa48("408") ? true : (stryCov_9fa48("408", "409", "410"), patch.feedbackKind !== undefined)) ? patch.feedbackKind : stryMutAct_9fa48("411") ? it.feedbackKind && 'coaching' : (stryCov_9fa48("411"), it.feedbackKind ?? (stryMutAct_9fa48("412") ? "" : (stryCov_9fa48("412"), 'coaching'))) : undefined;
        let done = it.done;
        let doneAt = it.doneAt;
        let goalStatus = (stryMutAct_9fa48("415") ? it.kind !== 'goal' : stryMutAct_9fa48("414") ? false : stryMutAct_9fa48("413") ? true : (stryCov_9fa48("413", "414", "415"), it.kind === (stryMutAct_9fa48("416") ? "" : (stryCov_9fa48("416"), 'goal')))) ? it.goalStatus : undefined;
        if (stryMutAct_9fa48("419") ? it.kind !== 'goal' : stryMutAct_9fa48("418") ? false : stryMutAct_9fa48("417") ? true : (stryCov_9fa48("417", "418", "419"), it.kind === (stryMutAct_9fa48("420") ? "" : (stryCov_9fa48("420"), 'goal')))) {
          if (stryMutAct_9fa48("421")) {
            {}
          } else {
            stryCov_9fa48("421");
            if (stryMutAct_9fa48("424") ? patch.goalStatus === undefined : stryMutAct_9fa48("423") ? false : stryMutAct_9fa48("422") ? true : (stryCov_9fa48("422", "423", "424"), patch.goalStatus !== undefined)) {
              if (stryMutAct_9fa48("425")) {
                {}
              } else {
                stryCov_9fa48("425");
                goalStatus = patch.goalStatus;
                done = stryMutAct_9fa48("428") ? patch.goalStatus !== 'completed' : stryMutAct_9fa48("427") ? false : stryMutAct_9fa48("426") ? true : (stryCov_9fa48("426", "427", "428"), patch.goalStatus === (stryMutAct_9fa48("429") ? "" : (stryCov_9fa48("429"), 'completed')));
                doneAt = done ? stryMutAct_9fa48("430") ? it.doneAt && nowIso() : (stryCov_9fa48("430"), it.doneAt ?? nowIso()) : undefined;
              }
            } else if (stryMutAct_9fa48("433") ? patch.done === undefined : stryMutAct_9fa48("432") ? false : stryMutAct_9fa48("431") ? true : (stryCov_9fa48("431", "432", "433"), patch.done !== undefined)) {
              if (stryMutAct_9fa48("434")) {
                {}
              } else {
                stryCov_9fa48("434");
                done = patch.done;
                goalStatus = done ? stryMutAct_9fa48("435") ? "" : (stryCov_9fa48("435"), 'completed') : stryMutAct_9fa48("436") ? "" : (stryCov_9fa48("436"), 'active');
                doneAt = done ? stryMutAct_9fa48("437") ? it.doneAt && nowIso() : (stryCov_9fa48("437"), it.doneAt ?? nowIso()) : undefined;
              }
            }
          }
        } else if (stryMutAct_9fa48("440") ? patch.done === true || !it.done : stryMutAct_9fa48("439") ? false : stryMutAct_9fa48("438") ? true : (stryCov_9fa48("438", "439", "440"), (stryMutAct_9fa48("442") ? patch.done !== true : stryMutAct_9fa48("441") ? true : (stryCov_9fa48("441", "442"), patch.done === (stryMutAct_9fa48("443") ? false : (stryCov_9fa48("443"), true)))) && (stryMutAct_9fa48("444") ? it.done : (stryCov_9fa48("444"), !it.done)))) {
          if (stryMutAct_9fa48("445")) {
            {}
          } else {
            stryCov_9fa48("445");
            done = stryMutAct_9fa48("446") ? false : (stryCov_9fa48("446"), true);
            doneAt = nowIso();
          }
        } else if (stryMutAct_9fa48("449") ? patch.done !== false : stryMutAct_9fa48("448") ? false : stryMutAct_9fa48("447") ? true : (stryCov_9fa48("447", "448", "449"), patch.done === (stryMutAct_9fa48("450") ? true : (stryCov_9fa48("450"), false)))) {
          if (stryMutAct_9fa48("451")) {
            {}
          } else {
            stryCov_9fa48("451");
            done = stryMutAct_9fa48("452") ? true : (stryCov_9fa48("452"), false);
            doneAt = undefined;
          }
        }
        return stryMutAct_9fa48("453") ? {} : (stryCov_9fa48("453"), {
          ...it,
          title,
          body,
          dueAt,
          startAt,
          remindAt,
          remindRepeat: remindAt ? remindRepeat : undefined,
          url,
          category,
          goalStatus: (stryMutAct_9fa48("456") ? it.kind !== 'goal' : stryMutAct_9fa48("455") ? false : stryMutAct_9fa48("454") ? true : (stryCov_9fa48("454", "455", "456"), it.kind === (stryMutAct_9fa48("457") ? "" : (stryCov_9fa48("457"), 'goal')))) ? goalStatus : undefined,
          feedbackKind,
          done,
          doneAt,
          updatedAt: nowIso()
        });
      }
    });
    let notified = clearedNotify ? clearReminderNotifyKeys(data.notifiedReminderIds, id) : data.notifiedReminderIds;
    const markedDoneId = stryMutAct_9fa48("458") ? data.items.find(it => it.id === id && patch.done === true && !it.done).id : (stryCov_9fa48("458"), data.items.find(stryMutAct_9fa48("459") ? () => undefined : (stryCov_9fa48("459"), it => stryMutAct_9fa48("462") ? it.id === id && patch.done === true || !it.done : stryMutAct_9fa48("461") ? false : stryMutAct_9fa48("460") ? true : (stryCov_9fa48("460", "461", "462"), (stryMutAct_9fa48("464") ? it.id === id || patch.done === true : stryMutAct_9fa48("463") ? true : (stryCov_9fa48("463", "464"), (stryMutAct_9fa48("466") ? it.id !== id : stryMutAct_9fa48("465") ? true : (stryCov_9fa48("465", "466"), it.id === id)) && (stryMutAct_9fa48("468") ? patch.done !== true : stryMutAct_9fa48("467") ? true : (stryCov_9fa48("467", "468"), patch.done === (stryMutAct_9fa48("469") ? false : (stryCov_9fa48("469"), true)))))) && (stryMutAct_9fa48("470") ? it.done : (stryCov_9fa48("470"), !it.done)))))?.id);
    if (stryMutAct_9fa48("472") ? false : stryMutAct_9fa48("471") ? true : (stryCov_9fa48("471", "472"), markedDoneId)) notified = stryMutAct_9fa48("473") ? notified : (stryCov_9fa48("473"), notified.filter(stryMutAct_9fa48("474") ? () => undefined : (stryCov_9fa48("474"), x => stryMutAct_9fa48("477") ? x === markedDoneId : stryMutAct_9fa48("476") ? false : stryMutAct_9fa48("475") ? true : (stryCov_9fa48("475", "476", "477"), x !== markedDoneId))));
    return stryMutAct_9fa48("478") ? {} : (stryCov_9fa48("478"), {
      ...data,
      items,
      notifiedReminderIds: notified
    });
  }
}
export function toggleItemDone(data: AppData, id: string): AppData {
  if (stryMutAct_9fa48("479")) {
    {}
  } else {
    stryCov_9fa48("479");
    const it = data.items.find(stryMutAct_9fa48("480") ? () => undefined : (stryCov_9fa48("480"), i => stryMutAct_9fa48("483") ? i.id !== id : stryMutAct_9fa48("482") ? false : stryMutAct_9fa48("481") ? true : (stryCov_9fa48("481", "482", "483"), i.id === id)));
    if (stryMutAct_9fa48("486") ? !it && it.kind !== 'task' && it.kind !== 'goal' : stryMutAct_9fa48("485") ? false : stryMutAct_9fa48("484") ? true : (stryCov_9fa48("484", "485", "486"), (stryMutAct_9fa48("487") ? it : (stryCov_9fa48("487"), !it)) || (stryMutAct_9fa48("489") ? it.kind !== 'task' || it.kind !== 'goal' : stryMutAct_9fa48("488") ? false : (stryCov_9fa48("488", "489"), (stryMutAct_9fa48("491") ? it.kind === 'task' : stryMutAct_9fa48("490") ? true : (stryCov_9fa48("490", "491"), it.kind !== (stryMutAct_9fa48("492") ? "" : (stryCov_9fa48("492"), 'task')))) && (stryMutAct_9fa48("494") ? it.kind === 'goal' : stryMutAct_9fa48("493") ? true : (stryCov_9fa48("493", "494"), it.kind !== (stryMutAct_9fa48("495") ? "" : (stryCov_9fa48("495"), 'goal')))))))) return data;
    if (stryMutAct_9fa48("498") ? it.kind !== 'goal' : stryMutAct_9fa48("497") ? false : stryMutAct_9fa48("496") ? true : (stryCov_9fa48("496", "497", "498"), it.kind === (stryMutAct_9fa48("499") ? "" : (stryCov_9fa48("499"), 'goal')))) {
      if (stryMutAct_9fa48("500")) {
        {}
      } else {
        stryCov_9fa48("500");
        const nextDone = stryMutAct_9fa48("501") ? it.done : (stryCov_9fa48("501"), !it.done);
        return updateItem(data, id, stryMutAct_9fa48("502") ? {} : (stryCov_9fa48("502"), {
          done: nextDone,
          goalStatus: nextDone ? stryMutAct_9fa48("503") ? "" : (stryCov_9fa48("503"), 'completed') : stryMutAct_9fa48("504") ? "" : (stryCov_9fa48("504"), 'active')
        }));
      }
    }
    return updateItem(data, id, stryMutAct_9fa48("505") ? {} : (stryCov_9fa48("505"), {
      done: stryMutAct_9fa48("506") ? it.done : (stryCov_9fa48("506"), !it.done)
    }));
  }
}
export function removeItem(data: AppData, id: string): AppData {
  if (stryMutAct_9fa48("507")) {
    {}
  } else {
    stryCov_9fa48("507");
    return stryMutAct_9fa48("508") ? {} : (stryCov_9fa48("508"), {
      ...data,
      items: stryMutAct_9fa48("509") ? data.items : (stryCov_9fa48("509"), data.items.filter(stryMutAct_9fa48("510") ? () => undefined : (stryCov_9fa48("510"), i => stryMutAct_9fa48("513") ? i.id === id : stryMutAct_9fa48("512") ? false : stryMutAct_9fa48("511") ? true : (stryCov_9fa48("511", "512", "513"), i.id !== id)))),
      notifiedReminderIds: clearReminderNotifyKeys(data.notifiedReminderIds, id)
    });
  }
}
export function updateUserProfile(data: AppData, patch: Partial<Pick<UserProfile, 'displayName' | 'jobTitle' | 'department' | 'phone' | 'bio' | 'avatarDataUrl'>>): AppData {
  if (stryMutAct_9fa48("514")) {
    {}
  } else {
    stryCov_9fa48("514");
    const p = stryMutAct_9fa48("515") ? data.profile && {
      displayName: 'Me',
      favoriteTeamIds: []
    } : (stryCov_9fa48("515"), data.profile ?? (stryMutAct_9fa48("516") ? {} : (stryCov_9fa48("516"), {
      displayName: stryMutAct_9fa48("517") ? "" : (stryCov_9fa48("517"), 'Me'),
      favoriteTeamIds: stryMutAct_9fa48("518") ? ["Stryker was here"] : (stryCov_9fa48("518"), [])
    })));
    const avatar = (stryMutAct_9fa48("521") ? patch.avatarDataUrl === undefined : stryMutAct_9fa48("520") ? false : stryMutAct_9fa48("519") ? true : (stryCov_9fa48("519", "520", "521"), patch.avatarDataUrl !== undefined)) ? (stryMutAct_9fa48("524") ? patch.avatarDataUrl || patch.avatarDataUrl.startsWith('data:') : stryMutAct_9fa48("523") ? false : stryMutAct_9fa48("522") ? true : (stryCov_9fa48("522", "523", "524"), patch.avatarDataUrl && (stryMutAct_9fa48("525") ? patch.avatarDataUrl.endsWith('data:') : (stryCov_9fa48("525"), patch.avatarDataUrl.startsWith(stryMutAct_9fa48("526") ? "" : (stryCov_9fa48("526"), 'data:')))))) ? patch.avatarDataUrl : undefined : p.avatarDataUrl;
    return stryMutAct_9fa48("527") ? {} : (stryCov_9fa48("527"), {
      ...data,
      profile: stryMutAct_9fa48("528") ? {} : (stryCov_9fa48("528"), {
        ...p,
        displayName: (stryMutAct_9fa48("531") ? patch.displayName === undefined : stryMutAct_9fa48("530") ? false : stryMutAct_9fa48("529") ? true : (stryCov_9fa48("529", "530", "531"), patch.displayName !== undefined)) ? (stryMutAct_9fa48("532") ? patch.displayName : (stryCov_9fa48("532"), patch.displayName.trim())) ? stryMutAct_9fa48("533") ? patch.displayName : (stryCov_9fa48("533"), patch.displayName.trim()) : p.displayName : p.displayName,
        jobTitle: (stryMutAct_9fa48("536") ? patch.jobTitle === undefined : stryMutAct_9fa48("535") ? false : stryMutAct_9fa48("534") ? true : (stryCov_9fa48("534", "535", "536"), patch.jobTitle !== undefined)) ? stryMutAct_9fa48("539") ? patch.jobTitle.trim() && undefined : stryMutAct_9fa48("538") ? false : stryMutAct_9fa48("537") ? true : (stryCov_9fa48("537", "538", "539"), (stryMutAct_9fa48("540") ? patch.jobTitle : (stryCov_9fa48("540"), patch.jobTitle.trim())) || undefined) : p.jobTitle,
        department: (stryMutAct_9fa48("543") ? patch.department === undefined : stryMutAct_9fa48("542") ? false : stryMutAct_9fa48("541") ? true : (stryCov_9fa48("541", "542", "543"), patch.department !== undefined)) ? stryMutAct_9fa48("546") ? patch.department.trim() && undefined : stryMutAct_9fa48("545") ? false : stryMutAct_9fa48("544") ? true : (stryCov_9fa48("544", "545", "546"), (stryMutAct_9fa48("547") ? patch.department : (stryCov_9fa48("547"), patch.department.trim())) || undefined) : p.department,
        phone: (stryMutAct_9fa48("550") ? patch.phone === undefined : stryMutAct_9fa48("549") ? false : stryMutAct_9fa48("548") ? true : (stryCov_9fa48("548", "549", "550"), patch.phone !== undefined)) ? stryMutAct_9fa48("553") ? patch.phone.trim() && undefined : stryMutAct_9fa48("552") ? false : stryMutAct_9fa48("551") ? true : (stryCov_9fa48("551", "552", "553"), (stryMutAct_9fa48("554") ? patch.phone : (stryCov_9fa48("554"), patch.phone.trim())) || undefined) : p.phone,
        bio: (stryMutAct_9fa48("557") ? patch.bio === undefined : stryMutAct_9fa48("556") ? false : stryMutAct_9fa48("555") ? true : (stryCov_9fa48("555", "556", "557"), patch.bio !== undefined)) ? stryMutAct_9fa48("560") ? patch.bio.trim() && undefined : stryMutAct_9fa48("559") ? false : stryMutAct_9fa48("558") ? true : (stryCov_9fa48("558", "559", "560"), (stryMutAct_9fa48("561") ? patch.bio : (stryCov_9fa48("561"), patch.bio.trim())) || undefined) : p.bio,
        avatarDataUrl: avatar
      })
    });
  }
}
export function updateAISettings(data: AppData, patch: Partial<AISettings>): AppData {
  if (stryMutAct_9fa48("562")) {
    {}
  } else {
    stryCov_9fa48("562");
    const current: AISettings = stryMutAct_9fa48("563") ? data.aiSettings && {} : (stryCov_9fa48("563"), data.aiSettings ?? {});
    const next: AISettings = stryMutAct_9fa48("564") ? {} : (stryCov_9fa48("564"), {
      provider: (stryMutAct_9fa48("567") ? patch.provider === undefined : stryMutAct_9fa48("566") ? false : stryMutAct_9fa48("565") ? true : (stryCov_9fa48("565", "566", "567"), patch.provider !== undefined)) ? stryMutAct_9fa48("570") ? patch.provider && undefined : stryMutAct_9fa48("569") ? false : stryMutAct_9fa48("568") ? true : (stryCov_9fa48("568", "569", "570"), patch.provider || undefined) : current.provider,
      apiKey: (stryMutAct_9fa48("573") ? patch.apiKey === undefined : stryMutAct_9fa48("572") ? false : stryMutAct_9fa48("571") ? true : (stryCov_9fa48("571", "572", "573"), patch.apiKey !== undefined)) ? (stryMutAct_9fa48("574") ? patch.apiKey : (stryCov_9fa48("574"), patch.apiKey.trim())) ? stryMutAct_9fa48("575") ? patch.apiKey : (stryCov_9fa48("575"), patch.apiKey.trim()) : undefined : current.apiKey,
      model: (stryMutAct_9fa48("578") ? patch.model === undefined : stryMutAct_9fa48("577") ? false : stryMutAct_9fa48("576") ? true : (stryCov_9fa48("576", "577", "578"), patch.model !== undefined)) ? (stryMutAct_9fa48("579") ? patch.model : (stryCov_9fa48("579"), patch.model.trim())) ? stryMutAct_9fa48("580") ? patch.model : (stryCov_9fa48("580"), patch.model.trim()) : undefined : current.model,
      systemPrompt: (stryMutAct_9fa48("583") ? patch.systemPrompt === undefined : stryMutAct_9fa48("582") ? false : stryMutAct_9fa48("581") ? true : (stryCov_9fa48("581", "582", "583"), patch.systemPrompt !== undefined)) ? (stryMutAct_9fa48("584") ? patch.systemPrompt : (stryCov_9fa48("584"), patch.systemPrompt.trim())) ? patch.systemPrompt : undefined : current.systemPrompt
    });
    const isEmpty = stryMutAct_9fa48("587") ? !next.provider && !next.apiKey && !next.model || !next.systemPrompt : stryMutAct_9fa48("586") ? false : stryMutAct_9fa48("585") ? true : (stryCov_9fa48("585", "586", "587"), (stryMutAct_9fa48("589") ? !next.provider && !next.apiKey || !next.model : stryMutAct_9fa48("588") ? true : (stryCov_9fa48("588", "589"), (stryMutAct_9fa48("591") ? !next.provider || !next.apiKey : stryMutAct_9fa48("590") ? true : (stryCov_9fa48("590", "591"), (stryMutAct_9fa48("592") ? next.provider : (stryCov_9fa48("592"), !next.provider)) && (stryMutAct_9fa48("593") ? next.apiKey : (stryCov_9fa48("593"), !next.apiKey)))) && (stryMutAct_9fa48("594") ? next.model : (stryCov_9fa48("594"), !next.model)))) && (stryMutAct_9fa48("595") ? next.systemPrompt : (stryCov_9fa48("595"), !next.systemPrompt)));
    return stryMutAct_9fa48("596") ? {} : (stryCov_9fa48("596"), {
      ...data,
      aiSettings: isEmpty ? undefined : next
    });
  }
}
export function toggleFavoriteTeam(data: AppData, teamId: string): AppData {
  if (stryMutAct_9fa48("597")) {
    {}
  } else {
    stryCov_9fa48("597");
    if (stryMutAct_9fa48("600") ? false : stryMutAct_9fa48("599") ? true : stryMutAct_9fa48("598") ? data.teams.some(t => t.id === teamId) : (stryCov_9fa48("598", "599", "600"), !(stryMutAct_9fa48("601") ? data.teams.every(t => t.id === teamId) : (stryCov_9fa48("601"), data.teams.some(stryMutAct_9fa48("602") ? () => undefined : (stryCov_9fa48("602"), t => stryMutAct_9fa48("605") ? t.id !== teamId : stryMutAct_9fa48("604") ? false : stryMutAct_9fa48("603") ? true : (stryCov_9fa48("603", "604", "605"), t.id === teamId))))))) return data;
    const p = stryMutAct_9fa48("606") ? data.profile && {
      displayName: 'Me',
      favoriteTeamIds: []
    } : (stryCov_9fa48("606"), data.profile ?? (stryMutAct_9fa48("607") ? {} : (stryCov_9fa48("607"), {
      displayName: stryMutAct_9fa48("608") ? "" : (stryCov_9fa48("608"), 'Me'),
      favoriteTeamIds: stryMutAct_9fa48("609") ? ["Stryker was here"] : (stryCov_9fa48("609"), [])
    })));
    const fav = stryMutAct_9fa48("610") ? p.favoriteTeamIds : (stryCov_9fa48("610"), p.favoriteTeamIds.filter(stryMutAct_9fa48("611") ? () => undefined : (stryCov_9fa48("611"), id => stryMutAct_9fa48("612") ? data.teams.every(t => t.id === id) : (stryCov_9fa48("612"), data.teams.some(stryMutAct_9fa48("613") ? () => undefined : (stryCov_9fa48("613"), t => stryMutAct_9fa48("616") ? t.id !== id : stryMutAct_9fa48("615") ? false : stryMutAct_9fa48("614") ? true : (stryCov_9fa48("614", "615", "616"), t.id === id)))))));
    const has = fav.includes(teamId);
    const next = has ? stryMutAct_9fa48("617") ? fav : (stryCov_9fa48("617"), fav.filter(stryMutAct_9fa48("618") ? () => undefined : (stryCov_9fa48("618"), x => stryMutAct_9fa48("621") ? x === teamId : stryMutAct_9fa48("620") ? false : stryMutAct_9fa48("619") ? true : (stryCov_9fa48("619", "620", "621"), x !== teamId)))) : stryMutAct_9fa48("622") ? [] : (stryCov_9fa48("622"), [teamId, ...(stryMutAct_9fa48("623") ? fav : (stryCov_9fa48("623"), fav.filter(stryMutAct_9fa48("624") ? () => undefined : (stryCov_9fa48("624"), x => stryMutAct_9fa48("627") ? x === teamId : stryMutAct_9fa48("626") ? false : stryMutAct_9fa48("625") ? true : (stryCov_9fa48("625", "626", "627"), x !== teamId)))))]);
    return stryMutAct_9fa48("628") ? {} : (stryCov_9fa48("628"), {
      ...data,
      profile: stryMutAct_9fa48("629") ? {} : (stryCov_9fa48("629"), {
        ...p,
        favoriteTeamIds: next
      })
    });
  }
}
export function addTodoGroup(data: AppData, name: string, id?: string): AppData {
  if (stryMutAct_9fa48("630")) {
    {}
  } else {
    stryCov_9fa48("630");
    const t = nowIso();
    const maxOrder = stryMutAct_9fa48("631") ? Math.min(0, ...data.todoGroups.map(g => g.sortOrder)) : (stryCov_9fa48("631"), Math.max(0, ...data.todoGroups.map(stryMutAct_9fa48("632") ? () => undefined : (stryCov_9fa48("632"), g => g.sortOrder))));
    const g: TodoGroup = stryMutAct_9fa48("633") ? {} : (stryCov_9fa48("633"), {
      id: stryMutAct_9fa48("634") ? id && uuid() : (stryCov_9fa48("634"), id ?? uuid()),
      name: stryMutAct_9fa48("637") ? name.trim() && 'New list' : stryMutAct_9fa48("636") ? false : stryMutAct_9fa48("635") ? true : (stryCov_9fa48("635", "636", "637"), (stryMutAct_9fa48("638") ? name : (stryCov_9fa48("638"), name.trim())) || (stryMutAct_9fa48("639") ? "" : (stryCov_9fa48("639"), 'New list'))),
      sortOrder: stryMutAct_9fa48("640") ? maxOrder - 1 : (stryCov_9fa48("640"), maxOrder + 1),
      createdAt: t
    });
    return stryMutAct_9fa48("641") ? {} : (stryCov_9fa48("641"), {
      ...data,
      todoGroups: stryMutAct_9fa48("642") ? [] : (stryCov_9fa48("642"), [...data.todoGroups, g])
    });
  }
}
export function updateTodoGroup(data: AppData, groupId: string, patch: Partial<Pick<TodoGroup, 'name' | 'sortOrder' | 'pinned' | 'archived'>>): AppData {
  if (stryMutAct_9fa48("643")) {
    {}
  } else {
    stryCov_9fa48("643");
    return stryMutAct_9fa48("644") ? {} : (stryCov_9fa48("644"), {
      ...data,
      todoGroups: data.todoGroups.map(stryMutAct_9fa48("645") ? () => undefined : (stryCov_9fa48("645"), g => (stryMutAct_9fa48("648") ? g.id !== groupId : stryMutAct_9fa48("647") ? false : stryMutAct_9fa48("646") ? true : (stryCov_9fa48("646", "647", "648"), g.id === groupId)) ? stryMutAct_9fa48("649") ? {} : (stryCov_9fa48("649"), {
        ...g,
        name: (stryMutAct_9fa48("652") ? patch.name === undefined : stryMutAct_9fa48("651") ? false : stryMutAct_9fa48("650") ? true : (stryCov_9fa48("650", "651", "652"), patch.name !== undefined)) ? stryMutAct_9fa48("655") ? patch.name.trim() && g.name : stryMutAct_9fa48("654") ? false : stryMutAct_9fa48("653") ? true : (stryCov_9fa48("653", "654", "655"), (stryMutAct_9fa48("656") ? patch.name : (stryCov_9fa48("656"), patch.name.trim())) || g.name) : g.name,
        sortOrder: (stryMutAct_9fa48("659") ? patch.sortOrder === undefined : stryMutAct_9fa48("658") ? false : stryMutAct_9fa48("657") ? true : (stryCov_9fa48("657", "658", "659"), patch.sortOrder !== undefined)) ? patch.sortOrder : g.sortOrder,
        pinned: (stryMutAct_9fa48("662") ? patch.pinned === undefined : stryMutAct_9fa48("661") ? false : stryMutAct_9fa48("660") ? true : (stryCov_9fa48("660", "661", "662"), patch.pinned !== undefined)) ? patch.pinned ? stryMutAct_9fa48("663") ? false : (stryCov_9fa48("663"), true) : undefined : g.pinned,
        archived: (stryMutAct_9fa48("666") ? patch.archived === undefined : stryMutAct_9fa48("665") ? false : stryMutAct_9fa48("664") ? true : (stryCov_9fa48("664", "665", "666"), patch.archived !== undefined)) ? patch.archived ? stryMutAct_9fa48("667") ? false : (stryCov_9fa48("667"), true) : undefined : g.archived
      }) : g))
    });
  }
}
export function removeTodoGroup(data: AppData, groupId: string): AppData {
  if (stryMutAct_9fa48("668")) {
    {}
  } else {
    stryCov_9fa48("668");
    if (stryMutAct_9fa48("672") ? data.todoGroups.length > 1 : stryMutAct_9fa48("671") ? data.todoGroups.length < 1 : stryMutAct_9fa48("670") ? false : stryMutAct_9fa48("669") ? true : (stryCov_9fa48("669", "670", "671", "672"), data.todoGroups.length <= 1)) return data;
    const fallback = stryMutAct_9fa48("673") ? data.todoGroups.find(g => g.id !== groupId).id : (stryCov_9fa48("673"), data.todoGroups.find(stryMutAct_9fa48("674") ? () => undefined : (stryCov_9fa48("674"), g => stryMutAct_9fa48("677") ? g.id === groupId : stryMutAct_9fa48("676") ? false : stryMutAct_9fa48("675") ? true : (stryCov_9fa48("675", "676", "677"), g.id !== groupId)))?.id);
    if (stryMutAct_9fa48("680") ? false : stryMutAct_9fa48("679") ? true : stryMutAct_9fa48("678") ? fallback : (stryCov_9fa48("678", "679", "680"), !fallback)) return data;
    const todoGroups = stryMutAct_9fa48("681") ? data.todoGroups : (stryCov_9fa48("681"), data.todoGroups.filter(stryMutAct_9fa48("682") ? () => undefined : (stryCov_9fa48("682"), g => stryMutAct_9fa48("685") ? g.id === groupId : stryMutAct_9fa48("684") ? false : stryMutAct_9fa48("683") ? true : (stryCov_9fa48("683", "684", "685"), g.id !== groupId))));
    if (stryMutAct_9fa48("688") ? todoGroups.length !== 0 : stryMutAct_9fa48("687") ? false : stryMutAct_9fa48("686") ? true : (stryCov_9fa48("686", "687", "688"), todoGroups.length === 0)) return data;
    const todoItems = data.todoItems.map(stryMutAct_9fa48("689") ? () => undefined : (stryCov_9fa48("689"), x => (stryMutAct_9fa48("692") ? x.groupId !== groupId : stryMutAct_9fa48("691") ? false : stryMutAct_9fa48("690") ? true : (stryCov_9fa48("690", "691", "692"), x.groupId === groupId)) ? stryMutAct_9fa48("693") ? {} : (stryCov_9fa48("693"), {
      ...x,
      groupId: fallback
    }) : x));
    return stryMutAct_9fa48("694") ? {} : (stryCov_9fa48("694"), {
      ...data,
      todoGroups,
      todoItems
    });
  }
}

/**
 * Reorder `groupId` so it sits immediately before `beforeGroupId` (or at the
 * end when `beforeGroupId` is `null`). Pinned/archived buckets are kept as
 * separate visibility groups: when the source and target are in the same
 * bucket we only re-number that bucket; when they differ we move the source
 * into the destination bucket (e.g. dropping a pinned list below an unpinned
 * one will unpin it). This is the action used by the drag-and-drop reorder.
 */
export function reorderTodoGroup(data: AppData, groupId: string, beforeGroupId: string | null): AppData {
  if (stryMutAct_9fa48("695")) {
    {}
  } else {
    stryCov_9fa48("695");
    const target = data.todoGroups.find(stryMutAct_9fa48("696") ? () => undefined : (stryCov_9fa48("696"), g => stryMutAct_9fa48("699") ? g.id !== groupId : stryMutAct_9fa48("698") ? false : stryMutAct_9fa48("697") ? true : (stryCov_9fa48("697", "698", "699"), g.id === groupId)));
    if (stryMutAct_9fa48("702") ? false : stryMutAct_9fa48("701") ? true : stryMutAct_9fa48("700") ? target : (stryCov_9fa48("700", "701", "702"), !target)) return data;
    if (stryMutAct_9fa48("705") ? beforeGroupId !== groupId : stryMutAct_9fa48("704") ? false : stryMutAct_9fa48("703") ? true : (stryCov_9fa48("703", "704", "705"), beforeGroupId === groupId)) return data;
    const before = beforeGroupId ? data.todoGroups.find(stryMutAct_9fa48("706") ? () => undefined : (stryCov_9fa48("706"), g => stryMutAct_9fa48("709") ? g.id !== beforeGroupId : stryMutAct_9fa48("708") ? false : stryMutAct_9fa48("707") ? true : (stryCov_9fa48("707", "708", "709"), g.id === beforeGroupId))) : null;
    const destPinned = before ? stryMutAct_9fa48("710") ? !before.pinned : (stryCov_9fa48("710"), !(stryMutAct_9fa48("711") ? before.pinned : (stryCov_9fa48("711"), !before.pinned))) : stryMutAct_9fa48("712") ? true : (stryCov_9fa48("712"), false);
    const destArchived = before ? stryMutAct_9fa48("713") ? !before.archived : (stryCov_9fa48("713"), !(stryMutAct_9fa48("714") ? before.archived : (stryCov_9fa48("714"), !before.archived))) : stryMutAct_9fa48("715") ? !target.archived : (stryCov_9fa48("715"), !(stryMutAct_9fa48("716") ? target.archived : (stryCov_9fa48("716"), !target.archived)));
    const willTogglePin = stryMutAct_9fa48("719") ? !!target.pinned === destPinned : stryMutAct_9fa48("718") ? false : stryMutAct_9fa48("717") ? true : (stryCov_9fa48("717", "718", "719"), (stryMutAct_9fa48("720") ? !target.pinned : (stryCov_9fa48("720"), !(stryMutAct_9fa48("721") ? target.pinned : (stryCov_9fa48("721"), !target.pinned)))) !== destPinned);
    const willToggleArchive = stryMutAct_9fa48("724") ? !!target.archived === destArchived : stryMutAct_9fa48("723") ? false : stryMutAct_9fa48("722") ? true : (stryCov_9fa48("722", "723", "724"), (stryMutAct_9fa48("725") ? !target.archived : (stryCov_9fa48("725"), !(stryMutAct_9fa48("726") ? target.archived : (stryCov_9fa48("726"), !target.archived)))) !== destArchived);
    const peers = stryMutAct_9fa48("728") ? data.todoGroups.sort((a, b) => a.sortOrder - b.sortOrder) : stryMutAct_9fa48("727") ? data.todoGroups.filter(g => !!g.pinned === destPinned && !!g.archived === destArchived && g.id !== groupId) : (stryCov_9fa48("727", "728"), data.todoGroups.filter(stryMutAct_9fa48("729") ? () => undefined : (stryCov_9fa48("729"), g => stryMutAct_9fa48("732") ? !!g.pinned === destPinned && !!g.archived === destArchived || g.id !== groupId : stryMutAct_9fa48("731") ? false : stryMutAct_9fa48("730") ? true : (stryCov_9fa48("730", "731", "732"), (stryMutAct_9fa48("734") ? !!g.pinned === destPinned || !!g.archived === destArchived : stryMutAct_9fa48("733") ? true : (stryCov_9fa48("733", "734"), (stryMutAct_9fa48("736") ? !!g.pinned !== destPinned : stryMutAct_9fa48("735") ? true : (stryCov_9fa48("735", "736"), (stryMutAct_9fa48("737") ? !g.pinned : (stryCov_9fa48("737"), !(stryMutAct_9fa48("738") ? g.pinned : (stryCov_9fa48("738"), !g.pinned)))) === destPinned)) && (stryMutAct_9fa48("740") ? !!g.archived !== destArchived : stryMutAct_9fa48("739") ? true : (stryCov_9fa48("739", "740"), (stryMutAct_9fa48("741") ? !g.archived : (stryCov_9fa48("741"), !(stryMutAct_9fa48("742") ? g.archived : (stryCov_9fa48("742"), !g.archived)))) === destArchived)))) && (stryMutAct_9fa48("744") ? g.id === groupId : stryMutAct_9fa48("743") ? true : (stryCov_9fa48("743", "744"), g.id !== groupId))))).sort(stryMutAct_9fa48("745") ? () => undefined : (stryCov_9fa48("745"), (a, b) => stryMutAct_9fa48("746") ? a.sortOrder + b.sortOrder : (stryCov_9fa48("746"), a.sortOrder - b.sortOrder))));
    const insertAt = before ? peers.findIndex(stryMutAct_9fa48("747") ? () => undefined : (stryCov_9fa48("747"), p => stryMutAct_9fa48("750") ? p.id !== before.id : stryMutAct_9fa48("749") ? false : stryMutAct_9fa48("748") ? true : (stryCov_9fa48("748", "749", "750"), p.id === before.id))) : peers.length;
    const ordered: TodoGroup[] = stryMutAct_9fa48("751") ? [] : (stryCov_9fa48("751"), [...(stryMutAct_9fa48("752") ? peers : (stryCov_9fa48("752"), peers.slice(0, stryMutAct_9fa48("753") ? Math.min(0, insertAt) : (stryCov_9fa48("753"), Math.max(0, insertAt))))), stryMutAct_9fa48("754") ? {} : (stryCov_9fa48("754"), {
      ...target,
      pinned: willTogglePin ? destPinned ? stryMutAct_9fa48("755") ? false : (stryCov_9fa48("755"), true) : undefined : target.pinned,
      archived: willToggleArchive ? destArchived ? stryMutAct_9fa48("756") ? false : (stryCov_9fa48("756"), true) : undefined : target.archived
    }), ...(stryMutAct_9fa48("757") ? peers : (stryCov_9fa48("757"), peers.slice(stryMutAct_9fa48("758") ? Math.min(0, insertAt) : (stryCov_9fa48("758"), Math.max(0, insertAt)))))]);

    // Build a fresh sortOrder for this bucket; offset within full list keeps
    // pinned-on-top ordering stable relative to unpinned items.
    const offset = destPinned ? 0 : 1_000_000;
    const archiveOffset = destArchived ? 2_000_000 : 0;
    const updates = new Map<string, number>();
    ordered.forEach((g, idx) => {
      if (stryMutAct_9fa48("759")) {
        {}
      } else {
        stryCov_9fa48("759");
        updates.set(g.id, stryMutAct_9fa48("760") ? offset + archiveOffset - idx : (stryCov_9fa48("760"), (stryMutAct_9fa48("761") ? offset - archiveOffset : (stryCov_9fa48("761"), offset + archiveOffset)) + idx));
      }
    });
    return stryMutAct_9fa48("762") ? {} : (stryCov_9fa48("762"), {
      ...data,
      todoGroups: data.todoGroups.map(g => {
        if (stryMutAct_9fa48("763")) {
          {}
        } else {
          stryCov_9fa48("763");
          if (stryMutAct_9fa48("766") ? g.id !== target.id : stryMutAct_9fa48("765") ? false : stryMutAct_9fa48("764") ? true : (stryCov_9fa48("764", "765", "766"), g.id === target.id)) {
            if (stryMutAct_9fa48("767")) {
              {}
            } else {
              stryCov_9fa48("767");
              return stryMutAct_9fa48("768") ? {} : (stryCov_9fa48("768"), {
                ...g,
                pinned: willTogglePin ? destPinned ? stryMutAct_9fa48("769") ? false : (stryCov_9fa48("769"), true) : undefined : g.pinned,
                archived: willToggleArchive ? destArchived ? stryMutAct_9fa48("770") ? false : (stryCov_9fa48("770"), true) : undefined : g.archived,
                sortOrder: stryMutAct_9fa48("771") ? updates.get(g.id) && g.sortOrder : (stryCov_9fa48("771"), updates.get(g.id) ?? g.sortOrder)
              });
            }
          }
          const next = updates.get(g.id);
          return (stryMutAct_9fa48("774") ? next === undefined : stryMutAct_9fa48("773") ? false : stryMutAct_9fa48("772") ? true : (stryCov_9fa48("772", "773", "774"), next !== undefined)) ? stryMutAct_9fa48("775") ? {} : (stryCov_9fa48("775"), {
            ...g,
            sortOrder: next
          }) : g;
        }
      })
    });
  }
}

/**
 * Move a todo group one position up or down within its visibility group
 * (pinned-vs-not). Pinned groups only reorder against other pinned, and
 * vice versa, to keep the "pinned-on-top" invariant intact.
 */
export function moveTodoGroup(data: AppData, groupId: string, direction: 'up' | 'down'): AppData {
  if (stryMutAct_9fa48("776")) {
    {}
  } else {
    stryCov_9fa48("776");
    const target = data.todoGroups.find(stryMutAct_9fa48("777") ? () => undefined : (stryCov_9fa48("777"), g => stryMutAct_9fa48("780") ? g.id !== groupId : stryMutAct_9fa48("779") ? false : stryMutAct_9fa48("778") ? true : (stryCov_9fa48("778", "779", "780"), g.id === groupId)));
    if (stryMutAct_9fa48("783") ? false : stryMutAct_9fa48("782") ? true : stryMutAct_9fa48("781") ? target : (stryCov_9fa48("781", "782", "783"), !target)) return data;
    const peers = stryMutAct_9fa48("785") ? [...data.todoGroups].sort((a, b) => a.sortOrder - b.sortOrder) : stryMutAct_9fa48("784") ? [...data.todoGroups].filter(g => !!g.pinned === !!target.pinned && !!g.archived === !!target.archived) : (stryCov_9fa48("784", "785"), (stryMutAct_9fa48("786") ? [] : (stryCov_9fa48("786"), [...data.todoGroups])).filter(stryMutAct_9fa48("787") ? () => undefined : (stryCov_9fa48("787"), g => stryMutAct_9fa48("790") ? !!g.pinned === !!target.pinned || !!g.archived === !!target.archived : stryMutAct_9fa48("789") ? false : stryMutAct_9fa48("788") ? true : (stryCov_9fa48("788", "789", "790"), (stryMutAct_9fa48("792") ? !!g.pinned !== !!target.pinned : stryMutAct_9fa48("791") ? true : (stryCov_9fa48("791", "792"), (stryMutAct_9fa48("793") ? !g.pinned : (stryCov_9fa48("793"), !(stryMutAct_9fa48("794") ? g.pinned : (stryCov_9fa48("794"), !g.pinned)))) === (stryMutAct_9fa48("795") ? !target.pinned : (stryCov_9fa48("795"), !(stryMutAct_9fa48("796") ? target.pinned : (stryCov_9fa48("796"), !target.pinned)))))) && (stryMutAct_9fa48("798") ? !!g.archived !== !!target.archived : stryMutAct_9fa48("797") ? true : (stryCov_9fa48("797", "798"), (stryMutAct_9fa48("799") ? !g.archived : (stryCov_9fa48("799"), !(stryMutAct_9fa48("800") ? g.archived : (stryCov_9fa48("800"), !g.archived)))) === (stryMutAct_9fa48("801") ? !target.archived : (stryCov_9fa48("801"), !(stryMutAct_9fa48("802") ? target.archived : (stryCov_9fa48("802"), !target.archived))))))))).sort(stryMutAct_9fa48("803") ? () => undefined : (stryCov_9fa48("803"), (a, b) => stryMutAct_9fa48("804") ? a.sortOrder + b.sortOrder : (stryCov_9fa48("804"), a.sortOrder - b.sortOrder))));
    const idx = peers.findIndex(stryMutAct_9fa48("805") ? () => undefined : (stryCov_9fa48("805"), g => stryMutAct_9fa48("808") ? g.id !== groupId : stryMutAct_9fa48("807") ? false : stryMutAct_9fa48("806") ? true : (stryCov_9fa48("806", "807", "808"), g.id === groupId)));
    if (stryMutAct_9fa48("812") ? idx >= 0 : stryMutAct_9fa48("811") ? idx <= 0 : stryMutAct_9fa48("810") ? false : stryMutAct_9fa48("809") ? true : (stryCov_9fa48("809", "810", "811", "812"), idx < 0)) return data;
    const swapWith = (stryMutAct_9fa48("815") ? direction !== 'up' : stryMutAct_9fa48("814") ? false : stryMutAct_9fa48("813") ? true : (stryCov_9fa48("813", "814", "815"), direction === (stryMutAct_9fa48("816") ? "" : (stryCov_9fa48("816"), 'up')))) ? peers[stryMutAct_9fa48("817") ? idx + 1 : (stryCov_9fa48("817"), idx - 1)] : peers[stryMutAct_9fa48("818") ? idx - 1 : (stryCov_9fa48("818"), idx + 1)];
    if (stryMutAct_9fa48("821") ? false : stryMutAct_9fa48("820") ? true : stryMutAct_9fa48("819") ? swapWith : (stryCov_9fa48("819", "820", "821"), !swapWith)) return data;
    const a = target.sortOrder;
    const b = swapWith.sortOrder;
    return stryMutAct_9fa48("822") ? {} : (stryCov_9fa48("822"), {
      ...data,
      todoGroups: data.todoGroups.map(g => {
        if (stryMutAct_9fa48("823")) {
          {}
        } else {
          stryCov_9fa48("823");
          if (stryMutAct_9fa48("826") ? g.id !== target.id : stryMutAct_9fa48("825") ? false : stryMutAct_9fa48("824") ? true : (stryCov_9fa48("824", "825", "826"), g.id === target.id)) return stryMutAct_9fa48("827") ? {} : (stryCov_9fa48("827"), {
            ...g,
            sortOrder: b
          });
          if (stryMutAct_9fa48("830") ? g.id !== swapWith.id : stryMutAct_9fa48("829") ? false : stryMutAct_9fa48("828") ? true : (stryCov_9fa48("828", "829", "830"), g.id === swapWith.id)) return stryMutAct_9fa48("831") ? {} : (stryCov_9fa48("831"), {
            ...g,
            sortOrder: a
          });
          return g;
        }
      })
    });
  }
}

/** Removes every completed task from the given list. */
/**
 * Drop both completed and cancelled rows from a list — the two terminal
 * states. Old builds only cleared `done` rows; cancelled items now share
 * that "no longer active" semantics so they're swept up too.
 */
export function clearCompletedInGroup(data: AppData, groupId: string): AppData {
  if (stryMutAct_9fa48("832")) {
    {}
  } else {
    stryCov_9fa48("832");
    return stryMutAct_9fa48("833") ? {} : (stryCov_9fa48("833"), {
      ...data,
      todoItems: stryMutAct_9fa48("834") ? data.todoItems : (stryCov_9fa48("834"), data.todoItems.filter(stryMutAct_9fa48("835") ? () => undefined : (stryCov_9fa48("835"), t => stryMutAct_9fa48("836") ? t.groupId === groupId && (t.status === 'done' || t.status === 'cancelled') : (stryCov_9fa48("836"), !(stryMutAct_9fa48("839") ? t.groupId === groupId || t.status === 'done' || t.status === 'cancelled' : stryMutAct_9fa48("838") ? false : stryMutAct_9fa48("837") ? true : (stryCov_9fa48("837", "838", "839"), (stryMutAct_9fa48("841") ? t.groupId !== groupId : stryMutAct_9fa48("840") ? true : (stryCov_9fa48("840", "841"), t.groupId === groupId)) && (stryMutAct_9fa48("843") ? t.status === 'done' && t.status === 'cancelled' : stryMutAct_9fa48("842") ? true : (stryCov_9fa48("842", "843"), (stryMutAct_9fa48("845") ? t.status !== 'done' : stryMutAct_9fa48("844") ? false : (stryCov_9fa48("844", "845"), t.status === (stryMutAct_9fa48("846") ? "" : (stryCov_9fa48("846"), 'done')))) || (stryMutAct_9fa48("848") ? t.status !== 'cancelled' : stryMutAct_9fa48("847") ? false : (stryCov_9fa48("847", "848"), t.status === (stryMutAct_9fa48("849") ? "" : (stryCov_9fa48("849"), 'cancelled'))))))))))))
    });
  }
}

/**
 * Marks every still-open task in the list (todo / in_progress) as done.
 * Cancelled rows are left alone — the user explicitly decided to drop
 * them, "mark all complete" shouldn't undo that decision.
 */
export function markAllCompleteInGroup(data: AppData, groupId: string): AppData {
  if (stryMutAct_9fa48("850")) {
    {}
  } else {
    stryCov_9fa48("850");
    const now = nowIso();
    return stryMutAct_9fa48("851") ? {} : (stryCov_9fa48("851"), {
      ...data,
      todoItems: data.todoItems.map(stryMutAct_9fa48("852") ? () => undefined : (stryCov_9fa48("852"), t => (stryMutAct_9fa48("855") ? t.groupId === groupId || t.status === 'todo' || t.status === 'in_progress' : stryMutAct_9fa48("854") ? false : stryMutAct_9fa48("853") ? true : (stryCov_9fa48("853", "854", "855"), (stryMutAct_9fa48("857") ? t.groupId !== groupId : stryMutAct_9fa48("856") ? true : (stryCov_9fa48("856", "857"), t.groupId === groupId)) && (stryMutAct_9fa48("859") ? t.status === 'todo' && t.status === 'in_progress' : stryMutAct_9fa48("858") ? true : (stryCov_9fa48("858", "859"), (stryMutAct_9fa48("861") ? t.status !== 'todo' : stryMutAct_9fa48("860") ? false : (stryCov_9fa48("860", "861"), t.status === (stryMutAct_9fa48("862") ? "" : (stryCov_9fa48("862"), 'todo')))) || (stryMutAct_9fa48("864") ? t.status !== 'in_progress' : stryMutAct_9fa48("863") ? false : (stryCov_9fa48("863", "864"), t.status === (stryMutAct_9fa48("865") ? "" : (stryCov_9fa48("865"), 'in_progress')))))))) ? stryMutAct_9fa48("866") ? {} : (stryCov_9fa48("866"), {
        ...t,
        status: stryMutAct_9fa48("867") ? "" : (stryCov_9fa48("867"), 'done'),
        done: stryMutAct_9fa48("868") ? false : (stryCov_9fa48("868"), true),
        doneAt: stryMutAct_9fa48("869") ? t.doneAt && now : (stryCov_9fa48("869"), t.doneAt ?? now),
        updatedAt: now
      }) : t))
    });
  }
}
export function addTodoItem(data: AppData, groupId: string, title: string, extras: {
  priority?: Priority;
  dueAt?: string;
  body?: string;
  bodyFormat?: 'markdown' | 'prosemirror';
  bodyPlainText?: string;
  sourceNoteId?: string;
} = {}): AppData {
  if (stryMutAct_9fa48("870")) {
    {}
  } else {
    stryCov_9fa48("870");
    const gid = (stryMutAct_9fa48("871") ? data.todoGroups.every(g => g.id === groupId) : (stryCov_9fa48("871"), data.todoGroups.some(stryMutAct_9fa48("872") ? () => undefined : (stryCov_9fa48("872"), g => stryMutAct_9fa48("875") ? g.id !== groupId : stryMutAct_9fa48("874") ? false : stryMutAct_9fa48("873") ? true : (stryCov_9fa48("873", "874", "875"), g.id === groupId))))) ? groupId : stryMutAct_9fa48("876") ? data.todoGroups[0].id : (stryCov_9fa48("876"), data.todoGroups[0]?.id);
    if (stryMutAct_9fa48("879") ? false : stryMutAct_9fa48("878") ? true : stryMutAct_9fa48("877") ? gid : (stryCov_9fa48("877", "878", "879"), !gid)) return data;
    const t = nowIso();
    // New items go to the TOP of the list (sortOrder = min - 1). This matches
    // how to-do apps usually behave when you "add task" — the new task is
    // immediately visible without scrolling.
    const minOrder = stryMutAct_9fa48("880") ? data.todoItems.reduce((acc, x) => Math.min(acc, x.sortOrder ?? 0), 0) : (stryCov_9fa48("880"), data.todoItems.filter(stryMutAct_9fa48("881") ? () => undefined : (stryCov_9fa48("881"), x => stryMutAct_9fa48("884") ? x.groupId !== gid : stryMutAct_9fa48("883") ? false : stryMutAct_9fa48("882") ? true : (stryCov_9fa48("882", "883", "884"), x.groupId === gid))).reduce(stryMutAct_9fa48("885") ? () => undefined : (stryCov_9fa48("885"), (acc, x) => stryMutAct_9fa48("886") ? Math.max(acc, x.sortOrder ?? 0) : (stryCov_9fa48("886"), Math.min(acc, stryMutAct_9fa48("887") ? x.sortOrder && 0 : (stryCov_9fa48("887"), x.sortOrder ?? 0)))), 0));
    // Persist body only when non-empty after trim; same normalisation as
    // `parseTodoItems` does on load, applied at the write side so a
    // user that opens-and-closes the markdown editor without typing
    // doesn't bloat the file with an empty string.
    const trimmedBody = (stryMutAct_9fa48("890") ? typeof extras.body !== 'string' : stryMutAct_9fa48("889") ? false : stryMutAct_9fa48("888") ? true : (stryCov_9fa48("888", "889", "890"), typeof extras.body === (stryMutAct_9fa48("891") ? "" : (stryCov_9fa48("891"), 'string')))) ? extras.body : undefined;
    const body = (stryMutAct_9fa48("894") ? trimmedBody || trimmedBody.trim() : stryMutAct_9fa48("893") ? false : stryMutAct_9fa48("892") ? true : (stryCov_9fa48("892", "893", "894"), trimmedBody && (stryMutAct_9fa48("895") ? trimmedBody : (stryCov_9fa48("895"), trimmedBody.trim())))) ? trimmedBody : undefined;
    // Source-note linking: only stamp the field when the caller actually
    // points at a note that exists. Defensive against stale UI state
    // (e.g. user deletes the note between opening the extractor and
    // clicking "Add all"); silently dropping the ref is safer than
    // creating a task that links nowhere.
    const sourceNoteId = (stryMutAct_9fa48("898") ? typeof extras.sourceNoteId === 'string' || extras.sourceNoteId.trim() : stryMutAct_9fa48("897") ? false : stryMutAct_9fa48("896") ? true : (stryCov_9fa48("896", "897", "898"), (stryMutAct_9fa48("900") ? typeof extras.sourceNoteId !== 'string' : stryMutAct_9fa48("899") ? true : (stryCov_9fa48("899", "900"), typeof extras.sourceNoteId === (stryMutAct_9fa48("901") ? "" : (stryCov_9fa48("901"), 'string')))) && (stryMutAct_9fa48("902") ? extras.sourceNoteId : (stryCov_9fa48("902"), extras.sourceNoteId.trim())))) ? (stryMutAct_9fa48("903") ? data.notes.every(n => n.id === extras.sourceNoteId) : (stryCov_9fa48("903"), data.notes.some(stryMutAct_9fa48("904") ? () => undefined : (stryCov_9fa48("904"), n => stryMutAct_9fa48("907") ? n.id !== extras.sourceNoteId : stryMutAct_9fa48("906") ? false : stryMutAct_9fa48("905") ? true : (stryCov_9fa48("905", "906", "907"), n.id === extras.sourceNoteId))))) ? extras.sourceNoteId : undefined : undefined;
    const item: TodoItem = stryMutAct_9fa48("908") ? {} : (stryCov_9fa48("908"), {
      id: uuid(),
      groupId: gid,
      title: stryMutAct_9fa48("911") ? title.trim() && 'Untitled task' : stryMutAct_9fa48("910") ? false : stryMutAct_9fa48("909") ? true : (stryCov_9fa48("909", "910", "911"), (stryMutAct_9fa48("912") ? title : (stryCov_9fa48("912"), title.trim())) || (stryMutAct_9fa48("913") ? "" : (stryCov_9fa48("913"), 'Untitled task'))),
      status: stryMutAct_9fa48("914") ? "" : (stryCov_9fa48("914"), 'todo'),
      done: stryMutAct_9fa48("915") ? true : (stryCov_9fa48("915"), false),
      sortOrder: stryMutAct_9fa48("916") ? minOrder + 1 : (stryCov_9fa48("916"), minOrder - 1),
      createdAt: t,
      updatedAt: t,
      ...(extras.priority ? stryMutAct_9fa48("917") ? {} : (stryCov_9fa48("917"), {
        priority: extras.priority
      }) : {}),
      ...(extras.dueAt ? stryMutAct_9fa48("918") ? {} : (stryCov_9fa48("918"), {
        dueAt: extras.dueAt
      }) : {}),
      ...(body ? stryMutAct_9fa48("919") ? {} : (stryCov_9fa48("919"), {
        body
      }) : {}),
      ...(extras.bodyFormat ? stryMutAct_9fa48("920") ? {} : (stryCov_9fa48("920"), {
        bodyFormat: extras.bodyFormat
      }) : {}),
      ...((stryMutAct_9fa48("922") ? extras.bodyPlainText.trim() : stryMutAct_9fa48("921") ? extras.bodyPlainText : (stryCov_9fa48("921", "922"), extras.bodyPlainText?.trim())) ? stryMutAct_9fa48("923") ? {} : (stryCov_9fa48("923"), {
        bodyPlainText: stryMutAct_9fa48("924") ? extras.bodyPlainText : (stryCov_9fa48("924"), extras.bodyPlainText.trim())
      }) : {}),
      ...(sourceNoteId ? stryMutAct_9fa48("925") ? {} : (stryCov_9fa48("925"), {
        sourceNoteId
      }) : {})
    });
    return stryMutAct_9fa48("926") ? {} : (stryCov_9fa48("926"), {
      ...data,
      todoItems: stryMutAct_9fa48("927") ? [] : (stryCov_9fa48("927"), [item, ...data.todoItems])
    });
  }
}

/**
 * Apply a partial update to a single to-do item.
 *
 * `status` is the authoritative lifecycle field. `done` (legacy boolean) and
 * `doneAt` (timestamp of completion) are always derived from it so callers
 * can't put the two out of sync:
 *
 *   - If `patch.status` is given, `done` follows it and `doneAt` is stamped
 *     when transitioning into `'done'` (or cleared when transitioning out).
 *   - If `patch.done` is given (legacy callers / checkbox toggles) we map
 *     it to a status change instead and run the same bookkeeping.
 *
 * That keeps `toggleTodoItem` and per-row checkbox handlers working
 * unchanged while still letting new code drive the model via `status`.
 */
export function updateTodoItem(data: AppData, id: string, patch: Partial<Pick<TodoItem, 'title' | 'body' | 'bodyFormat' | 'bodyPlainText' | 'groupId' | 'dueAt' | 'done' | 'status' | 'priority' | 'remindAt' | 'remindRepeat'>>): AppData {
  if (stryMutAct_9fa48("928")) {
    {}
  } else {
    stryCov_9fa48("928");
    let clearedNotify = stryMutAct_9fa48("929") ? true : (stryCov_9fa48("929"), false);
    const todoItems = data.todoItems.map(x => {
      if (stryMutAct_9fa48("930")) {
        {}
      } else {
        stryCov_9fa48("930");
        if (stryMutAct_9fa48("933") ? x.id === id : stryMutAct_9fa48("932") ? false : stryMutAct_9fa48("931") ? true : (stryCov_9fa48("931", "932", "933"), x.id !== id)) return x;
        if (stryMutAct_9fa48("936") ? 'remindAt' in patch && patch.remindAt !== x.remindAt && 'remindRepeat' in patch && patch.remindRepeat !== x.remindRepeat : stryMutAct_9fa48("935") ? false : stryMutAct_9fa48("934") ? true : (stryCov_9fa48("934", "935", "936"), (stryMutAct_9fa48("938") ? 'remindAt' in patch || patch.remindAt !== x.remindAt : stryMutAct_9fa48("937") ? false : (stryCov_9fa48("937", "938"), (stryMutAct_9fa48("939") ? "" : (stryCov_9fa48("939"), 'remindAt')) in patch && (stryMutAct_9fa48("941") ? patch.remindAt === x.remindAt : stryMutAct_9fa48("940") ? true : (stryCov_9fa48("940", "941"), patch.remindAt !== x.remindAt)))) || (stryMutAct_9fa48("943") ? 'remindRepeat' in patch || patch.remindRepeat !== x.remindRepeat : stryMutAct_9fa48("942") ? false : (stryCov_9fa48("942", "943"), (stryMutAct_9fa48("944") ? "" : (stryCov_9fa48("944"), 'remindRepeat')) in patch && (stryMutAct_9fa48("946") ? patch.remindRepeat === x.remindRepeat : stryMutAct_9fa48("945") ? true : (stryCov_9fa48("945", "946"), patch.remindRepeat !== x.remindRepeat)))))) {
          if (stryMutAct_9fa48("947")) {
            {}
          } else {
            stryCov_9fa48("947");
            clearedNotify = stryMutAct_9fa48("948") ? false : (stryCov_9fa48("948"), true);
          }
        }
        const groupId = (stryMutAct_9fa48("951") ? patch.groupId !== undefined || data.todoGroups.some(g => g.id === patch.groupId) : stryMutAct_9fa48("950") ? false : stryMutAct_9fa48("949") ? true : (stryCov_9fa48("949", "950", "951"), (stryMutAct_9fa48("953") ? patch.groupId === undefined : stryMutAct_9fa48("952") ? true : (stryCov_9fa48("952", "953"), patch.groupId !== undefined)) && (stryMutAct_9fa48("954") ? data.todoGroups.every(g => g.id === patch.groupId) : (stryCov_9fa48("954"), data.todoGroups.some(stryMutAct_9fa48("955") ? () => undefined : (stryCov_9fa48("955"), g => stryMutAct_9fa48("958") ? g.id !== patch.groupId : stryMutAct_9fa48("957") ? false : stryMutAct_9fa48("956") ? true : (stryCov_9fa48("956", "957", "958"), g.id === patch.groupId))))))) ? patch.groupId : x.groupId;
        const updatedAt = nowIso();

        // Resolve next status from the patch. `status` wins over `done`
        // if both are passed; that lets explicit "set to in_progress" calls
        // survive even when an older codepath also nudges `done: false`.
        let nextStatus: TodoStatus = x.status;
        if (stryMutAct_9fa48("961") ? patch.status === undefined : stryMutAct_9fa48("960") ? false : stryMutAct_9fa48("959") ? true : (stryCov_9fa48("959", "960", "961"), patch.status !== undefined)) {
          if (stryMutAct_9fa48("962")) {
            {}
          } else {
            stryCov_9fa48("962");
            nextStatus = patch.status;
          }
        } else if (stryMutAct_9fa48("965") ? patch.done === undefined : stryMutAct_9fa48("964") ? false : stryMutAct_9fa48("963") ? true : (stryCov_9fa48("963", "964", "965"), patch.done !== undefined)) {
          if (stryMutAct_9fa48("966")) {
            {}
          } else {
            stryCov_9fa48("966");
            nextStatus = patch.done ? stryMutAct_9fa48("967") ? "" : (stryCov_9fa48("967"), 'done') : stryMutAct_9fa48("968") ? "" : (stryCov_9fa48("968"), 'todo');
          }
        }
        const nextDone = stryMutAct_9fa48("971") ? nextStatus !== 'done' : stryMutAct_9fa48("970") ? false : stryMutAct_9fa48("969") ? true : (stryCov_9fa48("969", "970", "971"), nextStatus === (stryMutAct_9fa48("972") ? "" : (stryCov_9fa48("972"), 'done')));
        // Only stamp `doneAt` on a fresh transition into done — if the row
        // was already done we keep the original timestamp so analytics show
        // when it was *first* completed.
        let nextDoneAt = x.doneAt;
        if (stryMutAct_9fa48("975") ? nextDone || !x.done : stryMutAct_9fa48("974") ? false : stryMutAct_9fa48("973") ? true : (stryCov_9fa48("973", "974", "975"), nextDone && (stryMutAct_9fa48("976") ? x.done : (stryCov_9fa48("976"), !x.done)))) nextDoneAt = updatedAt;else if (stryMutAct_9fa48("979") ? false : stryMutAct_9fa48("978") ? true : stryMutAct_9fa48("977") ? nextDone : (stryCov_9fa48("977", "978", "979"), !nextDone)) nextDoneAt = undefined;
        const priority = (stryMutAct_9fa48("982") ? patch.priority === undefined : stryMutAct_9fa48("981") ? false : stryMutAct_9fa48("980") ? true : (stryCov_9fa48("980", "981", "982"), patch.priority !== undefined)) ? stryMutAct_9fa48("985") ? patch.priority && undefined : stryMutAct_9fa48("984") ? false : stryMutAct_9fa48("983") ? true : (stryCov_9fa48("983", "984", "985"), patch.priority || undefined) : x.priority;

        // Reminder fields. `undefined` in the patch means "clear" (a small
        // ergonomic departure from spread semantics — but matches how the
        // rest of this function treats `dueAt` clearing). Repeating a
        // reminder past its `dueAt` doesn't make sense, but we leave that
        // policing to the watcher — here we just persist the user's intent.
        let remindAt = (stryMutAct_9fa48("988") ? patch.remindAt === undefined : stryMutAct_9fa48("987") ? false : stryMutAct_9fa48("986") ? true : (stryCov_9fa48("986", "987", "988"), patch.remindAt !== undefined)) ? stryMutAct_9fa48("991") ? patch.remindAt && undefined : stryMutAct_9fa48("990") ? false : stryMutAct_9fa48("989") ? true : (stryCov_9fa48("989", "990", "991"), patch.remindAt || undefined) : x.remindAt;
        let remindRepeat = (stryMutAct_9fa48("994") ? patch.remindRepeat === undefined : stryMutAct_9fa48("993") ? false : stryMutAct_9fa48("992") ? true : (stryCov_9fa48("992", "993", "994"), patch.remindRepeat !== undefined)) ? stryMutAct_9fa48("997") ? patch.remindRepeat && undefined : stryMutAct_9fa48("996") ? false : stryMutAct_9fa48("995") ? true : (stryCov_9fa48("995", "996", "997"), patch.remindRepeat || undefined) : x.remindRepeat;
        // Status-driven cleanup: once a todo leaves the OPEN states the
        // reminder is logically void. Leaving `remindAt` set would cause a
        // surprise ping the moment the user re-opens the row (the watcher
        // checks the field on every tick, but a past timestamp would fire
        // immediately when status flips back to `todo`).
        if (stryMutAct_9fa48("1000") ? nextStatus === 'done' && nextStatus === 'cancelled' : stryMutAct_9fa48("999") ? false : stryMutAct_9fa48("998") ? true : (stryCov_9fa48("998", "999", "1000"), (stryMutAct_9fa48("1002") ? nextStatus !== 'done' : stryMutAct_9fa48("1001") ? false : (stryCov_9fa48("1001", "1002"), nextStatus === (stryMutAct_9fa48("1003") ? "" : (stryCov_9fa48("1003"), 'done')))) || (stryMutAct_9fa48("1005") ? nextStatus !== 'cancelled' : stryMutAct_9fa48("1004") ? false : (stryCov_9fa48("1004", "1005"), nextStatus === (stryMutAct_9fa48("1006") ? "" : (stryCov_9fa48("1006"), 'cancelled')))))) {
          if (stryMutAct_9fa48("1007")) {
            {}
          } else {
            stryCov_9fa48("1007");
            remindAt = undefined;
            remindRepeat = undefined;
          }
        }

        // Body patch semantics: omitted = keep existing, empty/whitespace =
        // clear (we treat both representations as "no body"). This matches
        // the way the markdown editor signals "user deleted everything" —
        // it calls `onChange('')` rather than `undefined`, and we want
        // that to land as a true clear in the file (so syncs propagate
        // the deletion).
        let nextBody: string | undefined = x.body;
        if (stryMutAct_9fa48("1010") ? patch.body === undefined : stryMutAct_9fa48("1009") ? false : stryMutAct_9fa48("1008") ? true : (stryCov_9fa48("1008", "1009", "1010"), patch.body !== undefined)) {
          if (stryMutAct_9fa48("1011")) {
            {}
          } else {
            stryCov_9fa48("1011");
            const trimmed = stryMutAct_9fa48("1012") ? patch.body : (stryCov_9fa48("1012"), patch.body.trim());
            nextBody = trimmed ? patch.body : undefined;
          }
        }
        let nextBodyFormat = (stryMutAct_9fa48("1015") ? patch.bodyFormat === undefined : stryMutAct_9fa48("1014") ? false : stryMutAct_9fa48("1013") ? true : (stryCov_9fa48("1013", "1014", "1015"), patch.bodyFormat !== undefined)) ? stryMutAct_9fa48("1018") ? patch.bodyFormat && undefined : stryMutAct_9fa48("1017") ? false : stryMutAct_9fa48("1016") ? true : (stryCov_9fa48("1016", "1017", "1018"), patch.bodyFormat || undefined) : x.bodyFormat;
        let nextBodyPlainText = (stryMutAct_9fa48("1021") ? patch.bodyPlainText === undefined : stryMutAct_9fa48("1020") ? false : stryMutAct_9fa48("1019") ? true : (stryCov_9fa48("1019", "1020", "1021"), patch.bodyPlainText !== undefined)) ? stryMutAct_9fa48("1024") ? patch.bodyPlainText && undefined : stryMutAct_9fa48("1023") ? false : stryMutAct_9fa48("1022") ? true : (stryCov_9fa48("1022", "1023", "1024"), patch.bodyPlainText || undefined) : x.bodyPlainText;
        if (stryMutAct_9fa48("1027") ? nextBody !== undefined : stryMutAct_9fa48("1026") ? false : stryMutAct_9fa48("1025") ? true : (stryCov_9fa48("1025", "1026", "1027"), nextBody === undefined)) {
          if (stryMutAct_9fa48("1028")) {
            {}
          } else {
            stryCov_9fa48("1028");
            nextBodyFormat = undefined;
            nextBodyPlainText = undefined;
          }
        }
        return stryMutAct_9fa48("1029") ? {} : (stryCov_9fa48("1029"), {
          ...x,
          title: (stryMutAct_9fa48("1032") ? patch.title === undefined : stryMutAct_9fa48("1031") ? false : stryMutAct_9fa48("1030") ? true : (stryCov_9fa48("1030", "1031", "1032"), patch.title !== undefined)) ? stryMutAct_9fa48("1035") ? patch.title.trim() && x.title : stryMutAct_9fa48("1034") ? false : stryMutAct_9fa48("1033") ? true : (stryCov_9fa48("1033", "1034", "1035"), (stryMutAct_9fa48("1036") ? patch.title : (stryCov_9fa48("1036"), patch.title.trim())) || x.title) : x.title,
          body: nextBody,
          bodyFormat: nextBodyFormat,
          bodyPlainText: nextBodyPlainText,
          groupId,
          dueAt: (stryMutAct_9fa48("1039") ? patch.dueAt === undefined : stryMutAct_9fa48("1038") ? false : stryMutAct_9fa48("1037") ? true : (stryCov_9fa48("1037", "1038", "1039"), patch.dueAt !== undefined)) ? stryMutAct_9fa48("1042") ? patch.dueAt && undefined : stryMutAct_9fa48("1041") ? false : stryMutAct_9fa48("1040") ? true : (stryCov_9fa48("1040", "1041", "1042"), patch.dueAt || undefined) : x.dueAt,
          status: nextStatus,
          done: nextDone,
          doneAt: nextDoneAt,
          priority,
          remindAt,
          remindRepeat,
          updatedAt
        });
      }
    });
    const notifiedReminderIds = clearedNotify ? clearReminderNotifyKeys(data.notifiedReminderIds, id) : data.notifiedReminderIds;
    return stryMutAct_9fa48("1043") ? {} : (stryCov_9fa48("1043"), {
      ...data,
      todoItems,
      notifiedReminderIds
    });
  }
}

/**
 * Explicit "set this item's status to X" helper.
 *
 * Thin wrapper around `updateTodoItem` so call sites (status dropdown,
 * bulk-status menu) don't have to remember the `done` ↔ `status` mapping.
 */
export function setTodoStatus(data: AppData, id: string, status: TodoStatus): AppData {
  if (stryMutAct_9fa48("1044")) {
    {}
  } else {
    stryCov_9fa48("1044");
    return updateTodoItem(data, id, stryMutAct_9fa48("1045") ? {} : (stryCov_9fa48("1045"), {
      status
    }));
  }
}

/**
 * Reorder an item within (or across) groups.
 *
 * `beforeItemId === null` puts the item at the end of `targetGroupId`.
 * If the destination group differs, the item's `groupId` is moved too — so
 * drag-and-drop between lists works for free.
 */
export function reorderTodoItem(data: AppData, itemId: string, targetGroupId: string, beforeItemId: string | null): AppData {
  if (stryMutAct_9fa48("1046")) {
    {}
  } else {
    stryCov_9fa48("1046");
    const target = data.todoItems.find(stryMutAct_9fa48("1047") ? () => undefined : (stryCov_9fa48("1047"), x => stryMutAct_9fa48("1050") ? x.id !== itemId : stryMutAct_9fa48("1049") ? false : stryMutAct_9fa48("1048") ? true : (stryCov_9fa48("1048", "1049", "1050"), x.id === itemId)));
    if (stryMutAct_9fa48("1053") ? false : stryMutAct_9fa48("1052") ? true : stryMutAct_9fa48("1051") ? target : (stryCov_9fa48("1051", "1052", "1053"), !target)) return data;
    if (stryMutAct_9fa48("1056") ? beforeItemId !== itemId : stryMutAct_9fa48("1055") ? false : stryMutAct_9fa48("1054") ? true : (stryCov_9fa48("1054", "1055", "1056"), beforeItemId === itemId)) return data;
    if (stryMutAct_9fa48("1059") ? false : stryMutAct_9fa48("1058") ? true : stryMutAct_9fa48("1057") ? data.todoGroups.some(g => g.id === targetGroupId) : (stryCov_9fa48("1057", "1058", "1059"), !(stryMutAct_9fa48("1060") ? data.todoGroups.every(g => g.id === targetGroupId) : (stryCov_9fa48("1060"), data.todoGroups.some(stryMutAct_9fa48("1061") ? () => undefined : (stryCov_9fa48("1061"), g => stryMutAct_9fa48("1064") ? g.id !== targetGroupId : stryMutAct_9fa48("1063") ? false : stryMutAct_9fa48("1062") ? true : (stryCov_9fa48("1062", "1063", "1064"), g.id === targetGroupId))))))) return data;
    const peers = stryMutAct_9fa48("1066") ? data.todoItems.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)) : stryMutAct_9fa48("1065") ? data.todoItems.filter(x => x.groupId === targetGroupId && x.id !== itemId) : (stryCov_9fa48("1065", "1066"), data.todoItems.filter(stryMutAct_9fa48("1067") ? () => undefined : (stryCov_9fa48("1067"), x => stryMutAct_9fa48("1070") ? x.groupId === targetGroupId || x.id !== itemId : stryMutAct_9fa48("1069") ? false : stryMutAct_9fa48("1068") ? true : (stryCov_9fa48("1068", "1069", "1070"), (stryMutAct_9fa48("1072") ? x.groupId !== targetGroupId : stryMutAct_9fa48("1071") ? true : (stryCov_9fa48("1071", "1072"), x.groupId === targetGroupId)) && (stryMutAct_9fa48("1074") ? x.id === itemId : stryMutAct_9fa48("1073") ? true : (stryCov_9fa48("1073", "1074"), x.id !== itemId))))).sort(stryMutAct_9fa48("1075") ? () => undefined : (stryCov_9fa48("1075"), (a, b) => stryMutAct_9fa48("1076") ? (a.sortOrder ?? 0) + (b.sortOrder ?? 0) : (stryCov_9fa48("1076"), (stryMutAct_9fa48("1077") ? a.sortOrder && 0 : (stryCov_9fa48("1077"), a.sortOrder ?? 0)) - (stryMutAct_9fa48("1078") ? b.sortOrder && 0 : (stryCov_9fa48("1078"), b.sortOrder ?? 0))))));
    const insertAt = beforeItemId ? peers.findIndex(stryMutAct_9fa48("1079") ? () => undefined : (stryCov_9fa48("1079"), p => stryMutAct_9fa48("1082") ? p.id !== beforeItemId : stryMutAct_9fa48("1081") ? false : stryMutAct_9fa48("1080") ? true : (stryCov_9fa48("1080", "1081", "1082"), p.id === beforeItemId))) : peers.length;
    const ordered: TodoItem[] = stryMutAct_9fa48("1083") ? [] : (stryCov_9fa48("1083"), [...(stryMutAct_9fa48("1084") ? peers : (stryCov_9fa48("1084"), peers.slice(0, stryMutAct_9fa48("1085") ? Math.min(0, insertAt) : (stryCov_9fa48("1085"), Math.max(0, insertAt))))), stryMutAct_9fa48("1086") ? {} : (stryCov_9fa48("1086"), {
      ...target,
      groupId: targetGroupId,
      updatedAt: nowIso()
    }), ...(stryMutAct_9fa48("1087") ? peers : (stryCov_9fa48("1087"), peers.slice(stryMutAct_9fa48("1088") ? Math.min(0, insertAt) : (stryCov_9fa48("1088"), Math.max(0, insertAt)))))]);

    // Re-stamp sortOrder in 10-step increments to leave room for fine-grained
    // future moves without rewriting every row.
    const reordered = new Map<string, number>();
    ordered.forEach(stryMutAct_9fa48("1089") ? () => undefined : (stryCov_9fa48("1089"), (x, idx) => reordered.set(x.id, stryMutAct_9fa48("1090") ? idx / 10 : (stryCov_9fa48("1090"), idx * 10))));
    return stryMutAct_9fa48("1091") ? {} : (stryCov_9fa48("1091"), {
      ...data,
      todoItems: data.todoItems.map(x => {
        if (stryMutAct_9fa48("1092")) {
          {}
        } else {
          stryCov_9fa48("1092");
          const nextOrder = reordered.get(x.id);
          if (stryMutAct_9fa48("1095") ? nextOrder !== undefined : stryMutAct_9fa48("1094") ? false : stryMutAct_9fa48("1093") ? true : (stryCov_9fa48("1093", "1094", "1095"), nextOrder === undefined)) return x;
          const moved = stryMutAct_9fa48("1098") ? x.id !== itemId : stryMutAct_9fa48("1097") ? false : stryMutAct_9fa48("1096") ? true : (stryCov_9fa48("1096", "1097", "1098"), x.id === itemId);
          return stryMutAct_9fa48("1099") ? {} : (stryCov_9fa48("1099"), {
            ...x,
            groupId: moved ? targetGroupId : x.groupId,
            sortOrder: nextOrder,
            updatedAt: moved ? nowIso() : x.updatedAt
          });
        }
      })
    });
  }
}
export function updateTodoGroupPriority(data: AppData, groupId: string, priority: Priority | undefined): AppData {
  if (stryMutAct_9fa48("1100")) {
    {}
  } else {
    stryCov_9fa48("1100");
    return stryMutAct_9fa48("1101") ? {} : (stryCov_9fa48("1101"), {
      ...data,
      todoGroups: data.todoGroups.map(stryMutAct_9fa48("1102") ? () => undefined : (stryCov_9fa48("1102"), g => (stryMutAct_9fa48("1105") ? g.id !== groupId : stryMutAct_9fa48("1104") ? false : stryMutAct_9fa48("1103") ? true : (stryCov_9fa48("1103", "1104", "1105"), g.id === groupId)) ? stryMutAct_9fa48("1106") ? {} : (stryCov_9fa48("1106"), {
        ...g,
        priority
      }) : g))
    });
  }
}
export function toggleTodoItem(data: AppData, id: string): AppData {
  if (stryMutAct_9fa48("1107")) {
    {}
  } else {
    stryCov_9fa48("1107");
    const x = data.todoItems.find(stryMutAct_9fa48("1108") ? () => undefined : (stryCov_9fa48("1108"), t => stryMutAct_9fa48("1111") ? t.id !== id : stryMutAct_9fa48("1110") ? false : stryMutAct_9fa48("1109") ? true : (stryCov_9fa48("1109", "1110", "1111"), t.id === id)));
    if (stryMutAct_9fa48("1114") ? false : stryMutAct_9fa48("1113") ? true : stryMutAct_9fa48("1112") ? x : (stryCov_9fa48("1112", "1113", "1114"), !x)) return data;
    return updateTodoItem(data, id, stryMutAct_9fa48("1115") ? {} : (stryCov_9fa48("1115"), {
      done: stryMutAct_9fa48("1116") ? x.done : (stryCov_9fa48("1116"), !x.done)
    }));
  }
}
export function removeTodoItem(data: AppData, id: string): AppData {
  if (stryMutAct_9fa48("1117")) {
    {}
  } else {
    stryCov_9fa48("1117");
    return stryMutAct_9fa48("1118") ? {} : (stryCov_9fa48("1118"), {
      ...data,
      todoItems: stryMutAct_9fa48("1119") ? data.todoItems : (stryCov_9fa48("1119"), data.todoItems.filter(stryMutAct_9fa48("1120") ? () => undefined : (stryCov_9fa48("1120"), x => stryMutAct_9fa48("1123") ? x.id === id : stryMutAct_9fa48("1122") ? false : stryMutAct_9fa48("1121") ? true : (stryCov_9fa48("1121", "1122", "1123"), x.id !== id)))),
      notifiedReminderIds: clearReminderNotifyKeys(data.notifiedReminderIds, id)
    });
  }
}

// -- Notes -----------------------------------------------------------------
//
// The reducers here only deal with PLAINTEXT bodies and verifier blobs.
// Anything that needs to actually encrypt/decrypt happens in the view (where
// the passphrase is in scope and the result of the Web Crypto promise can be
// awaited) and is only persisted back through `replaceNote`.

/**
 * `addNote(data, id)` is intentionally pure: the caller generates the id
 * outside the reducer so React's `setState(updater)` rule (updaters MUST be
 * pure and re-runnable) holds, even under StrictMode double-invocation.
 */
export function addNote(data: AppData, id: string): AppData {
  if (stryMutAct_9fa48("1124")) {
    {}
  } else {
    stryCov_9fa48("1124");
    const t = nowIso();
    const note: Note = stryMutAct_9fa48("1125") ? {} : (stryCov_9fa48("1125"), {
      id,
      title: stryMutAct_9fa48("1126") ? "Stryker was here!" : (stryCov_9fa48("1126"), ''),
      body: stryMutAct_9fa48("1127") ? "Stryker was here!" : (stryCov_9fa48("1127"), ''),
      locked: stryMutAct_9fa48("1128") ? true : (stryCov_9fa48("1128"), false),
      pinned: stryMutAct_9fa48("1129") ? true : (stryCov_9fa48("1129"), false),
      createdAt: t,
      updatedAt: t
    });
    return stryMutAct_9fa48("1130") ? {} : (stryCov_9fa48("1130"), {
      ...data,
      notes: stryMutAct_9fa48("1131") ? [] : (stryCov_9fa48("1131"), [note, ...data.notes])
    });
  }
}
export function replaceNote(data: AppData, note: Note): AppData {
  if (stryMutAct_9fa48("1132")) {
    {}
  } else {
    stryCov_9fa48("1132");
    return stryMutAct_9fa48("1133") ? {} : (stryCov_9fa48("1133"), {
      ...data,
      notes: data.notes.map(stryMutAct_9fa48("1134") ? () => undefined : (stryCov_9fa48("1134"), n => (stryMutAct_9fa48("1137") ? n.id !== note.id : stryMutAct_9fa48("1136") ? false : stryMutAct_9fa48("1135") ? true : (stryCov_9fa48("1135", "1136", "1137"), n.id === note.id)) ? stryMutAct_9fa48("1138") ? {} : (stryCov_9fa48("1138"), {
        ...note,
        updatedAt: nowIso()
      }) : n))
    });
  }
}
export function patchNote(data: AppData, id: string, patch: Partial<Pick<Note, 'title' | 'body' | 'bodyFormat' | 'bodyPlainText' | 'pinned' | 'sortOrder' | 'lastOpenedAt'>>): AppData {
  if (stryMutAct_9fa48("1139")) {
    {}
  } else {
    stryCov_9fa48("1139");
    const isContentChange = stryMutAct_9fa48("1142") ? ('title' in patch || 'body' in patch || 'bodyPlainText' in patch || 'bodyFormat' in patch) && 'pinned' in patch : stryMutAct_9fa48("1141") ? false : stryMutAct_9fa48("1140") ? true : (stryCov_9fa48("1140", "1141", "1142"), (stryMutAct_9fa48("1144") ? ('title' in patch || 'body' in patch || 'bodyPlainText' in patch) && 'bodyFormat' in patch : stryMutAct_9fa48("1143") ? false : (stryCov_9fa48("1143", "1144"), (stryMutAct_9fa48("1146") ? ('title' in patch || 'body' in patch) && 'bodyPlainText' in patch : stryMutAct_9fa48("1145") ? false : (stryCov_9fa48("1145", "1146"), (stryMutAct_9fa48("1148") ? 'title' in patch && 'body' in patch : stryMutAct_9fa48("1147") ? false : (stryCov_9fa48("1147", "1148"), (stryMutAct_9fa48("1149") ? "" : (stryCov_9fa48("1149"), 'title')) in patch || (stryMutAct_9fa48("1150") ? "" : (stryCov_9fa48("1150"), 'body')) in patch)) || (stryMutAct_9fa48("1151") ? "" : (stryCov_9fa48("1151"), 'bodyPlainText')) in patch)) || (stryMutAct_9fa48("1152") ? "" : (stryCov_9fa48("1152"), 'bodyFormat')) in patch)) || (stryMutAct_9fa48("1153") ? "" : (stryCov_9fa48("1153"), 'pinned')) in patch);
    return stryMutAct_9fa48("1154") ? {} : (stryCov_9fa48("1154"), {
      ...data,
      notes: data.notes.map(n => {
        if (stryMutAct_9fa48("1155")) {
          {}
        } else {
          stryCov_9fa48("1155");
          if (stryMutAct_9fa48("1158") ? n.id === id : stryMutAct_9fa48("1157") ? false : stryMutAct_9fa48("1156") ? true : (stryCov_9fa48("1156", "1157", "1158"), n.id !== id)) return n;
          const next: Note = stryMutAct_9fa48("1159") ? {} : (stryCov_9fa48("1159"), {
            ...n,
            ...patch
          });
          if (stryMutAct_9fa48("1161") ? false : stryMutAct_9fa48("1160") ? true : (stryCov_9fa48("1160", "1161"), isContentChange)) next.updatedAt = nowIso();
          return next;
        }
      })
    });
  }
}
export function removeNote(data: AppData, id: string): AppData {
  if (stryMutAct_9fa48("1162")) {
    {}
  } else {
    stryCov_9fa48("1162");
    return stryMutAct_9fa48("1163") ? {} : (stryCov_9fa48("1163"), {
      ...data,
      notes: stryMutAct_9fa48("1164") ? data.notes : (stryCov_9fa48("1164"), data.notes.filter(stryMutAct_9fa48("1165") ? () => undefined : (stryCov_9fa48("1165"), n => stryMutAct_9fa48("1168") ? n.id === id : stryMutAct_9fa48("1167") ? false : stryMutAct_9fa48("1166") ? true : (stryCov_9fa48("1166", "1167", "1168"), n.id !== id))))
    });
  }
}
export function setNotesLock(data: AppData, lock: NotesLock | undefined): AppData {
  if (stryMutAct_9fa48("1169")) {
    {}
  } else {
    stryCov_9fa48("1169");
    if (stryMutAct_9fa48("1172") ? false : stryMutAct_9fa48("1171") ? true : stryMutAct_9fa48("1170") ? lock : (stryCov_9fa48("1170", "1171", "1172"), !lock)) {
      if (stryMutAct_9fa48("1173")) {
        {}
      } else {
        stryCov_9fa48("1173");
        const {
          notesLock: _drop,
          ...rest
        } = data;
        return rest as AppData;
      }
    }
    return stryMutAct_9fa48("1174") ? {} : (stryCov_9fa48("1174"), {
      ...data,
      notesLock: lock
    });
  }
}
export function patchUtilityDocument(data: AppData, patch: Partial<Pick<UtilityDocument, 'body' | 'bodyFormat' | 'bodyPlainText'>>): AppData {
  if (stryMutAct_9fa48("1175")) {
    {}
  } else {
    stryCov_9fa48("1175");
    const prev: UtilityDocument = stryMutAct_9fa48("1176") ? data.utilityDocument && {
      body: '',
      updatedAt: nowIso()
    } : (stryCov_9fa48("1176"), data.utilityDocument ?? (stryMutAct_9fa48("1177") ? {} : (stryCov_9fa48("1177"), {
      body: stryMutAct_9fa48("1178") ? "Stryker was here!" : (stryCov_9fa48("1178"), ''),
      updatedAt: nowIso()
    })));
    return stryMutAct_9fa48("1179") ? {} : (stryCov_9fa48("1179"), {
      ...data,
      utilityDocument: stryMutAct_9fa48("1180") ? {} : (stryCov_9fa48("1180"), {
        ...prev,
        ...patch,
        updatedAt: nowIso()
      })
    });
  }
}
export function patchUtilityStructuredText(data: AppData, patch: Partial<Pick<UtilityStructuredText, 'content' | 'diffContent' | 'language'>>): AppData {
  if (stryMutAct_9fa48("1181")) {
    {}
  } else {
    stryCov_9fa48("1181");
    const prev: UtilityStructuredText = stryMutAct_9fa48("1182") ? data.utilityStructuredText && {
      content: '',
      language: 'json',
      updatedAt: nowIso()
    } : (stryCov_9fa48("1182"), data.utilityStructuredText ?? (stryMutAct_9fa48("1183") ? {} : (stryCov_9fa48("1183"), {
      content: stryMutAct_9fa48("1184") ? "Stryker was here!" : (stryCov_9fa48("1184"), ''),
      language: stryMutAct_9fa48("1185") ? "" : (stryCov_9fa48("1185"), 'json'),
      updatedAt: nowIso()
    })));
    const language = (stryMutAct_9fa48("1188") ? patch.language !== 'yaml' : stryMutAct_9fa48("1187") ? false : stryMutAct_9fa48("1186") ? true : (stryCov_9fa48("1186", "1187", "1188"), patch.language === (stryMutAct_9fa48("1189") ? "" : (stryCov_9fa48("1189"), 'yaml')))) ? stryMutAct_9fa48("1190") ? "" : (stryCov_9fa48("1190"), 'yaml') : (stryMutAct_9fa48("1193") ? patch.language !== 'json' : stryMutAct_9fa48("1192") ? false : stryMutAct_9fa48("1191") ? true : (stryCov_9fa48("1191", "1192", "1193"), patch.language === (stryMutAct_9fa48("1194") ? "" : (stryCov_9fa48("1194"), 'json')))) ? stryMutAct_9fa48("1195") ? "" : (stryCov_9fa48("1195"), 'json') : prev.language;
    return stryMutAct_9fa48("1196") ? {} : (stryCov_9fa48("1196"), {
      ...data,
      utilityStructuredText: stryMutAct_9fa48("1197") ? {} : (stryCov_9fa48("1197"), {
        ...prev,
        ...patch,
        language,
        updatedAt: nowIso()
      })
    });
  }
}
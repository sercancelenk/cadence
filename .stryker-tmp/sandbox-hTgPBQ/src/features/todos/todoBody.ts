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
import { plainTextFromBodyFields, type RichTextBodyFields } from '../../lib/richTextBody';
import type { TodoItem } from '../../model';
import type { SchedulePatch } from '../../components/ui/SchedulePopover';

/**
 * Bridge from the popover's tri-state patch shape (`undefined` =
 * untouched, `null` = clear, string = set) to our action layer's
 * shape, which treats `undefined` as "clear" already.
 */
export function schedulePatchToTodoPatch(patch: SchedulePatch): Partial<Pick<TodoItem, 'dueAt' | 'remindAt' | 'remindRepeat'>> {
  if (stryMutAct_9fa48("2498")) {
    {}
  } else {
    stryCov_9fa48("2498");
    const out: Partial<Pick<TodoItem, 'dueAt' | 'remindAt' | 'remindRepeat'>> = {};
    if (stryMutAct_9fa48("2501") ? patch.dueAt === undefined : stryMutAct_9fa48("2500") ? false : stryMutAct_9fa48("2499") ? true : (stryCov_9fa48("2499", "2500", "2501"), patch.dueAt !== undefined)) out.dueAt = stryMutAct_9fa48("2502") ? patch.dueAt && undefined : (stryCov_9fa48("2502"), patch.dueAt ?? undefined);
    if (stryMutAct_9fa48("2505") ? patch.remindAt === undefined : stryMutAct_9fa48("2504") ? false : stryMutAct_9fa48("2503") ? true : (stryCov_9fa48("2503", "2504", "2505"), patch.remindAt !== undefined)) out.remindAt = stryMutAct_9fa48("2506") ? patch.remindAt && undefined : (stryCov_9fa48("2506"), patch.remindAt ?? undefined);
    if (stryMutAct_9fa48("2509") ? patch.remindRepeat === undefined : stryMutAct_9fa48("2508") ? false : stryMutAct_9fa48("2507") ? true : (stryCov_9fa48("2507", "2508", "2509"), patch.remindRepeat !== undefined)) out.remindRepeat = stryMutAct_9fa48("2510") ? patch.remindRepeat && undefined : (stryCov_9fa48("2510"), patch.remindRepeat ?? undefined);
    return out;
  }
}
function stripTrailingSeparators(body: string): string {
  if (stryMutAct_9fa48("2511")) {
    {}
  } else {
    stryCov_9fa48("2511");
    return body.replace(stryMutAct_9fa48("2520") ? /(?:\s*\n)+\s*-{3,}\S*$/g : stryMutAct_9fa48("2519") ? /(?:\s*\n)+\s*-{3,}\s$/g : stryMutAct_9fa48("2518") ? /(?:\s*\n)+\s*-\s*$/g : stryMutAct_9fa48("2517") ? /(?:\s*\n)+\S*-{3,}\s*$/g : stryMutAct_9fa48("2516") ? /(?:\s*\n)+\s-{3,}\s*$/g : stryMutAct_9fa48("2515") ? /(?:\S*\n)+\s*-{3,}\s*$/g : stryMutAct_9fa48("2514") ? /(?:\s\n)+\s*-{3,}\s*$/g : stryMutAct_9fa48("2513") ? /(?:\s*\n)\s*-{3,}\s*$/g : stryMutAct_9fa48("2512") ? /(?:\s*\n)+\s*-{3,}\s*/g : (stryCov_9fa48("2512", "2513", "2514", "2515", "2516", "2517", "2518", "2519", "2520"), /(?:\s*\n)+\s*-{3,}\s*$/g), stryMutAct_9fa48("2521") ? "Stryker was here!" : (stryCov_9fa48("2521"), '')).replace(stryMutAct_9fa48("2524") ? /\S+$/g : stryMutAct_9fa48("2523") ? /\s$/g : stryMutAct_9fa48("2522") ? /\s+/g : (stryCov_9fa48("2522", "2523", "2524"), /\s+$/g), stryMutAct_9fa48("2525") ? "Stryker was here!" : (stryCov_9fa48("2525"), ''));
  }
}

/** Plain-text surface for search, AI, and legacy cleanup. */
export function legacyBodyPlainText(item: Pick<TodoItem, 'body' | 'bodyFormat' | 'bodyPlainText'>): string {
  if (stryMutAct_9fa48("2526")) {
    {}
  } else {
    stryCov_9fa48("2526");
    const plain = plainTextFromBodyFields(item);
    if (stryMutAct_9fa48("2529") ? item.bodyFormat !== 'prosemirror' : stryMutAct_9fa48("2528") ? false : stryMutAct_9fa48("2527") ? true : (stryCov_9fa48("2527", "2528", "2529"), item.bodyFormat === (stryMutAct_9fa48("2530") ? "" : (stryCov_9fa48("2530"), 'prosemirror')))) return plain;
    return stripTrailingSeparators(plain);
  }
}
export function itemToBodyFields(item: Pick<TodoItem, 'body' | 'bodyFormat' | 'bodyPlainText'>): RichTextBodyFields {
  if (stryMutAct_9fa48("2531")) {
    {}
  } else {
    stryCov_9fa48("2531");
    return stryMutAct_9fa48("2532") ? {} : (stryCov_9fa48("2532"), {
      body: stryMutAct_9fa48("2533") ? item.body && '' : (stryCov_9fa48("2533"), item.body ?? (stryMutAct_9fa48("2534") ? "Stryker was here!" : (stryCov_9fa48("2534"), ''))),
      bodyFormat: item.bodyFormat,
      bodyPlainText: item.bodyPlainText
    });
  }
}
export function todoHasBody(item: Pick<TodoItem, 'body' | 'bodyFormat' | 'bodyPlainText'>): boolean {
  if (stryMutAct_9fa48("2535")) {
    {}
  } else {
    stryCov_9fa48("2535");
    return stryMutAct_9fa48("2536") ? !plainTextFromBodyFields(item).trim() : (stryCov_9fa48("2536"), !(stryMutAct_9fa48("2537") ? plainTextFromBodyFields(item).trim() : (stryCov_9fa48("2537"), !(stryMutAct_9fa48("2538") ? plainTextFromBodyFields(item) : (stryCov_9fa48("2538"), plainTextFromBodyFields(item).trim())))));
  }
}
export function todoBodyPatchFromFields(fields: RichTextBodyFields): Partial<Pick<TodoItem, 'body' | 'bodyFormat' | 'bodyPlainText'>> {
  if (stryMutAct_9fa48("2539")) {
    {}
  } else {
    stryCov_9fa48("2539");
    if (stryMutAct_9fa48("2542") ? false : stryMutAct_9fa48("2541") ? true : stryMutAct_9fa48("2540") ? plainTextFromBodyFields(fields).trim() : (stryCov_9fa48("2540", "2541", "2542"), !(stryMutAct_9fa48("2543") ? plainTextFromBodyFields(fields) : (stryCov_9fa48("2543"), plainTextFromBodyFields(fields).trim())))) {
      if (stryMutAct_9fa48("2544")) {
        {}
      } else {
        stryCov_9fa48("2544");
        return stryMutAct_9fa48("2545") ? {} : (stryCov_9fa48("2545"), {
          body: stryMutAct_9fa48("2546") ? "Stryker was here!" : (stryCov_9fa48("2546"), '')
        });
      }
    }
    return stryMutAct_9fa48("2547") ? {} : (stryCov_9fa48("2547"), {
      body: fields.body,
      bodyFormat: fields.bodyFormat,
      bodyPlainText: fields.bodyPlainText
    });
  }
}
export type InlineAddDraft = {
  title: string;
  body: RichTextBodyFields;
};
export function emptyInlineAddDraft(): InlineAddDraft {
  if (stryMutAct_9fa48("2548")) {
    {}
  } else {
    stryCov_9fa48("2548");
    return stryMutAct_9fa48("2549") ? {} : (stryCov_9fa48("2549"), {
      title: stryMutAct_9fa48("2550") ? "Stryker was here!" : (stryCov_9fa48("2550"), ''),
      body: stryMutAct_9fa48("2551") ? {} : (stryCov_9fa48("2551"), {
        body: stryMutAct_9fa48("2552") ? "Stryker was here!" : (stryCov_9fa48("2552"), ''),
        bodyFormat: undefined,
        bodyPlainText: undefined
      })
    });
  }
}
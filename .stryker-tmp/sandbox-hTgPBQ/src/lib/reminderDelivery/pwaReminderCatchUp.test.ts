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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { collectPwaDeliveredSlotKeys, parseReminderNotificationTag } from './pwaReminderCatchUp';
describe(stryMutAct_9fa48("3121") ? "" : (stryCov_9fa48("3121"), 'parseReminderNotificationTag'), () => {
  if (stryMutAct_9fa48("3122")) {
    {}
  } else {
    stryCov_9fa48("3122");
    it(stryMutAct_9fa48("3123") ? "" : (stryCov_9fa48("3123"), 'parses cadence SW tags'), () => {
      if (stryMutAct_9fa48("3124")) {
        {}
      } else {
        stryCov_9fa48("3124");
        expect(parseReminderNotificationTag(stryMutAct_9fa48("3125") ? "" : (stryCov_9fa48("3125"), 'cadence:t1|2026-05-31T14:00:00.000Z'))).toEqual(stryMutAct_9fa48("3126") ? {} : (stryCov_9fa48("3126"), {
          itemId: stryMutAct_9fa48("3127") ? "" : (stryCov_9fa48("3127"), 't1'),
          remindAt: stryMutAct_9fa48("3128") ? "" : (stryCov_9fa48("3128"), '2026-05-31T14:00:00.000Z')
        }));
      }
    });
    it(stryMutAct_9fa48("3129") ? "" : (stryCov_9fa48("3129"), 'rejects unknown tags'), () => {
      if (stryMutAct_9fa48("3130")) {
        {}
      } else {
        stryCov_9fa48("3130");
        expect(parseReminderNotificationTag(stryMutAct_9fa48("3131") ? "" : (stryCov_9fa48("3131"), 'other:t1|x'))).toBeNull();
      }
    });
    it(stryMutAct_9fa48("3132") ? "" : (stryCov_9fa48("3132"), 'rejects tags without separator or empty parts'), () => {
      if (stryMutAct_9fa48("3133")) {
        {}
      } else {
        stryCov_9fa48("3133");
        expect(parseReminderNotificationTag(stryMutAct_9fa48("3134") ? "" : (stryCov_9fa48("3134"), 'cadence:only-id'))).toBeNull();
        expect(parseReminderNotificationTag(stryMutAct_9fa48("3135") ? "" : (stryCov_9fa48("3135"), 'cadence:|2026-01-01'))).toBeNull();
        expect(parseReminderNotificationTag(stryMutAct_9fa48("3136") ? "" : (stryCov_9fa48("3136"), 'cadence:id|'))).toBeNull();
      }
    });
  }
});
describe(stryMutAct_9fa48("3137") ? "" : (stryCov_9fa48("3137"), 'collectPwaDeliveredSlotKeys'), () => {
  if (stryMutAct_9fa48("3138")) {
    {}
  } else {
    stryCov_9fa48("3138");
    const originalNotification = globalThis.Notification;
    const originalNavigator = globalThis.navigator;
    beforeEach(() => {
      if (stryMutAct_9fa48("3139")) {
        {}
      } else {
        stryCov_9fa48("3139");
        vi.restoreAllMocks();
      }
    });
    afterEach(() => {
      if (stryMutAct_9fa48("3140")) {
        {}
      } else {
        stryCov_9fa48("3140");
        Object.defineProperty(globalThis, stryMutAct_9fa48("3141") ? "" : (stryCov_9fa48("3141"), 'Notification'), stryMutAct_9fa48("3142") ? {} : (stryCov_9fa48("3142"), {
          configurable: stryMutAct_9fa48("3143") ? false : (stryCov_9fa48("3143"), true),
          value: originalNotification
        }));
        Object.defineProperty(globalThis, stryMutAct_9fa48("3144") ? "" : (stryCov_9fa48("3144"), 'navigator'), stryMutAct_9fa48("3145") ? {} : (stryCov_9fa48("3145"), {
          configurable: stryMutAct_9fa48("3146") ? false : (stryCov_9fa48("3146"), true),
          value: originalNavigator
        }));
      }
    });
    function mockEnv(opts: {
      permission?: NotificationPermission;
      notifications?: Array<{
        tag?: string;
      }>;
      serviceWorker?: boolean;
      ready?: boolean;
    }) {
      if (stryMutAct_9fa48("3147")) {
        {}
      } else {
        stryCov_9fa48("3147");
        Object.defineProperty(globalThis, stryMutAct_9fa48("3148") ? "" : (stryCov_9fa48("3148"), 'Notification'), stryMutAct_9fa48("3149") ? {} : (stryCov_9fa48("3149"), {
          configurable: stryMutAct_9fa48("3150") ? false : (stryCov_9fa48("3150"), true),
          value: stryMutAct_9fa48("3151") ? {} : (stryCov_9fa48("3151"), {
            permission: stryMutAct_9fa48("3152") ? opts.permission && 'granted' : (stryCov_9fa48("3152"), opts.permission ?? (stryMutAct_9fa48("3153") ? "" : (stryCov_9fa48("3153"), 'granted')))
          })
        }));
        const getNotifications = vi.fn(stryMutAct_9fa48("3154") ? () => undefined : (stryCov_9fa48("3154"), async () => stryMutAct_9fa48("3155") ? opts.notifications && [] : (stryCov_9fa48("3155"), opts.notifications ?? (stryMutAct_9fa48("3156") ? ["Stryker was here"] : (stryCov_9fa48("3156"), [])))));
        const ready = (stryMutAct_9fa48("3159") ? opts.ready !== false : stryMutAct_9fa48("3158") ? false : stryMutAct_9fa48("3157") ? true : (stryCov_9fa48("3157", "3158", "3159"), opts.ready === (stryMutAct_9fa48("3160") ? true : (stryCov_9fa48("3160"), false)))) ? Promise.reject(new Error(stryMutAct_9fa48("3161") ? "" : (stryCov_9fa48("3161"), 'no sw'))) : Promise.resolve(stryMutAct_9fa48("3162") ? {} : (stryCov_9fa48("3162"), {
          getNotifications
        }));
        Object.defineProperty(globalThis, stryMutAct_9fa48("3163") ? "" : (stryCov_9fa48("3163"), 'navigator'), stryMutAct_9fa48("3164") ? {} : (stryCov_9fa48("3164"), {
          configurable: stryMutAct_9fa48("3165") ? false : (stryCov_9fa48("3165"), true),
          value: stryMutAct_9fa48("3166") ? {} : (stryCov_9fa48("3166"), {
            serviceWorker: (stryMutAct_9fa48("3169") ? opts.serviceWorker !== false : stryMutAct_9fa48("3168") ? false : stryMutAct_9fa48("3167") ? true : (stryCov_9fa48("3167", "3168", "3169"), opts.serviceWorker === (stryMutAct_9fa48("3170") ? true : (stryCov_9fa48("3170"), false)))) ? undefined : stryMutAct_9fa48("3171") ? {} : (stryCov_9fa48("3171"), {
              ready
            })
          })
        }));
      }
    }
    it(stryMutAct_9fa48("3172") ? "" : (stryCov_9fa48("3172"), 'returns empty when service worker is unavailable'), async () => {
      if (stryMutAct_9fa48("3173")) {
        {}
      } else {
        stryCov_9fa48("3173");
        Object.defineProperty(globalThis, stryMutAct_9fa48("3174") ? "" : (stryCov_9fa48("3174"), 'Notification'), stryMutAct_9fa48("3175") ? {} : (stryCov_9fa48("3175"), {
          configurable: stryMutAct_9fa48("3176") ? false : (stryCov_9fa48("3176"), true),
          value: stryMutAct_9fa48("3177") ? {} : (stryCov_9fa48("3177"), {
            permission: stryMutAct_9fa48("3178") ? "" : (stryCov_9fa48("3178"), 'granted')
          })
        }));
        Object.defineProperty(globalThis, stryMutAct_9fa48("3179") ? "" : (stryCov_9fa48("3179"), 'navigator'), stryMutAct_9fa48("3180") ? {} : (stryCov_9fa48("3180"), {
          configurable: stryMutAct_9fa48("3181") ? false : (stryCov_9fa48("3181"), true),
          value: {}
        }));
        await expect(collectPwaDeliveredSlotKeys()).resolves.toEqual(stryMutAct_9fa48("3182") ? ["Stryker was here"] : (stryCov_9fa48("3182"), []));
      }
    });
    it(stryMutAct_9fa48("3183") ? "" : (stryCov_9fa48("3183"), 'returns empty when notification permission is not granted'), async () => {
      if (stryMutAct_9fa48("3184")) {
        {}
      } else {
        stryCov_9fa48("3184");
        mockEnv(stryMutAct_9fa48("3185") ? {} : (stryCov_9fa48("3185"), {
          permission: stryMutAct_9fa48("3186") ? "" : (stryCov_9fa48("3186"), 'denied')
        }));
        await expect(collectPwaDeliveredSlotKeys()).resolves.toEqual(stryMutAct_9fa48("3187") ? ["Stryker was here"] : (stryCov_9fa48("3187"), []));
      }
    });
    it(stryMutAct_9fa48("3188") ? "" : (stryCov_9fa48("3188"), 'returns empty when service worker is not ready'), async () => {
      if (stryMutAct_9fa48("3189")) {
        {}
      } else {
        stryCov_9fa48("3189");
        mockEnv(stryMutAct_9fa48("3190") ? {} : (stryCov_9fa48("3190"), {
          ready: stryMutAct_9fa48("3191") ? true : (stryCov_9fa48("3191"), false)
        }));
        await expect(collectPwaDeliveredSlotKeys()).resolves.toEqual(stryMutAct_9fa48("3192") ? ["Stryker was here"] : (stryCov_9fa48("3192"), []));
      }
    });
    it(stryMutAct_9fa48("3193") ? "" : (stryCov_9fa48("3193"), 'collects slot keys for past-due cadence notifications'), async () => {
      if (stryMutAct_9fa48("3194")) {
        {}
      } else {
        stryCov_9fa48("3194");
        mockEnv(stryMutAct_9fa48("3195") ? {} : (stryCov_9fa48("3195"), {
          notifications: stryMutAct_9fa48("3196") ? [] : (stryCov_9fa48("3196"), [stryMutAct_9fa48("3197") ? {} : (stryCov_9fa48("3197"), {
            tag: stryMutAct_9fa48("3198") ? "" : (stryCov_9fa48("3198"), 'cadence:item-1|2020-01-01T10:00:00.000Z')
          }), stryMutAct_9fa48("3199") ? {} : (stryCov_9fa48("3199"), {
            tag: stryMutAct_9fa48("3200") ? "" : (stryCov_9fa48("3200"), 'cadence:item-2|2030-01-01T10:00:00.000Z')
          }), stryMutAct_9fa48("3201") ? {} : (stryCov_9fa48("3201"), {
            tag: stryMutAct_9fa48("3202") ? "" : (stryCov_9fa48("3202"), 'other:ignored|2020-01-01T10:00:00.000Z')
          }), stryMutAct_9fa48("3203") ? {} : (stryCov_9fa48("3203"), {
            tag: undefined
          })])
        }));
        const keys = await collectPwaDeliveredSlotKeys(new Date(stryMutAct_9fa48("3204") ? "" : (stryCov_9fa48("3204"), '2025-06-01T00:00:00.000Z')).getTime());
        expect(keys).toEqual(stryMutAct_9fa48("3205") ? [] : (stryCov_9fa48("3205"), [stryMutAct_9fa48("3206") ? "" : (stryCov_9fa48("3206"), 'item-1\u00012020-01-01T10:00:00.000Z')]));
      }
    });
    it(stryMutAct_9fa48("3207") ? "" : (stryCov_9fa48("3207"), 'ignores notifications whose remindAt is in the future'), async () => {
      if (stryMutAct_9fa48("3208")) {
        {}
      } else {
        stryCov_9fa48("3208");
        mockEnv(stryMutAct_9fa48("3209") ? {} : (stryCov_9fa48("3209"), {
          notifications: stryMutAct_9fa48("3210") ? [] : (stryCov_9fa48("3210"), [stryMutAct_9fa48("3211") ? {} : (stryCov_9fa48("3211"), {
            tag: stryMutAct_9fa48("3212") ? "" : (stryCov_9fa48("3212"), 'cadence:future|2099-01-01T10:00:00.000Z')
          })])
        }));
        const keys = await collectPwaDeliveredSlotKeys(Date.now());
        expect(keys).toEqual(stryMutAct_9fa48("3213") ? ["Stryker was here"] : (stryCov_9fa48("3213"), []));
      }
    });
    it(stryMutAct_9fa48("3214") ? "" : (stryCov_9fa48("3214"), 'ignores notifications with invalid remindAt timestamps'), async () => {
      if (stryMutAct_9fa48("3215")) {
        {}
      } else {
        stryCov_9fa48("3215");
        mockEnv(stryMutAct_9fa48("3216") ? {} : (stryCov_9fa48("3216"), {
          notifications: stryMutAct_9fa48("3217") ? [] : (stryCov_9fa48("3217"), [stryMutAct_9fa48("3218") ? {} : (stryCov_9fa48("3218"), {
            tag: stryMutAct_9fa48("3219") ? "" : (stryCov_9fa48("3219"), 'cadence:bad|not-a-date')
          })])
        }));
        const keys = await collectPwaDeliveredSlotKeys(Date.now());
        expect(keys).toEqual(stryMutAct_9fa48("3220") ? ["Stryker was here"] : (stryCov_9fa48("3220"), []));
      }
    });
  }
});
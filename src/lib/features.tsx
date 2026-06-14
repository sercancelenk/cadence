/**
 * Feature flag mimarisi — şirket içi (enterprise) ile public kullanım
 * arasında tek bir kod tabanından geçiş yapmamızı sağlayan tek doğru kaynak.
 *
 * Tasarım hedefi:
 *   - Cloud server ihtiyacı YOK. Her şey yerel: ya disk üzerindeki bir
 *     policy.json (IT departmanı / MDM yerleştirir), ya da kullanıcının
 *     onboarding'de seçtiği "Where will you use Cadence?" preset'i, ya da
 *     varsayılan ("personal", her şey açık).
 *   - Tek build, tek DMG, tek PWA — feature toggling runtime'da yapılır.
 *     Audit-edilebilir "tamamen sync-siz" binary istenirse Phase 2'de
 *     build flavor eklenecek; ama bugünkü gereksinim runtime gating.
 *   - Tüm sync/AI/export/update kod path'leri TEK noktadan (`useFeatures`)
 *     gating yapılır. Bir guard unutulursa enterprise binary'de UI sızar,
 *     bu yüzden bu modül "tip-driven" — Feature ekleyince TypeScript bütün
 *     callsite'ları hatırlatır.
 *
 * Precedence (en üstün → en zayıf):
 *   1. Electron policy.json (5-katmanlı disk araması; en sıkı path kazanır).
 *   2. Renderer-side override (DEV-only — production'da yok sayılır).
 *   3. Kullanıcının onboarding/Settings preset'i (localStorage).
 *   4. Varsayılan: `personal` preset (hepsi açık).
 *
 * Schema bütünlüğü:
 *   - `Features` tipi tüm feature toggle'ları enumere eder.
 *   - `PRESETS` 3 hazır kombinasyon — UI'da bunları gösteriyoruz.
 *   - `EffectiveFeatures` UI'a giden "son karar" objesi; managed=true ise
 *     kullanıcı düğmeyi değiştiremez, sadece görüntüler.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

// ───────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────

export type Features = {
  sync: {
    /**
     * Legacy LAN-sync flag. Same-Wi-Fi LAN sync has been removed; this field
     * is retained only so older `policy.json` files keep parsing. It no longer
     * gates any runtime capability.
     * @deprecated
     */
    lan: boolean;
    /** Cloud sync via Google Drive appdata folder. */
    cloud: boolean;
  };
  /** BYO-key AI assistant (calls OpenAI / Anthropic directly from renderer). */
  ai: boolean;
  /** Backup-as-file export from Settings → Backups & Recovery. */
  dataExport: boolean;
  /** Periodic + manual update check against GitHub Releases. */
  updateCheck: boolean;
};

export type PresetName = 'personal' | 'work-standard' | 'work-strict';

/**
 * Hazır preset'ler — onboarding'de + Settings'te bu üçünden biri seçilir.
 * Custom granular kontrol policy.json üzerinden mümkün; UI'da
 * "Advanced (custom policy active)" gibi bir badge ile gösteriliyor.
 */
export const PRESETS: Record<PresetName, Features> = {
  personal: {
    sync: { lan: true, cloud: true },
    ai: true,
    dataExport: true,
    updateCheck: true,
  },
  'work-standard': {
    // Şirket içi yaygın senaryo: cihazlar arası veri sızıntısı olmasın
    // (LAN + Cloud kapalı), ama kullanıcı yine de kendi BYO-key AI'ını
    // kullanabilir, backup alabilir, güncelleme alabilir.
    sync: { lan: false, cloud: false },
    ai: true,
    dataExport: true,
    updateCheck: true,
  },
  'work-strict': {
    // Sıkı şirket politikası: hiçbir dış servise data gitmesin.
    // AI yasak (LLM provider'larına şirket içeriği gönderilmesin),
    // export yasak (USB / kişisel email ile sızdırma engeli),
    // güncelleme yine açık — outdated app daha büyük güvenlik riski.
    sync: { lan: false, cloud: false },
    ai: false,
    dataExport: false,
    updateCheck: true,
  },
};

export const PRESET_LABELS: Record<PresetName, { title: string; description: string }> = {
  personal: {
    title: 'Personal',
    description:
      "Sync your data across devices (LAN or Google Drive), use AI assistance, and export backups. Best for your own laptop & phone.",
  },
  'work-standard': {
    title: 'Work — Standard',
    description:
      'Disable LAN and Cloud sync so your company data stays on this device. Keeps AI assistance and backup export available. Best for most company laptops.',
  },
  'work-strict': {
    title: 'Work — Strict',
    description:
      'Lock down all data-out paths: no sync, no AI providers, no exports. App updates still work so security patches arrive. Best for regulated industries.',
  },
};

/** Source of the currently active feature set. UI uses this to badge things. */
export type FeaturesSource =
  /** Disk'te policy.json yok; kullanıcı henüz preset seçmemiş → varsayılan. */
  | { kind: 'default' }
  /** localStorage'a yazılmış kullanıcı tercihi. */
  | { kind: 'user-preset'; preset: PresetName }
  /** policy.json'dan geliyor (granular veya preset). */
  | { kind: 'policy'; preset?: PresetName; path: string; managedBy?: string }
  /**
   * Compile-time build flavor (`CADENCE_DISTRIBUTION=enterprise`).
   *   - Behaves like a policy that the user cannot override.
   *   - A real on-disk policy.json may still loosen individual flags
   *     (recorded separately in `policyHint`) — useful when an IT team
   *     wants the locked-down binary AS WELL AS the ability to re-enable
   *     one specific capability (e.g. internal AI).
   */
  | { kind: 'distribution'; distribution: 'enterprise'; policyHint?: { path: string; managedBy?: string } };

/** Compile-time literal so dead-code-elimination can drop the unlocked branches. */
const IS_ENTERPRISE_BUILD = import.meta.env.CADENCE_DISTRIBUTION === 'enterprise';

export type EffectiveFeatures = {
  features: Features;
  /** True ise kullanıcı UI'dan değiştiremez (policy kilitli). */
  managed: boolean;
  source: FeaturesSource;
};

// ───────────────────────────────────────────────────────────────────────────
// Policy parsing — main process IPC'den gelen payload'ı validate eder.
// ───────────────────────────────────────────────────────────────────────────

export type PolicyPayload = {
  /** Hangi disk path'inde bulundu? UI'da "managed by your org" altında gösteriyoruz. */
  path: string;
  /** Görsel etiket: "ACME Corp IT", "MDM (Jamf)" gibi serbest metin. */
  managedBy?: string;
  /**
   * Ya 3 preset'ten biri ya da granular `features` objesi. İkisi de varsa
   * `features` granular olduğu için onu uyguluyoruz, preset adı sadece UI'a
   * "ACME Strict" gibi etiket çıkarma için kalıyor.
   */
  preset?: PresetName;
  /**
   * Granular override block. Every key (and every key inside `sync`) is
   * individually optional, so admins can express things like "use the
   * work-strict preset but re-enable AI" without having to restate the
   * other six flags.
   */
  features?: {
    sync?: { lan?: boolean; cloud?: boolean };
    ai?: boolean;
    dataExport?: boolean;
    updateCheck?: boolean;
  };
};

/**
 * Disk'ten gelen ham objeden tip-güvenli policy çıkarır. Tüm validasyon
 * burada — main process side'da JSON.parse yetiyor, ama renderer'a güvenli
 * şekilde aktarmak için iki tarafta da yapıyoruz.
 *
 * Returns `null` if the input cannot be interpreted as a policy — caller
 * then falls back to user-preset / default. Crashing here would lock the
 * user out of their workspace, which is unacceptable.
 */
export function parsePolicy(raw: unknown): PolicyPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const path = typeof o.path === 'string' ? o.path : '';
  if (!path) return null;
  const managedBy = typeof o.managedBy === 'string' ? o.managedBy : undefined;
  const preset =
    typeof o.preset === 'string' && (o.preset === 'personal' || o.preset === 'work-standard' || o.preset === 'work-strict')
      ? (o.preset as PresetName)
      : undefined;

  let features: PolicyPayload['features'] | undefined;
  if (o.features && typeof o.features === 'object') {
    const f = o.features as Record<string, unknown>;
    const out: PolicyPayload['features'] = {};
    if (f.sync && typeof f.sync === 'object') {
      const s = f.sync as Record<string, unknown>;
      out.sync = {};
      if (typeof s.lan === 'boolean') out.sync.lan = s.lan;
      if (typeof s.cloud === 'boolean') out.sync.cloud = s.cloud;
    }
    if (typeof f.ai === 'boolean') out.ai = f.ai;
    if (typeof f.dataExport === 'boolean') out.dataExport = f.dataExport;
    if (typeof f.updateCheck === 'boolean') out.updateCheck = f.updateCheck;
    if (Object.keys(out).length > 0) features = out;
  }

  if (!preset && !features) return null;
  return { path, managedBy, preset, features };
}

/**
 * Policy + user-preset + default'tan EffectiveFeatures üretir. Tüm
 * precedence kuralları buraya yazılı; testlerimiz sadece bu fonksiyonu
 * exercise ederek 4 katmanı da kapatıyor.
 *
 * Optional `opts.enterpriseBuild` short-circuits the entire resolution
 * to "work-strict, managed by build flavor" — set by `resolveFeatures()`
 * (or unit tests that want to simulate the locked build); the production
 * code path leans on the compile-time literal `IS_ENTERPRISE_BUILD` so
 * Vite can DCE the unlocked branches in the enterprise bundle.
 */
export function resolveFeatures(
  policy: PolicyPayload | null,
  userPreset: PresetName | null,
  opts: { enterpriseBuild?: boolean } = {},
): EffectiveFeatures {
  const enterprise = opts.enterpriseBuild ?? IS_ENTERPRISE_BUILD;

  if (enterprise) {
    // Lockdown base: work-strict. A policy file MAY still loosen individual
    // flags — that's the whole point of supporting both the build flavor
    // and a sidecar policy. (Tightening is also allowed, but redundant.)
    const base = PRESETS['work-strict'];
    const merged: Features = {
      sync: {
        lan: policy?.features?.sync?.lan ?? base.sync.lan,
        cloud: policy?.features?.sync?.cloud ?? base.sync.cloud,
      },
      ai: policy?.features?.ai ?? base.ai,
      dataExport: policy?.features?.dataExport ?? base.dataExport,
      updateCheck: policy?.features?.updateCheck ?? base.updateCheck,
    };
    return {
      features: merged,
      managed: true,
      source: {
        kind: 'distribution',
        distribution: 'enterprise',
        policyHint: policy ? { path: policy.path, managedBy: policy.managedBy } : undefined,
      },
    };
  }

  if (policy) {
    const basePreset: PresetName = policy.preset ?? 'work-standard';
    const base = PRESETS[basePreset];
    const merged: Features = {
      sync: {
        lan: policy.features?.sync?.lan ?? base.sync.lan,
        cloud: policy.features?.sync?.cloud ?? base.sync.cloud,
      },
      ai: policy.features?.ai ?? base.ai,
      dataExport: policy.features?.dataExport ?? base.dataExport,
      updateCheck: policy.features?.updateCheck ?? base.updateCheck,
    };
    return {
      features: merged,
      managed: true,
      source: {
        kind: 'policy',
        preset: policy.preset,
        path: policy.path,
        managedBy: policy.managedBy,
      },
    };
  }
  if (userPreset) {
    return {
      features: PRESETS[userPreset],
      managed: false,
      source: { kind: 'user-preset', preset: userPreset },
    };
  }
  return {
    features: PRESETS.personal,
    managed: false,
    source: { kind: 'default' },
  };
}

// ───────────────────────────────────────────────────────────────────────────
// React context
// ───────────────────────────────────────────────────────────────────────────

const USER_PRESET_KEY = 'cadence.features.userPreset.v1';

function readUserPreset(): PresetName | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const v = window.localStorage.getItem(USER_PRESET_KEY);
    if (v === 'personal' || v === 'work-standard' || v === 'work-strict') return v;
  } catch {
    /* ignore */
  }
  return null;
}

function writeUserPreset(p: PresetName | null) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    if (!p) window.localStorage.removeItem(USER_PRESET_KEY);
    else window.localStorage.setItem(USER_PRESET_KEY, p);
  } catch {
    /* ignore */
  }
}

type Ctx = EffectiveFeatures & {
  loading: boolean;
  /** Updates the user preset (no-op when policy is managed). */
  setPreset: (p: PresetName) => void;
  /** Has the user explicitly chosen a preset (i.e. completed the onboarding step)? */
  hasUserPreset: boolean;
};

const FeaturesCtx = createContext<Ctx | null>(null);

export function FeaturesProvider({ children }: { children: ReactNode }) {
  const [policy, setPolicy] = useState<PolicyPayload | null>(null);
  const [userPreset, setUserPresetState] = useState<PresetName | null>(() => readUserPreset());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const api = window.cadence;
      if (api?.policyGet) {
        try {
          const r = await api.policyGet();
          if (cancelled) return;
          setPolicy(r ? parsePolicy(r) : null);
        } catch {
          if (!cancelled) setPolicy(null);
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setPreset = useCallback((p: PresetName) => {
    writeUserPreset(p);
    setUserPresetState(p);
  }, []);

  const value = useMemo<Ctx>(() => {
    const eff = resolveFeatures(policy, userPreset);
    return {
      ...eff,
      loading,
      setPreset,
      hasUserPreset: userPreset !== null,
    };
  }, [policy, userPreset, loading, setPreset]);

  return <FeaturesCtx.Provider value={value}>{children}</FeaturesCtx.Provider>;
}

export function useFeatures(): Ctx {
  const v = useContext(FeaturesCtx);
  if (!v) {
    // Defansif fallback — tüm app FeaturesProvider içinde olmalı, ama
    // unit testler veya lazy-loaded preview'ler context dışından çağırabilir.
    // CRITICAL: even the fallback honours the compile-time enterprise
    // flag, so if a future code path mounts a component outside the
    // provider in the enterprise build we still don't quietly re-open
    // sync / AI / export. (For unit tests that need a specific fallback
    // they should wrap with `<FeaturesProvider>` instead.)
    const eff = resolveFeatures(null, null);
    return {
      ...eff,
      loading: false,
      setPreset: () => {},
      hasUserPreset: false,
    };
  }
  return v;
}

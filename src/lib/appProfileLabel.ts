import {
  PRESETS,
  PRESET_LABELS,
  type Features,
  type FeaturesSource,
  type PresetName,
} from './features';

export type AppProfileLabel = {
  /** Compact label for sidebar / home meta. */
  label: string;
  /** Badge text for Settings cards (may be longer). */
  badgeLabel: string;
  managed: boolean;
  preset: PresetName | 'custom';
};

function featuresEqual(a: Features, b: Features): boolean {
  return (
    a.sync.lan === b.sync.lan &&
    a.sync.cloud === b.sync.cloud &&
    a.ai === b.ai &&
    a.dataExport === b.dataExport &&
    a.updateCheck === b.updateCheck
  );
}

function matchPreset(features: Features): PresetName | 'custom' {
  for (const name of ['personal', 'work-standard', 'work-strict'] as PresetName[]) {
    if (featuresEqual(PRESETS[name], features)) return name;
  }
  return 'custom';
}

/**
 * When multiple presets share identical flags (personal ≈ work-standard after
 * cloud sync retirement), prefer the user's explicitly chosen preset name.
 */
function resolvePresetName(features: Features, source?: FeaturesSource): PresetName | 'custom' {
  const matched = matchPreset(features);
  if (matched === 'custom') return 'custom';
  if (source?.kind === 'user-preset' && featuresEqual(PRESETS[source.preset], features)) {
    return source.preset;
  }
  return matched;
}

function basePresetTitle(source: FeaturesSource | undefined): string | null {
  if (source?.kind === 'policy' && source.preset) {
    return PRESET_LABELS[source.preset].title;
  }
  if (source?.kind === 'user-preset') {
    return PRESET_LABELS[source.preset].title;
  }
  return null;
}

/** Resolve the active app profile label for shell surfaces and Settings badges. */
export function resolveAppProfileLabel(
  features: Features,
  managed: boolean,
  source?: FeaturesSource,
): AppProfileLabel {
  const preset = resolvePresetName(features, source);

  if (managed) {
    const base = basePresetTitle(source) ?? (preset !== 'custom' ? PRESET_LABELS[preset].title : null);
    return {
      label: base ? `Managed · ${base}` : 'Managed',
      badgeLabel: 'Managed by organization',
      managed: true,
      preset,
    };
  }

  if (preset === 'custom') {
    return { label: 'Custom', badgeLabel: 'Custom', managed: false, preset };
  }

  const title = PRESET_LABELS[preset].title;
  return { label: title, badgeLabel: title, managed: false, preset };
}

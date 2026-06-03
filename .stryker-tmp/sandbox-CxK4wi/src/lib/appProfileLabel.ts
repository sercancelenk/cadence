// @ts-nocheck
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

function matchPreset(features: Features): PresetName | 'custom' {
  for (const name of ['personal', 'work-standard', 'work-strict'] as PresetName[]) {
    const p = PRESETS[name];
    if (
      p.sync.lan === features.sync.lan &&
      p.sync.cloud === features.sync.cloud &&
      p.ai === features.ai &&
      p.dataExport === features.dataExport &&
      p.updateCheck === features.updateCheck
    ) {
      return name;
    }
  }
  return 'custom';
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
  const preset = matchPreset(features);

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

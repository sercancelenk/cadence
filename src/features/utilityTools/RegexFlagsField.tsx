import { useMemo } from 'react';
import {
  REGEX_FLAG_OPTIONS,
  REGEX_FLAG_PRESETS,
  type RegexFlagId,
} from '../../lib/utilityTools/regexTester';

type Props = {
  value: string;
  onChange: (next: string) => void;
};

const ALLOWED = new Set(['g', 'i', 'm', 's', 'u', 'y', 'd']);

function normalizeFlagChars(raw: string): string {
  const seen = new Set<string>();
  for (const ch of raw) {
    if (ALLOWED.has(ch)) seen.add(ch);
  }
  return [...seen].sort().join('');
}

function toggleFlag(current: string, id: RegexFlagId): string {
  const set = new Set(normalizeFlagChars(current).split('').filter(Boolean));
  if (set.has(id)) set.delete(id);
  else set.add(id);
  return [...set].sort().join('');
}

/**
 * Flags control: preset dropdown, per-flag chips with tooltips, and a freeform input.
 */
export function RegexFlagsField({ value, onChange }: Props) {
  const normalized = useMemo(() => normalizeFlagChars(value), [value]);
  const presetValue = useMemo(() => {
    const hit = REGEX_FLAG_PRESETS.find((p) => p.value !== 'custom' && p.value === normalized);
    return hit ? hit.value : 'custom';
  }, [normalized]);

  return (
    <div className="utilities-tools-flags">
      <label className="utilities-tools-field utilities-tools-field--narrow">
        <span>Flags preset</span>
        <select
          className="utilities-tools-input utilities-tools-select"
          value={presetValue}
          onChange={(e) => {
            const v = e.target.value;
            if (v === 'custom') return;
            onChange(v);
          }}
          aria-label="Regex flags preset"
        >
          {REGEX_FLAG_PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </label>

      <div className="utilities-tools-flags__chips" role="group" aria-label="Toggle regex flags">
        {REGEX_FLAG_OPTIONS.map((f) => {
          const on = normalized.includes(f.id);
          return (
            <button
              key={f.id}
              type="button"
              className={`utilities-tools-flag-chip${on ? ' utilities-tools-flag-chip--on' : ''}`}
              title={`${f.id} — ${f.name}: ${f.tip}`}
              aria-pressed={on}
              aria-label={`${f.id}: ${f.name}. ${f.tip}`}
              onClick={() => onChange(toggleFlag(value, f.id))}
            >
              {f.id}
            </button>
          );
        })}
      </div>

      <label className="utilities-tools-field utilities-tools-field--narrow">
        <span>Flags (custom)</span>
        <input
          className="utilities-tools-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          placeholder="gi"
          title="Type any combination of g i m s u y d, or use the chips / preset above."
          aria-label="Custom regex flags"
        />
      </label>
    </div>
  );
}

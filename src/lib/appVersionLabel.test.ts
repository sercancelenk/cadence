import { describe, expect, it } from 'vitest';
import { computeCalVerVersion, formatAppVersion } from './appVersionLabel';

describe('formatAppVersion', () => {
  it('formats a CalVer version as "<Month> <Year>" with the build number', () => {
    const r = formatAppVersion('2026.7.72');
    expect(r.isCalVer).toBe(true);
    expect(r.label).toBe('July 2026');
    expect(r.build).toBe(72);
    expect(r.raw).toBe('2026.7.72');
  });

  it('handles every month without leading-zero padding', () => {
    expect(formatAppVersion('2026.1.1').label).toBe('January 2026');
    expect(formatAppVersion('2026.12.999').label).toBe('December 2026');
  });

  it('handles year rollover as a larger, later label', () => {
    expect(formatAppVersion('2027.1.3').label).toBe('January 2027');
  });

  it('strips build metadata / prerelease suffixes before parsing', () => {
    expect(formatAppVersion('2026.7.72+abcdef').label).toBe('July 2026');
    expect(formatAppVersion('v2026.7.72').label).toBe('July 2026');
  });

  it('falls back to "v<raw>" for classic semver (dev builds)', () => {
    const r = formatAppVersion('0.2.0');
    expect(r.isCalVer).toBe(false);
    expect(r.label).toBe('v0.2.0');
    expect(r.build).toBeNull();
  });

  it('does not treat a low major (1.x) as a CalVer year', () => {
    expect(formatAppVersion('1.4.0').isCalVer).toBe(false);
    expect(formatAppVersion('1.4.0').label).toBe('v1.4.0');
  });

  it('rejects an out-of-range month and falls back safely', () => {
    const r = formatAppVersion('2026.13.1');
    expect(r.isCalVer).toBe(false);
    expect(r.label).toBe('v2026.13.1');
  });

  it('never throws on empty / nullish / garbage input', () => {
    expect(formatAppVersion('').label).toBe('—');
    expect(formatAppVersion(null).label).toBe('—');
    expect(formatAppVersion(undefined).label).toBe('—');
    expect(formatAppVersion('not-a-version').isCalVer).toBe(false);
  });

  it('round-trips with computeCalVerVersion (producer <-> UI formatter stay in sync)', () => {
    const date = new Date(Date.UTC(2026, 6, 15)); // July 2026
    const version = computeCalVerVersion(date, 72);
    expect(version).toBe('2026.7.72');
    const parsed = formatAppVersion(version);
    expect(parsed.isCalVer).toBe(true);
    expect(parsed.label).toBe('July 2026');
    expect(parsed.build).toBe(72);

    // Any month the producer emits must parse back to a valid CalVer label.
    for (let m = 0; m < 12; m += 1) {
      const v = computeCalVerVersion(new Date(Date.UTC(2026, m, 1)), 5);
      expect(formatAppVersion(v).isCalVer).toBe(true);
    }
  });

  it('computeCalVerVersion is strictly greater than the legacy 0.3.x line', () => {
    const v = computeCalVerVersion(new Date(Date.UTC(2026, 6, 1)), 72);
    const [maj] = v.split('.').map(Number);
    expect(maj).toBeGreaterThan(0); // 2026 > 0 -> upgrade for every legacy client
  });

  it('computeCalVerVersion rejects invalid build numbers', () => {
    expect(() => computeCalVerVersion(new Date(), -1)).toThrow();
    expect(() => computeCalVerVersion(new Date(), 1.5)).toThrow();
  });
});

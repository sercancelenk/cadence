import { describe, expect, it } from 'vitest';

type Pkg = { name?: string; repository?: { url?: string }; build?: { publish?: Array<Record<string, unknown>> } };

async function load() {
  const patchPath = '../../scripts/patch-publish.mjs';
  const versionPath = '../../scripts/release-version.mjs';
  const patch = (await import(/* @vite-ignore */ patchPath)) as unknown as {
    patchPublish: (pkg: Pkg, o: { owner: string; channel?: string }) => Pkg;
  };
  const version = (await import(/* @vite-ignore */ versionPath)) as unknown as {
    isReleaseVersion: (v: string) => boolean;
    isBetaVersion: (v: string) => boolean;
    compareReleaseCores: (a: string, b: string) => number;
  };
  return { ...patch, ...version };
}

const basePkg = (): Pkg => ({
  name: 'cadence',
  repository: { url: 'https://github.com/YOUR_GITHUB_USERNAME/cadence.git' },
  build: { publish: [{ provider: 'github', owner: 'someone', repo: 'cadence', releaseType: 'release' }] },
});

describe('patch-publish', () => {
  it('points the feed at the repository owner and publishes a normal release', async () => {
    const { patchPublish } = await load();
    const out = patchPublish(basePkg(), { owner: 'sercancelenk' });
    expect(out.build?.publish?.[0]).toMatchObject({ owner: 'sercancelenk', releaseType: 'release' });
    expect(out.build?.publish?.[0]).not.toHaveProperty('channel');
    expect(out.repository?.url).toContain('sercancelenk');
  });

  it('publishes a beta as a GitHub prerelease on its own update channel', async () => {
    const { patchPublish } = await load();
    const out = patchPublish(basePkg(), { owner: 'sercancelenk', channel: 'beta' });
    expect(out.build?.publish?.[0]).toMatchObject({ releaseType: 'prerelease', channel: 'beta' });
  });

  it('a stable run undoes an earlier beta setting instead of inheriting it', async () => {
    const { patchPublish } = await load();
    const beta = patchPublish(basePkg(), { owner: 'o', channel: 'beta' });
    const stable = patchPublish(beta, { owner: 'o', channel: 'stable' });
    expect(stable.build?.publish?.[0]).toMatchObject({ releaseType: 'release' });
    expect(stable.build?.publish?.[0]).not.toHaveProperty('channel');
  });

  it('refuses a channel it does not know, and a package without a publish target', async () => {
    const { patchPublish } = await load();
    expect(() => patchPublish(basePkg(), { owner: 'o', channel: 'nightly' })).toThrow(/channel/i);
    expect(() => patchPublish({ build: {} }, { owner: 'o' })).toThrow(/publish/i);
  });
});

describe('release version rules', () => {
  it('accepts a release and a beta, and nothing else', async () => {
    const { isReleaseVersion, isBetaVersion } = await load();
    expect(isReleaseVersion('2026.10.150')).toBe(true);
    expect(isReleaseVersion('2026.10.150-beta.1')).toBe(true);
    for (const bad of ['2026.10', '2026.10.150-rc.1', '2026.10.150-beta', '2026.10.150+abc', 'v2026.10.150', '']) {
      expect(isReleaseVersion(bad)).toBe(false);
    }
    expect(isBetaVersion('2026.10.150-beta.1')).toBe(true);
    expect(isBetaVersion('2026.10.150')).toBe(false);
  });

  it('compares the numeric cores, so a beta of a newer build counts as newer than the last release', async () => {
    const { compareReleaseCores } = await load();
    expect(compareReleaseCores('2026.10.151-beta.1', 'v2026.10.150')).toBeGreaterThan(0);
    expect(compareReleaseCores('2026.10.150-beta.1', 'v2026.10.150')).toBe(0);
    expect(compareReleaseCores('2026.10.149-beta.1', 'v2026.10.150')).toBeLessThan(0);
    expect(compareReleaseCores('2026.10.x', '2026.10.1')).toBeNaN();
  });
});

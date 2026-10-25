/**
 * CI: package.json içindeki build.publish[0] alanlarını yayın hedefine göre yazar.
 *   owner       repository sahibi
 *   channel     stable (varsayılan): normal release, `latest` güncelleme kanalı
 *               beta: GitHub "pre-release" + `beta` kanalı (yalnızca beta kurulu uygulamalar görür)
 * Kullanım: node scripts/patch-publish.mjs <github_owner> [stable|beta]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * @param {{ name?: string, repository?: { url?: string }, build?: { publish?: Array<Record<string, unknown>> } }} pkg
 * @param {{ owner: string, channel?: string }} options
 */
export function patchPublish(pkg, { owner, channel = 'stable' }) {
  if (channel !== 'stable' && channel !== 'beta') {
    throw new Error(`unknown channel "${channel}" (expected stable or beta)`);
  }
  const target = pkg.build?.publish?.[0];
  if (!target) throw new Error('package.json build.publish[0] bulunamadı (no publish target)');
  target.owner = owner;
  if (channel === 'beta') {
    // electron-updater: an install that is itself a beta sees prereleases; a stable install never does.
    target.releaseType = 'prerelease';
    target.channel = 'beta';
  } else {
    target.releaseType = 'release';
    delete target.channel;
  }
  if (pkg.repository?.url && pkg.repository.url.includes('YOUR_GITHUB_USERNAME')) {
    pkg.repository.url = `https://github.com/${owner}/${pkg.name}.git`;
  }
  return pkg;
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (invokedDirectly) {
  const owner = process.argv[2];
  const channel = process.argv[3] ?? 'stable';
  if (!owner) {
    console.error('Kullanım: node scripts/patch-publish.mjs <github_owner> [stable|beta]');
    process.exit(1);
  }
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const pkgPath = path.join(root, 'package.json');
  try {
    const pkg = patchPublish(JSON.parse(fs.readFileSync(pkgPath, 'utf8')), { owner, channel });
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
  console.log('publish.owner ->', owner, '| channel ->', channel);
}

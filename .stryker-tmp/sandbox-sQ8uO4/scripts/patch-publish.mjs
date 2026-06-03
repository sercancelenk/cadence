/**
 * CI: package.json içindeki build.publish[0].owner alanını repository sahibiyle yazar.
 * Kullanım: node scripts/patch-publish.mjs <github_owner>
 */
// @ts-nocheck

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const owner = process.argv[2];
if (!owner) {
  console.error('Kullanım: node scripts/patch-publish.mjs <github_owner>');
  process.exit(1);
}

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkgPath = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
if (!pkg.build?.publish?.[0]) {
  console.error('package.json build.publish[0] bulunamadı');
  process.exit(1);
}
pkg.build.publish[0].owner = owner;
if (pkg.repository?.url && pkg.repository.url.includes('YOUR_GITHUB_USERNAME')) {
  pkg.repository.url = `https://github.com/${owner}/${pkg.name}.git`;
}
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
console.log('publish.owner ->', owner);

#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Rasterises public/icon.svg into every PNG size the app needs:
 *
 *   PWA / web (`public/`):
 *     - icon-192.png            manifest, "any" purpose
 *     - icon-512.png            manifest, "any" purpose, splash source
 *     - icon-maskable-512.png   manifest, "maskable" purpose (safe-zone padding)
 *     - apple-touch-icon.png    180×180, iOS home-screen pin
 *     - favicon-32.png          browser tab
 *
 *   Electron desktop (`build/`):
 *     - icon.png                1024×1024, picked up by electron-builder to
 *                               auto-derive the platform-specific bundle
 *                               icon (macOS .icns / Windows .ico / Linux PNG).
 *                               Without this file the DMG / installer ships
 *                               the default Electron globe icon.
 *
 * Run after editing icon.svg:
 *   npm run icons
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'public', 'icon.svg');

async function main() {
  const svg = await readFile(src);

  const targets = [
    { dir: 'public', out: 'icon-192.png', size: 192 },
    { dir: 'public', out: 'icon-512.png', size: 512 },
    { dir: 'public', out: 'apple-touch-icon.png', size: 180 },
    { dir: 'public', out: 'favicon-32.png', size: 32 },
    // electron-builder reads `build/icon.png` (>= 512×512) by default and
    // generates platform-specific bundle icons from it. We render at
    // 1024×1024 so the macOS retina icon stays crisp.
    { dir: 'build', out: 'icon.png', size: 1024 },
  ];

  for (const t of targets) {
    const dirPath = join(root, t.dir);
    await mkdir(dirPath, { recursive: true });
    const buf = await sharp(svg, { density: 384 })
      .resize(t.size, t.size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    await writeFile(join(dirPath, t.out), buf);
    console.log(`✓ ${t.dir}/${t.out} (${t.size}×${t.size})`);
  }

  // Maskable icon: 512×512 with 10% safe-zone padding all around so the OS
  // can crop it into a circle/squircle without clipping the mark. The
  // background colour must match the icon's plate so the safe-zone padding
  // blends with the artwork instead of revealing a coloured border ring.
  // Current plate is the `#fef3c7` cream from icon.svg → keep these in sync.
  const inner = 410;
  const maskable = await sharp({
    create: { width: 512, height: 512, channels: 4, background: { r: 254, g: 243, b: 199, alpha: 1 } },
  })
    .composite([
      {
        input: await sharp(svg, { density: 512 }).resize(inner, inner).png().toBuffer(),
        gravity: 'center',
      },
    ])
    .png()
    .toBuffer();
  await writeFile(join(root, 'public', 'icon-maskable-512.png'), maskable);
  console.log('✓ icon-maskable-512.png (512×512, maskable safe-zone)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

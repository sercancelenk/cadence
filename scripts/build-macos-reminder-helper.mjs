#!/usr/bin/env node
/**
 * Compile the macOS reminder helper (UserNotifications scheduled delivery).
 * Requires Xcode CLI tools (`swiftc`) on macOS.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const src = path.join(root, 'electron/reminder/native/main.swift');
const outDir = path.join(root, 'electron/reminder/native');
const out = path.join(outDir, 'cadence-notify-schedule');
const outX64 = path.join(outDir, 'cadence-notify-schedule-x64');
const outArm64 = path.join(outDir, 'cadence-notify-schedule-arm64');

const swiftArgs = [
  '-O',
  src,
  '-framework',
  'UserNotifications',
  '-framework',
  'Foundation',
  '-framework',
  'AppKit',
];

function buildUniversalHelper() {
  execFileSync('swiftc', [...swiftArgs, '-target', 'x86_64-apple-macos12.0', '-o', outX64], {
    stdio: 'inherit',
  });
  execFileSync('swiftc', [...swiftArgs, '-target', 'arm64-apple-macos12.0', '-o', outArm64], {
    stdio: 'inherit',
  });
  execFileSync('lipo', ['-create', '-output', out, outX64, outArm64], { stdio: 'inherit' });
  fs.unlinkSync(outX64);
  fs.unlinkSync(outArm64);
}

function buildNativeHelper() {
  execFileSync('swiftc', ['-O', '-o', out, ...swiftArgs.slice(1)], { stdio: 'inherit' });
}

if (process.platform !== 'darwin') {
  console.log('[cadence] skip reminder helper build (not macOS)');
  process.exit(0);
}

if (!fs.existsSync(src)) {
  console.error('[cadence] missing', src);
  process.exit(1);
}

try {
  // Release universal builds copy the same helper into x64 and arm64 slices;
  // ship a fat binary so @electron/universal can keep one copy via x64ArchFiles.
  const wantUniversal = process.env.CI === 'true' || process.env.CADENCE_UNIVERSAL_HELPER === '1';
  if (wantUniversal) {
    buildUniversalHelper();
  } else {
    try {
      buildUniversalHelper();
    } catch {
      console.warn('[cadence] universal helper build failed; falling back to native arch only');
      buildNativeHelper();
    }
  }
  fs.chmodSync(out, 0o755);
  console.log('[cadence] built', out);
} catch (err) {
  console.error('[cadence] swiftc failed — install Xcode Command Line Tools');
  process.exit(typeof err.status === 'number' ? err.status : 1);
}

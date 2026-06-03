#!/usr/bin/env node
// @ts-nocheck
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

if (process.platform !== 'darwin') {
  console.log('[cadence] skip reminder helper build (not macOS)');
  process.exit(0);
}

if (!fs.existsSync(src)) {
  console.error('[cadence] missing', src);
  process.exit(1);
}

try {
  execFileSync(
    'swiftc',
    ['-O', '-o', out, src, '-framework', 'UserNotifications', '-framework', 'Foundation', '-framework', 'AppKit'],
    { stdio: 'inherit' },
  );
  fs.chmodSync(out, 0o755);
  console.log('[cadence] built', out);
} catch (err) {
  console.error('[cadence] swiftc failed — install Xcode Command Line Tools');
  process.exit(typeof err.status === 'number' ? err.status : 1);
}

#!/usr/bin/env node
/**
 * Preflight checks for desktop release builds.
 * Run on macOS after build:reminder-helper; run on any OS before packaging.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { minimatch } from 'minimatch';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkHelper = process.argv.includes('--check-helper');

let failed = false;
const fail = (msg) => {
  console.error('✗', msg);
  failed = true;
};
const ok = (msg) => console.log('✓', msg);

function readJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(root, relPath), 'utf8'));
}

const MAC_HELPER_EXTRA_TO = 'MacOS/helpers/cadence-notify-schedule';
const MAC_HELPER_BINARY = 'Contents/MacOS/helpers/cadence-notify-schedule';

function validateMacBlock(label, mac) {
  if (!mac) {
    fail(`${label}: missing mac config`);
    return;
  }
  if (mac.bin) {
    fail(`${label}: mac.bin is invalid in electron-builder 25 — use extraFiles + binaries`);
  }
  const hasHelperExtra = mac.extraFiles?.some((f) => f.to === MAC_HELPER_EXTRA_TO);
  if (!hasHelperExtra) {
    fail(
      `${label}: mac.extraFiles must copy cadence-notify-schedule into ${MAC_HELPER_EXTRA_TO} (signing order)`,
    );
  }
  if (!mac.binaries?.includes(MAC_HELPER_BINARY)) {
    fail(`${label}: mac.binaries must list helper for signing/notarization`);
  }
  const pattern = mac.x64ArchFiles;
  if (!pattern) {
    fail(`${label}: mac.x64ArchFiles is required for universal packaging`);
  } else if (!minimatch(MAC_HELPER_BINARY, pattern, { matchBase: true })) {
    fail(`${label}: x64ArchFiles "${pattern}" does not match ${MAC_HELPER_BINARY}`);
  } else {
    ok(`${label}: mac universal helper config`);
  }
}

function validateWinBlock(label, win) {
  if (!win?.extraFiles?.some((f) => f.from?.includes('cadence-notify-schedule.exe'))) {
    fail(`${label}: win.extraFiles must bundle cadence-notify-schedule.exe`);
  } else {
    ok(`${label}: win helper extraFiles`);
  }
}

validateMacBlock('package.json', readJson('package.json').build?.mac);
validateWinBlock('package.json', readJson('package.json').build?.win);
validateMacBlock('electron-builder.enterprise.json', readJson('electron-builder.enterprise.json').mac);
validateWinBlock('electron-builder.enterprise.json', readJson('electron-builder.enterprise.json').win);

const programCs = fs.readFileSync(
  path.join(root, 'electron/reminder/native-windows/Program.cs'),
  'utf8',
);
if (programCs.includes('GetFutureScheduledToastNotificationsCollection')) {
  fail('Program.cs uses unsupported GetFutureScheduledToastNotificationsCollection');
} else if (!programCs.includes('GetScheduledToastNotifications()')) {
  fail('Program.cs must list pending toasts via ToastNotifier.GetScheduledToastNotifications()');
} else {
  ok('Windows Program.cs toast APIs');
}

const scheduler = fs.readFileSync(
  path.join(root, 'electron/reminder/inProcessScheduler.cjs'),
  'utf8',
);
if (/^const \{ Notification \} = require\('electron'\)/m.test(scheduler)) {
  fail('inProcessScheduler.cjs eagerly requires electron — CI unit tests will fail');
} else {
  ok('inProcessScheduler lazy electron load');
}

if (!fs.existsSync(path.join(root, 'build/entitlements.mac.plist'))) {
  fail('build/entitlements.mac.plist missing');
} else {
  ok('mac entitlements plist');
}

if (checkHelper && process.platform === 'darwin') {
  const helper = path.join(root, 'electron/reminder/native/cadence-notify-schedule');
  if (!fs.existsSync(helper)) {
    fail('macOS helper missing — run npm run build:reminder-helper with CI=true');
  } else {
    try {
      const info = execFileSync('lipo', ['-info', helper], { encoding: 'utf8' }).trim();
      if (!info.includes('x86_64') || !info.includes('arm64')) {
        fail(`macOS helper must be a universal fat binary for release: ${info}`);
      } else {
        ok(`macOS helper binary: ${info}`);
      }
    } catch {
      fail('could not inspect macOS helper with lipo');
    }
  }
}

if (checkHelper && process.platform === 'win32') {
  const exe = path.join(root, 'electron/reminder/native-windows/out/cadence-notify-schedule.exe');
  if (!fs.existsSync(exe)) {
    fail('Windows helper missing — run npm run build:reminder-helper-win');
  } else {
    ok('Windows helper exe present');
  }
}

if (failed) {
  console.error('\nRelease preflight failed.');
  process.exit(1);
}

console.log('\nRelease preflight passed.');

#!/usr/bin/env node
// @ts-nocheck
/**
 * Compile the Windows reminder helper (ScheduledToastNotification delivery).
 * Requires .NET SDK on Windows.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const projectDir = path.join(root, 'electron/reminder/native-windows');
const outDir = path.join(projectDir, 'out');

if (process.platform !== 'win32') {
  console.log('[cadence] skip windows reminder helper build (not Windows)');
  process.exit(0);
}

if (!fs.existsSync(path.join(projectDir, 'CadenceNotifySchedule.csproj'))) {
  console.error('[cadence] missing Windows reminder helper project');
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

try {
  execFileSync(
    'dotnet',
    [
      'publish',
      projectDir,
      '-c',
      'Release',
      '-r',
      'win-x64',
      '--self-contained',
      'true',
      '/p:PublishSingleFile=true',
      '-o',
      outDir,
    ],
    { stdio: 'inherit' },
  );
  console.log('[cadence] built', path.join(outDir, 'cadence-notify-schedule.exe'));
} catch (err) {
  console.error('[cadence] dotnet publish failed — install .NET 8 SDK on Windows');
  process.exit(typeof err.status === 'number' ? err.status : 1);
}

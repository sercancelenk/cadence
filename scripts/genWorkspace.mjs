#!/usr/bin/env node
/**
 * Write a deterministic synthetic workspace JSON for performance testing.
 *
 * The output is a plain workspace snapshot in the same shape the app exports,
 * so it can be imported into a SCRATCH account via Settings → Backups &
 * Recovery. Never import it into an account that holds real notes: import
 * replaces the workspace.
 *
 * Usage:
 *   node scripts/genWorkspace.mjs --notes 1000 --todos 1000 --out /tmp/ws.json
 *   node scripts/genWorkspace.mjs --preset large
 *
 * Presets: small (100/100), medium (1000/1000), large (5000/5000).
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createSyntheticWorkspace } = require('../electron/persistence/syntheticWorkspace.cjs');

const PRESETS = {
  small: { notes: 100, todoItems: 100 },
  medium: { notes: 1000, todoItems: 1000 },
  large: { notes: 5000, todoItems: 5000 },
};

function parseArgs(argv) {
  /** @type {Record<string, string>} */
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      args[key] = 'true';
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function readCount(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(
    [
      'Usage: node scripts/genWorkspace.mjs [--preset small|medium|large]',
      '                                     [--notes N] [--todos N]',
      '                                     [--paragraphs N] [--seed N]',
      '                                     [--out FILE]',
    ].join('\n'),
  );
  process.exit(0);
}

const preset = PRESETS[args.preset ?? 'medium'];
if (!preset) {
  console.error(`Unknown preset "${args.preset}". Use one of: ${Object.keys(PRESETS).join(', ')}`);
  process.exit(1);
}

const options = {
  notes: readCount(args.notes, preset.notes),
  todoItems: readCount(args.todos, preset.todoItems),
  paragraphsPerNote: readCount(args.paragraphs, 6),
  seed: readCount(args.seed, 1337),
};

const workspace = createSyntheticWorkspace(options);
const json = JSON.stringify(workspace);

const outPath = path.resolve(
  args.out ?? `cadence-synthetic-${options.notes}n-${options.todoItems}t.json`,
);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, json, 'utf8');

const megabytes = (Buffer.byteLength(json, 'utf8') / (1024 * 1024)).toFixed(2);
console.log(
  `Wrote ${options.notes} notes + ${options.todoItems} todos (${megabytes} MB) to ${outPath}`,
);
console.log('Import into a SCRATCH account only — import replaces the workspace.');

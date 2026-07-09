#!/usr/bin/env node
/**
 * Pre-deploy environment health check.
 *
 * Run with `npm run check:env` before publishing a production build.
 * The script verifies the configuration that downstream code expects
 * but cannot enforce at TypeScript level (Vite resolves them at build
 * time and a missing value would silently produce a broken feature).
 *
 * Exit codes:
 *   0 — all checks passed, ship it.
 *   1 — at least one critical check failed.
 *
 * Soft warnings are printed but do not fail the script — those are
 * "we'd prefer you set this" rather than "the app will not work".
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

let failed = 0;
let warned = 0;

function ok(msg) {
  console.log(`  \u2713 ${msg}`);
}
function fail(msg) {
  console.log(`  \u2717 ${msg}`);
  failed++;
}
function warn(msg) {
  console.log(`  ! ${msg}`);
  warned++;
}
function section(name) {
  console.log(`\n${name}`);
}

// --------------------------------------------------------------- Node version

section('Node runtime');
{
  const v = process.versions.node;
  const major = Number(v.split('.')[0]);
  if (major >= 20) ok(`Node ${v}`);
  else fail(`Node ${v} — need >= 20 (see package.json engines).`);
}

// --------------------------------------------------------------- Files we ship

section('Required source files');
const requiredFiles = [
  'README.md',
  'PRIVACY.md',
  'TERMS.md',
  'package.json',
  'vite.config.ts',
  '.env.example',
];
for (const f of requiredFiles) {
  if (fs.existsSync(path.join(root, f))) ok(f);
  else fail(`Missing ${f}`);
}

// --------------------------------------------------------------- .gitignore safety

section('.gitignore safety (no env leaks)');
{
  const gi = path.join(root, '.gitignore');
  if (!fs.existsSync(gi)) {
    fail('.gitignore missing');
  } else {
    const content = fs.readFileSync(gi, 'utf8');
    for (const pat of ['.env', '.env.local']) {
      if (content.includes(pat)) ok(`${pat} is git-ignored`);
      else fail(`${pat} not in .gitignore`);
    }
  }
}

// --------------------------------------------------------------- Optional but recommended

section('Optional');
{
  const baseUrl = process.env.VITE_BASE_URL || readDotEnvValue('VITE_BASE_URL');
  if (baseUrl) ok(`VITE_BASE_URL=${baseUrl}`);
  else warn('VITE_BASE_URL not set — Vite will use its default base for the build.');
}

// --------------------------------------------------------------- Done

console.log('');
if (failed > 0) {
  console.log(`\u2717 ${failed} check(s) failed; ${warned} warning(s).`);
  process.exit(1);
}
console.log(`\u2713 All checks passed${warned > 0 ? ` (${warned} warning${warned === 1 ? '' : 's'})` : ''}.`);
process.exit(0);

// --------------------------------------------------------------- Helpers

function readDotEnvValue(key) {
  // Read from either .env.local (preferred) or .env (fallback).
  for (const f of ['.env.local', '.env']) {
    const p = path.join(root, f);
    if (!fs.existsSync(p)) continue;
    const text = fs.readFileSync(p, 'utf8');
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const k = line.slice(0, eq).trim();
      const v = line
        .slice(eq + 1)
        .trim()
        .replace(/^['"]|['"]$/g, '');
      if (k === key) return v;
    }
  }
  return '';
}


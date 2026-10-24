/**
 * Every left-menu page uses `.page`. It must fill the shell (like Notes) rather
 * than sit in a centred, width-capped column on large or maximised windows.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function css(name: string): string {
  return readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8');
}

const base = css('./base.css');

/** Declarations of the first rule whose selector is exactly `selector`. */
function rule(selector: string): string {
  const m = new RegExp(`(?:^|\\n)${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`).exec(base);
  return m?.[1] ?? '';
}

describe('page width', () => {
  it('.page fills the available width and is not centred in a capped column', () => {
    const decl = rule('.page');
    expect(decl).toMatch(/max-width:\s*none/);
    expect(decl).toMatch(/width:\s*100%/);
    expect(decl).not.toMatch(/margin:\s*0 auto/);
  });

  it('no width modifier brings a cap back', () => {
    expect(rule('.page--wide')).not.toMatch(/max-width:\s*\d/);
    expect(rule('.page--narrow')).not.toMatch(/max-width:\s*\d/);
    expect(base).not.toMatch(/\.page[^{]*\{[^}]*max-width:\s*\d/);
  });
});

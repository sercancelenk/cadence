import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Static guards for docs/BACKUP-RECOVERY-STANDARD.md. They read the source of the main process
 * and fail when a future change quietly removes a rule. Behaviour is tested in mainSavePath.test.ts.
 */
const main = fs.readFileSync(path.join(__dirname, 'main.cjs'), 'utf8');

function handlerBody(channel: string): string {
  const start = main.indexOf(`ipcMain.handle('${channel}'`);
  if (start < 0) throw new Error(`${channel} handler not found`);
  const next = main.indexOf('\nipcMain.handle(', start + 10);
  return main.slice(start, next < 0 ? undefined : next);
}

describe('backup & recovery standard (static guards)', () => {
  it.each(['data:restoreFromSource', 'data:importBundle', 'data:importWorkspace'])(
    'B1: %s makes its safety copy through snapshotBeforeReplace and stops when it fails',
    (channel) => {
      const body = handlerBody(channel);
      expect(body).toMatch(/snapshotBeforeReplace\(/);
      expect(body).toMatch(/if \(!safety\.ok\) return safety;/);
      expect(body).not.toMatch(/\n\s*snapshotCurrentDataFile\(uid, 'pre-(restore|import)'/);
    },
  );

  it('B1: every handler that replaces the workspace from outside is covered by the list above', () => {
    const replacing = Array.from(main.matchAll(/ipcMain\.handle\('([^']+)'/g))
      .map((m) => m[1] as string)
      .filter((channel) => /allowOverwriteUnreadable:\s*true/.test(handlerBody(channel)))
      // Key changes re-commit the same workspace under a new key and take their own pre-change snapshot.
      .filter((channel) => !channel.startsWith('account:'));
    expect(replacing.sort()).toEqual(['data:importBundle', 'data:importWorkspace', 'data:restoreFromSource']);
  });

  it.each(['account:changePassword', 'account:recoverWithCodes'])(
    'B2: %s stages the key it replaces before saving the account, commits after, and drops it on failure',
    (channel) => {
      const body = handlerBody(channel);
      const stage = body.indexOf('stageKeyHistory(');
      const save = body.indexOf('writeAccounts(accounts)');
      const commit = body.indexOf('commitKeyHistory(');
      expect(stage).toBeGreaterThan(-1);
      expect(save).toBeGreaterThan(stage);
      expect(commit).toBeGreaterThan(save);
      expect(body.match(/discardKeyHistory\(/g)?.length).toBeGreaterThanOrEqual(2);
    },
  );

  it('B2: reading a backup set tries the earlier keys', () => {
    const fn = main.slice(main.indexOf('function loadWorkspaceFromBackupSet'));
    expect(fn.slice(0, 2500)).toMatch(/tryPreviousKeys:\s*true/);
  });

  it('B3: restore and folder import report what the sidecar steps could not do', () => {
    expect(handlerBody('data:restoreFromSource')).toMatch(/attachmentsFailed/);
    expect(handlerBody('data:restoreFromSource')).toMatch(/historyIncomplete/);
    expect(handlerBody('data:importBundle')).toMatch(/historyIncomplete/);
  });

  it('B4: the full backup returns and records how many images it left out', () => {
    const body = handlerBody('data:exportBundle');
    expect(body).toMatch(/attachmentsSkipped/);
    expect(body.match(/attachmentsSkipped/g)?.length).toBeGreaterThanOrEqual(3);
  });
});

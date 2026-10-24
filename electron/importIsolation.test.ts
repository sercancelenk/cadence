import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Importing a workspace must never reach into another account's attachment
 * folder with that account's cached key. A JSON-only import carries no images;
 * images come from a portable ZIP or a full backup folder. A guard against the
 * removed "salvage from sibling accounts" path coming back unnoticed.
 */
describe('workspace import isolation', () => {
  const main = readFileSync(join(__dirname, 'main.cjs'), 'utf8');

  it('has no path that reads another account\'s attachments with its cached key', () => {
    expect(main).not.toContain('salvageReferencedAttachmentsLocally');
    expect(main).not.toContain('readAttachmentBytesWithPersistedKey');
  });

  it('answers a JSON-only import with zero restored images', () => {
    const handler = main.slice(main.indexOf("ipcMain.handle('data:importWorkspace'"));
    expect(handler.slice(0, 1200)).toMatch(/attachmentsRestored:\s*0/);
  });
});

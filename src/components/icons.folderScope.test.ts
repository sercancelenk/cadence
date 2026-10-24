import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8');

describe('where the yellow list folder is used', () => {
  it('marks note lists in the Notes tree', () => {
    expect(read('features/notes/NotesGroupTree.tsx')).toMatch(/<IcFolderGradient\b/);
  });

  it('leaves the folder icons that mean something else untouched', () => {
    for (const file of [
      'features/home/HomeQuickAccess.tsx',
      'components/CommandPalette.tsx',
      'components/AppSidebar.tsx',
      'features/notes/NotesSidebar.tsx',
    ]) {
      expect(read(file), file).not.toMatch(/IcFolderGradient/);
      expect(read(file), file).toMatch(/IcFolder\b/);
    }
  });
});

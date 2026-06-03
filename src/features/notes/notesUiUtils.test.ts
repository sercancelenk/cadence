import { describe, expect, it } from 'vitest';
import {
  clamp,
  unlockDialogBody,
  unlockDialogButton,
  unlockDialogTitle,
} from './notesUiUtils';
import type { PendingIntent } from './noteLockTypes';

describe('clamp', () => {
  it('clamps within inclusive bounds', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(99, 0, 10)).toBe(10);
  });
});

describe('unlock dialog copy', () => {
  const intents: PendingIntent[] = ['lock', 'unlock-selected', 'disable-locking', 'view'];

  it('returns intent-specific titles', () => {
    expect(unlockDialogTitle('lock')).toContain('lock');
    expect(unlockDialogTitle('unlock-selected')).toContain('unlock');
    expect(unlockDialogTitle('disable-locking')).toContain('remove lock');
    expect(unlockDialogTitle('view')).toBe('Unlock notes');
    expect(unlockDialogTitle(null)).toBe('Unlock notes');
  });

  it('returns non-empty body and button for each intent', () => {
    for (const intent of intents) {
      expect(unlockDialogBody(intent).length).toBeGreaterThan(10);
      expect(unlockDialogButton(intent).length).toBeGreaterThan(0);
    }
    expect(unlockDialogBody(null)).toContain('view locked notes');
    expect(unlockDialogButton(null)).toBe('Unlock');
  });
});

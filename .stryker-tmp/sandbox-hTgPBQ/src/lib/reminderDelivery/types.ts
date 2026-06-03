/**
 * TS mirror of electron/reminder types for renderer imports.
 * Logic is tested via electron/reminder/collectDesiredSlots.test.ts (CJS source of truth).
 */
// @ts-nocheck

export type ReminderSource = 'todo' | 'team-item';
export type ReminderSlot = {
  slotKey: string;
  itemId: string;
  source: ReminderSource;
  remindAt: string;
  title: string;
  body: string;
  repeat?: 'daily' | 'weekly' | 'monthly';
  /** PWA notification click navigation path. */
  deepLinkPath?: string | null;
};
export type ReminderSyncStatus = {
  osScheduling: boolean;
  platform: string;
  pendingInApp: number;
  pendingOs: number;
  osError: string | null;
  /** Linux: tray background mode is active. */
  backgroundMode?: boolean;
  launchAtLogin?: boolean;
  hideToTrayOnClose?: boolean;
};
export type ReminderBackgroundSettings = {
  launchAtLogin?: boolean;
  hideToTrayOnClose?: boolean;
};
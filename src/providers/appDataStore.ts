import type { AppData, DataShape } from '../core/model';

export type PersistError = {
  reason?: string;
  error?: string;
  at: number;
};

export type DataLossSuspicion = {
  current: DataShape;
  previous: DataShape;
  at: number;
};

/** External-store subscription for AppData snapshots (useSyncExternalStore). */
export type AppDataSnapshotStore = {
  subscribe: (onStoreChange: () => void) => () => void;
  getSnapshot: () => AppData | null;
  setSnapshot: (next: AppData | null) => void;
};

export function createAppDataSnapshotStore(): AppDataSnapshotStore {
  let snapshot: AppData | null = null;
  const listeners = new Set<() => void>();

  return {
    subscribe(onStoreChange) {
      listeners.add(onStoreChange);
      return () => {
        listeners.delete(onStoreChange);
      };
    },
    getSnapshot() {
      return snapshot;
    },
    setSnapshot(next) {
      snapshot = next;
      listeners.forEach((l) => l());
    },
  };
}

export type PersistStatusSnapshot = {
  ready: boolean;
  lastSaveError: PersistError | null;
  lastSavedAt: number | null;
  saving: boolean;
  dataLossSuspicion: DataLossSuspicion | null;
  currentShape: DataShape;
};

export type PersistStatusStore = {
  subscribe: (onStoreChange: () => void) => () => void;
  getSnapshot: () => PersistStatusSnapshot;
  setSnapshot: (patch: Partial<PersistStatusSnapshot>) => void;
};

export function createPersistStatusStore(initial: PersistStatusSnapshot): PersistStatusStore {
  let snapshot = initial;
  const listeners = new Set<() => void>();

  return {
    subscribe(onStoreChange) {
      listeners.add(onStoreChange);
      return () => {
        listeners.delete(onStoreChange);
      };
    },
    getSnapshot() {
      return snapshot;
    },
    setSnapshot(patch) {
      snapshot = { ...snapshot, ...patch };
      listeners.forEach((l) => l());
    },
  };
}

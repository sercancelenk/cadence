/** Portable backup layout shared by desktop folder, desktop ZIP, and web/mobile ZIP. */

export const BACKUP_BUNDLE_FORMAT = 'cadence-bundle-v2' as const;
export const BACKUP_DATA_FILE = 'data.json' as const;
export const BACKUP_MANIFEST_FILE = 'manifest.json' as const;
export const BACKUP_ATTACHMENTS_DIR = 'attachments' as const;

export type BackupManifest = {
  format: typeof BACKUP_BUNDLE_FORMAT;
  exportedAt: string;
  attachmentsPortable: boolean;
  attachmentCount: number;
  /** Present when some referenced images were missing at export time. */
  attachmentMissing?: number;
};

export type ParsedBackupBundle = {
  workspaceRaw: unknown;
  manifest: BackupManifest | null;
  /** attachment id → raw bytes */
  attachments: Map<string, Uint8Array>;
};

export type BackupImportResult = {
  ok: true;
  attachmentsImported: number;
  attachmentsSkipped: number;
  /** Encrypted sidecars that cannot be decrypted on web (desktop required). */
  attachmentsEncryptedSkipped?: number;
};

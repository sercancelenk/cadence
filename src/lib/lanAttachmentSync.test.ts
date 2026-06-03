import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppData } from '../core/model';
import { syncLanAttachments } from './lanAttachmentSync';

const loadPair = vi.fn();
const fetchAttachmentManifest = vi.fn();
const readAttachmentBlobForSync = vi.fn();
const uploadAttachment = vi.fn();
const downloadAttachment = vi.fn();
const attachmentExistsLocally = vi.fn();
const importAttachmentBlob = vi.fn();
const collectReferencedAttachmentIds = vi.fn();

vi.mock('./lanSyncClient', () => ({
  loadPair: (...args: unknown[]) => loadPair(...args),
  fetchAttachmentManifest: (...args: unknown[]) => fetchAttachmentManifest(...args),
  uploadAttachment: (...args: unknown[]) => uploadAttachment(...args),
  downloadAttachment: (...args: unknown[]) => downloadAttachment(...args),
}));

vi.mock('./richTextAttachmentStore', () => ({
  readAttachmentBlobForSync: (...args: unknown[]) => readAttachmentBlobForSync(...args),
  attachmentExistsLocally: (...args: unknown[]) => attachmentExistsLocally(...args),
  importAttachmentBlob: (...args: unknown[]) => importAttachmentBlob(...args),
}));

vi.mock('./richTextAttachmentIndex', () => ({
  collectReferencedAttachmentIds: (...args: unknown[]) => collectReferencedAttachmentIds(...args),
}));

const emptyData = (): AppData =>
  ({
    version: 3,
    teams: [],
    people: [],
    items: [],
    notifiedReminderIds: [],
    todoGroups: [],
    todoItems: [],
    notes: [],
  }) as AppData;

describe('syncLanAttachments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadPair.mockReturnValue({ url: 'https://192.168.1.5:9787', token: 'tok' });
    fetchAttachmentManifest.mockResolvedValue([]);
    collectReferencedAttachmentIds.mockReturnValue([]);
  });

  it('returns early when no pair is saved', async () => {
    loadPair.mockReturnValue(null);
    await syncLanAttachments(emptyData(), 'user-1');
    expect(fetchAttachmentManifest).not.toHaveBeenCalled();
  });

  it('returns early when userId is empty', async () => {
    await syncLanAttachments(emptyData(), '');
    expect(fetchAttachmentManifest).not.toHaveBeenCalled();
  });

  it('returns early when nothing references attachments', async () => {
    await syncLanAttachments(emptyData(), 'user-1');
    expect(fetchAttachmentManifest).not.toHaveBeenCalled();
  });

  it('uploads local blobs missing from the remote manifest', async () => {
    const id = 'note-doc1-abc123456789';
    collectReferencedAttachmentIds.mockReturnValue([id]);
    fetchAttachmentManifest.mockResolvedValue([]);
    const blob = new Blob(['img'], { type: 'image/webp' });
    readAttachmentBlobForSync.mockResolvedValue(blob);
    uploadAttachment.mockResolvedValue(true);
    attachmentExistsLocally.mockResolvedValue(true);

    await syncLanAttachments(emptyData(), 'user-1');

    expect(uploadAttachment).toHaveBeenCalledWith(
      'https://192.168.1.5:9787',
      'tok',
      id,
      blob,
    );
    expect(downloadAttachment).not.toHaveBeenCalled();
  });

  it('skips upload when remote already has the attachment', async () => {
    const id = 'note-doc1-abc123456789';
    collectReferencedAttachmentIds.mockReturnValue([id]);
    fetchAttachmentManifest.mockResolvedValue([id]);
    attachmentExistsLocally.mockResolvedValue(true);

    await syncLanAttachments(emptyData(), 'user-1');

    expect(readAttachmentBlobForSync).not.toHaveBeenCalled();
    expect(uploadAttachment).not.toHaveBeenCalled();
  });

  it('downloads and imports attachments missing locally', async () => {
    const id = 'note-doc1-abc123456789';
    collectReferencedAttachmentIds.mockReturnValue([id]);
    fetchAttachmentManifest.mockResolvedValue([id]);
    attachmentExistsLocally.mockResolvedValue(false);
    const blob = new Blob(['remote'], { type: 'image/webp' });
    downloadAttachment.mockResolvedValue(blob);

    await syncLanAttachments(emptyData(), 'user-1');

    expect(downloadAttachment).toHaveBeenCalledWith('https://192.168.1.5:9787', 'tok', id);
    expect(importAttachmentBlob).toHaveBeenCalledWith('user-1', id, blob);
  });

  it('does not import when download fails', async () => {
    const id = 'note-doc1-abc123456789';
    collectReferencedAttachmentIds.mockReturnValue([id]);
    fetchAttachmentManifest.mockResolvedValue([id]);
    attachmentExistsLocally.mockResolvedValue(false);
    downloadAttachment.mockResolvedValue(null);

    await syncLanAttachments(emptyData(), 'user-1');

    expect(importAttachmentBlob).not.toHaveBeenCalled();
  });
});

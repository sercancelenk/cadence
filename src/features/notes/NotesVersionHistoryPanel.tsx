import { RichTextDocumentPane } from '../../components/ui/RichTextDocumentPane';
import { IcClock, IcX } from '../../components/icons';
import type { NoteRevisionPayload } from '../../lib/noteRevision/types';
import type { useNoteVersionHistory } from './useNoteVersionHistory';

type HistoryState = ReturnType<typeof useNoteVersionHistory>;

export type NotesVersionHistoryPanelProps = {
  attachmentUserId: string;
  noteId: string;
  history: HistoryState;
};

function formatRevisionWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function triggerLabel(revision: NoteRevisionPayload): string {
  if (revision.label?.trim()) return revision.label.trim();
  switch (revision.trigger) {
    case 'manual':
      return 'Manual save';
    case 'pre-restore':
      return 'Before restore';
    case 'lock':
      return 'Locked';
    case 'session-end':
      return 'Edit session';
    default:
      return 'Autosave';
  }
}

export function NotesVersionHistoryPanel({
  attachmentUserId,
  noteId,
  history,
}: NotesVersionHistoryPanelProps) {
  if (!history.open) return null;

  const {
    setOpen,
    available,
    loading,
    previewLoading,
    revisions,
    selectedRevisionId,
    setSelectedRevisionId,
    previewBody,
    previewFormat,
    previewTitle,
    previewRevision,
    noteTitle,
    error,
    busy,
    manualLabel,
    setManualLabel,
    saveManualVersion,
    restoreSelected,
    needsUnlock,
  } = history;

  return (
    <div className="notes-version-history" role="dialog" aria-modal="true" aria-label="Note version history">
      <button
        type="button"
        className="notes-version-history__backdrop"
        aria-label="Close version history"
        onClick={() => setOpen(false)}
      />
      <aside className="notes-version-history__panel">
        <header className="notes-version-history__header">
          <div className="notes-version-history__heading">
            <IcClock size={18} />
            <div>
              <h2>Version history</h2>
              <p className="muted small">{noteTitle}</p>
            </div>
          </div>
          <button
            type="button"
            className="notes-version-history__close"
            aria-label="Close"
            onClick={() => setOpen(false)}
          >
            <IcX size={18} />
          </button>
        </header>

        {!available ? (
          <p className="notes-version-history__message muted">
            Version history is available in the Cadence desktop app.
          </p>
        ) : needsUnlock ? (
          <p className="notes-version-history__message muted">
            Unlock this note to view and restore earlier versions.
          </p>
        ) : (
          <>
            <div className="notes-version-history__save-row">
              <input
                type="text"
                className="notes-version-history__label-input"
                placeholder="Optional label (e.g. Before rewrite)"
                value={manualLabel}
                onChange={(e) => setManualLabel(e.target.value)}
                disabled={busy}
              />
              <button type="button" className="btn btn--sm" disabled={busy} onClick={() => void saveManualVersion()}>
                Save version
              </button>
            </div>

            {error ? <p className="notes-version-history__error">{error}</p> : null}

            <div className="notes-version-history__body">
              <ul className="notes-version-history__list" aria-label="Saved versions">
                {loading ? (
                  <li className="notes-version-history__empty muted">Loading…</li>
                ) : revisions.length === 0 ? (
                  <li className="notes-version-history__empty muted">
                    No earlier versions yet. Cadence saves versions as you edit (about every 3 minutes) and when you
                    leave the note.
                  </li>
                ) : (
                  revisions.map((revision) => (
                    <li key={revision.id}>
                      <button
                        type="button"
                        className={`notes-version-history__item${selectedRevisionId === revision.id ? ' notes-version-history__item--active' : ''}`}
                        onClick={() => setSelectedRevisionId(revision.id)}
                      >
                        <span className="notes-version-history__item-title">{triggerLabel(revision)}</span>
                        <span className="notes-version-history__item-meta muted small">
                          {formatRevisionWhen(revision.createdAt)}
                        </span>
                        <span className="notes-version-history__item-summary muted small">{revision.summary}</span>
                      </button>
                    </li>
                  ))
                )}
              </ul>

              <div className="notes-version-history__preview">
                {previewLoading ? (
                  <p className="muted notes-version-history__empty">Loading preview…</p>
                ) : previewRevision ? (
                  <>
                    <h3 className="notes-version-history__preview-title">{previewTitle}</h3>
                    <RichTextDocumentPane
                      editorKey={`${noteId}-${previewRevision.id}`}
                      value={previewBody}
                      valueFormat={previewFormat}
                      editing={false}
                      onEditingChange={() => {}}
                      editable={false}
                      minHeight={240}
                      attachmentScope={{ documentKind: 'note', documentId: noteId }}
                      attachmentUserId={attachmentUserId}
                      previewHint="Read-only preview of this saved version"
                      showModeToggle={false}
                      className="notes-version-history__preview-pane"
                    />
                  </>
                ) : (
                  <p className="muted notes-version-history__empty">Select a version to preview.</p>
                )}
              </div>
            </div>

            <footer className="notes-version-history__footer">
              <p className="muted small notes-version-history__footer-hint">
                Restore saves your current note as a version first, then replaces it with the selected snapshot.
              </p>
              <button
                type="button"
                className="btn btn--primary btn--sm"
                disabled={busy || !previewRevision}
                onClick={() => void restoreSelected()}
              >
                Restore this version
              </button>
            </footer>
          </>
        )}
      </aside>
    </div>
  );
}

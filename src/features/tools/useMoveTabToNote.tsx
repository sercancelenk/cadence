import { useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppData } from '../../AppDataContext';
import { useToast } from '../../components/ui/Toast';
import { MoveToNoteDialog } from './MoveToNoteDialog';

/**
 * "Move to Notes" for a tab on either Tools page: opens the destination picker,
 * performs the move through the provider (note created and tab removed in one
 * update) and then opens the new note. A second confirm while a move is running
 * is ignored, so a double click cannot create two notes.
 */
export function useMoveTabToNote(kind: 'document' | 'structured'): {
  request: (tabId: string) => void;
  dialog: ReactNode;
} {
  const { data, getLatestSnapshot, moveDocumentTabToNote, moveStructuredTabToNote } = useAppData();
  const toast = useToast();
  const navigate = useNavigate();
  const [pending, setPending] = useState<{ id: string; title: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const runningRef = useRef(false);

  const request = (tabId: string) => {
    const tab =
      kind === 'document'
        ? data.utilityDocumentTabs?.find((t) => t.id === tabId)
        : data.utilityStructuredTabs?.find((t) => t.id === tabId);
    if (tab) setPending({ id: tab.id, title: tab.title });
  };

  const confirm = async (groupId: string | undefined) => {
    if (!pending || runningRef.current) return;
    runningRef.current = true;
    setBusy(true);
    try {
      const noteId =
        kind === 'document'
          ? await moveDocumentTabToNote(pending.id, groupId)
          : await moveStructuredTabToNote(pending.id, groupId);
      setPending(null);
      if (!noteId) {
        // A second request for the same tab finds it already gone; that is not a save problem.
        const latest = getLatestSnapshot();
        const tabs = kind === 'document' ? latest.utilityDocumentTabs : latest.utilityStructuredTabs;
        if (!tabs?.some((t) => t.id === pending.id)) toast.showInfo('Already moved', pending.title);
        else toast.showWarning('Could not move', 'Saving is temporarily blocked.');
        return;
      }
      toast.showSuccess('Moved to Notes', pending.title);
      navigate(`/notes?id=${encodeURIComponent(noteId)}`);
    } finally {
      runningRef.current = false;
      setBusy(false);
    }
  };

  const dialog = pending ? (
    <MoveToNoteDialog
      groups={data.noteGroups ?? []}
      tabTitle={pending.title}
      busy={busy}
      onConfirm={(groupId) => void confirm(groupId)}
      onCancel={() => {
        if (!runningRef.current) setPending(null);
      }}
    />
  ) : null;

  return { request, dialog };
}

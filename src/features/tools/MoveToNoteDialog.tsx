import { useMemo, useState } from 'react';
import { AppModal, AppModalActions } from '../../components/ui/AppModal';
import type { NoteGroup } from '../../core/model';
import { noteDestinations } from '../notes/noteGroupForest';

export type MoveToNoteDialogProps = {
  groups: NoteGroup[];
  tabTitle: string;
  /** `undefined` means the top level (a note that belongs to no list). */
  onConfirm: (groupId: string | undefined) => void;
  onCancel: () => void;
  busy?: boolean;
};

/** Pick where a Tools document lands in Notes: a list, or no list. */
export function MoveToNoteDialog({ groups, tabTitle, onConfirm, onCancel, busy = false }: MoveToNoteDialogProps) {
  const options = useMemo(() => noteDestinations(groups), [groups]);
  const [selected, setSelected] = useState<string | undefined>(undefined);

  return (
    <AppModal
      title="Move to Notes"
      description={
        <>
          “{tabTitle}” becomes a note and is removed from Tools. Choose where it goes.
        </>
      }
      onClose={onCancel}
      size="sm"
      footer={
        <AppModalActions
          onCancel={onCancel}
          onConfirm={() => onConfirm(selected)}
          confirmLabel="Move to Notes"
          busy={busy}
        />
      }
    >
      <div role="radiogroup" aria-label="Destination" className="move-to-note__options">
        {options.map((o) => (
          <label key={o.id ?? 'top'} className="move-to-note__option">
            <input
              type="radio"
              name="move-to-note-destination"
              checked={selected === o.id}
              onChange={() => setSelected(o.id)}
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </AppModal>
  );
}

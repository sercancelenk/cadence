import { FormEvent, useState } from 'react';
import { IcPlus, IcTrash } from '../../components/icons';
import type { NoteGroup } from '../../model';

export type NotesGroupBarProps = {
  groups: NoteGroup[];
  selectedGroupId: string | null;
  onSelectGroup: (id: string) => void;
  onCreateGroup: (name: string) => void;
  onRenameGroup: (id: string, name: string) => void;
  onRemoveGroup: (id: string) => void;
  noteCountByGroup: Map<string, number>;
};

export function NotesGroupBar({
  groups,
  selectedGroupId,
  onSelectGroup,
  onCreateGroup,
  onRenameGroup,
  onRemoveGroup,
  noteCountByGroup,
}: NotesGroupBarProps) {
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const submitNew = (e: FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    onCreateGroup(name);
    setNewName('');
    setNewOpen(false);
  };

  const submitRename = (e: FormEvent) => {
    e.preventDefault();
    if (!renamingId) return;
    const name = renameValue.trim();
    if (!name) return;
    onRenameGroup(renamingId, name);
    setRenamingId(null);
    setRenameValue('');
  };

  return (
    <div className="notes-page__groups">
      <div className="notes-page__group-chips" role="tablist" aria-label="Note lists">
        {groups.map((g) => {
          const active = g.id === selectedGroupId;
          const count = noteCountByGroup.get(g.id) ?? 0;
          return (
            <button
              key={g.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={`notes-page__group-chip${active ? ' notes-page__group-chip--active' : ''}`}
              onClick={() => onSelectGroup(g.id)}
              onDoubleClick={() => {
                setRenamingId(g.id);
                setRenameValue(g.name);
              }}
              title={`${g.name} (${count}) — double-click to rename`}
            >
              <span className="notes-page__group-chip-name">{g.name}</span>
              {count > 0 ? <span className="notes-page__group-chip-count">{count}</span> : null}
            </button>
          );
        })}
        <button
          type="button"
          className="notes-page__group-add"
          onClick={() => setNewOpen((v) => !v)}
          aria-expanded={newOpen}
          title="Create a new note list"
        >
          <IcPlus size={14} />
          <span>List</span>
        </button>
      </div>

      {newOpen ? (
        <form className="notes-page__group-form" onSubmit={submitNew}>
          <input
            className="input notes-page__group-input"
            placeholder="New list name"
            value={newName}
            autoFocus
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setNewOpen(false);
                setNewName('');
              }
            }}
            aria-label="New list name"
          />
          <button type="submit" className="btn btn--primary btn--small" disabled={!newName.trim()}>
            Create
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={() => {
              setNewOpen(false);
              setNewName('');
            }}
          >
            Cancel
          </button>
        </form>
      ) : null}

      {renamingId ? (
        <form className="notes-page__group-form" onSubmit={submitRename}>
          <input
            className="input notes-page__group-input"
            value={renameValue}
            autoFocus
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setRenamingId(null);
                setRenameValue('');
              }
            }}
            aria-label="Rename list"
          />
          <button type="submit" className="btn btn--primary btn--small" disabled={!renameValue.trim()}>
            Save
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={() => {
              setRenamingId(null);
              setRenameValue('');
            }}
          >
            Cancel
          </button>
          {groups.length > 1 ? (
            <button
              type="button"
              className="btn btn--danger btn--small btn--icon"
              title="Delete list (notes move to another list)"
              aria-label="Delete list"
              onClick={() => {
                onRemoveGroup(renamingId);
                setRenamingId(null);
                setRenameValue('');
              }}
            >
              <IcTrash size={14} />
            </button>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}

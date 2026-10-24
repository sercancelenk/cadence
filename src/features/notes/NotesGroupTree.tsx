import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  IcArchive,
  IcArchiveRestore,
  IcChevronDown,
  IcFolder,
  IcFolderGradient,
  IcPlus,
  IcTrash,
} from '../../components/icons';
import type { Note, NoteGroup } from '../../model';
import { NotesGroupContextMenu } from './NotesGroupContextMenu';
import { moveTargets, type GroupNode } from './noteGroupForest';

export type NotesGroupTreeProps = {
  nodes: GroupNode[];
  /** Every list (for "Move to…" destinations). */
  allGroups: NoteGroup[];
  archivedView: boolean;
  isExpanded: (groupId: string) => boolean;
  onToggle: (groupId: string) => void;
  onExpand: (groupId: string) => void;
  /** Row for one note; must render an `<li>`. */
  renderNote: (note: Note) => ReactNode;
  onCreateNote: (groupId: string) => void;
  onCreateSubGroup: (parentId: string, name: string) => void;
  onRename: (groupId: string, name: string) => void;
  onSetArchived: (groupId: string, archived: boolean) => void;
  onMove: (groupId: string, newParentId: string | undefined) => void;
  /** The caller owns the confirmation dialog. */
  onRequestDelete: (groupId: string) => void;
  dropTargetGroupId: string | null;
  onGroupDragOver: (e: React.DragEvent<HTMLLIElement>, groupId: string) => void;
  onGroupDrop: (e: React.DragEvent<HTMLLIElement>, groupId: string) => void;
};

function indexNodes(nodes: GroupNode[], into = new Map<string, GroupNode>()): Map<string, GroupNode> {
  for (const node of nodes) {
    into.set(node.group.id, node);
    indexNodes(node.children, into);
  }
  return into;
}

/** Recursive list tree for the notes sidebar: inline create / rename, context menu, archive. */
export function NotesGroupTree(props: NotesGroupTreeProps) {
  const {
    nodes,
    allGroups,
    archivedView,
    isExpanded,
    onToggle,
    onExpand,
    renderNote,
    onCreateNote,
    onCreateSubGroup,
    onRename,
    onSetArchived,
    onMove,
    onRequestDelete,
    dropTargetGroupId,
    onGroupDragOver,
    onGroupDrop,
  } = props;

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [creatingUnder, setCreatingUnder] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null);

  const byId = useMemo(() => indexNodes(nodes), [nodes]);

  const startRename = (g: NoteGroup) => {
    setRenamingId(g.id);
    setRenameValue(g.name);
  };
  const commitRename = () => {
    const name = renameValue.trim();
    if (!renamingId || !name) return;
    onRename(renamingId, name);
    setRenamingId(null);
    setRenameValue('');
  };
  const startCreate = (parentId: string) => {
    onExpand(parentId);
    setCreatingUnder(parentId);
    setNewName('');
  };
  const commitCreate = () => {
    const name = newName.trim();
    if (!creatingUnder || !name) return;
    onCreateSubGroup(creatingUnder, name);
    onExpand(creatingUnder);
    setCreatingUnder(null);
    setNewName('');
  };

  const renderBranch = (node: GroupNode): ReactNode => {
    const g = node.group;
    const expanded = isExpanded(g.id);
    const empty = node.notes.length === 0 && node.children.length === 0;
    return (
      <li
        key={g.id}
        className={[
          'notes-page__group-holder',
          expanded ? 'notes-page__group-holder--open' : '',
          dropTargetGroupId === g.id ? 'notes-page__group-holder--drop-target' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onDragOver={(e) => {
          e.stopPropagation();
          onGroupDragOver(e, g.id);
        }}
        onDrop={(e) => {
          e.stopPropagation();
          onGroupDrop(e, g.id);
        }}
      >
        {renamingId === g.id ? (
          <form
            className="notes-page__group-rename"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              commitRename();
            }}
          >
            <input
              className="input notes-page__group-input"
              value={renameValue}
              autoFocus
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitRename();
                } else if (e.key === 'Escape') {
                  setRenamingId(null);
                  setRenameValue('');
                }
              }}
              aria-label="Rename list"
            />
            <button type="submit" className="btn btn--primary btn--small" disabled={!renameValue.trim()}>
              Save
            </button>
          </form>
        ) : (
          <div
            className="notes-page__group-head"
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({ x: e.clientX, y: e.clientY, id: g.id });
            }}
          >
            <button
              type="button"
              className="notes-page__group-toggle"
              onClick={() => onToggle(g.id)}
              onDoubleClick={() => !archivedView && startRename(g)}
              onKeyDown={(e) => {
                if (e.key === 'F2' && !archivedView) {
                  e.preventDefault();
                  startRename(g);
                }
              }}
              aria-expanded={expanded}
              title={archivedView ? g.name : 'Double-click or press F2 to rename · right-click for more'}
            >
              <span className={`notes-page__group-chev${expanded ? ' notes-page__group-chev--open' : ''}`}>
                <IcChevronDown size={14} />
              </span>
              <IcFolderGradient size={16} className="notes-page__group-folder" />
              {node.pathLabel ? <span className="notes-page__group-path">{node.pathLabel}</span> : null}
              <span className="notes-page__group-name">{g.name}</span>
              <span className="notes-page__group-count">{node.noteCount}</span>
            </button>
            {!archivedView ? (
              <button
                type="button"
                className="notes-page__group-add-note icon-btn"
                title={`Add note to ${g.name}`}
                aria-label={`Add note to ${g.name}`}
                onClick={() => onCreateNote(g.id)}
              >
                <IcPlus size={14} />
              </button>
            ) : null}
            {node.canAddSubList ? (
              <button
                type="button"
                className="notes-page__group-action icon-btn"
                title={`Add sub-list to ${g.name}`}
                aria-label={`Add sub-list to ${g.name}`}
                onClick={() => startCreate(g.id)}
              >
                <IcFolder size={14} />
              </button>
            ) : null}
            {node.canArchive ? (
              <button
                type="button"
                className="notes-page__group-action icon-btn"
                title={`Archive ${g.name} with everything in it`}
                aria-label={`Archive ${g.name}`}
                onClick={() => onSetArchived(g.id, true)}
              >
                <IcArchive size={14} />
              </button>
            ) : null}
            {node.canRestore ? (
              <button
                type="button"
                className="notes-page__group-restore icon-btn"
                title={`Restore ${g.name} with everything in it`}
                aria-label={`Restore ${g.name}`}
                onClick={() => onSetArchived(g.id, false)}
              >
                <IcArchiveRestore size={14} />
              </button>
            ) : null}
            <button
              type="button"
              className="notes-page__group-delete icon-btn"
              title={`Delete ${g.name}`}
              aria-label={`Delete ${g.name}`}
              onClick={(e) => {
                e.stopPropagation();
                onRequestDelete(g.id);
              }}
            >
              <IcTrash size={14} />
            </button>
          </div>
        )}
        {expanded ? (
          <ul className="notes-page__group-children" aria-label={`Notes in ${g.name}`}>
            {creatingUnder === g.id ? (
              <li className="notes-page__group-create">
                <input
                  className="input notes-page__group-input"
                  placeholder="New sub-list name"
                  value={newName}
                  autoFocus
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitCreate();
                    } else if (e.key === 'Escape') {
                      setCreatingUnder(null);
                      setNewName('');
                    }
                  }}
                  aria-label="New sub-list name"
                />
              </li>
            ) : null}
            {node.children.map(renderBranch)}
            {node.notes.map(renderNote)}
            {empty && creatingUnder !== g.id && !archivedView ? (
              <li className="notes-page__group-empty muted small">Drop notes here or use + to add</li>
            ) : null}
          </ul>
        ) : null}
      </li>
    );
  };

  const menuNode = menu ? byId.get(menu.id) : undefined;

  return (
    <>
      {nodes.map(renderBranch)}
      {menu && menuNode ? (
        <NotesGroupContextMenu
          x={menu.x}
          y={menu.y}
          node={menuNode}
          moveTargets={moveTargets(allGroups, menu.id)}
          onClose={() => setMenu(null)}
          onNewNote={() => onCreateNote(menu.id)}
          onNewSubList={() => startCreate(menu.id)}
          onRename={() => startRename(menuNode.group)}
          onSetArchived={(archived) => onSetArchived(menu.id, archived)}
          onMove={(parentId) => onMove(menu.id, parentId)}
          onDelete={() => onRequestDelete(menu.id)}
        />
      ) : null}
    </>
  );
}

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { IcPlus, IcX } from '../../components/icons';

export type UtilityTabStripItem = {
  id: string;
  title: string;
  /** Small marker before the title (e.g. the JSON / YAML language badge). */
  badge?: ReactNode;
};

export type UtilityTabStripProps = {
  tabs: readonly UtilityTabStripItem[];
  activeId: string;
  ariaLabel: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  /** Called for every close click; the page decides whether to confirm first. */
  onClose: (id: string) => void;
  onRename: (id: string, title: string) => void;
};

/** Tab strip shared by the Tools → Document and Tools → JSON / YAML pages. */
export function UtilityTabStrip(props: UtilityTabStripProps) {
  const { tabs, activeId, ariaLabel, onSelect, onAdd, onClose, onRename } = props;
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const tabRefs = useRef(new Map<string, HTMLDivElement>());

  useEffect(() => {
    if (renamingId) renameInputRef.current?.focus();
  }, [renamingId]);

  const commitRename = () => {
    if (renamingId) onRename(renamingId, renameValue);
    setRenamingId(null);
    setRenameValue('');
  };
  const cancelRename = () => {
    setRenamingId(null);
    setRenameValue('');
  };

  const beginRename = (tab: UtilityTabStripItem) => {
    setRenamingId(tab.id);
    setRenameValue(tab.title);
  };

  // Roving tabindex: arrow keys move the selection (and focus) between tabs.
  const navigate = (fromIndex: number, key: string): boolean => {
    const last = tabs.length - 1;
    const target =
      key === 'ArrowRight' ? (fromIndex >= last ? 0 : fromIndex + 1)
      : key === 'ArrowLeft' ? (fromIndex <= 0 ? last : fromIndex - 1)
      : key === 'Home' ? 0
      : key === 'End' ? last
      : -1;
    if (target < 0) return false;
    const next = tabs[target];
    if (!next) return false;
    onSelect(next.id);
    tabRefs.current.get(next.id)?.focus();
    return true;
  };

  return (
    <div className="structured-tabbar">
      <div className="structured-tabbar__list" role="tablist" aria-label={ariaLabel}>
        {tabs.map((tab, index) => {
          const isActive = tab.id === activeId;
          const isRenaming = tab.id === renamingId;
          return (
            <div
              key={tab.id}
              className={`structured-tab${isActive ? ' structured-tab--active' : ''}`}
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              ref={(el) => {
                if (el) tabRefs.current.set(tab.id, el);
                else tabRefs.current.delete(tab.id);
              }}
              onClick={() => onSelect(tab.id)}
              onDoubleClick={() => beginRename(tab)}
              onKeyDown={(e) => {
                // Keys typed into the rename field belong to the field.
                if (e.target !== e.currentTarget) return;
                if (e.key === 'F2') {
                  e.preventDefault();
                  beginRename(tab);
                } else if (navigate(index, e.key)) {
                  e.preventDefault();
                }
              }}
            >
              {tab.badge}
              {isRenaming ? (
                <input
                  ref={renameInputRef}
                  className="structured-tab__rename"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitRename();
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      cancelRename();
                    }
                  }}
                />
              ) : (
                <span className="structured-tab__title" title={tab.title}>
                  {tab.title}
                </span>
              )}
              <button
                type="button"
                className="structured-tab__close"
                aria-label={`Close ${tab.title}`}
                title="Close tab"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(tab.id);
                }}
              >
                <IcX size={13} />
              </button>
            </div>
          );
        })}
      </div>
      <button type="button" className="structured-tabbar__add" aria-label="New tab" title="New tab" onClick={onAdd}>
        <IcPlus size={16} />
      </button>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { AppModal } from './AppModal';

export type EntityLinkPickerOption = {
  id: string;
  label: string;
  hint?: string;
};

export type EntityLinkPickerProps = {
  open: boolean;
  title: string;
  description?: string;
  options: EntityLinkPickerOption[];
  onClose: () => void;
  onPick: (id: string) => void;
  searchPlaceholder?: string;
  emptyLabel?: string;
};

/** Searchable single-select list for linking a note or todo. */
export function EntityLinkPicker({
  open,
  title,
  description,
  options,
  onClose,
  onPick,
  searchPlaceholder = 'Search…',
  emptyLabel = 'Nothing to link',
}: EntityLinkPickerProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.hint ? o.hint.toLowerCase().includes(q) : false),
    );
  }, [options, query]);

  if (!open) return null;

  return (
    <AppModal
      title={title}
      description={description}
      onClose={() => {
        setQuery('');
        onClose();
      }}
      size="md"
      showCloseButton
      bodyClassName="entity-link-picker__body"
    >
      <input
        className="entity-link-picker__search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={searchPlaceholder}
        aria-label={searchPlaceholder}
        autoFocus
      />
      {filtered.length === 0 ? (
        <p className="entity-link-picker__empty muted">{emptyLabel}</p>
      ) : (
        <ul className="entity-link-picker__list" role="listbox" aria-label={title}>
          {filtered.map((opt) => (
            <li key={opt.id}>
              <button
                type="button"
                className="entity-link-picker__row"
                role="option"
                onClick={() => {
                  onPick(opt.id);
                  setQuery('');
                  onClose();
                }}
              >
                <span className="entity-link-picker__row-label">{opt.label}</span>
                {opt.hint ? (
                  <span className="entity-link-picker__row-hint muted small">{opt.hint}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </AppModal>
  );
}

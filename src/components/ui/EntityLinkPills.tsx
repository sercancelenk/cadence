import { IcPlus, IcX } from '../icons';

export type EntityLinkPillItem = {
  id: string;
  /** Display text — parent decides (title, “Note 1”, …). */
  label: string;
  /** Target missing from workspace. */
  orphan?: boolean;
};

export type EntityLinkPillsProps = {
  items: EntityLinkPillItem[];
  ariaLabel: string;
  onOpen: (id: string) => void;
  onAdd?: () => void;
  onRemove?: (id: string) => void;
  addLabel?: string;
  /** When set and items empty and no onAdd, render nothing. */
  hideWhenEmpty?: boolean;
};

/**
 * Rounded badge/pill strip for N:N entity links (notes ↔ todos).
 * Presentation-only — parents own labels, navigation, and link mutations.
 */
export function EntityLinkPills({
  items,
  ariaLabel,
  onOpen,
  onAdd,
  onRemove,
  addLabel = 'Link',
  hideWhenEmpty = true,
}: EntityLinkPillsProps) {
  if (hideWhenEmpty && items.length === 0 && !onAdd) return null;

  return (
    <div className="entity-link-pills" role="group" aria-label={ariaLabel}>
      <ul className="entity-link-pills__list">
        {items.map((item) => (
          <li key={item.id} className="entity-link-pills__item">
            <button
              type="button"
              className={`entity-link-pills__pill${item.orphan ? ' entity-link-pills__pill--orphan' : ''}`}
              title={item.orphan ? `${item.label} (deleted)` : item.label}
              aria-label={item.orphan ? `${item.label} — deleted` : `Open ${item.label}`}
              disabled={item.orphan}
              onClick={() => {
                if (item.orphan) return;
                onOpen(item.id);
              }}
            >
              <span className="entity-link-pills__label">{item.label}</span>
            </button>
            {onRemove ? (
              <button
                type="button"
                className="entity-link-pills__remove"
                aria-label={item.orphan ? `Remove deleted link ${item.label}` : `Unlink ${item.label}`}
                title={item.orphan ? 'Remove link' : 'Unlink'}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(item.id);
                }}
              >
                <IcX size={11} />
              </button>
            ) : null}
          </li>
        ))}
        {onAdd ? (
          <li className="entity-link-pills__item">
            <button
              type="button"
              className="entity-link-pills__pill entity-link-pills__pill--add"
              onClick={onAdd}
              aria-label={addLabel}
              title={addLabel}
            >
              <IcPlus size={12} />
              <span className="entity-link-pills__label">{addLabel}</span>
            </button>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

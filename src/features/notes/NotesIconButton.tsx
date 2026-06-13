import type { ReactNode } from 'react';

export type NotesIconButtonProps = {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  /** Used as `aria-label` for screen readers. */
  label: string;
  /** Native browser tooltip text. Defaults to `label`. */
  tooltip?: string;
  variant?: 'ghost' | 'primary' | 'danger';
  /** When true, paints the button with the accent fill (e.g. pinned state). */
  pressed?: boolean;
  /** For panel toggles — mirrors `aria-expanded` on the underlying button. */
  ariaExpanded?: boolean;
};

/**
 * Compact, icon-only action button used across the Notes header bars.
 */
export function NotesIconButton({
  children,
  onClick,
  disabled,
  label,
  tooltip,
  variant = 'ghost',
  pressed,
  ariaExpanded,
}: NotesIconButtonProps) {
  const cls = [
    'notes-icon-btn',
    `notes-icon-btn--${variant}`,
    pressed ? 'notes-icon-btn--pressed' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      type="button"
      className={cls}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={pressed}
      aria-expanded={ariaExpanded}
      title={tooltip ?? label}
    >
      {children}
    </button>
  );
}

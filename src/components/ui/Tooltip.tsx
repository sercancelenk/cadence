import { cloneElement, isValidElement, useId, type ReactElement } from 'react';

export type TooltipPlacement = 'top' | 'bottom';

export type TooltipProps = {
  label: string;
  children: ReactElement;
  placement?: TooltipPlacement;
};

/**
 * Instant, styled hover/focus tooltip. Prefer this over native `title` in
 * Electron — macOS title tips are slow and often feel broken.
 */
export function Tooltip({ label, children, placement = 'bottom' }: TooltipProps) {
  const id = useId();

  if (!label.trim() || !isValidElement(children)) {
    return children;
  }

  const child = cloneElement(children, {
    'aria-describedby': id,
    title: undefined,
  } as Record<string, unknown>);

  return (
    <span className={`ui-tooltip ui-tooltip--${placement}`}>
      {child}
      <span id={id} className="ui-tooltip__bubble" role="tooltip">
        {label}
      </span>
    </span>
  );
}

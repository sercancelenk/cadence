// @ts-nocheck
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'sm' | 'icon';

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  iconRight?: ReactNode;
  children?: ReactNode;
};

function labelFromChildren(children: ReactNode): string | undefined {
  if (children == null || children === false) return undefined;
  if (typeof children === 'string' || typeof children === 'number') return String(children);
  if (Array.isArray(children)) {
    const parts = children.map(labelFromChildren).filter(Boolean);
    return parts.length ? parts.join(' ') : undefined;
  }
  return undefined;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  iconRight,
  children,
  className = '',
  type = 'button',
  title: titleProp,
  'aria-label': ariaLabelProp,
  ...rest
}: Props) {
  const hasLeftIcon = !!icon;
  const hasRightIcon = !!iconRight;
  const hasAnyIcon = hasLeftIcon || hasRightIcon;
  const textLabel = labelFromChildren(children);
  const tooltip = titleProp ?? (hasAnyIcon ? textLabel : undefined);
  const ariaLabel = ariaLabelProp ?? (hasAnyIcon ? tooltip : undefined);
  const showText = !hasAnyIcon && children != null && children !== false && children !== '';

  const iconOnly =
    size === 'icon' || (hasAnyIcon && !showText) || (!children && !iconRight && !!icon) || (!children && !icon && !!iconRight);

  const classes = [
    'btn',
    variant === 'primary' && 'btn--primary',
    variant === 'ghost' && 'btn--ghost',
    variant === 'danger' && 'btn--danger',
    variant === 'secondary' && 'btn--secondary',
    size === 'sm' && 'btn--small',
    iconOnly && 'btn--icon',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type={type}
      className={classes}
      title={tooltip}
      aria-label={ariaLabel}
      {...rest}
    >
      {icon ? <span className="btn__icon">{icon}</span> : null}
      {showText ? <span className="btn__text">{children}</span> : null}
      {iconRight ? <span className="btn__icon btn__icon--end">{iconRight}</span> : null}
    </button>
  );
}

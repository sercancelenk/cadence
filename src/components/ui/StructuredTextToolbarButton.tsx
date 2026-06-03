import type { ReactNode } from 'react';
import { Button } from './Button';

type StructuredTextToolbarButtonProps = {
  label: string;
  icon: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  /** Overrides native tooltip; defaults to `label`. */
  tooltip?: string;
};

/** Icon-only toolbar control with hover tooltip for JSON / YAML editors. */
export function StructuredTextToolbarButton({
  label,
  icon,
  onClick,
  disabled,
  tooltip,
}: StructuredTextToolbarButtonProps) {
  return (
    <Button
      size="sm"
      variant="secondary"
      icon={icon}
      onClick={onClick}
      disabled={disabled}
      title={tooltip ?? label}
    >
      {label}
    </Button>
  );
}

import type { ReactNode } from 'react';
import { AppModal } from '../../components/ui/AppModal';

export type NotesDialogProps = {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  onClose: () => void;
  footer: ReactNode;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
};

export function NotesDialog({
  title,
  description,
  icon,
  onClose,
  footer,
  children,
  size = 'sm',
}: NotesDialogProps) {
  return (
    <AppModal
      title={title}
      description={description}
      icon={icon}
      onClose={onClose}
      size={size}
      showCloseButton
      footer={footer}
    >
      {children}
    </AppModal>
  );
}

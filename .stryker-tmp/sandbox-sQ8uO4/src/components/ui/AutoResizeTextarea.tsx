// @ts-nocheck
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { ChangeEvent, KeyboardEvent, FocusEvent } from 'react';

type Props = {
  value: string;
  onChange: (next: string) => void;
  onSubmit?: () => void;
  onBlur?: () => void;
  onCancel?: () => void;
  placeholder?: string;
  className?: string;
  minRows?: number;
  maxRows?: number;
  autoFocus?: boolean;
  disabled?: boolean;
  /**
   * Controls keyboard submit behaviour:
   *   - 'enter'  → plain Enter submits, Shift+Enter inserts a newline (chat-style),
   *   - 'mod'    → Enter inserts a newline, Cmd/Ctrl+Enter submits (long-form-style),
   *   - 'never'  → Enter just inserts a newline, no submit shortcut.
   * Default is 'mod' because callers usually want a real multi-line surface.
   */
  submitMode?: 'enter' | 'mod' | 'never';
  ariaLabel?: string;
};

/**
 * Multi-line text input that grows with its content. Designed so a task title
 * field stops being a cramped one-liner without surprising power users:
 *   - plain Enter submits (matches the old single-line input behaviour),
 *   - Shift+Enter (or Cmd/Ctrl+Enter) inserts a newline,
 *   - Escape calls onCancel,
 *   - growth is bounded between minRows and maxRows so layouts stay sane.
 */
export const AutoResizeTextarea = forwardRef<HTMLTextAreaElement, Props>(function AutoResizeTextarea(
  {
    value,
    onChange,
    onSubmit,
    onBlur,
    onCancel,
    placeholder,
    className,
    minRows = 1,
    maxRows = 8,
    autoFocus,
    disabled,
    submitMode = 'mod',
    ariaLabel,
  },
  ref,
) {
  const inner = useRef<HTMLTextAreaElement | null>(null);
  useImperativeHandle(ref, () => inner.current as HTMLTextAreaElement, []);

  // Recompute height whenever value changes so the textarea always hugs its
  // contents. minRows/maxRows are honoured by clamping scrollHeight.
  useEffect(() => {
    const el = inner.current;
    if (!el) return;
    el.style.height = 'auto';
    const cs = window.getComputedStyle(el);
    const lineHeight = parseFloat(cs.lineHeight) || 20;
    const padTop = parseFloat(cs.paddingTop) || 0;
    const padBottom = parseFloat(cs.paddingBottom) || 0;
    const min = lineHeight * minRows + padTop + padBottom;
    const max = lineHeight * maxRows + padTop + padBottom;
    el.style.height = `${Math.min(Math.max(el.scrollHeight, min), max)}px`;
    el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden';
  }, [value, minRows, maxRows]);

  return (
    <textarea
      ref={inner}
      className={className}
      value={value}
      placeholder={placeholder}
      autoFocus={autoFocus}
      disabled={disabled}
      aria-label={ariaLabel}
      rows={minRows}
      onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
      onBlur={(_e: FocusEvent<HTMLTextAreaElement>) => onBlur?.()}
      onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onCancel?.();
          return;
        }
        if (e.key !== 'Enter') return;

        if (submitMode === 'enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault();
          onSubmit?.();
          return;
        }
        if (submitMode === 'mod' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          onSubmit?.();
        }
      }}
    />
  );
});

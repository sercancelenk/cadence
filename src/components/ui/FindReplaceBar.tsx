import { useEffect, useRef, type KeyboardEvent } from 'react';
import { IcChevronDown, IcChevronRight, IcSearch, IcX } from '../icons';

export interface FindReplaceBarProps {
  find: string;
  replace: string;
  caseSensitive: boolean;
  /** Whether the replace row is expanded. */
  replaceOpen: boolean;
  /** Replace controls are only enabled when the editor is editable. */
  canReplace: boolean;
  /** Total matches for the current query. */
  matchCount: number;
  /** 1-based index of the active match, or 0 when none is focused. */
  currentIndex: number;
  onFindChange: (value: string) => void;
  onReplaceChange: (value: string) => void;
  onToggleCase: () => void;
  onToggleReplace: () => void;
  onNext: () => void;
  onPrev: () => void;
  onReplaceOne: () => void;
  onReplaceAll: () => void;
  onClose: () => void;
}

/**
 * VS Code-style find & replace bar. Purely presentational: the owning editor
 * supplies match counts and wires the callbacks to its own search engine
 * (ProseMirror for rich text, plain string ops for the Markdown textarea).
 */
export function FindReplaceBar({
  find,
  replace,
  caseSensitive,
  replaceOpen,
  canReplace,
  matchCount,
  currentIndex,
  onFindChange,
  onReplaceChange,
  onToggleCase,
  onToggleReplace,
  onNext,
  onPrev,
  onReplaceOne,
  onReplaceAll,
  onClose,
}: FindReplaceBarProps) {
  const findInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    // Focus + select on mount so re-opening over a selection is type-to-search.
    const el = findInputRef.current;
    if (el) {
      el.focus();
      el.select();
    }
  }, []);

  const matchLabel = find
    ? matchCount === 0
      ? 'No results'
      : `${currentIndex || 1} of ${matchCount}`
    : '';

  const onFindKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) onPrev();
      else onNext();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const onReplaceKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onReplaceOne();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div className="find-bar" role="search" aria-label="Find and replace">
      <button
        type="button"
        className="find-bar__toggle"
        aria-label={replaceOpen ? 'Hide replace' : 'Show replace'}
        aria-expanded={replaceOpen}
        title={replaceOpen ? 'Hide replace' : 'Show replace'}
        onClick={onToggleReplace}
      >
        {replaceOpen ? <IcChevronDown size={14} /> : <IcChevronRight size={14} />}
      </button>

      <div className="find-bar__fields">
        <div className="find-bar__row">
          <span className="find-bar__ic" aria-hidden>
            <IcSearch size={14} />
          </span>
          <input
            ref={findInputRef}
            className="find-bar__input"
            type="text"
            placeholder="Find"
            value={find}
            aria-label="Find"
            onChange={(e) => onFindChange(e.target.value)}
            onKeyDown={onFindKeyDown}
          />
          <span className="find-bar__count" aria-live="polite">
            {matchLabel}
          </span>
          <button
            type="button"
            className={`find-bar__btn find-bar__btn--case${caseSensitive ? ' find-bar__btn--on' : ''}`}
            aria-pressed={caseSensitive}
            title="Match case"
            onClick={onToggleCase}
          >
            Aa
          </button>
          <button
            type="button"
            className="find-bar__btn"
            title="Previous match (Shift+Enter)"
            aria-label="Previous match"
            disabled={matchCount === 0}
            onClick={onPrev}
          >
            <IcChevronDown size={14} style={{ transform: 'rotate(180deg)' }} />
          </button>
          <button
            type="button"
            className="find-bar__btn"
            title="Next match (Enter)"
            aria-label="Next match"
            disabled={matchCount === 0}
            onClick={onNext}
          >
            <IcChevronDown size={14} />
          </button>
          <button
            type="button"
            className="find-bar__btn find-bar__btn--close"
            title="Close (Esc)"
            aria-label="Close find bar"
            onClick={onClose}
          >
            <IcX size={14} />
          </button>
        </div>

        {replaceOpen ? (
          <div className="find-bar__row">
            <span className="find-bar__ic" aria-hidden />
            <input
              className="find-bar__input"
              type="text"
              placeholder="Replace"
              value={replace}
              aria-label="Replace"
              disabled={!canReplace}
              onChange={(e) => onReplaceChange(e.target.value)}
              onKeyDown={onReplaceKeyDown}
            />
            <button
              type="button"
              className="find-bar__btn find-bar__btn--text"
              title="Replace (Enter)"
              disabled={!canReplace || matchCount === 0}
              onClick={onReplaceOne}
            >
              Replace
            </button>
            <button
              type="button"
              className="find-bar__btn find-bar__btn--text"
              title="Replace all"
              disabled={!canReplace || matchCount === 0}
              onClick={onReplaceAll}
            >
              All
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

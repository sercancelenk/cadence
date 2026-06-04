import { useMemo, useRef, useState } from 'react';
import {
  computeStructuredSemanticDiff,
  semanticDiffCounts,
  semanticPathDisplayName,
  type StructuredSemanticDiffFilter,
} from '../../lib/structuredTextSemanticDiff';
import {
  buildSemanticSummaryItemHeights,
  buildSemanticSummarySections,
  countSemanticSummaryRows,
  flattenSemanticSummarySections,
  SUMMARY_VIRTUAL_ROW_HEIGHT,
  SUMMARY_VIRTUAL_ROW_THRESHOLD,
  type SemanticSummaryListItem,
  type SemanticSummaryRow,
  type SemanticSummarySection,
} from '../../lib/structuredTextSemanticSummary';
import { useVariableVirtualList } from '../../hooks/useVariableVirtualList';
import type { StructuredTextLanguage } from '../../lib/structuredText';

export type StructuredTextSemanticDiffPanelProps = {
  valueA: string;
  valueB: string;
  language: StructuredTextLanguage;
  leftLabel?: string;
  rightLabel?: string;
  onJumpToPath?: (side: 'a' | 'b', path: string) => void;
};

export function StructuredTextSemanticDiffPanel({
  valueA,
  valueB,
  language,
  leftLabel = 'Left',
  rightLabel = 'Right',
  onJumpToPath,
}: StructuredTextSemanticDiffPanelProps) {
  const [filter, setFilter] = useState<StructuredSemanticDiffFilter>('all');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const result = useMemo(
    () => computeStructuredSemanticDiff(valueA, valueB, language),
    [valueA, valueB, language],
  );

  const sections = useMemo(() => {
    if (!result.ok) return [];
    return buildSemanticSummarySections(result, filter, leftLabel, rightLabel);
  }, [result, filter, leftLabel, rightLabel]);

  const listItems = useMemo(() => flattenSemanticSummarySections(sections), [sections]);
  const rowCount = useMemo(() => countSemanticSummaryRows(sections), [sections]);
  const useVirtual = rowCount > SUMMARY_VIRTUAL_ROW_THRESHOLD;
  const itemHeights = useMemo(
    () => (useVirtual ? buildSemanticSummaryItemHeights(listItems) : []),
    [useVirtual, listItems],
  );
  const virtual = useVariableVirtualList(scrollRef, { itemHeights });

  if (!result.ok) {
    return (
      <div className="structured-text-semantic-diff structured-text-semantic-diff--err" role="status">
        <p className="structured-text-semantic-diff__title">Summary unavailable</p>
        <p className="muted small">{result.error}</p>
      </div>
    );
  }

  const counts = semanticDiffCounts(result);

  if (counts.total === 0) {
    return (
      <div className="structured-text-semantic-diff structured-text-semantic-diff--empty" role="status">
        <p className="structured-text-semantic-diff__title">Summary</p>
        <p className="muted small">
          {leftLabel} and {rightLabel} match — no field or value differences.
        </p>
      </div>
    );
  }

  return (
    <div className="structured-text-semantic-diff">
      <div className="structured-text-semantic-diff__head">
        <div className="structured-text-semantic-diff__head-text">
          <p className="structured-text-semantic-diff__title">Summary</p>
          <p className="structured-text-semantic-diff__lead muted small">
            {leftLabel} ↔ {rightLabel} — compare by field path, not line number
          </p>
        </div>
        <div className="structured-text-semantic-diff__filters" role="tablist" aria-label="Summary filter">
          <FilterTab
            active={filter === 'all'}
            label="All"
            count={counts.total}
            onClick={() => setFilter('all')}
          />
          <FilterTab
            active={filter === 'keys'}
            label="Keys"
            count={counts.keys}
            onClick={() => setFilter('keys')}
          />
          <FilterTab
            active={filter === 'values'}
            label="Values"
            count={counts.values}
            onClick={() => setFilter('values')}
          />
        </div>
      </div>

      <div
        ref={scrollRef}
        className={`structured-text-semantic-diff__sections${useVirtual ? ' structured-text-semantic-diff__sections--virtual' : ''}`}
      >
        {useVirtual ? (
          <>
            <div className="structured-text-semantic-diff__table-head structured-text-semantic-diff__table-head--sticky" role="row">
              <span role="columnheader">Field</span>
              <span role="columnheader">{leftLabel}</span>
              <span role="columnheader">{rightLabel}</span>
            </div>
            <div
              className="structured-text-semantic-diff__virtual-track"
              style={{ height: virtual.totalHeight }}
            >
              {virtual.items.map(({ index, top, height }) => (
                <div
                  key={listItems[index]!.key}
                  className="structured-text-semantic-diff__virtual-item"
                  style={{ transform: `translateY(${top}px)`, height }}
                >
                  <SummaryListItem item={listItems[index]!} onJump={onJumpToPath} />
                </div>
              ))}
            </div>
          </>
        ) : (
          sections.map((section) => (
            <CompareSection
              key={section.id}
              section={section}
              leftLabel={leftLabel}
              rightLabel={rightLabel}
              onJump={onJumpToPath}
            />
          ))
        )}
      </div>
    </div>
  );
}

function FilterTab({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`structured-text-semantic-diff__filter${active ? ' structured-text-semantic-diff__filter--active' : ''}`}
      onClick={onClick}
    >
      {label}
      <span className="structured-text-semantic-diff__filter-count">{count}</span>
    </button>
  );
}

function SummaryListItem({
  item,
  onJump,
}: {
  item: SemanticSummaryListItem;
  onJump?: (side: 'a' | 'b', path: string) => void;
}) {
  if (item.kind === 'header') {
    return <SectionHead section={item.section} compact={item.section.rows.length > 0} />;
  }

  return (
    <CompareRowItem
      row={item.row}
      tone={item.tone}
      virtualized
      onJump={onJump}
    />
  );
}

function CompareSection({
  section,
  leftLabel,
  rightLabel,
  onJump,
}: {
  section: SemanticSummarySection;
  leftLabel: string;
  rightLabel: string;
  onJump?: (side: 'a' | 'b', path: string) => void;
}) {
  return (
    <section className={`structured-text-semantic-diff__section structured-text-semantic-diff__section--${section.tone}`}>
      <SectionHead section={section} />
      <div
        className="structured-text-semantic-diff__table"
        role="table"
        aria-label={`${section.title}: ${leftLabel} vs ${rightLabel}`}
      >
        <div className="structured-text-semantic-diff__table-head" role="row">
          <span role="columnheader">Field</span>
          <span role="columnheader">{leftLabel}</span>
          <span role="columnheader">{rightLabel}</span>
        </div>
        <ul className="structured-text-semantic-diff__list">
          {section.rows.map((row) => (
            <CompareRowItem
              key={`${section.id}:${row.path}:${row.fieldLabel ?? ''}`}
              row={row}
              tone={section.tone}
              onJump={onJump}
            />
          ))}
        </ul>
      </div>
    </section>
  );
}

function SectionHead({
  section,
  compact = false,
}: {
  section: SemanticSummarySection;
  compact?: boolean;
}) {
  return (
    <div
      className={`structured-text-semantic-diff__section-head${compact ? ' structured-text-semantic-diff__section-head--compact' : ''}`}
    >
      <h3 className="structured-text-semantic-diff__section-title">
        {section.title}
        <span className="structured-text-semantic-diff__section-count">{section.rows.length}</span>
      </h3>
      {!compact ? (
        <p className="structured-text-semantic-diff__section-hint muted small">{section.hint}</p>
      ) : null}
    </div>
  );
}

function CompareRowItem({
  row,
  tone,
  virtualized = false,
  onJump,
}: {
  row: SemanticSummaryRow;
  tone: SemanticSummarySection['tone'];
  virtualized?: boolean;
  onJump?: (side: 'a' | 'b', path: string) => void;
}) {
  const displayName = row.fieldLabel ?? semanticPathDisplayName(row.path);
  const pathLeft = row.jumpPathLeft ?? row.path;
  const pathRight = row.jumpPathRight ?? row.path;

  return (
    <li
      className={`structured-text-semantic-diff__item structured-text-semantic-diff__item--${tone}${virtualized ? ' structured-text-semantic-diff__item--virtual' : ''}`}
      role="row"
      style={virtualized ? { minHeight: SUMMARY_VIRTUAL_ROW_HEIGHT } : undefined}
    >
      <div className="structured-text-semantic-diff__field" role="cell">
        <span className="structured-text-semantic-diff__field-name">{displayName}</span>
        <code className="structured-text-semantic-diff__field-path muted small" title={row.path}>
          {row.path}
        </code>
      </div>
      <SideCell
        side="a"
        value={row.left}
        jumpable={row.jumpLeft}
        jumpPath={pathLeft}
        onJump={onJump}
      />
      <SideCell
        side="b"
        value={row.right}
        jumpable={row.jumpRight}
        jumpPath={pathRight}
        onJump={onJump}
      />
    </li>
  );
}

function SideCell({
  side,
  value,
  jumpable,
  jumpPath,
  onJump,
}: {
  side: 'a' | 'b';
  value: string;
  jumpable: boolean;
  jumpPath: string;
  onJump?: (side: 'a' | 'b', path: string) => void;
}) {
  const empty = value === '—';
  const className = [
    'structured-text-semantic-diff__side',
    `structured-text-semantic-diff__side--${side}`,
    empty ? 'structured-text-semantic-diff__side--empty' : '',
    jumpable && !empty ? 'structured-text-semantic-diff__side--jump' : '',
  ]
    .filter(Boolean)
    .join(' ');

  if (jumpable && !empty) {
    return (
      <button
        type="button"
        role="cell"
        className={className}
        title={`Jump to this field on ${side === 'a' ? 'left' : 'right'}`}
        onClick={() => onJump?.(side, jumpPath)}
      >
        <code>{value}</code>
      </button>
    );
  }

  return (
    <span role="cell" className={className} aria-hidden={empty}>
      <code>{value}</code>
    </span>
  );
}

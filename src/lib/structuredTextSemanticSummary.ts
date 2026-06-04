import {
  formatStructuredValue,
  semanticPathDisplayName,
  type StructuredSemanticDiff,
  type StructuredSemanticDiffFilter,
} from './structuredTextSemanticDiff';

export const SUMMARY_VIRTUAL_ROW_THRESHOLD = 80;
export const SUMMARY_VIRTUAL_ROW_HEIGHT = 54;
export const SUMMARY_VIRTUAL_HEADER_HEIGHT = 72;

const EMPTY_CELL = '—';

export type SemanticSummaryRow = {
  path: string;
  fieldLabel?: string;
  left: string;
  right: string;
  jumpLeft: boolean;
  jumpRight: boolean;
  jumpPathLeft?: string;
  jumpPathRight?: string;
};

export type SemanticSummarySection = {
  id: string;
  title: string;
  hint: string;
  tone: 'add' | 'remove' | 'change' | 'rename' | 'order';
  rows: SemanticSummaryRow[];
};

export type SemanticSummaryListItem =
  | {
      kind: 'header';
      key: string;
      section: SemanticSummarySection;
    }
  | {
      kind: 'row';
      key: string;
      sectionId: string;
      tone: SemanticSummarySection['tone'];
      row: SemanticSummaryRow;
    };

export function buildSemanticSummarySections(
  diff: StructuredSemanticDiff,
  filter: StructuredSemanticDiffFilter,
  leftLabel: string,
  rightLabel: string,
): SemanticSummarySection[] {
  const showAdded = filter === 'all' || filter === 'keys';
  const showRemoved = filter === 'all' || filter === 'keys';
  const showRenamed = filter === 'all' || filter === 'keys';
  const showChanged = filter === 'all' || filter === 'values';
  const showReordered = filter === 'all' || filter === 'values';

  const sections: SemanticSummarySection[] = [];

  if (showRenamed && diff.renamed.length > 0) {
    sections.push({
      id: 'renamed',
      title: 'Possible renames',
      hint: `Same value under a different field name on ${leftLabel} vs ${rightLabel}`,
      tone: 'rename',
      rows: diff.renamed.map((item) => ({
        path: item.fromPath,
        fieldLabel: `${semanticPathDisplayName(item.fromPath)} → ${semanticPathDisplayName(item.toPath)}`,
        left: formatStructuredValue(item.value),
        right: formatStructuredValue(item.value),
        jumpLeft: true,
        jumpRight: true,
        jumpPathLeft: item.fromPath,
        jumpPathRight: item.toPath,
      })),
    });
  }

  if (showAdded && diff.added.length > 0) {
    sections.push({
      id: 'added',
      title: `Only on ${rightLabel}`,
      hint: `Field exists on ${rightLabel} but not on ${leftLabel}`,
      tone: 'add',
      rows: diff.added.map((item) => ({
        path: item.path,
        left: EMPTY_CELL,
        right: formatStructuredValue(item.after),
        jumpLeft: false,
        jumpRight: true,
      })),
    });
  }

  if (showRemoved && diff.removed.length > 0) {
    sections.push({
      id: 'removed',
      title: `Only on ${leftLabel}`,
      hint: `Field exists on ${leftLabel} but not on ${rightLabel}`,
      tone: 'remove',
      rows: diff.removed.map((item) => ({
        path: item.path,
        left: formatStructuredValue(item.before),
        right: EMPTY_CELL,
        jumpLeft: true,
        jumpRight: false,
      })),
    });
  }

  if (showChanged && diff.changed.length > 0) {
    sections.push({
      id: 'changed',
      title: 'Value changes',
      hint: `Same field path, different value on ${leftLabel} vs ${rightLabel}`,
      tone: 'change',
      rows: diff.changed.map((item) => ({
        path: item.path,
        left: formatStructuredValue(item.before),
        right: formatStructuredValue(item.after),
        jumpLeft: true,
        jumpRight: true,
      })),
    });
  }

  if (showReordered && diff.reordered.length > 0) {
    sections.push({
      id: 'reordered',
      title: 'List order changes',
      hint: `Same items in the list, different order on ${leftLabel} vs ${rightLabel}`,
      tone: 'order',
      rows: diff.reordered.map((item) => ({
        path: item.path,
        left: formatStructuredValue(item.before),
        right: formatStructuredValue(item.after),
        jumpLeft: true,
        jumpRight: true,
      })),
    });
  }

  return sections;
}

export function flattenSemanticSummarySections(
  sections: SemanticSummarySection[],
): SemanticSummaryListItem[] {
  const items: SemanticSummaryListItem[] = [];
  for (const section of sections) {
    items.push({ kind: 'header', key: `${section.id}:head`, section });
    for (const row of section.rows) {
      items.push({
        kind: 'row',
        key: `${section.id}:${row.path}:${row.fieldLabel ?? ''}`,
        sectionId: section.id,
        tone: section.tone,
        row,
      });
    }
  }
  return items;
}

export function countSemanticSummaryRows(sections: SemanticSummarySection[]): number {
  return sections.reduce((total, section) => total + section.rows.length, 0);
}

export function buildSemanticSummaryItemHeights(items: SemanticSummaryListItem[]): number[] {
  return items.map((item) =>
    item.kind === 'header' ? SUMMARY_VIRTUAL_HEADER_HEIGHT : SUMMARY_VIRTUAL_ROW_HEIGHT,
  );
}

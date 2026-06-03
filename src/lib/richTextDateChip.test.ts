import { Editor } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { describe, expect, it } from 'vitest';
import { DateChip, formatDateChipLabel, todayIsoDate } from './richTextDateChip';

function editorWithDateChip(content?: string) {
  return new Editor({
    extensions: [Document, Paragraph, Text, DateChip],
    content: content ?? '<p></p>',
  });
}

describe('formatDateChipLabel', () => {
  it('formats YYYY-MM-DD for display', () => {
    const label = formatDateChipLabel('2026-05-31');
    expect(label).toBeTruthy();
    expect(label).not.toBe('2026-05-31');
  });

  it('returns raw string for invalid dates', () => {
    expect(formatDateChipLabel('not-a-date')).toBe('not-a-date');
  });
});

describe('todayIsoDate', () => {
  it('returns YYYY-MM-DD', () => {
    expect(todayIsoDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('DateChip node', () => {
  it('parseHTML reads iso and label from a time element', () => {
    const editor = editorWithDateChip(
      '<p><time data-date-chip data-iso="2026-06-01" data-label="Jun 1">Jun 1</time></p>',
    );
    const chip = editor.state.doc.descendants((node) => node.type.name === 'dateChip');
    let found = false;
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'dateChip') {
        found = true;
        expect(node.attrs.iso).toBe('2026-06-01');
        expect(node.attrs.label).toBe('Jun 1');
      }
    });
    expect(found).toBe(true);
    editor.destroy();
  });

  it('renderHTML falls back to formatted iso when label is missing', () => {
    const editor = editorWithDateChip();
    editor.commands.insertContent({
      type: 'dateChip',
      attrs: { iso: '2026-05-31', label: null },
    });
    const html = editor.getHTML();
    expect(html).toContain('data-date-chip');
    expect(html).toContain('datetime="2026-05-31"');
    editor.destroy();
  });

  it('renderHTML uses "Date" when iso is also missing', () => {
    const editor = editorWithDateChip();
    editor.commands.insertContent({
      type: 'dateChip',
      attrs: { iso: null, label: null },
    });
    expect(editor.getHTML()).toContain('Date');
    editor.destroy();
  });

  it('insertDateChip command uses today and formatted label by default', () => {
    const editor = editorWithDateChip();
    editor.commands.insertDateChip();
    const chip = editor.state.doc.nodeAt(1);
    expect(chip?.type.name).toBe('dateChip');
    expect(chip?.attrs.iso).toBe(todayIsoDate());
    expect(chip?.attrs.label).toBe(formatDateChipLabel(todayIsoDate()));
    editor.destroy();
  });

  it('insertDateChip trims iso to day and accepts custom label', () => {
    const editor = editorWithDateChip();
    editor.commands.insertDateChip({
      iso: '2026-12-25T15:00:00.000Z',
      label: 'Christmas',
    });
    const chip = editor.state.doc.nodeAt(1);
    expect(chip?.attrs.iso).toBe('2026-12-25');
    expect(chip?.attrs.label).toBe('Christmas');
    editor.destroy();
  });

  it('parseHTML reads label from textContent when data-label is absent', () => {
    const editor = editorWithDateChip(
      '<p><time data-date-chip data-iso="2026-07-04">July 4</time></p>',
    );
    let label: string | null = null;
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'dateChip') label = node.attrs.label as string;
    });
    expect(label).toBe('July 4');
    editor.destroy();
  });

  it('renderHTML keeps an explicit label and datetime', () => {
    const editor = editorWithDateChip();
    editor.commands.insertContent({
      type: 'dateChip',
      attrs: { iso: '2026-03-15', label: 'Custom label' },
    });
    const html = editor.getHTML();
    expect(html).toContain('data-label="Custom label"');
    expect(html).toContain('datetime="2026-03-15"');
    expect(html).toContain('Custom label');
    editor.destroy();
  });

  it('insertDateChip formats label when only iso is provided', () => {
    const editor = editorWithDateChip();
    editor.commands.insertDateChip({ iso: '2026-08-20' });
    const chip = editor.state.doc.nodeAt(1);
    expect(chip?.attrs.iso).toBe('2026-08-20');
    expect(chip?.attrs.label).toBe(formatDateChipLabel('2026-08-20'));
    editor.destroy();
  });
});

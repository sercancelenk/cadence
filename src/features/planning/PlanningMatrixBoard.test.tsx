import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TodoGroup, TodoItem } from '../../model';
import { PlanningMatrixBoard } from './PlanningMatrixBoard';

afterEach(cleanup);

const AT = '2026-10-24T10:00:00.000Z';
const groups: TodoGroup[] = [{ id: 'g1', name: 'Work', sortOrder: 1, createdAt: AT }];
const item = (id: string, over: Partial<TodoItem> = {}): TodoItem =>
  ({ id, groupId: 'g1', title: id, status: 'todo', done: false, sortOrder: 1, createdAt: AT, updatedAt: AT, planInHub: true, ...over }) as TodoItem;

function board(hubItems: TodoItem[], onClassifyWithAi?: () => void, aiNeedsSetup = false) {
  render(
    <MemoryRouter>
    <PlanningMatrixBoard
      hubItems={hubItems}
      groups={groups}
      focusIds={new Set()}
      onMoveToQuadrant={() => {}}
      onToggleFocus={() => {}}
      onRemoveFromHub={() => {}}
      onToggleComplete={() => {}}
      onStatusChange={() => {}}
      onPreview={() => {}}
      onClassifyWithAi={onClassifyWithAi}
      aiNeedsSetup={aiNeedsSetup}
    />
    </MemoryRouter>,
  );
}

describe('PlanningMatrixBoard AI entry', () => {
  it('offers "Classify with AI" only when AI is on and some task is unsorted', () => {
    const onClassify = vi.fn();
    board([item('a'), item('b', { planImportant: true, planUrgent: false })], onClassify);
    fireEvent.click(screen.getByRole('button', { name: /Classify with AI/ }));
    expect(onClassify).toHaveBeenCalledTimes(1);
  });

  it('is absent without the handler', () => {
    board([item('a')]);
    expect(screen.queryByRole('button', { name: /Classify with AI/ })).toBeNull();
  });

  it('stays visible but disabled, and says why, when every task is already sorted or the hub is empty', () => {
    const onClassify = vi.fn();
    board([item('a', { planImportant: true, planUrgent: true })], onClassify);
    const sorted = screen.getByRole('button', { name: /Classify with AI/ }) as HTMLButtonElement;
    expect(sorted.disabled).toBe(true);
    expect(sorted.title).toMatch(/already sorted/i);
    fireEvent.click(sorted);
    expect(onClassify).not.toHaveBeenCalled();
    cleanup();
    board([], onClassify);
    const empty = screen.getByRole('button', { name: /Classify with AI/ }) as HTMLButtonElement;
    expect(empty.disabled).toBe(true);
    expect(empty.title).toMatch(/add tasks/i);
  });

  it('points to the AI settings when AI is on but no connection is set up', () => {
    board([item('a')], undefined, true);
    const link = screen.getByRole('link', { name: /Set up AI/ });
    expect(link.getAttribute('href')).toBe('/settings#ai');
    expect(screen.queryByRole('button', { name: /Classify with AI/ })).toBeNull();
  });
});

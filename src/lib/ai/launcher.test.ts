import { describe, expect, it, vi } from 'vitest';
import { AI_TOOL_IDS, isAiToolId, openAiTool, subscribeAiTool } from './launcher';

describe('AI tool launcher', () => {
  it('delivers an opened tool to every subscriber until it unsubscribes', () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = subscribeAiTool(a);
    const offB = subscribeAiTool(b);
    openAiTool('weekly-digest');
    expect(a).toHaveBeenCalledWith('weekly-digest');
    expect(b).toHaveBeenCalledWith('weekly-digest');
    offA();
    openAiTool('weekly-digest');
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
    offB();
  });

  it('recognises only tools it can open', () => {
    expect(isAiToolId('weekly-digest')).toBe(true);
    expect(isAiToolId('break-down')).toBe(false);
    expect(AI_TOOL_IDS).toContain('weekly-digest');
    expect(isAiToolId('screenshot-to-diagram')).toBe(true);
    expect(isAiToolId('ask-workspace')).toBe(true);
  });

  it('passes a preset to subscribers, and nothing extra when there is none', () => {
    const h = vi.fn();
    const off = subscribeAiTool(h);
    openAiTool('weekly-digest', { mode: 'upward' });
    expect(h).toHaveBeenLastCalledWith('weekly-digest', { mode: 'upward' });
    openAiTool('weekly-digest');
    expect(h).toHaveBeenLastCalledWith('weekly-digest');
    off();
  });

  it('knows the draw tool and passes its format preset', () => {
    expect(isAiToolId('draw-from-description')).toBe(true);
    const h = vi.fn();
    const off = subscribeAiTool(h);
    openAiTool('draw-from-description', { format: 'sketch' });
    expect(h).toHaveBeenLastCalledWith('draw-from-description', { format: 'sketch' });
    off();
  });
});

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeData } from '../model';

let mobileWeb = false;
let aiOn = false;
const openAiTool = vi.hoisted(() => vi.fn());
let workspace = normalizeData(null);

vi.mock('../lib/runtime', () => ({ useMobileWeb: () => mobileWeb }));
vi.mock('../lib/ai/launcher', () => ({ openAiTool }));
vi.mock('../lib/features', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/features')>()),
  useFeatures: () => ({ features: { ai: aiOn, aiPeople: true, aiFocusNote: true } }),
}));
vi.mock('../lib/appBranding', () => ({ brandIconUrl: () => 'logo.png' }));
vi.mock('../AccountContext', () => ({ useAccount: () => ({ user: { id: 'u1' } }) }));
vi.mock('../AppDataContext', () => ({
  useAppDataSelector: (select: (d: ReturnType<typeof normalizeData>) => unknown) => select(workspace),
}));
vi.mock('./AppSidebarFooter', () => ({ AppSidebarFooter: () => null }));

import { AppSidebar } from './AppSidebar';

const KEY = 'cadence.sidebar.collapsedGroups.v1:u1';

function mount(path = '/agenda', collapsed = false) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppSidebar collapsed={collapsed} />
    </MemoryRouter>,
  );
}
const openAll = () => localStorage.setItem(KEY, '[]');
const linkNames = (scope: HTMLElement = document.body) =>
  Array.from(scope.querySelectorAll('a')).map((a) => a.textContent?.trim());

beforeEach(() => {
  mobileWeb = false;
  aiOn = false;
  openAiTool.mockClear();
  workspace = normalizeData(null);
  localStorage.clear();
});
afterEach(cleanup);

describe('AppSidebar layout', () => {
  it('puts Home first, then Workspace, Insights, Utilities, People and Account last', () => {
    openAll();
    mount();
    const heads = screen.getAllByRole('button', { expanded: true }).map((b) => b.textContent?.trim());
    expect(heads).toEqual(['Workspace', 'Insights', 'Utilities', 'People', 'Account']);
    expect(linkNames()[0]).toBe('Home');
  });

  it('starts with People and Account folded when nothing was saved', () => {
    mount('/agenda');
    const state = (name: string) => screen.getByRole('button', { name }).getAttribute('aria-expanded');
    expect(state('People')).toBe('false');
    expect(state('Account')).toBe('false');
    expect(state('Workspace')).toBe('true');
    expect(state('Insights')).toBe('true');
    expect(state('Utilities')).toBe('true');
    expect(screen.queryByRole('link', { name: 'Teams' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Settings' })).toBeNull();
  });

  it('lists the grouped items in order', () => {
    openAll();
    mount();
    expect(linkNames()).toEqual([
      'Home',
      'Agenda',
      'Planning',
      'To-dos',
      'Notes',
      'Analytics',
      'Document',
      'Sketch',
      'Time',
      'ER diagram',
      'JSON / YAML',
      'Others',
      'Teams',
      'Profile',
      'Settings',
    ]);
  });

  it('points Time, ER diagram, Sketch and Others at their tool pages', () => {
    openAll();
    mount();
    const href = (name: string) => screen.getByRole('link', { name }).getAttribute('href');
    expect(href('Time')).toBe('/utilities/tools/time');
    expect(href('ER diagram')).toBe('/utilities/tools/erd');
    expect(href('Sketch')).toBe('/utilities/tools/sketch');
    expect(href('Others')).toBe('/utilities/tools');
    expect(href('Document')).toBe('/utilities/document');
  });

  it('hides desktop-only items and empty groups on mobile web', () => {
    mobileWeb = true;
    openAll();
    mount();
    expect(screen.queryByRole('link', { name: 'Home' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Teams' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Analytics' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'People' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Insights' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Utilities' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Agenda' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Settings' })).toBeTruthy();
  });
});

describe('AppSidebar collapsible groups', () => {
  it('collapses and expands a group from its header and remembers it', () => {
    mount('/agenda');
    const head = screen.getByRole('button', { name: 'Utilities' });
    expect(head.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(head);
    expect(head.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('link', { name: 'Sketch' })).toBeNull();
    expect(JSON.parse(localStorage.getItem(KEY) ?? '[]').sort()).toEqual(['account', 'people', 'utilities']);
    fireEvent.click(head);
    expect(screen.getByRole('link', { name: 'Sketch' })).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(KEY) ?? '[]').sort()).toEqual(['account', 'people']);
    // Opening a default-folded group is remembered too.
    fireEvent.click(screen.getByRole('button', { name: 'People' }));
    expect(JSON.parse(localStorage.getItem(KEY) ?? '[]')).toEqual(['account']);
  });

  it('follows the saved state over the defaults', () => {
    localStorage.setItem(KEY, JSON.stringify(['workspace']));
    mount('/utilities/document');
    expect(screen.getByRole('button', { name: 'Workspace' }).getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByRole('button', { name: 'Account' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('link', { name: 'Profile' })).toBeTruthy();
  });

  it('keeps the group of the current page open even if it was saved as collapsed', () => {
    localStorage.setItem(KEY, JSON.stringify(['utilities']));
    mount('/utilities/tools/time');
    expect(screen.getByRole('button', { name: 'Utilities' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('link', { name: 'Time' })).toBeTruthy();
  });

  it('opens the People group for a team page', () => {
    localStorage.setItem(KEY, JSON.stringify(['people']));
    mount('/teams');
    expect(screen.getByRole('button', { name: 'People' }).getAttribute('aria-expanded')).toBe('true');
  });

  it('falls back to the defaults for unreadable or malformed saved state', () => {
    localStorage.setItem(KEY, '{not json');
    mount('/agenda');
    expect(screen.getByRole('button', { name: 'Utilities' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'Account' }).getAttribute('aria-expanded')).toBe('false');
    cleanup();
    localStorage.setItem(KEY, JSON.stringify({ not: 'a list' }));
    mount('/agenda');
    expect(screen.getByRole('button', { name: 'People' }).getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByRole('button', { name: 'Workspace' }).getAttribute('aria-expanded')).toBe('true');
  });

  it('shows every item without headers in the icon-only sidebar, even for collapsed groups', () => {
    localStorage.setItem(KEY, JSON.stringify(['utilities', 'account']));
    mount('/agenda', true);
    expect(screen.queryByRole('button', { name: 'Utilities' })).toBeNull();
    // Icon-only links carry no text, so they are found by their tooltip.
    expect(screen.getByTitle('Sketch — whiteboard')).toBeTruthy();
    expect(screen.getByTitle('Settings')).toBeTruthy();
  });
});

describe('AppSidebar active state', () => {
  const active = () => Array.from(document.querySelectorAll('a[aria-current="page"]')).map((a) => a.textContent?.trim());

  it('marks only Others active on a generic tool page, and the specific item on its own page', () => {
    mount('/utilities/tools/hash');
    expect(active()).toEqual(['Others']);
    cleanup();
    mount('/utilities/tools/time');
    expect(active()).toEqual(['Time']);
    cleanup();
    mount('/utilities/tools/sketch');
    expect(active()).toEqual(['Sketch']);
    cleanup();
    mount('/utilities/tools');
    expect(active()).toEqual(['Others']);
  });

  it('shows the team links when a team is open', () => {
    workspace = { ...normalizeData(null), teams: [{ id: 't1', name: 'Platform' } as never] };
    mount('/teams/t1');
    expect(screen.getByRole('link', { name: 'Overview' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Members' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'People' }).getAttribute('aria-expanded')).toBe('true');
  });
});

describe('AppSidebar AI shortcuts', () => {
  const connected = { provider: 'openai', apiKey: 'sk-test-key-12345', model: 'm' } as never;
  const heads = () => screen.getAllByRole('button', { expanded: true }).map((b) => b.textContent?.trim());

  it('is absent when AI is switched off', () => {
    openAll();
    workspace = { ...normalizeData(null), aiSettings: connected };
    mount();
    expect(screen.queryByRole('button', { name: 'AI' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Ask your workspace/ })).toBeNull();
  });

  it('sits between Workspace and Insights', () => {
    aiOn = true;
    workspace = { ...normalizeData(null), aiSettings: connected };
    openAll();
    mount();
    expect(heads()).toEqual(['Workspace', 'AI', 'Insights', 'Utilities', 'People', 'Account']);
  });

  it('opens the tools that need no selection', () => {
    aiOn = true;
    workspace = { ...normalizeData(null), aiSettings: connected };
    mount();
    fireEvent.click(screen.getByRole('button', { name: /Ask your workspace/ }));
    fireEvent.click(screen.getByRole('button', { name: /Weekly digest/ }));
    fireEvent.click(screen.getByRole('button', { name: /Diagram from a screenshot/ }));
    fireEvent.click(screen.getByRole('button', { name: /Draw from a description/ }));
    expect(openAiTool.mock.calls).toEqual([['ask-workspace'], ['weekly-digest'], ['screenshot-to-diagram'], ['draw-from-description']]);
  });

  it('offers only "Set up AI" until a provider is connected', () => {
    aiOn = true;
    mount();
    expect(screen.getByRole('link', { name: 'Set up AI' }).getAttribute('href')).toBe('/settings#ai');
    expect(screen.queryByRole('button', { name: /Ask your workspace/ })).toBeNull();
  });

  it('is open by default, folds like the other groups, and is reachable in the icon-only sidebar', () => {
    aiOn = true;
    workspace = { ...normalizeData(null), aiSettings: connected };
    mount();
    const head = screen.getByRole('button', { name: 'AI' });
    expect(head.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(head);
    expect(screen.queryByRole('button', { name: /Ask your workspace/ })).toBeNull();
    cleanup();
    mount('/agenda', true);
    expect(screen.getByTitle(/Ask your workspace/)).toBeTruthy();
  });
});

describe('group header of the group holding the current page', () => {
  it('cannot be folded, and says so, instead of silently changing the saved state', () => {
    mount('/agenda');
    const header = screen.getByRole('button', { name: /^Workspace$/ });
    fireEvent.click(header);
    expect(header.getAttribute('aria-expanded')).toBe('true');
    expect(header.getAttribute('aria-disabled')).toBe('true');
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});

describe('icon-only sidebar', () => {
  it('names each AI tool by its label, not only by a long tooltip', () => {
    aiOn = true;
    workspace = { ...normalizeData(null), aiSettings: { provider: 'openai', apiKey: 'sk-test-key-1234', model: 'gpt-5.4-mini' } };
    mount('/agenda', true);
    for (const name of ['Ask your workspace', 'Weekly digest', 'Diagram from a screenshot', 'Draw from a description']) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
  });

  it('does not indent the team items, so their icons line up with the rest of the rail', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync(`${process.cwd()}/src/styles/shell.css`, 'utf8');
    const rule = css.match(/\.app-shell--nav-collapsed \.app-sidebar__team\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(rule).toMatch(/margin:\s*4px 0 0\s*;/);
    expect(rule).toMatch(/padding-left:\s*0/);
    expect(rule).toMatch(/border-left:\s*0|border-left:\s*none/);
  });
});

describe('AppSidebar icon colours', () => {
  const TONES = ['amber', 'coral', 'orange', 'green', 'blue', 'pink', 'violet', 'teal', 'slate', 'ai'];

  it('gives every menu icon a colour tone, spread over many different hues', () => {
    aiOn = true;
    openAll();
    mount('/teams/t1');
    const icons = [...document.querySelectorAll('.app-sidebar__ic')];
    expect(icons.length).toBeGreaterThan(15);
    const tones = icons.map((el) => el.getAttribute('data-tone'));
    for (const tone of tones) expect(TONES).toContain(tone);
    expect(new Set(tones).size).toBeGreaterThanOrEqual(8);
  });

  it('colours the same destination the same way wherever it appears', () => {
    openAll();
    mount();
    const toneOf = (name: string) => screen.getByRole('link', { name }).querySelector('.app-sidebar__ic')?.getAttribute('data-tone');
    expect(toneOf('To-dos')).toBe('green');
    expect(toneOf('Notes')).toBe('blue');
    expect(toneOf('Planning')).toBe('orange');
    expect(toneOf('Agenda')).not.toBe(toneOf('Notes'));
  });
});

describe('AppSidebar AI group icons', () => {
  const AI_TOOLS = ['Ask your workspace', 'Weekly digest', 'Diagram from a screenshot', 'Draw from a description'];

  it('gives each AI tool its own icon, and marks every one as AI with a small sparkle', () => {
    aiOn = true;
    workspace = { ...normalizeData(null), aiSettings: { provider: 'openai', apiKey: 'sk-test-key-12345', model: 'm' } as never };
    openAll();
    mount();
    const topic = AI_TOOLS.map((name) => {
      const button = screen.getByRole('button', { name: new RegExp(name) });
      const svgs = button.querySelectorAll('.app-sidebar__ic svg');
      expect(svgs.length, name).toBe(2);
      expect(button.querySelector('.app-sidebar__ai-mark'), name).not.toBeNull();
      return svgs[0]!.innerHTML;
    });
    expect(new Set(topic).size).toBe(AI_TOOLS.length);
  });
});

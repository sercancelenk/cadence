/**
 * Generates docs/demo/cadence-screenshot-demo.json — a rich software-themed
 * workspace for marketing screenshots. Dates are relative to "now" so
 * Agenda, Analytics and Activity report stay populated after import.
 *
 * Usage: node scripts/generate-screenshot-demo.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '../docs/demo/cadence-screenshot-demo.json');

const DATA_VERSION = 3;

const TEAM_PLATFORM = '11111111-1111-4111-8111-111111111101';
const TEAM_PRODUCT = '11111111-1111-4111-8111-111111111102';

function isoDaysAgo(days, hour = 10, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function isoDaysFromNow(days, hour = 17, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function isoToday(hour, minute = 0) {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

const t0 = isoDaysAgo(14);
const t1 = isoDaysAgo(7);
const t2 = isoDaysAgo(3);
const t3 = isoDaysAgo(1);
const t4 = isoToday(9, 15);
const t5 = isoToday(14, 40);

const selfPlatform = `__self__${TEAM_PLATFORM}`;
const leaderPlatform = `__leader__${TEAM_PLATFORM}`;
const selfProduct = `__self__${TEAM_PRODUCT}`;
const leaderProduct = `__leader__${TEAM_PRODUCT}`;

const people = [
  {
    id: selfPlatform,
    teamId: TEAM_PLATFORM,
    name: 'Me',
    isSelf: true,
    title: 'Engineering Lead',
    scratchpad: '',
    createdAt: t0,
  },
  {
    id: leaderPlatform,
    teamId: TEAM_PLATFORM,
    name: 'Dana Weiss',
    title: 'VP Engineering',
    scratchpad: '## Q2 themes\n- Ship local-first sync story\n- Reduce on-call toil\n- Hire 2 senior backend engineers',
    agenda: '- [ ] Review platform OKRs\n- [ ] Discuss Cadence open-source launch timeline\n- [ ] Budget for observability tooling',
    createdAt: t0,
  },
  {
    id: '22222222-2222-4222-8222-222222222201',
    teamId: TEAM_PLATFORM,
    name: 'Alex Rivera',
    title: 'Senior Backend Engineer',
    scratchpad: 'Working on monthly shard persistence + backup merge path.',
    createdAt: t0,
  },
  {
    id: '22222222-2222-4222-8222-222222222202',
    teamId: TEAM_PLATFORM,
    name: 'Sam Okonkwo',
    title: 'Staff SRE',
    scratchpad: 'On-call this week. Watching error budget for sync API.',
    createdAt: t0,
  },
  {
    id: '22222222-2222-4222-8222-222222222203',
    teamId: TEAM_PLATFORM,
    name: 'Jordan Lee',
    title: 'Frontend Lead',
    scratchpad: 'Planning hub + activity report UI polish for v0.2.',
    createdAt: t1,
  },
  {
    id: selfProduct,
    teamId: TEAM_PRODUCT,
    name: 'Me',
    isSelf: true,
    scratchpad: '',
    createdAt: t0,
  },
  {
    id: leaderProduct,
    teamId: TEAM_PRODUCT,
    name: 'Morgan Patel',
    title: 'Product Manager',
    scratchpad: 'Cadence marketing pages refresh — need screenshots with realistic data.',
    createdAt: t0,
  },
  {
    id: '33333333-3333-4333-8333-333333333301',
    teamId: TEAM_PRODUCT,
    name: 'Riley Chen',
    title: 'Product Designer',
    scratchpad: 'Dark mode screenshot pass for landing page.',
    createdAt: t1,
  },
];

const teams = [
  { id: TEAM_PLATFORM, name: 'Platform Engineering', createdAt: t0, status: 'active' },
  { id: TEAM_PRODUCT, name: 'Product', createdAt: t0, status: 'active' },
];

const items = [
  {
    id: '44444444-4444-4444-8444-444444444401',
    personId: '22222222-2222-4222-8222-222222222201',
    kind: 'goal',
    title: 'Ship monthly workspace shards (Phase 2)',
    body: 'Split notes/todos into monthly files while keeping a full base copy for downgrade safety.',
    goalStatus: 'active',
    startAt: isoDaysAgo(21),
    dueAt: isoDaysFromNow(5),
    done: false,
    createdAt: t0,
    updatedAt: t3,
  },
  {
    id: '44444444-4444-4444-8444-444444444402',
    personId: '22222222-2222-4222-8222-222222222202',
    kind: 'task',
    title: 'Add shard round-trip verification after save',
    body: 'Post-save `shardRoundTripMatches` — refuse commit if merge diverges.',
    dueAt: isoDaysFromNow(2),
    done: false,
    createdAt: t1,
    updatedAt: t4,
  },
  {
    id: '44444444-4444-4444-8444-444444444403',
    personId: '22222222-2222-4222-8222-222222222203',
    kind: 'task',
    title: 'Refresh GitHub Pages landing copy',
    body: 'Planning hub, activity report, archive UX.',
    done: true,
    doneAt: t5,
    createdAt: t2,
    updatedAt: t5,
  },
  {
    id: '44444444-4444-4444-8444-444444444404',
    personId: leaderPlatform,
    kind: 'goal',
    title: 'Reduce P99 sync latency under 400ms on LAN',
    body: '',
    goalStatus: 'planned',
    dueAt: isoDaysFromNow(30),
    done: false,
    createdAt: t1,
    updatedAt: t1,
  },
  {
    id: '44444444-4444-4444-8444-444444444405',
    personId: '33333333-3333-4333-8333-333333333301',
    kind: 'document',
    title: 'Screenshot shot list for marketing',
    body: 'Planning, activity report, notes archived, storage settings, backup recovery.',
    done: false,
    createdAt: t2,
    updatedAt: t3,
  },
  {
    id: '44444444-4444-4444-8444-444444444406',
    personId: '22222222-2222-4222-8222-222222222201',
    kind: 'feedback',
    title: 'Great job on backward-compatible optional fields',
    body: 'No DATA_VERSION bump — exactly what we needed for archive flags.',
    feedbackKind: 'praise',
    done: false,
    createdAt: t3,
    updatedAt: t3,
  },
  {
    id: '44444444-4444-4444-8444-444444444407',
    personId: '22222222-2222-4222-8222-222222222202',
    kind: 'note',
    title: 'Incident: sync 412 spike after deploy',
    body: 'ETag mismatch when mobile PWA pulled during desktop save. Mitigation: debounce pull on focus.',
    done: false,
    createdAt: isoDaysAgo(5),
    updatedAt: isoDaysAgo(4),
  },
];

const todoGroups = [
  {
    id: '55555555-5555-4555-8555-555555555501',
    name: 'Sprint 24 — Platform',
    sortOrder: 0,
    pinned: true,
    priority: 'urgent',
    createdAt: t0,
  },
  {
    id: '55555555-5555-4555-8555-555555555502',
    name: 'v0.2 Release prep',
    sortOrder: 1,
    priority: 'high',
    createdAt: t0,
  },
  {
    id: '55555555-5555-4555-8555-555555555503',
    name: 'Technical debt',
    sortOrder: 2,
    priority: 'normal',
    createdAt: t1,
  },
  {
    id: '55555555-5555-4555-8555-555555555504',
    name: 'Q1 experiments (archived)',
    sortOrder: 3,
    archived: true,
    priority: 'low',
    createdAt: isoDaysAgo(90),
  },
];

function todo(
  id,
  groupId,
  title,
  {
    status = 'todo',
    priority = 'normal',
    dueAt,
    remindAt,
    body,
    bodyPlainText,
    sortOrder = 0,
    planInHub,
    planImportant,
    planUrgent,
    planFocusToday,
    archived,
    createdAt = t2,
    updatedAt = t3,
    doneAt,
  } = {},
) {
  const done = status === 'done';
  return {
    id,
    groupId,
    title,
    body,
    bodyPlainText: bodyPlainText ?? body,
    status,
    done,
    doneAt: doneAt ?? (done ? updatedAt : undefined),
    priority,
    dueAt,
    remindAt,
    sortOrder,
    planInHub,
    planImportant,
    planUrgent,
    planFocusToday,
    archived,
    createdAt,
    updatedAt,
  };
}

const G1 = todoGroups[0].id;
const G2 = todoGroups[1].id;
const G3 = todoGroups[2].id;
const G4 = todoGroups[3].id;

const todoItems = [
  // Planning hub — Eisenhower quadrants
  todo('66666666-6666-4666-8666-666666666601', G1, 'Fix ETag race on concurrent LAN sync', {
    status: 'in_progress',
    priority: 'urgent',
    planInHub: true,
    planImportant: true,
    planUrgent: true,
    planFocusToday: true,
    dueAt: isoToday(18),
    body: 'Reproduce with two clients + rapid save/pull cycle.',
    createdAt: t2,
    updatedAt: t4,
  }),
  todo('66666666-6666-4666-8666-666666666602', G1, 'Write ADR: monthly shard storage layout', {
    status: 'todo',
    priority: 'high',
    planInHub: true,
    planImportant: true,
    planUrgent: false,
    planFocusToday: true,
    dueAt: isoDaysFromNow(4),
    body: 'Document retainBaseBulk downgrade path.',
    createdAt: t1,
    updatedAt: t2,
  }),
  todo('66666666-6666-4666-8666-666666666603', G2, 'Regenerate demo workspace JSON for screenshots', {
    status: 'in_progress',
    priority: 'high',
    planInHub: true,
    planImportant: true,
    planUrgent: true,
    planFocusToday: true,
    body: 'Software-themed sample data with relative dates.',
    createdAt: t3,
    updatedAt: t5,
  }),
  todo('66666666-6666-4666-8666-666666666604', G2, 'Update README + user guide links', {
    status: 'todo',
    planInHub: true,
    planImportant: true,
    planUrgent: false,
    dueAt: isoDaysFromNow(3),
    createdAt: t2,
    updatedAt: t2,
  }),
  todo('66666666-6666-4666-8666-666666666605', G3, 'Run dependency audit (npm + electron)', {
    status: 'todo',
    planInHub: true,
    planImportant: false,
    planUrgent: true,
    dueAt: isoDaysFromNow(1),
    createdAt: t1,
    updatedAt: t1,
  }),
  todo('66666666-6666-4666-8666-666666666606', G3, 'Remove stale feature flag: legacyImportV1', {
    status: 'todo',
    planInHub: true,
    planImportant: false,
    planUrgent: false,
    createdAt: isoDaysAgo(20),
    updatedAt: isoDaysAgo(10),
  }),
  todo('66666666-6666-4666-8666-666666666607', G1, 'Add vitest coverage for backup merge', {
    status: 'done',
    priority: 'high',
    planInHub: true,
    planImportant: true,
    planUrgent: true,
    doneAt: t4,
    createdAt: t2,
    updatedAt: t4,
  }),
  // Regular sprint tasks
  todo('66666666-6666-4666-8666-666666666608', G1, 'Harden importBundle envelope unwrap', {
    status: 'done',
    priority: 'urgent',
    doneAt: t3,
    createdAt: isoDaysAgo(4),
    updatedAt: t3,
  }),
  todo('66666666-6666-4666-8666-666666666609', G1, 'Exclude archived todos from ⌘K palette', {
    status: 'done',
    priority: 'normal',
    doneAt: t5,
    createdAt: t4,
    updatedAt: t5,
  }),
  todo('66666666-6666-4666-8666-666666666610', G1, 'Simplify Settings backup UI', {
    status: 'in_progress',
    priority: 'high',
    dueAt: isoDaysFromNow(2),
    body: '## Scope\n- Merge export into Backup & recovery\n- Drop data location card\n- Live workspace summary',
    createdAt: t3,
    updatedAt: t4,
  }),
  todo('66666666-6666-4666-8666-666666666611', G2, 'Capture dark-mode screenshots for Pages', {
    status: 'todo',
    priority: 'high',
    dueAt: isoDaysFromNow(1),
    remindAt: isoToday(16),
    createdAt: t4,
    updatedAt: t4,
  }),
  todo('66666666-6666-4666-8666-666666666612', G2, 'Verify Playwright e2e on CI', {
    status: 'todo',
    priority: 'normal',
    dueAt: isoDaysFromNow(6),
    createdAt: t2,
    updatedAt: t2,
  }),
  todo('66666666-6666-4666-8666-666666666613', G2, 'Draft release notes for v0.2', {
    status: 'in_progress',
    priority: 'normal',
    body: '- Planning hub\n- Activity report\n- Notes/todos archive\n- Monthly shards',
    createdAt: t1,
    updatedAt: t3,
  }),
  todo('66666666-6666-4666-8666-666666666614', G3, 'Migrate jest-style mocks in electron tests', {
    status: 'cancelled',
    priority: 'low',
    createdAt: isoDaysAgo(30),
    updatedAt: isoDaysAgo(25),
  }),
  todo('66666666-6666-4666-8666-666666666615', G3, 'Spike: CRDT for offline-first merge', {
    status: 'todo',
    priority: 'low',
    dueAt: isoDaysFromNow(14),
    createdAt: t0,
    updatedAt: t0,
  }),
  // Archived tasks (for Active | Archived screenshots)
  todo('66666666-6666-4666-8666-666666666616', G1, 'Prototype Leeadman → Cadence rename script', {
    status: 'done',
    archived: true,
    doneAt: isoDaysAgo(60),
    createdAt: isoDaysAgo(90),
    updatedAt: isoDaysAgo(60),
  }),
  todo('66666666-6666-4666-8666-666666666617', G2, 'Old landing page hero copy', {
    status: 'cancelled',
    archived: true,
    createdAt: isoDaysAgo(45),
    updatedAt: isoDaysAgo(40),
  }),
  // Archived list tasks
  todo('66666666-6666-4666-8666-666666666618', G4, 'Experiment: webpack bundle analyzer', {
    status: 'done',
    doneAt: isoDaysAgo(80),
    createdAt: isoDaysAgo(100),
    updatedAt: isoDaysAgo(80),
  }),
  todo('66666666-6666-4666-8666-666666666619', G1, 'Review PR: workspace storage stats', {
    status: 'todo',
    priority: 'high',
    dueAt: isoDaysAgo(2),
    remindAt: isoToday(11),
    createdAt: t3,
    updatedAt: t4,
  }),
  todo('66666666-6666-4666-8666-666666666620', G1, 'Pair with Sam on backup restore UX', {
    status: 'todo',
    priority: 'normal',
    dueAt: isoDaysFromNow(0),
    createdAt: t4,
    updatedAt: t4,
  }),
];

function note(id, title, body, { pinned, archived, sortOrder = 0, createdAt = t1, updatedAt = t2, lastOpenedAt } = {}) {
  return {
    id,
    title,
    body,
    bodyPlainText: body.replace(/[#*`[\]()>-]/g, ' ').replace(/\s+/g, ' ').trim(),
    locked: false,
    pinned,
    archived,
    sortOrder,
    createdAt,
    updatedAt,
    lastOpenedAt: lastOpenedAt ?? updatedAt,
  };
}

const notes = [
  note(
    '77777777-7777-4777-8777-777777777701',
    'Sprint 24 planning',
    `# Sprint 24 — Platform\n\n## Goals\n1. Monthly shard storage (Phase 2)\n2. Screenshot-ready demo data\n3. Settings UX cleanup\n\n## Risks\n- Backup import from pre-shard exports\n- Activity report date filters\n\n## Demo import\nUse \`docs/demo/cadence-screenshot-demo.json\` via Settings → Import JSON.`,
    { pinned: true, sortOrder: 0, createdAt: t0, updatedAt: t4, lastOpenedAt: t5 },
  ),
  note(
    '77777777-7777-4777-8777-777777777702',
    'Incident postmortem — API latency spike',
    `## Summary\nP99 sync pull latency jumped to 2.1s after deploy **0.1.9**.\n\n## Root cause\nCold Chromium cache + large monolithic JSON parse on mobile PWA.\n\n## Action items\n- [ ] Shard reads by month\n- [ ] Add cache warm on pair\n- [ ] Document in USER-GUIDE.md`,
    { sortOrder: 1, createdAt: isoDaysAgo(5), updatedAt: isoDaysAgo(4) },
  ),
  note(
    '77777777-7777-4777-8777-777777777703',
    'React 19 migration checklist',
    `# React 19 migration\n\n- [x] Update vite plugin\n- [x] Strict mode double-mount audit\n- [ ] Test ProseMirror integration\n\n*Archived — migration complete.*`,
    { archived: true, sortOrder: 0, createdAt: isoDaysAgo(120), updatedAt: isoDaysAgo(30) },
  ),
  note(
    '77777777-7777-4777-8777-777777777704',
    'RFC: Activity report design',
    `## Motivation\nUsers wanted a chronological log without exporting JSON.\n\n## Approach\nDerive events from todo \`createdAt\` / \`updatedAt\` / \`doneAt\` + team items.\n\n## Non-goals\n- Real-time audit trail\n- Server-side analytics`,
    { archived: true, sortOrder: 1, createdAt: isoDaysAgo(40), updatedAt: isoDaysAgo(15) },
  ),
  note(
    '77777777-7777-4777-8777-777777777705',
    'Architecture review — local-first storage',
    `## Participants\nAlex, Sam, Jordan\n\n## Decisions\n- Keep \`DATA_VERSION = 3\`\n- Optional \`archived\` on notes/todos\n- Base file retains full bulk (\`retainBaseBulk: true\`)\n\n## Open questions\n- When to prune old monthly shards?`,
    { sortOrder: 2, createdAt: t2, updatedAt: t3, lastOpenedAt: t4 },
  ),
  note(
    '77777777-7777-4777-8777-777777777706',
    'Books — software craftsmanship',
    `1. **A Philosophy of Software Design** — John Ousterhout\n2. **Designing Data-Intensive Applications** — Martin Kleppmann\n3. **Working Effectively with Legacy Code** — Michael Feathers\n\n> Good references for a team reading club.`,
    { sortOrder: 3, createdAt: isoDaysAgo(20), updatedAt: isoDaysAgo(18) },
  ),
  note(
    '77777777-7777-4777-8777-777777777707',
    'Meeting notes — Cadence open source launch',
    `- Marketing site refresh before announcement\n- Prepare demo workspace for screenshots\n- CI: typecheck + vitest + playwright\n- MIT license already in repo`,
    { sortOrder: 4, createdAt: t3, updatedAt: t5, lastOpenedAt: t5 },
  ),
  note(
    '77777777-7777-4777-8777-777777777708',
    'Snippet: Vitest config for electron tests',
    '```ts\n// vitest.config.ts\ninclude: ["src/**/*.test.ts", "electron/**/*.test.ts"]\n```\n\nHandy when adding persistence tests under `electron/persistence/`.',
    { sortOrder: 5, createdAt: t4, updatedAt: t4 },
  ),
];

const workspace = {
  version: DATA_VERSION,
  teams,
  people,
  items,
  notifiedReminderIds: [],
  lastTeamId: TEAM_PLATFORM,
  profile: {
    displayName: 'Alex Chen',
    jobTitle: 'Engineering Lead',
    department: 'Platform Engineering',
    favoriteTeamIds: [TEAM_PLATFORM, TEAM_PRODUCT],
    bio: 'Building local-first tools. Currently shipping Cadence v0.2.',
  },
  todoGroups,
  todoItems,
  notes,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(workspace, null, 2)}\n`, 'utf8');

const counts = {
  teams: teams.length,
  people: people.length,
  items: items.length,
  todoGroups: todoGroups.length,
  todoItems: todoItems.length,
  notes: notes.length,
  planningHub: todoItems.filter((t) => t.planInHub).length,
  archivedNotes: notes.filter((n) => n.archived).length,
  archivedTodos: todoItems.filter((t) => t.archived).length,
};

console.log(`Wrote ${OUT}`);
console.log(JSON.stringify(counts, null, 2));

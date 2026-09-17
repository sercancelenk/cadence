/**
 * Deterministic synthetic workspaces for performance work.
 *
 * Used by `scripts/genWorkspace.mjs` (writes a JSON file you can import into a
 * scratch account) and by `saveBench.test.ts`. Deterministic on purpose: a
 * before/after comparison is only meaningful when both runs saw identical
 * bytes.
 *
 * The shape mirrors what `compactAppDataForPersist` emits, so the generated
 * workspace exercises the same save path as a real one. It is test data — never
 * write it over a real account's file.
 */

const MAX_DATA_VERSION = 3;

/** Small deterministic PRNG (mulberry32) so runs are byte-identical. */
function createRandom(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS = [
  'roadmap', 'retro', 'incident', 'latency', 'backlog', 'hiring', 'onboarding',
  'migration', 'rollout', 'postmortem', 'budget', 'staffing', 'design', 'review',
  'sync', 'escalation', 'quarter', 'metric', 'runbook', 'handover',
];

function sentence(random, wordCount) {
  const words = [];
  for (let i = 0; i < wordCount; i += 1) {
    words.push(WORDS[Math.floor(random() * WORDS.length)]);
  }
  return `${words.join(' ')}.`;
}

/** ProseMirror doc with `paragraphs` paragraphs — the format notes persist in. */
function richDoc(random, paragraphs) {
  const content = [];
  for (let i = 0; i < paragraphs; i += 1) {
    content.push({
      type: 'paragraph',
      content: [{ type: 'text', text: sentence(random, 12 + Math.floor(random() * 12)) }],
    });
  }
  return { type: 'doc', content };
}

/**
 * Spread timestamps across `monthSpan` months so the monthly-shard split
 * produces several shards, like a workspace that has been in use for a while.
 */
function isoAt(index, total, monthSpan) {
  const monthOffset = Math.floor((index / Math.max(1, total)) * monthSpan);
  const year = 2026;
  const month = ((monthOffset % 12) + 1).toString().padStart(2, '0');
  const day = ((index % 27) + 1).toString().padStart(2, '0');
  const hour = (index % 24).toString().padStart(2, '0');
  return `${year}-${month}-${day}T${hour}:00:00.000Z`;
}

/**
 * @param {{
 *   notes?: number;
 *   todoItems?: number;
 *   paragraphsPerNote?: number;
 *   monthSpan?: number;
 *   seed?: number;
 * }} [options]
 * @returns {Record<string, unknown>} a workspace payload ready for the save path
 */
function createSyntheticWorkspace(options = {}) {
  const {
    notes: noteCount = 500,
    todoItems: todoCount = 500,
    paragraphsPerNote = 6,
    monthSpan = 6,
    seed = 1337,
  } = options;

  const random = createRandom(seed);

  const todoGroups = [
    { id: 'group-inbox', name: 'Inbox', sortOrder: 0 },
    { id: 'group-week', name: 'This week', sortOrder: 1 },
    { id: 'group-later', name: 'Later', sortOrder: 2 },
  ];

  const notes = [];
  for (let i = 0; i < noteCount; i += 1) {
    const doc = richDoc(random, paragraphsPerNote);
    const plainText = doc.content
      .map((p) => p.content?.[0]?.text ?? '')
      .join('\n')
      .trim();
    const at = isoAt(i, noteCount, monthSpan);
    notes.push({
      id: `note-${i}`,
      title: `Note ${i} — ${sentence(random, 3).replace(/\.$/, '')}`,
      body: JSON.stringify(doc),
      bodyFormat: 'prosemirror',
      bodyPlainText: plainText,
      createdAt: at,
      updatedAt: at,
    });
  }

  const todoItems = [];
  for (let i = 0; i < todoCount; i += 1) {
    const doc = richDoc(random, 1);
    const at = isoAt(i, todoCount, monthSpan);
    todoItems.push({
      id: `todo-${i}`,
      groupId: todoGroups[i % todoGroups.length].id,
      title: `Task ${i} — ${sentence(random, 4).replace(/\.$/, '')}`,
      body: JSON.stringify(doc),
      bodyFormat: 'prosemirror',
      bodyPlainText: doc.content[0]?.content?.[0]?.text ?? '',
      status: i % 4 === 0 ? 'done' : 'todo',
      sortOrder: i,
      createdAt: at,
      updatedAt: at,
    });
  }

  return {
    version: MAX_DATA_VERSION,
    teams: [{ id: 'team-1', name: 'Platform' }],
    people: [],
    items: [],
    todoGroups,
    todoItems,
    notes,
    noteGroups: [],
    noteTodoLinks: [],
  };
}

module.exports = {
  createSyntheticWorkspace,
};

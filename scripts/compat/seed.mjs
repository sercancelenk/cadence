/**
 * The data every compatibility fixture holds, and how to read it back.
 * Shared by make-fixture.mjs (an OLD build writes it) and downgrade-check.mjs (the CURRENT build writes it).
 * `h` is a harness from electron/testing/mainHarness.cjs.
 */
import crypto from 'node:crypto';

export const EMAIL = 'compat@example.com';
export const PASSWORD = 'compat-password-1';
export const PIN = '1234';
export const NOTE_IDS_WITH_HISTORY = ['note-compat-0001', 'note-compat-0002', 'note-compat-0003'];

// Distinct bytes per image so a swapped or damaged image is noticed.
const png = (n) => Buffer.concat([Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'), Buffer.from(`image-${n}-`.repeat(40))]);
export const IMAGES = { 'attachment-compat-0001': png(1), 'attachment-compat-0002': png(2) };
export const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const note = (id, title, body, updatedAt) => ({ id, title, body, createdAt: updatedAt, updatedAt });
const workspace = (notes) => ({
  version: 3,
  people: [],
  teams: [{ id: 'team-compat-0001', name: 'Compat team', createdAt: '2026-01-01T00:00:00.000Z', status: 'active' }],
  items: [],
  todoGroups: [],
  todoItems: [
    { id: 'todo-compat-0001', text: 'First task', done: false, createdAt: '2026-01-02T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' },
    { id: 'todo-compat-0002', text: 'Second task', done: true, createdAt: '2026-02-02T00:00:00.000Z', updatedAt: '2026-02-02T00:00:00.000Z' },
  ],
  notes,
  noteGroups: [],
});

/** Account, notes in two months, tasks, two images, note history, a PIN and two snapshots. */
export async function seed(h) {
  const reg = await h.invoke('account:register', { email: EMAIL, password: PASSWORD });
  if (!reg.ok) throw new Error(`register failed: ${reg.error}`);
  const uid = reg.user.id;
  for (const [id, bytes] of Object.entries(IMAGES)) {
    const r = await h.invoke('attachment:write', { attachmentId: id, dataBase64: bytes.toString('base64') });
    if (!r.ok) throw new Error(`attachment ${id} failed`);
  }
  const notes = [
    note('note-compat-0001', 'Plain note', 'Plain body one', '2026-01-10T10:00:00.000Z'),
    note('note-compat-0002', 'Note with image', 'Has an image cadence-attachment://attachment-compat-0001', '2026-01-11T10:00:00.000Z'),
    note('note-compat-0003', 'February note', 'Second month body', '2026-02-12T10:00:00.000Z'),
    note('note-compat-0004', 'Another image note', 'cadence-attachment://attachment-compat-0002', '2026-02-13T10:00:00.000Z'),
    note('note-compat-0005', 'Doomed note', 'Dropped by a later save so a snapshot holds it', '2026-02-14T10:00:00.000Z'),
    note('note-compat-0006', 'Doomed note two', 'Dropped by a later save too', '2026-02-15T10:00:00.000Z'),
  ];
  const first = await h.invoke('data:save', workspace(notes), uid, undefined);
  if (!first.ok) throw new Error(`first save failed: ${first.reason ?? first.error}`);
  let gen = first.writeGeneration;
  for (let keep = 5; keep >= 4; keep -= 1) {
    const r = await h.invoke('data:save', workspace(notes.slice(0, keep)), uid, gen);
    if (!r.ok) throw new Error(`shrinking save failed: ${r.reason ?? r.error}`);
    gen = r.writeGeneration;
    await wait(30);
  }
  const history = [
    ['note-compat-0001', 'Plain note v1', 'first draft'],
    ['note-compat-0001', 'Plain note v2', 'second draft'],
    ['note-compat-0002', 'Image note v1', 'cadence-attachment://attachment-compat-0001 first'],
    ['note-compat-0003', 'February v1', 'history only for february'],
  ];
  for (const [noteId, title, body] of history) {
    const r = await h.invoke('noteHistory:append', { noteId, trigger: 'manual', title, summary: `${title} summary`, locked: false, body, bodyFormat: 'markdown' });
    if (!r.ok) throw new Error(`history append failed: ${r.error}`);
    await wait(5);
  }
  const pin = await h.invoke('auth:setPin', { pin: PIN });
  if (!pin.ok) throw new Error(`setPin failed: ${pin.error}`);
  return { uid, recoveryCodes: reg.recoveryCodes ?? null };
}

/** What a build holds, read through its own handlers (signed in). */
export async function readBack(h) {
  const loaded = await h.invoke('data:load');
  const out = {
    notes: loaded.notes.map((n) => ({ id: n.id, title: n.title, bodySha: sha(Buffer.from(n.body ?? '')) })).sort((a, b) => a.id.localeCompare(b.id)),
    todos: loaded.todoItems.map((t) => ({ id: t.id, text: t.text, done: t.done })).sort((a, b) => a.id.localeCompare(b.id)),
    teams: loaded.teams.map((t) => t.id).sort(),
    images: {},
    history: {},
  };
  for (const id of Object.keys(IMAGES)) {
    const r = await h.invoke('attachment:read', { attachmentId: id });
    if (r.ok) out.images[id] = sha(Buffer.from(r.dataBase64, 'base64'));
  }
  for (const noteId of NOTE_IDS_WITH_HISTORY) {
    const list = await h.invoke('noteHistory:list', { noteId });
    const revs = [];
    for (const meta of list.revisions ?? []) {
      const r = await h.invoke('noteHistory:read', { noteId, revisionId: meta.id });
      revs.push({ id: meta.id, title: r.revision.title, bodySha: sha(Buffer.from(r.revision.body ?? '')) });
    }
    out.history[noteId] = revs.sort((a, b) => a.id.localeCompare(b.id));
  }
  return { loaded, ...out };
}

import { describe, expect, it } from 'vitest';
import { boxesTask } from './boxes';
import { challengeTask } from './challenge';
import { digestTask } from './digest';
import { erdTask } from './erd';
import { extractTask } from './extract';
import { mockDataTask } from './mockdata';
import { prepTask } from './prep';
import { sbiTask } from './sbi';
import { sketchTask } from './sketch';
import { structureTask } from './structure';
import { visualizeTask } from './visualize';
import { workspaceTask } from './workspace';
import { sanitizeFocusNote } from '../focusNote';
import type { PromptContext } from '../types';

const ctx: PromptContext = { now: new Date('2026-01-05T10:00:00Z'), timeZone: 'UTC', options: {} };

// A lone high or low surrogate makes some gateways reject the whole request body.
const LONE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
const BIG = '😀'.repeat(20_000);
// An odd prefix shifts the pairs so that either parity of cap lands inside a pair.
const texts = [BIG, `a${BIG}`];

const builders: Record<string, (t: string) => { system: string; user: string }> = {
  boxes: (t) => boxesTask.build({ text: t, current: t, change: t }, ctx),
  challenge: (t) => challengeTask.build({ text: t }, ctx),
  digest: (t) => digestTask.build({ activity: t, notes: [] }, ctx),
  erd: (t) => erdTask.build({ request: t, current: t }, ctx),
  extract: (t) => extractTask.build({ notes: t, lists: [] }, ctx),
  mockdata: (t) => mockDataTask.build({ sample: t, count: 3 }, ctx),
  prep: (t) => prepTask.build({ context: t }, ctx),
  sbi: (t) => sbiTask.build({ text: t }, ctx),
  sketch: (t) => sketchTask.build({ graph: t }, ctx),
  structure: (t) => structureTask.build({ text: t }, ctx),
  visualize: (t) => visualizeTask.build({ text: t, current: t, change: t }, ctx),
  workspace: (t) => workspaceTask.build({ question: t, sources: [] }, ctx),
};

describe('prompt inputs are cut by characters, never in the middle of a surrogate pair', () => {
  for (const [name, build] of Object.entries(builders)) {
    for (const [i, t] of texts.entries()) {
      it(`${name} (${i})`, () => {
        const p = build(t);
        expect(LONE.test(p.user)).toBe(false);
        expect(LONE.test(p.system)).toBe(false);
      });
    }
  }

  it('focus note', () => {
    for (const t of texts) expect(LONE.test(sanitizeFocusNote(t))).toBe(false);
  });
});

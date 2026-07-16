import { describe, expect, it } from 'vitest';
import { emptyErdDocument, sampleErdDocument } from './erd/erdModel';
import {
  validateErdDocumentForSave,
  validateSketchSceneForSave,
} from './utilityDiagrams';

describe('validateErdDocumentForSave', () => {
  it('rejects an empty diagram', () => {
    const r = validateErdDocumentForSave(emptyErdDocument());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/table/i);
  });

  it('accepts the sample diagram', () => {
    expect(validateErdDocumentForSave(sampleErdDocument()).ok).toBe(true);
  });
});

describe('validateSketchSceneForSave', () => {
  it('rejects empty JSON', () => {
    const r = validateSketchSceneForSave('');
    expect(r.ok).toBe(false);
  });

  it('rejects a scene with only deleted elements', () => {
    const scene = JSON.stringify({
      type: 'excalidraw',
      elements: [{ id: 'a', type: 'rectangle', isDeleted: true }],
    });
    const r = validateSketchSceneForSave(scene);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/empty/i);
  });

  it('accepts a minimal live element', () => {
    const scene = JSON.stringify({
      type: 'excalidraw',
      elements: [{ id: 'a', type: 'rectangle', isDeleted: false, x: 0, y: 0 }],
    });
    expect(validateSketchSceneForSave(scene).ok).toBe(true);
  });
});

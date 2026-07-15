import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  downloadBlob,
  downloadTextFile,
  MAX_SKETCH_ELEMENTS,
  parseSketchSceneJson,
  SKETCH_SCENE_TYPE,
} from './sketchExport';

describe('parseSketchSceneJson', () => {
  it('accepts a minimal Excalidraw scene', () => {
    expect(
      parseSketchSceneJson({
        type: SKETCH_SCENE_TYPE,
        version: 2,
        elements: [],
        appState: {},
        files: {},
      }),
    ).toEqual({ ok: true });
  });

  it('accepts scenes without an explicit type when elements exist', () => {
    expect(parseSketchSceneJson({ elements: [{ id: 'a' }] })).toEqual({ ok: true });
  });

  it('rejects non-objects and missing elements', () => {
    expect(parseSketchSceneJson(null).ok).toBe(false);
    expect(parseSketchSceneJson('x').ok).toBe(false);
    expect(parseSketchSceneJson({ type: SKETCH_SCENE_TYPE }).ok).toBe(false);
  });

  it('rejects unknown type', () => {
    const r = parseSketchSceneJson({ type: 'other', elements: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Unsupported sketch type/);
  });

  it('rejects oversized element lists', () => {
    const elements = Array.from({ length: MAX_SKETCH_ELEMENTS + 1 }, (_, i) => ({ id: String(i) }));
    const r = parseSketchSceneJson({ type: SKETCH_SCENE_TYPE, elements });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/too many elements/i);
  });
});

describe('sketch download helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('downloads text and blob files via temporary anchor clicks', () => {
    const click = vi.fn();
    const revoke = vi.fn();
    const createObjectURL = vi.fn(() => 'blob:sketch-test');
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: revoke });
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreate(tag);
      if (tag === 'a') {
        Object.defineProperty(el, 'click', { value: click });
      }
      return el;
    });

    downloadTextFile('scene.excalidraw', '{"type":"excalidraw","elements":[]}');
    expect(createObjectURL).toHaveBeenCalled();
    expect(click).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith('blob:sketch-test');

    downloadBlob('scene.png', new Blob(['png'], { type: 'image/png' }));
    expect(click).toHaveBeenCalledTimes(2);
    expect(revoke).toHaveBeenCalledTimes(2);
  });
});

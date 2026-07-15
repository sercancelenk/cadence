/** Lightweight helpers for the ephemeral Sketch (Excalidraw) utility. No AppData. */

export const SKETCH_SCENE_TYPE = 'excalidraw' as const;
export const MAX_SKETCH_ELEMENTS = 5_000;

export type SketchParseResult = { ok: true } | { ok: false; error: string };

/**
 * Defensive check before handing a file to Excalidraw's loader.
 * Does not mutate or persist anything.
 */
export function parseSketchSceneJson(raw: unknown): SketchParseResult {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'Invalid sketch file (not an object).' };
  }
  const o = raw as Record<string, unknown>;
  if (o.type !== undefined && o.type !== SKETCH_SCENE_TYPE) {
    return { ok: false, error: `Unsupported sketch type (expected "${SKETCH_SCENE_TYPE}").` };
  }
  if (!Array.isArray(o.elements)) {
    return { ok: false, error: 'Sketch file must include an elements array.' };
  }
  if (o.elements.length > MAX_SKETCH_ELEMENTS) {
    return {
      ok: false,
      error: `Sketch has too many elements (max ${MAX_SKETCH_ELEMENTS.toLocaleString()}).`,
    };
  }
  return { ok: true };
}

export function downloadTextFile(filename: string, contents: string, mime = 'application/json'): void {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

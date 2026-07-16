/**
 * Limits + validation for persisted Utilities → ERD / Sketch libraries.
 * Explicit Save only — this module never writes AppData itself.
 */

import { emptyErdDocument, parseErdDocument, type ErdDocument } from './erd/erdModel';
import { MAX_SKETCH_ELEMENTS, parseSketchSceneJson } from './sketch/sketchExport';

/** Soft cap so a single ERD stays practical on the canvas. */
export const MAX_ERD_TABLES = 200;

/** Reject oversized Excalidraw scenes so workspace JSON / sync stay healthy. */
export const MAX_SKETCH_SCENE_CHARS = 3 * 1024 * 1024;

export type DiagramSaveError =
  | { ok: false; error: string }
  | { ok: true };

export function isErdDocumentEmpty(doc: ErdDocument): boolean {
  return doc.tables.length === 0;
}

export function validateErdDocumentForSave(doc: ErdDocument): DiagramSaveError {
  const parsed = parseErdDocument(doc);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  if (parsed.doc.tables.length === 0) {
    return { ok: false, error: 'Add at least one table before saving.' };
  }
  if (parsed.doc.tables.length > MAX_ERD_TABLES) {
    return {
      ok: false,
      error: `Too many tables (max ${MAX_ERD_TABLES}). Split into another diagram or Export JSON.`,
    };
  }
  return { ok: true };
}

export function validateSketchSceneForSave(sceneJson: string): DiagramSaveError {
  const trimmed = sceneJson.trim();
  if (!trimmed) return { ok: false, error: 'Sketch is empty — draw something before saving.' };
  if (trimmed.length > MAX_SKETCH_SCENE_CHARS) {
    return {
      ok: false,
      error: `Sketch is too large to save in the workspace (max ~${Math.round(MAX_SKETCH_SCENE_CHARS / (1024 * 1024))} MB). Use Export instead.`,
    };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: 'Sketch data is not valid JSON.' };
  }
  const parsed = parseSketchSceneJson(raw);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const elements = (raw as { elements?: unknown[] }).elements;
  if (!Array.isArray(elements) || elements.length === 0) {
    return { ok: false, error: 'Sketch is empty — draw something before saving.' };
  }
  // Deleted Excalidraw elements still sit in the array; count “live” ones for emptiness.
  const live = elements.filter((el) => {
    if (!el || typeof el !== 'object') return false;
    return (el as { isDeleted?: boolean }).isDeleted !== true;
  });
  if (live.length === 0) {
    return { ok: false, error: 'Sketch is empty — draw something before saving.' };
  }
  if (elements.length > MAX_SKETCH_ELEMENTS) {
    return {
      ok: false,
      error: `Sketch has too many elements (max ${MAX_SKETCH_ELEMENTS.toLocaleString()}).`,
    };
  }
  return { ok: true };
}

export function blankErdDocument(): ErdDocument {
  return emptyErdDocument();
}

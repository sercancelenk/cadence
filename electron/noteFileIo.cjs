/**
 * Pure validation for note ⇄ disk file IPC (`tools:saveAs`, `note:openFile`).
 * Kept free of Electron so it is unit-testable; the handlers in main.cjs only
 * add dialogs and the durable write around it.
 */

const NOTE_FILE_MAX_BYTES = 5 * 1024 * 1024;
const OPEN_EXTENSIONS = new Set(['md', 'markdown', 'txt', 'html', 'htm']);
const MAX_NAME_LENGTH = 180;

/**
 * @param {string} fileName
 * @param {number} sizeBytes
 */
function checkOpenableNoteFile(fileName, sizeBytes) {
  const dot = fileName.lastIndexOf('.');
  const ext = dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : '';
  if (!OPEN_EXTENSIONS.has(ext)) {
    return { ok: false, error: 'Only .md, .markdown, .txt and .html files can be opened.' };
  }
  if (sizeBytes > NOTE_FILE_MAX_BYTES) {
    return { ok: false, error: 'File is too large to open (limit 5 MB).' };
  }
  return { ok: true, ext };
}

/** @param {Buffer} buf */
function decodeNoteFileText(buf) {
  let text;
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    text = buf.subarray(2).toString('utf16le');
  } else if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    text = buf.subarray(3).toString('utf8');
  } else {
    text = buf.toString('utf8');
  }
  return text.replace(/\r\n?/g, '\n');
}

/**
 * The durable writer stages into `<target>.tmp` and opens it with `w`, which
 * would silently truncate a file of the user's that already has that name.
 * Refuse instead of destroying it; the target itself was confirmed in the
 * native save dialog.
 * @param {string} filePath
 * @param {(p: string) => boolean} exists
 */
function checkSaveTargetFree(filePath, exists) {
  const tmp = `${filePath}.tmp`;
  if (exists(tmp)) {
    return {
      ok: false,
      error: `A file named "${tmp.split(/[\\/]/).pop()}" already exists next to the chosen location. Rename or remove it, or pick another name.`,
    };
  }
  return { ok: true };
}

const TOOL_VARIANT_KEYS = new Set(['md', 'txt', 'html', 'json', 'yaml', 'yml', '*']);
const EXTENSION_RE = /^[a-z0-9]{1,8}$/;
const MAX_FILTER_EXTENSIONS = 6;

/**
 * Payload for the Tools pages' "save to a file": one or more text variants and
 * the extension the dialog should suggest. The user types the real extension in
 * the save dialog; {@link pickSaveVariant} then chooses the matching variant.
 * @param {unknown} payload
 */
function validateToolSavePayload(payload) {
  if (!payload || typeof payload !== 'object') return { ok: false, error: 'Invalid payload.' };
  const { suggestedName, defaultExt, extensions, variants } = /** @type {Record<string, unknown>} */ (payload);
  if (!variants || typeof variants !== 'object' || Array.isArray(variants)) {
    return { ok: false, error: 'Nothing to save.' };
  }
  const entries = Object.entries(/** @type {Record<string, unknown>} */ (variants));
  if (entries.length === 0) return { ok: false, error: 'Nothing to save.' };
  /** @type {Record<string, string>} */
  const clean = {};
  for (const [key, value] of entries) {
    if (!TOOL_VARIANT_KEYS.has(key)) return { ok: false, error: 'Unsupported format.' };
    if (typeof value !== 'string') return { ok: false, error: 'Content must be text.' };
    if (Buffer.byteLength(value, 'utf8') > NOTE_FILE_MAX_BYTES) {
      return { ok: false, error: 'Document is too large to save as a file.' };
    }
    clean[key] = value;
  }
  if (typeof defaultExt !== 'string' || !EXTENSION_RE.test(defaultExt)) {
    return { ok: false, error: 'Unsupported format.' };
  }
  if (!Object.prototype.hasOwnProperty.call(clean, defaultExt) && !Object.prototype.hasOwnProperty.call(clean, '*')) {
    return { ok: false, error: 'Unsupported format.' };
  }
  if (!Array.isArray(extensions) || extensions.length === 0 || extensions.length > MAX_FILTER_EXTENSIONS) {
    return { ok: false, error: 'Unsupported format.' };
  }
  for (const ext of extensions) {
    if (typeof ext !== 'string' || !EXTENSION_RE.test(ext)) return { ok: false, error: 'Unsupported format.' };
  }
  const rawName = typeof suggestedName === 'string' ? suggestedName : '';
  const base = rawName.split(/[\\/]/).pop() ?? '';
  const name =
    base.replace(/[\u0000-\u001f]/g, '-').trim().slice(0, MAX_NAME_LENGTH) || `document.${defaultExt}`;
  const filters = [
    ...extensions.map((ext) => ({ name: `${ext.toUpperCase()} (.${ext})`, extensions: [ext] })),
    { name: 'All files', extensions: ['*'] },
  ];
  return { ok: true, suggestedName: name, defaultExt, variants: clean, filters };
}

/**
 * Choose what to write for the path the user confirmed in the save dialog, from
 * the extension they typed. An unknown or missing extension gets the default
 * variant; the path itself is never changed.
 * @param {Record<string, string>} variants
 * @param {string} chosenPath
 * @param {string} defaultExt
 * @returns {string} the text to write
 */
function pickSaveVariant(variants, chosenPath, defaultExt) {
  const base = chosenPath.split(/[\\/]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  const typed = dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
  const has = (key) => Object.prototype.hasOwnProperty.call(variants, key);
  if (typed && typed !== '*' && has(typed)) return variants[typed];
  if (has('*')) return variants['*'];
  return variants[defaultExt];
}

module.exports = {
  validateToolSavePayload,
  pickSaveVariant,
  NOTE_FILE_MAX_BYTES,
  checkSaveTargetFree,
  checkOpenableNoteFile,
  decodeNoteFileText,
};

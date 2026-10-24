/**
 * Pure validation for note ⇄ disk file IPC (`note:saveAs`, `note:openFile`).
 * Kept free of Electron so it is unit-testable; the handlers in main.cjs only
 * add dialogs and the durable write around it.
 */

const NOTE_FILE_MAX_BYTES = 5 * 1024 * 1024;
const SAVE_FORMATS = new Set(['md', 'txt', 'html']);
const OPEN_EXTENSIONS = new Set(['md', 'markdown', 'txt', 'html', 'htm']);
const MAX_NAME_LENGTH = 180;

/** @param {unknown} payload */
function validateNoteSavePayload(payload) {
  if (!payload || typeof payload !== 'object') return { ok: false, error: 'Invalid payload.' };
  const { suggestedName, format, content } = /** @type {Record<string, unknown>} */ (payload);
  if (typeof format !== 'string' || !SAVE_FORMATS.has(format)) {
    return { ok: false, error: 'Unsupported format.' };
  }
  if (typeof content !== 'string') return { ok: false, error: 'Content must be text.' };
  if (Buffer.byteLength(content, 'utf8') > NOTE_FILE_MAX_BYTES) {
    return { ok: false, error: 'Note is too large to save as a file.' };
  }
  const rawName = typeof suggestedName === 'string' ? suggestedName : '';
  const base = rawName.split(/[\\/]/).pop() ?? '';
  const name = base.replace(/[\u0000-\u001f]/g, '-').trim().slice(0, MAX_NAME_LENGTH) || `note.${format}`;
  return { ok: true, suggestedName: name, format, content };
}

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

module.exports = {
  NOTE_FILE_MAX_BYTES,
  validateNoteSavePayload,
  checkOpenableNoteFile,
  decodeNoteFileText,
};

/**
 * Which attachment ids does a workspace payload still reference?
 *
 * Pure (no Electron) so it can be unit-tested. The orphan-GC in main.cjs deletes
 * every attachment this scan does not report, so under-counting is silent image
 * loss: every place that can hold a rich-text body must be scanned here.
 */

/** Safe attachment id for filesystem use (matches renderer validation). */
function sanitizeAttachmentId(id) {
  const s = String(id || '').trim();
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(s)) return null;
  return s;
}

const ATTACHMENT_URI_PREFIX = 'cadence-attachment://';

function parseAttachmentIdFromSrc(src) {
  if (!src || typeof src !== 'string') return null;
  if (!src.startsWith(ATTACHMENT_URI_PREFIX)) return null;
  return sanitizeAttachmentId(src.slice(ATTACHMENT_URI_PREFIX.length).trim());
}

function collectAttachmentIdsFromDocNode(node, out) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'image' && node.attrs && typeof node.attrs === 'object') {
    const id =
      (typeof node.attrs.attachmentId === 'string' && sanitizeAttachmentId(node.attrs.attachmentId)) ||
      parseAttachmentIdFromSrc(node.attrs.src);
    if (id) out.add(id);
  }
  if (Array.isArray(node.content)) {
    for (const child of node.content) collectAttachmentIdsFromDocNode(child, out);
  }
}

const ATTACHMENT_URI_SCAN_RE = /cadence-attachment:\/\/([a-zA-Z0-9_-]{8,128})/g;

/**
 * Scan a markdown / legacy / unknown-format body for raw
 * `cadence-attachment://<id>` URIs (inside `![](…)` or inline HTML). The
 * prosemirror structural scan cannot see these, so orphan GC must fall back
 * to this — otherwise a markdown-bodied note/todo's still-referenced images
 * look like orphans and get deleted (silent attachment loss).
 */
function collectAttachmentIdsFromMarkdownBody(body, out) {
  if (!body || typeof body !== 'string' || !body.includes(ATTACHMENT_URI_PREFIX)) return;
  for (const m of body.matchAll(ATTACHMENT_URI_SCAN_RE)) {
    const safe = sanitizeAttachmentId(m[1]);
    if (safe) out.add(safe);
  }
}

function collectReferencedAttachmentIdsFromPayload(payload) {
  const ids = new Set();
  // Format-agnostic scan, mirroring the renderer's `scanAnyBody`: prosemirror
  // bodies are parsed structurally; every other format is scanned for raw
  // attachment URIs. A malformed prosemirror body also falls back to the URI
  // scan so GC can never UNDER-count references (worst case: keep an orphan).
  const scan = (body, bodyFormat) => {
    if (!body || typeof body !== 'string' || !body.trim()) return;
    if (bodyFormat === 'prosemirror') {
      try {
        collectAttachmentIdsFromDocNode(JSON.parse(body), ids);
        return;
      } catch {
        /* malformed prosemirror — fall through to raw URI scan */
      }
    }
    collectAttachmentIdsFromMarkdownBody(body, ids);
  };
  for (const n of payload?.notes || []) {
    scan(n.body, n.bodyFormat);
    if (Array.isArray(n.attachmentRefs)) {
      for (const id of n.attachmentRefs) {
        const safe = sanitizeAttachmentId(id);
        if (safe) ids.add(safe);
      }
    }
  }
  for (const t of payload?.todoItems || []) scan(t.body, t.bodyFormat);
  const util = payload?.utilityDocument;
  if (util) scan(util.body, util.bodyFormat);
  // Document tabs hold images too; leaving them out would let orphan GC delete them.
  for (const tab of Array.isArray(payload?.utilityDocumentTabs) ? payload.utilityDocumentTabs : []) {
    scan(tab?.body, tab?.bodyFormat);
  }
  for (const it of payload?.items || []) scan(it.body, it.bodyFormat);
  for (const p of payload?.people || []) {
    scan(p.scratchpad, p.scratchpadFormat);
    scan(p.agenda, p.agendaFormat);
  }
  return ids;
}

module.exports = {
  ATTACHMENT_URI_PREFIX,
  sanitizeAttachmentId,
  parseAttachmentIdFromSrc,
  collectReferencedAttachmentIdsFromPayload,
};

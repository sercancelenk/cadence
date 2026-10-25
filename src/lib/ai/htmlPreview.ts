/**
 * HTML an assistant wrote for a screenshot is shown in a sandboxed frame and stored as code only
 * after this pass: no scripts, frames, forms, event handlers, or anything that loads from the
 * network. It is defence in depth; the frame itself has no scripts and no origin either.
 */

export type HtmlPreviewResult = { ok: true; html: string } | { ok: false; error: string };

const MAX_HTML_CHARS = 20_000;
const REMOVE = new Set(['script', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'form', 'input', 'button', 'select', 'textarea', 'link', 'base', 'meta', 'title', 'noscript', 'template', 'svg', 'math']);
const URL_ATTRS = ['src', 'href', 'srcset', 'action', 'formaction', 'poster', 'xlink:href', 'background', 'data', 'ping'];

const allowedUrl = (value: string): boolean => {
  const v = value.trim().replace(/[\u0000- ]/g, '');
  return v.startsWith('#') || /^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]*$/i.test(v);
};

/** Drops every `url(...)`, `@import` and `expression(...)` that is not an inline data image. */
function cleanCss(css: string): string {
  return css
    .replace(/@import[^;]*;?/gi, '')
    .replace(/expression\s*\([^)]*\)/gi, '')
    .replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (m, _q, target: string) => (allowedUrl(target) ? m : 'none'));
}

function stripFence(text: string): string {
  const m = text.trim().match(/^```(?:html)?[^\n]*\n([\s\S]*?)\n?```$/i);
  return (m ? m[1] : text).trim();
}

export function sanitizeHtmlPreview(raw: string): HtmlPreviewResult {
  const source = stripFence(raw);
  if (!source.replace(/<!--[\s\S]*?-->/g, '').trim()) return { ok: false, error: 'The reply was empty.' };
  if (source.length > MAX_HTML_CHARS) return { ok: false, error: 'The HTML was too long.' };

  const doc = new DOMParser().parseFromString(`<!doctype html><body>${source}`, 'text/html');
  const body = doc.body;

  for (const el of Array.from(body.querySelectorAll('*'))) {
    if (!el.isConnected) continue;
    const tag = el.tagName.toLowerCase();
    if (REMOVE.has(tag)) {
      el.remove();
      continue;
    }
    if (tag === 'style') {
      const cleaned = cleanCss(el.textContent ?? '');
      // Cutting text out can splice a closing style tag together; such a block is dropped whole.
      el.textContent = /<\/\s*style/i.test(cleaned) ? '' : cleaned;
      continue;
    }
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on')) el.removeAttribute(attr.name);
      else if (URL_ATTRS.includes(name)) {
        if (!allowedUrl(attr.value)) el.removeAttribute(attr.name);
      } else if (name === 'style') el.setAttribute(attr.name, cleanCss(attr.value));
    }
  }
  for (const node of Array.from(doc.querySelectorAll('*')).filter((e) => !body.contains(e) && e !== body && e.tagName !== 'HTML' && e.tagName !== 'HEAD')) {
    node.remove();
  }

  const html = body.innerHTML.trim();
  if (!html || (!body.textContent?.trim() && !body.querySelector('img,hr,table'))) {
    return { ok: false, error: 'Nothing was left to show after removing unsafe content.' };
  }
  return { ok: true, html };
}

/** The page shown inside the sandboxed frame. */
export function previewDocument(html: string): string {
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">`,
    '<style>body{font-family:system-ui,sans-serif;margin:12px;color:#222}</style>',
    `</head><body>${html}</body></html>`,
  ].join('');
}

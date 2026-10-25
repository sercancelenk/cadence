import { describe, expect, it } from 'vitest';
import { previewDocument, sanitizeHtmlPreview } from './htmlPreview';

const clean = (html: string) => {
  const r = sanitizeHtmlPreview(html);
  if (!r.ok) throw new Error(r.error);
  return r.html;
};

describe('sanitizeHtmlPreview', () => {
  it('keeps plain structure, text and inline styles', () => {
    const html = clean('<div style="color:red"><h1>Title</h1><p>Hello <b>world</b></p><ul><li>a</li></ul></div>');
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('style="color:red"');
    expect(html).toContain('<li>a</li>');
  });

  it.each([
    ['a script', '<p>x</p><script>alert(1)</script>'],
    ['an iframe', '<iframe src="https://evil.test"></iframe><p>x</p>'],
    ['an object', '<object data="x"></object><p>x</p>'],
    ['an embed', '<embed src="x"><p>x</p>'],
    ['a form', '<form action="https://evil.test"><input name="a"></form><p>x</p>'],
    ['a link tag', '<link rel="stylesheet" href="https://evil.test/a.css"><p>x</p>'],
    ['a base tag', '<base href="https://evil.test/"><p>x</p>'],
    ['a meta refresh', '<meta http-equiv="refresh" content="0;url=https://evil.test"><p>x</p>'],
  ])('removes %s', (_n, html) => {
    const out = clean(html);
    expect(out).not.toMatch(/<(?:script|iframe|object|embed|form|link|base|meta|input)\b/i);
    expect(out).toContain('<p>x</p>');
  });

  it('removes event handler attributes and javascript: URLs', () => {
    const out = clean('<img src="data:image/png;base64,AAAA" onerror="alert(1)"><a href="javascript:alert(1)" onclick="x()">go</a><p onmouseover="y()">t</p>');
    expect(out).not.toMatch(/\son\w+=/i);
    expect(out).not.toMatch(/javascript:/i);
    expect(out).toContain('data:image/png;base64,AAAA');
  });

  it('removes external resources but keeps data images and in-page anchors', () => {
    const out = clean('<img src="https://tracker.test/p.gif"><img src="//tracker.test/p.gif"><img src="data:image/png;base64,AAAA"><a href="#top">top</a><a href="https://example.com">out</a>');
    expect(out).not.toContain('tracker.test');
    expect(out).not.toContain('example.com');
    expect(out).toContain('data:image/png;base64,AAAA');
    expect(out).toContain('href="#top"');
  });

  it('removes css that loads something', () => {
    const out = clean('<style>@import url(https://evil.test/a.css); body{background:url(https://evil.test/b.png)} p{color:blue}</style><div style="background:url(\'https://evil.test/c.png\');color:red">x</div>');
    expect(out).not.toContain('evil.test');
    expect(out).toContain('color:blue');
    expect(out).toContain('color:red');
  });

  it('strips an outer code fence and rejects empty or oversized input', () => {
    expect(clean('```html\n<p>x</p>\n```')).toBe('<p>x</p>');
    expect(sanitizeHtmlPreview('   ').ok).toBe(false);
    expect(sanitizeHtmlPreview('<p>' + 'x'.repeat(30_000) + '</p>').ok).toBe(false);
  });

  it('rejects input that is nothing but removed content', () => {
    expect(sanitizeHtmlPreview('<script>alert(1)</script>').ok).toBe(false);
  });
});

describe('previewDocument', () => {
  it('wraps the html with a policy that blocks scripts and network', () => {
    const doc = previewDocument('<p>x</p>');
    expect(doc).toContain("default-src 'none'");
    expect(doc).toContain('<p>x</p>');
  });

  it.each([
    '<p>hi</p><style></sty@import a;le><img src=x onerror=alert(1)></style>',
    '<p>hi</p><style></styexpression(a)le><img src=x onerror=alert(1)></style>',
  ])('removing css text can never build a closing style tag that lets markup out: %s', (input) => {
    const r = sanitizeHtmlPreview(input);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const back = new DOMParser().parseFromString(`<!doctype html><body>${r.html}`, 'text/html');
    expect(back.querySelector('[onerror]')).toBeNull();
    expect(r.html).not.toMatch(/onerror/i);
  });
});

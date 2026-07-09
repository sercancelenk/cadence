let initialized = false;
let renderSeq = 0;
type MermaidApi = typeof import('mermaid').default;
let mermaidApi: MermaidApi | null = null;

function resolveMermaidTheme(): 'dark' | 'neutral' {
  if (typeof document === 'undefined') return 'neutral';
  const theme = document.documentElement.getAttribute('data-theme');
  return theme === 'light' ? 'neutral' : 'dark';
}

async function loadMermaid(): Promise<MermaidApi> {
  if (mermaidApi) return mermaidApi;
  const mod = await import('mermaid');
  mermaidApi = mod.default;
  return mermaidApi;
}

/** Idempotent Mermaid bootstrap — never auto-scan the DOM. */
async function ensureMermaidInitialized(): Promise<MermaidApi> {
  const mermaid = await loadMermaid();
  if (!initialized) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: resolveMermaidTheme(),
      fontFamily: 'inherit',
    });
    initialized = true;
  }
  return mermaid;
}

/**
 * Render Mermaid source to SVG. Returns SVG markup or an error message.
 * Source text is never executed as HTML — Mermaid parses it as diagram DSL.
 * The mermaid package is loaded on first preview only (not on editor mount).
 */
export async function renderMermaidSvg(
  source: string,
): Promise<{ ok: true; svg: string } | { ok: false; error: string }> {
  const trimmed = source.trim();
  if (!trimmed) {
    return { ok: false, error: 'Empty diagram' };
  }
  const id = `cadence-mermaid-${++renderSeq}-${Date.now()}`;
  try {
    const mermaid = await ensureMermaidInitialized();
    const { svg } = await mermaid.render(id, trimmed);
    // Belt-and-suspenders: Mermaid 11 cleans temp nodes, but remove any leftover.
    if (typeof document !== 'undefined') {
      document.getElementById(`d${id}`)?.remove();
    }
    return { ok: true, svg };
  } catch (err) {
    if (typeof document !== 'undefined') {
      document.getElementById(`d${id}`)?.remove();
    }
    const message = err instanceof Error ? err.message : 'Invalid Mermaid diagram';
    return { ok: false, error: message };
  }
}

/**
 * Opens an AI tool that is not tied to a page (weekly digest, ask your workspace, diagram from a
 * screenshot). ⌘K and page buttons call `openAiTool`; the one `AiLauncher` mounted in the app
 * shell shows the dialog.
 */
export const AI_TOOL_IDS = ['weekly-digest', 'screenshot-to-diagram', 'ask-workspace', 'draw-from-description'] as const;
export type AiToolId = (typeof AI_TOOL_IDS)[number];

export const isAiToolId = (id: string): id is AiToolId => (AI_TOOL_IDS as readonly string[]).includes(id);

/** What a page can ask a tool to start with: the digest's mode, or the format of a drawing. */
export type AiToolPreset = { mode?: 'retro' | 'upward'; format?: 'mermaid' | 'sketch' };

type Handler = (id: AiToolId, preset?: AiToolPreset) => void;
const handlers = new Set<Handler>();

export function subscribeAiTool(handler: Handler): () => void {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}

export function openAiTool(id: AiToolId, preset?: AiToolPreset): void {
  for (const h of [...handlers]) {
    if (preset === undefined) h(id);
    else h(id, preset);
  }
}

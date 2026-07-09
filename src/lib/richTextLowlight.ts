import { common, createLowlight } from 'lowlight';

/**
 * Shared lowlight instance for TipTap CodeBlockLowlight.
 * `common` covers the languages users expect in notes/todos (JS/TS, JSON, Python, …).
 * Mermaid is not a highlight.js grammar — it is rendered separately when
 * `language === 'mermaid'`.
 */
export const richTextLowlight = createLowlight(common);

/** Languages offered in the code-block picker (Notion-style). */
export const RICH_TEXT_CODE_LANGUAGES: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'plaintext', label: 'Plain text' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'json', label: 'JSON' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'python', label: 'Python' },
  { value: 'java', label: 'Java' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'sql', label: 'SQL' },
  { value: 'bash', label: 'Bash' },
  { value: 'yaml', label: 'YAML' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'mermaid', label: 'Mermaid' },
];

export const MERMAID_LANGUAGE = 'mermaid';

export function isMermaidLanguage(language: string | null | undefined): boolean {
  return (language ?? '').toLowerCase() === MERMAID_LANGUAGE;
}

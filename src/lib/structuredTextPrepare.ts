/** Shared surface normalize for structured text paste / parse paths. */

/** Strip a leading UTF-8 BOM then trim — common in exports / clipboard pastes. */
export function prepareStructuredTextInput(text: string): string {
  return text.replace(/^\uFEFF/, '').trim();
}

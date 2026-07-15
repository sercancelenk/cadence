export type UrlCodecResult = { ok: true; text: string } | { ok: false; error: string };

/** encodeURIComponent for query/path fragments. */
export function encodeUrlComponent(text: string): string {
  return encodeURIComponent(text);
}

export function decodeUrlComponent(input: string): UrlCodecResult {
  try {
    return { ok: true, text: decodeURIComponent(input.replace(/\+/g, '%20')) };
  } catch {
    return { ok: false, error: 'Invalid percent-encoding (incomplete or bad escape sequence).' };
  }
}

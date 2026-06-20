// Recovery codes are highly sensitive: anyone holding them can reset the
// account password. We therefore keep freshly generated codes ONLY in volatile
// module memory until the onboarding tour shows them once. They are never
// written to sessionStorage/localStorage, which can be flushed to disk as
// plaintext (e.g. browser session restore, OS swap of the renderer). The cost
// is that a reload before viewing the tour discards the pending codes — an
// acceptable, fail-safe trade-off since they can be regenerated in Settings.

let pending: string[] | null = null;

/** Hold freshly generated codes (in memory only) until the tour shows them once. */
export function stashPendingRecoveryCodes(codes: string[]): void {
  if (!Array.isArray(codes) || codes.length === 0 || codes.some((c) => typeof c !== 'string')) {
    pending = null;
    return;
  }
  pending = [...codes];
}

export function readPendingRecoveryCodes(): string[] | null {
  return pending ? [...pending] : null;
}

export function clearPendingRecoveryCodes(): void {
  if (pending) {
    // Best-effort scrub of the backing array before dropping the reference.
    pending.fill('');
    pending = null;
  }
}

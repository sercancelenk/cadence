export const MAX_UUID_BATCH = 500;

/** Generate `count` UUIDv4 strings (capped). */
export function generateUuids(count: number): string[] {
  const n = Math.max(0, Math.min(MAX_UUID_BATCH, Math.floor(count)));
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(crypto.randomUUID());
  return out;
}

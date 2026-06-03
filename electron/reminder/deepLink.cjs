/**
 * Parse cadence:// deep links from notifications and external opens.
 * @param {string} url
 * @returns {{ kind: 'todo'; itemId: string } | { kind: 'team-item'; itemId: string } | null}
 */
function parseCadenceDeepLink(url) {
  if (typeof url !== 'string' || !url.trim()) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== 'cadence:') return null;
    const parts = [u.hostname, ...u.pathname.split('/').filter(Boolean)].filter(Boolean);
    if (parts.length < 2) return null;
    const kind = parts[0].toLowerCase();
    const itemId = parts[1];
    if (!itemId) return null;
    if (kind === 'todo') return { kind: 'todo', itemId };
    if (kind === 'item') return { kind: 'team-item', itemId };
    return null;
  } catch {
    return null;
  }
}

/**
 * Resolve a team-scoped item id to a person workspace URL.
 * @param {string} itemId
 * @param {Record<string, unknown>} appData
 * @returns {string | null}
 */
function resolveTeamItemPath(itemId, appData) {
  const items = Array.isArray(appData.items) ? appData.items : [];
  const people = Array.isArray(appData.people) ? appData.people : [];
  const item = items.find((i) => i && i.id === itemId);
  if (!item || typeof item.personId !== 'string') return null;
  const person = people.find((p) => p && p.id === item.personId);
  if (!person || typeof person.teamId !== 'string') return null;
  return `/teams/${person.teamId}/people/${person.id}?focus=${encodeURIComponent(itemId)}`;
}

/**
 * @param {{ kind: string; itemId: string }} parsed
 * @param {Record<string, unknown> | null | undefined} [appData]
 */
function deepLinkToRendererPath(parsed, appData) {
  if (parsed.kind === 'todo') return `/todos?focus=${encodeURIComponent(parsed.itemId)}`;
  if (parsed.kind === 'team-item' && appData) return resolveTeamItemPath(parsed.itemId, appData);
  return null;
}

module.exports = { parseCadenceDeepLink, deepLinkToRendererPath, resolveTeamItemPath };

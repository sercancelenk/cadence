/**
 * The in-page anchor of a location hash. With a hash router (the desktop app) the hash holds the
 * route as well (`#/settings#ai`), so the anchor is what follows the LAST `#`; with a path router
 * it is the whole hash (`#ai`). A hash that is only a route (`#/settings`) has no anchor.
 */
export function hashFragment(hash: string): string {
  const last = hash.lastIndexOf('#');
  if (last === -1) return hash.startsWith('/') ? '' : hash;
  // `#/settings` is a route, not an anchor.
  if (last === 0 && hash.slice(1).startsWith('/')) return '';
  return hash.slice(last + 1);
}

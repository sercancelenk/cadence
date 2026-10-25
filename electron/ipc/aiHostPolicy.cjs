'use strict';

/**
 * Organization allow-list for the hosts AI requests may be sent to
 * (`policy.json` → `features.aiAllowedHosts`).
 *
 * No `aiAllowedHosts` key means no restriction beyond the `ai` flag. When the
 * key is present it always restricts: a request is allowed only when its host
 * equals an entry, or ends with `.suffix` for an entry written `*.suffix`.
 * Entries are bare host names (no scheme, port or path); anything else is
 * dropped, and a key that ends up with no valid entry allows nothing, so a
 * typo can never switch the restriction off. Matching is case-insensitive and
 * never uses substrings, so `api.openai.com.evil.com` does not match
 * `api.openai.com`. The port is not part of the match.
 */

const MAX_ENTRIES = 100;

/**
 * Normalises the raw value read from policy.json.
 *
 * @param {unknown} raw
 * @returns {string[] | undefined} `undefined` only when the key is absent;
 *   otherwise the valid entries, which may be none (nothing allowed).
 */
function parseAllowedHosts(raw) {
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const entry of raw) {
    if (typeof entry !== 'string') continue;
    const host = entry.trim().toLowerCase();
    if (!host || out.length >= MAX_ENTRIES) continue;
    if (!/^(\*\.)?[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(host) && host !== '[::1]') continue;
    out.push(host);
  }
  return out;
}

/**
 * @param {string} hostname
 * @param {string[] | undefined} allowed
 */
function isAiHostAllowed(hostname, allowed) {
  if (!allowed) return true;
  const host = String(hostname).toLowerCase();
  return allowed.some((pattern) =>
    pattern.startsWith('*.') ? host.endsWith(pattern.slice(1)) && host.length > pattern.length - 1 : host === pattern,
  );
}

/**
 * @param {unknown} baseUrl
 * @param {string[] | undefined} allowed
 * @returns {{ ok: false; reason: 'policy-disabled'; error: string } | null}
 */
function requireAiHost(baseUrl, allowed) {
  if (!allowed) return null;
  if (allowed.length === 0) {
    return {
      ok: false,
      reason: 'policy-disabled',
      error:
        'Your organization has not allowed any AI hosts. Ask your administrator to check features.aiAllowedHosts in policy.json.',
    };
  }
  let host = '';
  try {
    host = new URL(String(baseUrl)).hostname;
  } catch {
    host = '';
  }
  if (host && isAiHostAllowed(host, allowed)) return null;
  return {
    ok: false,
    reason: 'policy-disabled',
    error: `Your organization only allows AI requests to: ${allowed.join(', ')}.`,
  };
}

/**
 * `features.aiPeople` and `features.aiFocusNote` from policy.json: booleans only.
 *
 * @param {unknown} features
 * @returns {{ aiPeople?: boolean; aiFocusNote?: boolean }}
 */
function parseAiPolicyFlags(features) {
  const out = {};
  if (!features || typeof features !== 'object') return out;
  if (typeof features.aiPeople === 'boolean') out.aiPeople = features.aiPeople;
  if (typeof features.aiFocusNote === 'boolean') out.aiFocusNote = features.aiFocusNote;
  return out;
}

/**
 * The AI sub-flags follow `features.ai` unless the policy sets them explicitly.
 *
 * @param {boolean | undefined} explicit
 * @param {boolean} aiAllowed
 */
function resolveAiSubFlag(explicit, aiAllowed) {
  return typeof explicit === 'boolean' ? explicit : aiAllowed;
}

/**
 * The checks every AI request from the renderer passes before it is made: AI allowed, host
 * allowed, and the data class declared and allowed. `null` means go ahead; anything else is
 * the answer to return to the renderer.
 */
function guardAiGatewayRequest(req, { isFeatureAllowed, allowedHosts }) {
  const { requirePolicyFeature, requireDataClassPolicy } = require('./policyGuard.cjs');
  return (
    requirePolicyFeature('ai', isFeatureAllowed) ||
    requireAiHost(req?.baseUrl, allowedHosts) ||
    requireDataClassPolicy(req?.dataClass, isFeatureAllowed)
  );
}

module.exports = {
  guardAiGatewayRequest,
  parseAllowedHosts,
  isAiHostAllowed,
  requireAiHost,
  parseAiPolicyFlags,
  resolveAiSubFlag,
};

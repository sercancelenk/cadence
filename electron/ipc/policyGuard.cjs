/**
 * IPC-level policy enforcement (defence in depth alongside renderer gating).
 *
 * @param {(featurePath: string) => boolean} isFeatureAllowed
 */

const POLICY_MESSAGES = {
  'sync.lan':
    'LAN sync is disabled by your organization policy. Contact your IT administrator if you need this enabled.',
  'sync.cloud':
    'Cloud sync is disabled by your organization policy. Contact your IT administrator if you need this enabled.',
  ai: 'AI features are disabled by your organization policy.',
  aiPeople:
    'AI features for 1:1 notes, feedback and other people data are disabled by your organization policy.',
  aiFocusNote: 'Custom AI focus notes are disabled by your organization policy.',
  dataExport:
    'Data export and import are disabled by your organization policy. Contact your IT administrator if you need this enabled.',
  updateCheck:
    'Update checks are disabled by your organization policy. Contact your IT administrator if you need this enabled.',
};

/**
 * @param {string} featurePath
 * @param {(featurePath: string) => boolean} isFeatureAllowed
 * @returns {{ ok: false; reason: 'policy-disabled'; error: string } | null}
 */
function requirePolicyFeature(featurePath, isFeatureAllowed) {
  if (isFeatureAllowed(featurePath)) return null;
  return {
    ok: false,
    reason: 'policy-disabled',
    error: POLICY_MESSAGES[featurePath] ?? 'This action is disabled by your organization policy.',
  };
}

/**
 * Every AI request names the class of data it carries. People data (1:1 notes, feedback)
 * additionally needs `aiPeople`; ordinary content does not.
 *
 * @param {unknown} dataClass
 * @param {(featurePath: string) => boolean} isFeatureAllowed
 */
function requireDataClassPolicy(dataClass, isFeatureAllowed) {
  if (dataClass === 'content') return null;
  if (dataClass === 'people') return requirePolicyFeature('aiPeople', isFeatureAllowed);
  // The class is declared by the renderer; a missing or unknown one must not pass as ordinary content.
  return { ok: false, reason: 'invalid-request', error: 'The request did not say what kind of data it carries (data class).' };
}

module.exports = { requirePolicyFeature, requireDataClassPolicy };

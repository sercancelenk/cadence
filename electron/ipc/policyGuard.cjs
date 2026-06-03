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

module.exports = { requirePolicyFeature };

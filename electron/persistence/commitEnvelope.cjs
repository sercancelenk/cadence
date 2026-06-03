/**
 * On-disk commit envelope: workspace bytes and write-generation travel together
 * in a single atomic write, so a crash can never leave data and generation
 * out of sync.
 *
 * Legacy files (raw AppData JSON without this wrapper) remain readable; the
 * next save upgrades them to the envelope format.
 */

const COMMIT_MAGIC = 'CDNC1';

/**
 * @param {number} writeGeneration
 * @param {unknown} workspace
 */
function wrapCommitEnvelope(writeGeneration, workspace) {
  return {
    magic: COMMIT_MAGIC,
    writeGeneration,
    updatedAt: new Date().toISOString(),
    workspace,
  };
}

/**
 * @param {unknown} obj
 * @returns {boolean}
 */
function isCommitEnvelope(obj) {
  return (
    !!obj &&
    typeof obj === 'object' &&
    /** @type {{ magic?: unknown }} */ (obj).magic === COMMIT_MAGIC &&
    /** @type {{ workspace?: unknown }} */ (obj).workspace != null &&
    typeof /** @type {{ workspace: unknown }} */ (obj).workspace === 'object'
  );
}

/**
 * Split a parsed JSON value into workspace payload + optional generation.
 *
 * @param {unknown} parsed
 * @returns {{ workspace: unknown; writeGeneration: number | null; enveloped: boolean }}
 */
function unwrapStoredWorkspace(parsed) {
  if (isCommitEnvelope(parsed)) {
    const gen = /** @type {{ writeGeneration?: unknown }} */ (parsed).writeGeneration;
    const writeGeneration =
      typeof gen === 'number' && Number.isFinite(gen) && gen >= 0 ? gen : 0;
    return {
      workspace: /** @type {{ workspace: unknown }} */ (parsed).workspace,
      writeGeneration,
      enveloped: true,
    };
  }
  return { workspace: parsed, writeGeneration: null, enveloped: false };
}

module.exports = {
  COMMIT_MAGIC,
  wrapCommitEnvelope,
  isCommitEnvelope,
  unwrapStoredWorkspace,
};

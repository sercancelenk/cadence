/**
 * Entry point for the persistence utility process.
 *
 * Deliberately trivial: every decision, guard and piece of state lives in the
 * main process, and everything this file does is turn a message into a call to
 * `handlePersistRequest`. It stages bytes into tmp files and reports back; it
 * never renames anything into place, so it cannot change what a reader of the
 * workspace sees. If it dies mid-batch the only trace is an orphan tmp file.
 */

const { handlePersistRequest } = require('./persistRequest.cjs');

const parentPort = process.parentPort;

if (parentPort) {
  parentPort.on('message', (event) => {
    const request = event?.data;
    if (!request || typeof request.id !== 'number' || !Array.isArray(request.documents)) return;
    let response;
    try {
      response = handlePersistRequest(request);
    } catch (err) {
      // handlePersistRequest already swallows everything; this is the last
      // resort so the main process always gets an answer and never hangs
      // waiting on a batch that silently died.
      console.error('[cadence] persistence worker failed to answer', err);
      response = {
        id: request.id,
        ok: false,
        failure: { path: '', reason: 'worker-error', error: 'The persistence worker failed.' },
      };
    }
    parentPort.postMessage(response);
  });
}

/**
 * Local crash/minidump collection for packaged builds.
 * uploadToServer stays false — diagnostics remain on-device unless the
 * user explicitly shares crash logs with support.
 */

const { app, crashReporter } = require('electron');
const path = require('path');
const fs = require('fs');

/** @type {boolean} */
let started = false;

/**
 * @param {string} userDataPath
 */
function initCrashReporting(userDataPath) {
  if (started || !app.isPackaged) return;
  started = true;

  try {
    const crashDir = path.join(userDataPath, 'crashes');
    fs.mkdirSync(crashDir, { recursive: true });
    crashReporter.start({
      productName: app.name || 'Cadence',
      companyName: 'Cadence',
      uploadToServer: false,
      compress: true,
      extra: {
        version: app.getVersion(),
        platform: process.platform,
      },
    });
    console.log('[cadence] crashReporter active; dumps under', crashReporter.getCrashesDirectory?.() ?? crashDir);
  } catch (err) {
    console.warn('[cadence] crashReporter start failed (continuing)', err);
  }
}

module.exports = { initCrashReporting };

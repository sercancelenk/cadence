const fs = require('fs');
const path = require('path');
const { app } = require('electron');

function readPkgAppId(pkgPath) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  if (typeof pkg.cadenceAppId === 'string' && pkg.cadenceAppId) return pkg.cadenceAppId;
  if (typeof pkg.build?.appId === 'string' && pkg.build.appId) return pkg.build.appId;
  return null;
}

/** Single source for Windows AUMID / toast app id (public + enterprise). */
function getBuildAppId() {
  if (process.env.CADENCE_APP_ID) return process.env.CADENCE_APP_ID;
  try {
    if (app.isPackaged) {
      const packaged = readPkgAppId(path.join(app.getAppPath(), 'package.json'));
      if (packaged) return packaged;
    }
    const dev = readPkgAppId(path.join(__dirname, '..', 'package.json'));
    return dev || 'com.cadence.app';
  } catch {
    return 'com.cadence.app';
  }
}

module.exports = { getBuildAppId };

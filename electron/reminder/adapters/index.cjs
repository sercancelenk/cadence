const macos = require('./macos.cjs');
const windows = require('./windows.cjs');
const linux = require('./linux.cjs');
const noop = require('./noop.cjs');

function getPlatformAdapter() {
  if (process.platform === 'darwin') return macos;
  if (process.platform === 'win32') return windows;
  if (process.platform === 'linux') return linux;
  return noop;
}

module.exports = { getPlatformAdapter };

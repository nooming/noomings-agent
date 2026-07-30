const fs = require('fs');
const path = require('path');

/**
 * Load .env into process.env (no overwrite of existing keys).
 * @param {string} [agentDir] defaults to project root
 */
function loadEnv(agentDir) {
  const base = agentDir || path.join(__dirname, '..', '..');
  const envPath = path.join(base, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 1) continue;
    const key = t.slice(0, i).trim();
    if (process.env[key] === undefined) {
      process.env[key] = t.slice(i + 1).trim();
    }
  }
}

module.exports = { loadEnv };

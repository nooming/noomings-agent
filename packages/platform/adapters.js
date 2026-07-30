const fs = require('fs');
const path = require('path');
const { getPlatformRoot } = require('./paths');

function adaptersDir() {
  return path.join(getPlatformRoot(), 'adapters');
}

function loadAdapter(catalogId) {
  if (!catalogId) return null;
  const file = path.join(adaptersDir(), `${catalogId}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

module.exports = { loadAdapter, adaptersDir };

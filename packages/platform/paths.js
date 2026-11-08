const path = require('path');
const { getRuntimePlatformRoot } = require('../shared/data-paths');

function getPlatformRoot() {
  return getRuntimePlatformRoot();
}

function getCatalogPath() {
  return path.join(getPlatformRoot(), 'catalog.json');
}

function getCategoriesPath() {
  return path.join(getPlatformRoot(), 'categories.json');
}

function getTracesRoot() {
  const override = String(process.env.AGENT_TRACES_ROOT || '').trim();
  if (override) return path.resolve(override);
  return path.join(getPlatformRoot(), 'traces');
}

module.exports = {
  getPlatformRoot,
  getCatalogPath,
  getCategoriesPath,
  getTracesRoot,
};

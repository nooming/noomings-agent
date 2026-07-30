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
  return path.join(getPlatformRoot(), 'traces');
}

module.exports = {
  getPlatformRoot,
  getCatalogPath,
  getCategoriesPath,
  getTracesRoot,
};

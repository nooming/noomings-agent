/** Thin re-export: chapter/meta loaders for packages sample ids. */
const {
  loadChapterForSample,
  loadMetaForSample,
  getPackageChapterPath,
  getPackageMetaPath,
  getPackageGamePath,
  getPackageManifestPath,
  getPackagesRoot,
} = require('../../packages/shared/data-paths');

module.exports = {
  loadChapterForSample,
  loadMetaForSample,
  getPackageChapterPath,
  getPackageMetaPath,
  getPackageGamePath,
  getPackageManifestPath,
  getPackagesRoot,
};

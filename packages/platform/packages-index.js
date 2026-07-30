const fs = require('fs');
const path = require('path');
const {
  getPackagesRoot,
  getPackageDir,
  getPackageGamePath,
  getPackageChapterPath,
  getPackageManifestPath,
} = require('../shared/data-paths');
const { resolvePackageId, packagePlayUrl } = require('../shared/package-layout');
const { resolveGraphPreviewUrl } = require('./graph-preview-url');

function loadManifest() {
  const file = getPackageManifestPath();
  if (!fs.existsSync(file)) return { samples: [] };
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function sampleTitle(sample) {
  const topic = sample.topic || sample.id;
  return `${topic} · ${sample.id}`;
}

function listPackageGraphs() {
  const { samples = [] } = loadManifest();
  return samples
    .filter(s => s.id !== 'capacitor-plate')
    .filter(s => fs.existsSync(getPackageChapterPath(s.id)))
    .map(s => ({
      id: s.id,
      title: sampleTitle(s),
      topic: s.topic || '',
      tags: s.tags || [],
      split: s.split || null,
      source: 'html-sample',
      protected: true,
      sampleId: s.id,
      type: 'html-sample',
      url: resolveGraphPreviewUrl(s.id),
    }));
}

function listPackagePages() {
  const { samples = [] } = loadManifest();
  return samples
    .filter(s => s.id !== 'capacitor-plate')
    .filter(s => fs.existsSync(getPackageGamePath(s.id)))
    .map(s => ({
      url: packagePlayUrl(s.id),
      label: sampleTitle(s),
      topic: s.topic || '',
      source: 'html-sample',
      protected: true,
      sampleId: s.id,
      graphId: s.id,
    }));
}

/** @deprecated alias */
const listHtmlSampleGraphs = listPackageGraphs;
/** @deprecated alias */
const listHtmlSamplePages = listPackagePages;

module.exports = {
  loadManifest,
  listPackageGraphs,
  listPackagePages,
  listHtmlSampleGraphs,
  listHtmlSamplePages,
  getPackagesRoot,
  getPackageDir,
};

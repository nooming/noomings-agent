const schema = require('./schema-prompt');
const play = require('./graph/play-graph');
const strategy = require('./strategy/strategy-rules');
const dtKg = require('./graph/dt-kg-coupling');
const traceMap = require('./graph/trace-map');
const { validateChapter } = require('./validate/validate-structure');
const { validateChapterQuality } = require('./validate/validate-quality');
const { validateChapterScope } = require('./validate/validate-scope');
const sanitize = require('./strategy/strategy-sanitize');
const enrich = require('./enrich/index');

module.exports = {
  ...schema,
  ...play,
  ...strategy,
  ...dtKg,
  ...traceMap,
  ...sanitize,
  validateChapter,
  validateChapterQuality,
  validateChapterScope,
  enrichChapterContract: enrich.enrichChapterContract,
  inferInquiryProfile: enrich.inferInquiryProfile,
  normalizeKgTeachGroups: enrich.normalizeKgTeachGroups,
};

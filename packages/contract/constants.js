const VALID_GROUPS = new Set([
  'premise', 'operation', 'method', 'core', 'result', 'constraint', 'junction', 'irrelevant',
]);

const VALID_LAYERS = new Set(['play', 'teach']);

const VALID_LINK_TP = new Set(['premise', 'method', 'core', 'verify']);

/** layer=teach �?LLM 误写�?group �?*/
const TEACH_GROUP_ALIASES = new Set(['teach', 'teaching', 'lesson', '教案', '教学']);

const TEACH_DEFAULT_GROUP = 'core';

module.exports = {
  VALID_GROUPS,
  VALID_LAYERS,
  VALID_LINK_TP,
  TEACH_GROUP_ALIASES,
  TEACH_DEFAULT_GROUP,
};

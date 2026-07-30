const path = require('path');
const dp = require('../../packages/shared/data-paths');

const ROOT = path.resolve(__dirname, '../..');

module.exports = {
  ROOT,
  ...dp,
};

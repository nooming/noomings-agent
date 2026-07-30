const { assert } = require('../../../lib/assert');
/**
 * Discrete control id inference regression.
 */
const { extractGameHints, inferDiscreteControlIds } = require('../../../../packages/generate/hints');

const CHECKBOX_HTML = `<!DOCTYPE html>
<html><body>
<input type="checkbox" id="airCheckbox" />
<input type="range" id="input-speed" min="0" max="100" />
<select id="planetSelect"><option>Earth</option></select>
<button id="toggleGuideBtn">Guide</button>
<script>
const on = document.getElementById('airCheckbox').checked;
</script>
</body></html>`;

function run() {
  const sources = [{ path: 'mixed.html', content: CHECKBOX_HTML }];
  const hints = extractGameHints(sources);
  assert(hints.discreteControlIds?.includes('airCheckbox'), 'extracts checkbox id');
  assert(hints.discreteControlIds?.includes('planetSelect'), 'extracts select id');
  assert(hints.discreteControlIds?.includes('toggleGuideBtn'), 'extracts toggle btn');
  assert(!hints.discreteControlIds?.includes('input-speed'), 'slider not in discrete');
  assert(hints.variableKindSummary?.sliderCount >= 1, 'slider count');
  assert(hints.variableKindSummary?.discreteCount >= 2, 'discrete count');

  const discrete = inferDiscreteControlIds(CHECKBOX_HTML, ['input-speed']);
  assert(discrete.includes('airCheckbox'), 'inferDiscrete checkbox');
  assert(discrete.includes('planetSelect'), 'inferDiscrete select');
  assert(!discrete.includes('input-speed'), 'inferDiscrete excludes slider');

  console.log('discrete-control-hints-check: OK');
}

module.exports = { run };

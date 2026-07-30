const { assert } = require('../../../lib/assert');
const { enrichChapterContract } = require('../../../../packages/contract/enrich');
const { validateInquiryScript } = require('../../../../packages/contract/validate/validate-inquiry-script');
const { backfillInquiryScript } = require('../../../../packages/contract/enrich/inquiry-script-backfill');
const { buildGameSpec } = require('../../../../packages/generate/game-spec');
const { buildTelemetrySpec } = require('../../../../packages/generate/telemetry-spec');
const { buildLlmPromptBundle } = require('../../../../packages/generate/export/llm-prompt-bundle');

function miniChapter() {
  return {
    mapping: '| DT | KG |',
    kg: {
      title: '斜抛探究',
      nodes: [
        { id: 'P1', label: 'P1', group: 'premise', layer: 'play', level: 0, r: 22, desc: '设定目标' },
        { id: 'O1', label: 'O1', group: 'operation', layer: 'play', level: 1, r: 22, desc: '调节角度速度' },
        { id: 'C1', label: 'C1', group: 'constraint', layer: 'play', level: 2, r: 22, desc: '命中目标区域' },
        { id: 'R1', label: 'R1', group: 'result', layer: 'play', level: 3, r: 22, desc: '过关' },
        { id: 'S1', label: '平抛运动', group: 'core', layer: 'teach', level: 1, r: 22, desc: 'x=v0t, y=½gt²' },
      ],
      links: [
        { s: 'P1', t: 'O1', tp: 'premise' },
        { s: 'O1', t: 'C1', tp: 'premise' },
        { s: 'C1', t: 'R1', tp: 'core' },
        { s: 'S1', t: 'O1', tp: 'verify' },
      ],
    },
    dt: {
      tree: {
        n: '开始', t: 'root',
        children: [{
          n: '命中?', t: 'decision',
          children: [
            { _e: '否', n: '重试', t: 'retry' },
            { _e: '是', n: '过关', t: 'result' },
          ],
        }],
      },
    },
    winSync: { title: '过关' },
    strategy: {
      mermaid: 'graph TD\nStart([开始]):::stratStart\nStart --> Win[过关]:::stratResult',
      routes: [{ id: 'm', label: '主路径', mapsTo: ['P1', 'O1', 'C1', 'R1'], highlightNodes: ['Start'] }],
    },
    traceMap: {
      controls: {
        's-angle': { kgId: 'O1', role: 'operation' },
        's-speed': { kgId: 'O1', role: 'operation' },
        'btn-fire': { kgId: 'O1', role: 'operation' },
      },
    },
  };
}

function run() {
  const hints = { tier: 'generic', minConstraints: 1, minNodes: 6, minTeachNodes: 1, minVerifyLinks: 1 };
  const enriched = enrichChapterContract(miniChapter(), hints, []);

  assert(enriched.inquiryScript?.knowledgePoints?.length >= 1, 'backfill knowledgePoints');
  assert(enriched.inquiryScript?.adjustmentVariables?.length >= 2, 'backfill adjustmentVariables');
  assert(enriched.gameSpec?.controls?.length >= 2, 'gameSpec controls');
  assert(enriched.telemetrySpec?.events?.length >= 2, 'telemetrySpec events');
  assert(enriched.meta?.generationMode === 'analyze', 'generationMode analyze');

  const v = validateInquiryScript(enriched, hints);
  assert(v.ok, `inquiry validate: ${v.errors.join('; ')}`);

  const bundle = buildLlmPromptBundle(enriched);
  assert(bundle.system.includes('HTML'), 'prompt bundle system');
  assert(bundle.user.includes('gameSpec'), 'prompt bundle user has gameSpec');
  assert(bundle.markdown.length > 200, 'prompt bundle markdown');

  const draft = backfillInquiryScript(miniChapter(), hints);
  assert(draft.inquiryScript.adjustmentVariables.some(a => a.controlId === 's-angle'), 'AV from traceMap');

  const spec = buildGameSpec(enriched, hints);
  assert(spec.controls.some(c => c.id === 's-angle'), 'gameSpec s-angle');

  const telem = buildTelemetrySpec(enriched);
  assert(telem.events.some(e => e.controlId === 's-angle'), 'telemetry tuning event');

  console.log('inquiry-script-smoke: OK');
}

module.exports = { run };

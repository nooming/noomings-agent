const { assert } = require('../../../lib/assert');
const {
  validateChapterQuality,
  validateDtEnvAlignment,
  validateDtConditionalParamBranch,
  validateKgConditionalParamCoupling,
} = require('../../../../packages/contract');
const { enrichChapterContract } = require('../../../../packages/contract/enrich');
const { ensureCoupledTraceMap } = require('../../../../packages/contract');
const { loadChapter: loadFixtureChapter } = require('../../../lib/fixture-loader');

const COND_PARAM_HINTS = {
  tier: 'generic',
  minConstraints: 4,
  minTeachNodes: 3,
  minVerifyLinks: 1,
  minNodes: 10,
  maxNodes: 30,
  minStrategyRoutes: 2,
  hasCoupledControls: true,
  hasConditionalParamProfile: true,
  hasIrrelevant: true,
  modeToggleCount: 1,
};

function enrichFixture(key, hints) {
  let ch = loadFixtureChapter('judge', key);
  if (ch.chapter) ch = ch.chapter;
  return enrichChapterContract(ensureCoupledTraceMap(ch, hints));
}

function run() {
  const generic = enrichFixture('coupled', { ...COND_PARAM_HINTS, hasConditionalParamProfile: false });
  assert(validateKgConditionalParamCoupling(generic, true, false).length === 0, 'generic coupled skips kg conditional-param');
  const gq = validateChapterQuality(generic, {
    ...COND_PARAM_HINTS,
    hasConditionalParamProfile: false,
    minConstraints: 1,
    minNodes: 6,
  });
  assert(gq.checklist.kgConditionalParamCoupling, 'generic coupled kgConditionalParamCoupling N/A');
  console.log('generic coupled fixture: kgConditionalParamCoupling skipped');

  const good = enrichFixture('coupledAligned', COND_PARAM_HINTS);
  assert(validateDtEnvAlignment(good, true).length === 0, 'aligned dtEnvAlignment');
  assert(validateKgConditionalParamCoupling(good, true, true).length === 0, 'aligned kgConditionalParamCoupling');
  const goodQ = validateChapterQuality(good, COND_PARAM_HINTS);
  assert(goodQ.checklist.dtEnvAlignment, 'aligned quality dtEnvAlignment');
  assert(goodQ.checklist.kgConditionalParamCoupling, 'aligned quality kgConditionalParamCoupling');
  assert(goodQ.checklist.strategyTeacherAlignment, 'aligned strategyTeacherAlignment');
  assert(goodQ.checklist.dtConditionalParamBranch, 'aligned dtConditionalParamBranch');

  const bad = JSON.parse(JSON.stringify(good));
  const offParam = bad.dt.tree.children[0].children[0].children[1];
  assert(offParam && /参数 B 仅 UI 范围/.test(offParam.n), 'expected off-mode param B node');
  offParam.n = '参数 B 在范围?';
  offParam.d = '关态支：参数 B 约束';
  const badBranchErrors = validateDtConditionalParamBranch(bad, true, true);
  assert(badBranchErrors.length > 0, 'bad off-mode range gate should fail dtConditionalParamBranch');
  const badQ = validateChapterQuality(bad, COND_PARAM_HINTS);
  assert(!badQ.checklist.dtConditionalParamBranch, 'bad chapter dtConditionalParamBranch false');

  const firstDt = good.dt?.tree?.children?.[0];
  assert(/模式|环境|开关|mode/i.test(`${firstDt?.n || ''}${firstDt?.d || ''}`), 'DT first decision is mode/env');
  const c4 = good.kg.nodes.find(n => n.id === 'C4');
  const c5 = good.kg.nodes.find(n => n.id === 'C5');
  assert(c4 && c5, 'C4 and C5 present');
  assert(/无关|不影响|无效|关态|UI/i.test(c4.desc || ''), 'C4 desc mentions off-mode irrelevance');

  console.log('conditional-param: OK');
}

module.exports = { run };

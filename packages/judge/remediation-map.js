/**
 * 主错因 / 子技能 → 固定可操作教学建议（形成性，非 LLM 即兴）。
 */
'use strict';

const { CODE } = require('./primary-misconception');

const REMEDIATION_BY_CODE = Object.freeze({
  [CODE.PASS_WEAK_COMPARE]:
    '固定其余调节量不变，对同一有效参数至少再测 2～3 次，观察因变量变化后再下结论。',
  [CODE.CV_AS_CAUSE]:
    '竞赛段先回到有效调节量；无关量可短暂试探，但不要当作改变结果的主原因。',
  [CODE.MULTI_AV_TRAP]:
    '每次只改一项调节量，其余保持不变，发射/测试后再改下一项。',
  [CODE.TIMING_BLIND_TUNE]:
    '拧完参数先观察读数或现象，再发射/测试；避免连续快拧不看反馈。',
  [CODE.EXPLORE_NO_SOLID]:
    '在探究段对主推参数做 2 次以上单参对照，直到触发探究达成再继续竞赛。',
  [CODE.POSITIVE_CONVERGED]:
    '可进入竞赛段，保持当前单参策略继续收敛即可。',
  [CODE.NONE]: '',
});

const PRIMARY_SHORT_LABEL = Object.freeze({
  [CODE.PASS_WEAK_COMPARE]: '少对照',
  [CODE.CV_AS_CAUSE]: 'CV当因',
  [CODE.MULTI_AV_TRAP]: '多参混调',
  [CODE.TIMING_BLIND_TUNE]: '监测不足',
  [CODE.EXPLORE_NO_SOLID]: '无达成',
  [CODE.POSITIVE_CONVERGED]: '已收敛',
  [CODE.NONE]: '',
});

/** primaryMisconception.code → attention flag skillId */
const CODE_TO_SKILL_ID = Object.freeze({
  [CODE.PASS_WEAK_COMPARE]: 'pass_without_contrast',
  [CODE.CV_AS_CAUSE]: 'confound_bypass',
  [CODE.MULTI_AV_TRAP]: 'controlled_contrast',
  [CODE.TIMING_BLIND_TUNE]: 'timing_dense',
  [CODE.EXPLORE_NO_SOLID]: 'explore_solid',
  [CODE.POSITIVE_CONVERGED]: 'controlled_contrast',
});

function remediationForPrimaryCode(code) {
  const c = code || CODE.NONE;
  const text = REMEDIATION_BY_CODE[c] || '';
  return {
    code: c,
    text,
    source: text ? 'primary_code' : 'none',
  };
}

function primaryShortLabel(code) {
  return PRIMARY_SHORT_LABEL[code || CODE.NONE] || '';
}

module.exports = {
  REMEDIATION_BY_CODE,
  PRIMARY_SHORT_LABEL,
  CODE_TO_SKILL_ID,
  remediationForPrimaryCode,
  primaryShortLabel,
};

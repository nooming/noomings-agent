/**
 * 教师端「需关注」旗标：对照不足已过关 / 旁路偏高 / 有探究无达成
 */
const { assert } = require('../../../lib/assert');
const {
  FLAG_IDS,
  SKILL_IDS,
  detectSessionAttentionFlags,
  detectStudentAttentionFlags,
  formatAttentionFlagsSummary,
  DISCLAIMER,
} = require('../../../../packages/judge/attention-flags');
const { PASS_WEAK_COMPARE_GAP } = require('../../../../packages/judge/judge');

function run() {
  // 空 → 无旗
  {
    const r = detectSessionAttentionFlags({});
    assert(r.flags.length === 0, 'empty no flags');
    assert(r.disclaimer === DISCLAIMER, 'disclaimer');
  }

  // 对照不足已过关
  {
    const r = detectSessionAttentionFlags({
      terminalOutcome: 'pass',
      verdict: 'pass',
      gaps: [PASS_WEAK_COMPARE_GAP],
      abilityScore: {
        bands: { result: '达标' },
        parts: { result: { raw: 100 }, efficiency: { challengeTrials: 1 } },
      },
    });
    assert(r.flagIds.includes(FLAG_IDS.PASS_WEAK_COMPARE), 'pass weak compare');
    assert(r.flags[0].skillId === SKILL_IDS.PASS_WITHOUT_CONTRAST, 'skill id');
    assert(/对照不足已过关/.test(r.flags[0].label), 'label zh');
  }

  // 旁路偏高：gaps 或 cvOver
  {
    const byGap = detectSessionAttentionFlags({
      gaps: ['竞赛段偏重拧无关量，更像试探旁路'],
      abilityScore: { parts: { challengeProcess: { raw: 40 } } },
    });
    assert(byGap.flagIds.includes(FLAG_IDS.CV_BYPASS_HEAVY), 'bypass by gap');
    const byCv = detectSessionAttentionFlags({
      abilityScore: { parts: { challengeProcess: { raw: 30, cvOver: true } } },
    });
    assert(byCv.flagIds.includes(FLAG_IDS.CV_BYPASS_HEAVY), 'bypass by cvOver');
  }

  // 有探究无达成：触达探究但无 solid
  {
    const r = detectSessionAttentionFlags({
      abilityScore: {
        parts: {
          exploreProcess: { raw: 45 },
          exploreResult: { raw: 0, tier: 'none' },
          efficiency: { exploreTrials: 3, challengeTrials: 0 },
        },
        bands: { exploreResult: '未达成' },
      },
      currentPhase: 'explore',
    });
    assert(r.flagIds.includes(FLAG_IDS.EXPLORE_NO_SOLID), 'explore no solid');
  }

  // solid 达成 → 不亮「有探究无达成」
  {
    const r = detectSessionAttentionFlags({
      abilityScore: {
        parts: {
          exploreProcess: { raw: 80 },
          exploreResult: { raw: 100, tier: 'solid' },
          efficiency: { exploreTrials: 4 },
        },
        bands: { exploreResult: '扎实达成' },
      },
    });
    assert(!r.flagIds.includes(FLAG_IDS.EXPLORE_NO_SOLID), 'solid suppresses explore_no_solid');
  }

  // 学生级并集
  {
    const student = detectStudentAttentionFlags([
      {
        terminalOutcome: 'pass',
        gaps: [PASS_WEAK_COMPARE_GAP],
        abilityScore: { bands: { result: '达标' }, parts: { result: { raw: 100 } } },
      },
      {
        abilityScore: {
          parts: {
            exploreProcess: { raw: 40 },
            exploreResult: { raw: 40, tier: 'lucky' },
            efficiency: { exploreTrials: 2 },
          },
        },
      },
    ]);
    assert(student.flagIds.includes(FLAG_IDS.PASS_WEAK_COMPARE), 'union pass weak');
    assert(student.flagIds.includes(FLAG_IDS.EXPLORE_NO_SOLID), 'union explore no solid');
    const summary = formatAttentionFlagsSummary(student);
    assert(/需关注/.test(summary) && /非能力鉴定/.test(summary), `summary: ${summary}`);
  }

  // 幸运一发也算无扎实
  {
    const r = detectSessionAttentionFlags({
      abilityScore: {
        parts: {
          exploreResult: { raw: 50, tier: 'lucky' },
          efficiency: { exploreTrials: 2 },
        },
      },
    });
    assert(r.flagIds.includes(FLAG_IDS.EXPLORE_NO_SOLID), 'lucky → explore_no_solid');
  }
}

module.exports = { run };

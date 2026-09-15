/**
 * literacy-mapping：四维学习表现解读（轻量断言）
 */
const { assert } = require('../../../lib/assert');
const {
  computeLiteracyProfile,
  aggregateLiteracyProfiles,
  mergeLevelsCautiousMode,
  LEVELS,
} = require('../../../../packages/judge/literacy-mapping');

function byId(profile, id) {
  return (profile.dimensions || []).find((d) => d.id === id);
}

function run() {
  // 空输入 → 四维证据不足
  {
    const p = computeLiteracyProfile({});
    assert(p.version === 1, 'version');
    assert(p.audience === 'university', 'audience');
    assert(/非标准化测评/.test(p.disclaimer), 'disclaimer');
    for (const id of ['inquiry', 'reasoning', 'problemSolving', 'engagement']) {
      assert(byId(p, id)?.level === LEVELS.INSUFFICIENT, `${id} empty → insufficient`);
    }
  }

  // 有探究过程 + 单参亮点 → 探究偏强；科学推理偏强
  {
    const p = computeLiteracyProfile({
      abilityScore: {
        version: 4,
        parts: {
          exploreProcess: { raw: 78, primary: '单变量·A' },
          exploreResult: { raw: 100, tier: 'solid' },
          efficiency: { exploreTrials: 4, challengeTrials: 0 },
        },
        bands: { exploreResult: '扎实达成', process: '清楚' },
      },
      judgeResult: {
        verdict: 'learning',
        strengths: ['符合主推控制变量途径，单参调节优于多参混调'],
        gaps: [],
      },
      strategyPathByPhase: {
        explore: { scoredPhase: 'explore', type: '单变量型（s-a）' },
      },
      eventCount: 20,
      currentPhase: 'explore',
    });
    assert(byId(p, 'inquiry')?.level === LEVELS.STRONG, 'inquiry strong with explore+CV');
    assert(byId(p, 'reasoning')?.level === LEVELS.STRONG, 'reasoning strong with single-var');
    assert(byId(p, 'problemSolving')?.level === LEVELS.INSUFFICIENT, 'no challenge → PS insufficient');
  }

  // 旁路 gaps → 科学推理待加强
  {
    const p = computeLiteracyProfile({
      abilityScore: {
        parts: {
          challengeProcess: { raw: 35, cvOver: true, trap: false },
          result: { raw: 0 },
          efficiency: { exploreTrials: 1, challengeTrials: 4, processGate: false },
        },
        bands: { result: '未达标', process: '尚不清晰' },
      },
      judgeResult: {
        verdict: 'learning',
        strengths: [],
        gaps: ['竞赛段偏重拧无关量，更像试探旁路'],
      },
      terminalOutcome: 'exhausted_fail',
      eventCount: 30,
      currentPhase: 'challenge',
    });
    assert(byId(p, 'reasoning')?.level === LEVELS.WEAK, 'bypass gap → reasoning weak');
    assert(byId(p, 'problemSolving')?.level === LEVELS.WEAK, 'exhausted + weak process → PS weak');
  }

  // 双模 + 终局高完成 → 学习投入偏强；勿出现「学习动机」
  {
    const p = computeLiteracyProfile({
      abilityScore: {
        parts: {
          exploreProcess: { raw: 60 },
          challengeProcess: { raw: 62 },
          challengeResult: { raw: 100 },
          efficiency: { exploreTrials: 3, challengeTrials: 3, processGate: true, raw: 70 },
        },
        bands: { challengeResult: '达标', process: '清楚' },
      },
      strategyPathByPhase: {
        explore: { scoredPhase: 'explore', type: '单变量型' },
        challenge: { scoredPhase: 'challenge', type: '单变量型' },
      },
      terminalOutcome: 'pass',
      eventCount: 40,
      sawPhaseChange: true,
    });
    assert(byId(p, 'engagement')?.level === LEVELS.STRONG, 'dual-mode terminal → engagement strong');
    assert(byId(p, 'problemSolving')?.level === LEVELS.STRONG, 'win + process → PS strong');
    const blob = JSON.stringify(p);
    assert(!/学习动机/.test(blob), 'must not label 学习动机');
    assert(byId(p, 'engagement')?.label === '学习投入', 'engagement label');
  }

  // 无评判但有 ability/path → 推理可用路径信号；无路径则不足
  {
    const thin = computeLiteracyProfile({
      abilityScore: { parts: { efficiency: { exploreTrials: 0, challengeTrials: 0 } } },
      eventCount: 2,
    });
    assert(byId(thin, 'reasoning')?.level === LEVELS.INSUFFICIENT, 'no judge/path → reasoning insufficient');
    assert(/规则评判/.test(byId(thin, 'reasoning')?.evidence || ''), 'hint to run judge');
  }

  // 调参↔动作过短 + 未达成 → 问题解决依据提「偏快出手」；不改探究/推理档
  {
    const p = computeLiteracyProfile({
      abilityScore: {
        parts: {
          challengeProcess: { raw: 30 },
          result: { raw: 0 },
          efficiency: { exploreTrials: 2, challengeTrials: 3, processGate: false },
        },
        bands: { result: '未达标', process: '尚不清晰' },
      },
      terminalOutcome: 'exhausted_fail',
      eventCount: 40,
      currentPhase: 'challenge',
      timingFeatures: {
        version: 1,
        startupDelayMs: 800,
        tuneActionGapMs: { median: 400, mean: 420, n: 5, capped: 0 },
        tuneTuneGapMs: { median: 600, mean: 600, n: 4, capped: 0 },
        phaseDurationMs: { explore: 25_000, challenge: 40_000, unknown: 0 },
      },
    });
    assert(/偏快出手/.test(byId(p, 'problemSolving')?.evidence || ''), 'PS rush cue');
    assert(byId(p, 'problemSolving')?.level === LEVELS.WEAK, 'PS level from outcome not timing');
    assert((byId(p, 'problemSolving')?.evidenceKinds || []).includes('timing'), 'PS timing kind');
    assert(/依据/.test(byId(p, 'problemSolving')?.evidenceDetail || ''), 'PS evidenceDetail audit');
  }

  // 有对照、后达成 + 短间隔 → 勿误判偏快出手
  {
    const p = computeLiteracyProfile({
      abilityScore: {
        parts: {
          challengeProcess: { raw: 75, primary: '单变量·A' },
          result: { raw: 100 },
          efficiency: { exploreTrials: 2, challengeTrials: 3, processGate: true, raw: 70 },
        },
        bands: { result: '达标', process: '清楚' },
      },
      judgeResult: {
        verdict: 'pass',
        strengths: ['符合主推控制变量途径，单参调节优于多参混调'],
        gaps: [],
      },
      terminalOutcome: 'pass',
      eventCount: 40,
      currentPhase: 'challenge',
      timingFeatures: {
        version: 1,
        startupDelayMs: 800,
        tuneActionGapMs: { median: 400, mean: 420, n: 5, capped: 0 },
        tuneTuneGapMs: { median: 600, mean: 600, n: 4, capped: 0 },
        phaseDurationMs: { explore: 25_000, challenge: 40_000, unknown: 0 },
      },
    });
    assert(!/偏快出手/.test(byId(p, 'problemSolving')?.evidence || ''), 'no rush after contrast+pass');
    assert(byId(p, 'problemSolving')?.level === LEVELS.STRONG, 'PS still strong');
  }

  // 空输入维：证据不足可审计
  {
    const p = computeLiteracyProfile({});
    assert(byId(p, 'inquiry')?.evidenceInsufficient === true, 'inquiry insufficient flag');
    assert(/证据不足/.test(byId(p, 'inquiry')?.evidenceDetail || ''), 'inquiry detail says 证据不足');
  }

  // 封顶后段时长可辅证投入；超长 gap 已剔除不影响
  {
    const p = computeLiteracyProfile({
      abilityScore: {
        parts: {
          exploreProcess: { raw: 50 },
          challengeProcess: { raw: 50 },
          efficiency: { exploreTrials: 2, challengeTrials: 2 },
        },
        bands: { process: '部分清楚' },
      },
      terminalOutcome: 'pass',
      eventCount: 30,
      currentPhase: 'challenge',
      timingFeatures: {
        version: 1,
        startupDelayMs: 2000,
        tuneActionGapMs: { median: 2000, mean: 2000, n: 4, capped: 2 },
        tuneTuneGapMs: { median: 1500, mean: 1500, n: 3, capped: 1 },
        phaseDurationMs: { explore: 30_000, challenge: 35_000, unknown: 0 },
      },
    });
    const eng = byId(p, 'engagement');
    assert(eng?.level === LEVELS.STRONG, 'dual+terminal engagement strong');
    assert(/封顶后活跃段/.test(eng?.evidence || ''), 'engagement cites capped phase');
    assert(!/深度思考/.test(eng?.evidence || ''), 'no deep-think from long gaps');
  }

  // 众数合并；并列取更弱档
  {
    assert(mergeLevelsCautiousMode(['strong', 'strong', 'moderate']) === LEVELS.STRONG, 'mode strong');
    assert(mergeLevelsCautiousMode(['strong', 'weak']) === LEVELS.WEAK, 'tie → weaker');
    assert(mergeLevelsCautiousMode(['moderate', 'strong']) === LEVELS.MODERATE, 'tie moderate/strong → moderate');
  }

  // 学生级聚合：忽略不足后众数；依据含「基于 N 局」；勿写学习动机
  {
    const strongInquiry = computeLiteracyProfile({
      abilityScore: {
        parts: {
          exploreProcess: { raw: 78, primary: '单变量·A' },
          exploreResult: { raw: 100, tier: 'solid' },
          efficiency: { exploreTrials: 4, challengeTrials: 0 },
        },
        bands: { exploreResult: '扎实达成', process: '清楚' },
      },
      judgeResult: {
        verdict: 'learning',
        strengths: ['符合主推控制变量途径，单参调节优于多参混调'],
        gaps: [],
      },
      eventCount: 20,
      currentPhase: 'explore',
    });
    const weakInquiry = computeLiteracyProfile({
      abilityScore: {
        parts: {
          exploreProcess: { raw: 20 },
          exploreResult: { raw: 0 },
          efficiency: { exploreTrials: 3, challengeTrials: 0 },
        },
        bands: { exploreResult: '未达成', process: '尚不清晰' },
      },
      eventCount: 15,
      currentPhase: 'explore',
    });
    const agg = aggregateLiteracyProfiles([strongInquiry, weakInquiry, strongInquiry]);
    assert(agg.scope === 'student', 'student scope');
    assert(/近阶段过程证据/.test(agg.disclaimer), 'student disclaimer');
    assert(agg.aggregation?.strategy === 'cautious_mode', 'cautious strategy');
    assert(agg.aggregation?.sessionCount === 3, 'sessionCount 3');
    assert(byId(agg, 'inquiry')?.level === LEVELS.STRONG, 'inquiry mode of 2 strong + 1 weak');
    assert(/基于 3 局/.test(byId(agg, 'inquiry')?.evidence || ''), 'evidence cites N');
    assert(!/学习动机/.test(JSON.stringify(agg)), 'no 学习动机 in student agg');
    for (const d of agg.dimensions || []) {
      assert(typeof d.evidence === 'string', `${d.id} agg evidence is string`);
      assert(!/\[object Object\]/.test(d.evidence || ''), `${d.id} evidence not [object Object]`);
      assert(!/\[object Object\]/.test(d.evidenceDetail || ''), `${d.id} evidenceDetail not [object Object]`);
    }
  }

  // 浏览器镜像聚合：evidence 必须为字符串（勿把 summarized 对象塞进 dim）
  {
    const browserLm = require('../../../../apps/web/ui/literacy-mapping');
    const profiles = [
      {
        dimensions: [
          { id: 'inquiry', label: '探究素养', level: 'strong', evidence: '探究达成较扎实。', evidenceKinds: ['pe', 'er'] },
          { id: 'reasoning', label: '科学推理', level: 'moderate', evidence: '推理一般。', evidenceKinds: ['path'] },
          { id: 'problemSolving', label: '问题解决', level: 'weak', evidence: 'PS 弱。', evidenceKinds: ['result'] },
          { id: 'engagement', label: '学习投入', level: 'strong', evidence: '投入偏强。', evidenceKinds: ['dual'] },
        ],
      },
      {
        dimensions: [
          { id: 'inquiry', label: '探究素养', level: 'strong', evidence: '单参对照清晰。', evidenceKinds: ['pe', 'path'] },
          { id: 'reasoning', label: '科学推理', level: 'moderate', evidence: '信号混杂。', evidenceKinds: ['gaps'] },
          { id: 'problemSolving', label: '问题解决', level: 'moderate', evidence: 'PS 一般。', evidenceKinds: ['pc'] },
          { id: 'engagement', label: '学习投入', level: 'moderate', evidence: '投入一般。', evidenceKinds: ['events'] },
        ],
      },
    ];
    const aggUi = browserLm.aggregateLiteracyProfiles(profiles);
    for (const d of aggUi.dimensions || []) {
      assert(typeof d.evidence === 'string', `ui ${d.id} evidence string`);
      assert(!/\[object Object\]/.test(String(d.evidence)), `ui ${d.id} no [object Object]`);
      assert(/基于 2 局/.test(d.evidence), `ui ${d.id} cites N sessions`);
    }
    assert(Array.isArray(byId(aggUi, 'inquiry')?.evidenceKinds), 'ui inquiry kinds array');
  }

  // 并列强弱 → 取弱；全不足 → 不足
  {
    const a = {
      dimensions: [
        { id: 'inquiry', label: '探究素养', level: 'strong', evidence: 'A强。' },
        { id: 'reasoning', label: '科学推理', level: 'insufficient', evidence: '无。' },
        { id: 'problemSolving', label: '问题解决', level: 'moderate', evidence: 'A一般。' },
        { id: 'engagement', label: '学习投入', level: 'weak', evidence: 'A弱。' },
      ],
    };
    const b = {
      dimensions: [
        { id: 'inquiry', label: '探究素养', level: 'weak', evidence: 'B弱。' },
        { id: 'reasoning', label: '科学推理', level: 'insufficient', evidence: '无。' },
        { id: 'problemSolving', label: '问题解决', level: 'moderate', evidence: 'B一般。' },
        { id: 'engagement', label: '学习投入', level: 'strong', evidence: 'B强。' },
      ],
    };
    const agg = aggregateLiteracyProfiles([a, b]);
    assert(byId(agg, 'inquiry')?.level === LEVELS.WEAK, 'strong/weak tie → weak');
    assert(byId(agg, 'reasoning')?.level === LEVELS.INSUFFICIENT, 'all insufficient');
    assert(byId(agg, 'engagement')?.level === LEVELS.WEAK, 'weak/strong tie → weak');
  }
}

module.exports = { run };

/**
 * Confound probe visual: StrategySelect side-branch + low-score route, no priorityRank.
 * Also collapses redundant ModeOff / 条件下误操作 misconception islands.
 */
const { assert } = require('../../../lib/assert');
const {
  repairStrategyConfoundVisual,
  hasConfoundSelectEdge,
  hasMisconceptionLoop,
} = require('../../../../packages/contract/repair/strategy-confound-visual-repair');
const { annotateStrategyMermaidPriority, isConfoundProbeRoute, routePriorityMeta } = require('../../../../packages/shared/strategy-priority-mermaid');

const BASE = {
  inquiryScript: {
    confoundingVariables: [
      { id: 'CV1', controlId: 's-mass', label: '质量', reason: '装饰' },
    ],
    adjustmentVariables: [
      { id: 'AV1', controlId: 's-angle', label: '倾角', priorityRank: 1 },
    ],
  },
  strategy: {
    mermaid: `graph TD
Start --> StrategySelect{选择?}
StrategySelect -->|单变量·倾角| AngleRoute
AngleRoute --> AdjustAngle
AdjustAngle --> Fire
Fire --> Observe
Observe --> Win
`,
    routes: [
      {
        id: 'main',
        label: '单变量·倾角',
        priorityRank: 1,
        score: 1,
        highlightNodes: ['Start', 'StrategySelect', 'AngleRoute', 'AdjustAngle', 'Fire', 'Observe', 'Win'],
        highlightEdges: [],
      },
    ],
  },
};

const DUAL = {
  inquiryScript: {
    confoundingVariables: [
      { id: 'CV1', controlId: 'CV1', label: '无关控件' },
    ],
  },
  strategy: {
    mermaid: `graph TD
Start --> Env{选择模式?}
Env -->|探究| Explore[探究模式]:::stratCore
Explore --> StrategySelect{选择调参策略?}
StrategySelect -->|单变量·匝数| Route1
CheckMisconception -->|是| InvalidMisconception[条件下误操作]:::stratInvalid
InvalidMisconception --> ModeOff
ModeOff --> CheckMisconception{是否误调无效参数?}:::stratCond
StrategySelect -.->|试探混淆·无关控件| ProbeCV[拧混淆·无关控件]:::stratInvalid
ProbeCV --> ObserveCV{观察有无增益?}:::stratCond
ObserveCV -->|无增益| BackFromCV[回到主策略]:::stratCore
BackFromCV --> StrategySelect
`,
    routes: [
      {
        id: 'confound_CV1',
        label: '试探混淆·无关控件',
        kind: 'confoundProbe',
        score: 0.15,
        highlightNodes: ['StrategySelect', 'ProbeCV', 'ObserveCV', 'BackFromCV'],
        highlightEdges: [],
      },
    ],
  },
};

const MODE_PLUS_CV = {
  inquiryScript: {
    confoundingVariables: [
      { id: 'CV1', controlId: 'audio-volume', label: '音量' },
    ],
  },
  strategy: {
    mermaid: `graph TD
Start --> Env{选择模式?}
Env -->|竞赛模式| ModeOff[竞赛模式·目标随机锁定]:::stratCore
Env -->|探究模式| ModeOn[探究模式]:::stratCore
ModeOff --> StrategySelect
ModeOn --> StrategySelect{选择调参策略?}
ModeOff --> CheckMisconception{是否误调无效参数?}:::stratCond
CheckMisconception -->|是| InvalidMisconception[条件下误操作]:::stratInvalid
InvalidMisconception --> ModeOff
StrategySelect -->|单变量·C1| Adjust1
`,
    routes: [
      {
        id: 'main',
        label: '单变量·C1',
        highlightNodes: ['Start', 'Env', 'ModeOff', 'StrategySelect', 'Adjust1'],
        highlightEdges: [],
      },
    ],
  },
};

function run() {
  const repaired = repairStrategyConfoundVisual(BASE);
  assert(hasConfoundSelectEdge(repaired.strategy.mermaid), 'mermaid has 试探混淆 edge');
  assert(/ProbeCV/.test(repaired.strategy.mermaid), 'ProbeCV node');
  assert(/:::stratInvalid/.test(repaired.strategy.mermaid), 'stratInvalid on probe');
  const probe = repaired.strategy.routes.find(r => r.kind === 'confoundProbe');
  assert(!!probe, 'confoundProbe route');
  assert(/试探(?:混淆)?·质量/.test(probe.label), `label ${probe.label}`);
  assert(probe.priorityRank == null, 'no priorityRank on confound');
  assert(Number(probe.score) <= 0.15, 'low score');
  assert(probe.highlightNodes.includes('ProbeCV') || probe.highlightNodes.some(id => /ProbeCV/i.test(id)), 'hl ProbeCV');

  assert(isConfoundProbeRoute(probe), 'isConfoundProbeRoute');
  const meta = routePriorityMeta(probe);
  assert(meta.confound === true, 'meta.confound');
  assert(meta.trap === false, 'not trap');
  assert(meta.rank >= 90, 'rank not competing with AV');

  const annotated = annotateStrategyMermaidPriority(repaired.strategy.mermaid, repaired.strategy.routes);
  assert(/旁路/.test(annotated), 'annotated 旁路');
  assert(/-\.->\|[^|]*试探混淆/.test(annotated) || /-\.->\|[^|]*旁路/.test(annotated), 'dotted confound edge');

  // Idempotent
  const again = repairStrategyConfoundVisual(repaired);
  const probes = again.strategy.routes.filter(r => r.kind === 'confoundProbe');
  assert(probes.length === 1, `exactly one confound route got ${probes.length}`);

  // Dual path: orphan ModeOff 迷思环 + 试探混淆 → keep only CV bypass
  const dualFixed = repairStrategyConfoundVisual(DUAL);
  assert(!hasMisconceptionLoop(dualFixed.strategy.mermaid), 'orphan misconception loop removed');
  assert(!/\bModeOff\b/.test(dualFixed.strategy.mermaid), 'orphan ModeOff removed');
  assert(hasConfoundSelectEdge(dualFixed.strategy.mermaid), 'CV bypass kept');
  assert(/试探(?:混淆)?·无关控件/.test(dualFixed.strategy.mermaid), 'CV label kept');

  // Real ModeOff watershed + CV: keep ModeOff hub, drop Check/Invalid cycle, inject CV by name
  const modeFixed = repairStrategyConfoundVisual(MODE_PLUS_CV);
  assert(/ModeOff\[竞赛模式/.test(modeFixed.strategy.mermaid), 'real ModeOff kept');
  assert(!hasMisconceptionLoop(modeFixed.strategy.mermaid), 'misconception cycle stripped');
  assert(/试探(?:混淆)?·音量/.test(modeFixed.strategy.mermaid), 'CV uses real label 音量');
  assert(modeFixed.strategy.routes.some(r => r.kind === 'confoundProbe' && /音量/.test(r.label)), 'confoundProbe route');

  console.log('strategy-confound-visual-repair-check: ok');
}

module.exports = { run };

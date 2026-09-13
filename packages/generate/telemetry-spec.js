/** traceMap + DT → 论文用 telemetrySpec（文档化，暂不注入 adapter） */

const { walkDt } = require('../contract/graph/play-graph');

function buildTelemetrySpec(chapter) {
  const controls = chapter.traceMap?.controls || {};
  const legacy = chapter.traceMap?.legacyTypes || {};
  const events = [];

  for (const [controlId, meta] of Object.entries(controls)) {
    if (meta?.role === 'operation') {
      events.push({
        type: 'tuning',
        controlId,
        kgId: meta.kgId,
        required: true,
        description: `学生调节 ${controlId} → KG ${meta.kgId}`,
      });
    } else if (meta?.role === 'irrelevant') {
      events.push({
        type: 'irrelevant_touch',
        controlId,
        kgId: meta.kgId,
        required: false,
        description: `混淆/无关控件触碰 ${controlId}`,
      });
    }
  }

  for (const [legacyType, meta] of Object.entries(legacy)) {
    events.push({
      type: legacyType,
      canonical: meta.canonical,
      control: meta.control,
      required: meta.canonical === 'tuning',
    });
  }

  const dtCheckpoints = [];
  walkDt(chapter.dt?.tree, node => {
    if (node.t === 'decision') {
      dtCheckpoints.push({
        name: node.n,
        type: 'decision',
        desc: node.d || '',
      });
    }
    if (node.t === 'result') {
      dtCheckpoints.push({ name: node.n, type: 'result', desc: node.d || '' });
    }
    if (node.t === 'retry') {
      dtCheckpoints.push({ name: node.n, type: 'retry', desc: node.d || '' });
    }
  });

  // 规范结果事件（非 control 派生）：竞赛 win vs 探究 explore_success
  events.push({
    type: 'explore_success',
    required: false,
    description: '探究模式达成（命中/对照里程碑）。payload 可含 winOk、hintKey、controls；不计为竞赛通关【主口径】',
  });
  events.push({
    type: 'win',
    required: false,
    description: '竞赛模式通关。仅 challenge 段应 emit；探究达成请用 explore_success',
  });
  events.push({
    type: 'phase_change',
    required: false,
    description: '双模切换。payload.phase = explore | challenge；优先 CraftTelemetry.initDualModePhase() 或等价',
  });
  events.push({
    type: 'snapshot',
    required: false,
    description: '发射/测后/归因。可含 controls、winOk、hintKey；通关归因后可带 attribution（主 AV id / mixed / unsure；勿把 CV 当正确归因）',
  });

  const paperNotes = [
    '按事理图谱 traceMap 上报：每次滑条/按钮操作记录 controlId、值、时间戳。',
    'snapshot 事件在「发射/测试/提交」时记录各 control 当前值；通关归因后再发可含 attribution。',
    '探究达成（主）：emit(\'explore_success\', { winOk: true, hintKey, … })；勿用 win 冒充竞赛结果。',
    '竞赛通关：emit(\'snapshot\', { winOk: true, … }) + emit(\'win\', { winOk: true })；仅 challenge。',
    '双模：#modeSelect 变更时 emit phase_change；包目录可挂 packages/_shared/craft-telemetry.js。',
    'deprecated：探究段 emit win 仅兼容旧轨迹；新产品禁止再用 win 表示探究达成。',
    '判分：探究结果认 explore_success（兼容旧轨迹探究段 win/winOk）；竞赛结果只认竞赛段 win/winOk，不认 explore_success。',
    '评判时将轨迹节点映射到 KG play 链（P1→O1→C*→R1）与 strategy routes。',
    '混淆变量触碰记 irrelevant_touch，不计入主探究路径得分；CV 滑条可交互但不进归因正确项。',
  ].join('\n');

  return {
    version: 1,
    alignedWith: 'traceMap',
    exportEndpoint: '/api/trace/ingest',
    events,
    dtCheckpoints: dtCheckpoints.slice(0, 24),
    paperNotes,
    craftTelemetry: {
      sharedPath: 'data/runtime/packages/_shared/craft-telemetry.js',
      tokensPath: 'data/runtime/packages/_shared/craft-tokens.css',
      shellPath: 'data/runtime/packages/_shared/craft-shell.css',
      feedbackPath: 'data/runtime/packages/_shared/craft-feedback.js',
      contractReadme: 'data/runtime/packages/_shared/README.md',
      generatedHtml: 'inline craft CSS variables + shell patterns (.bench-hd, .side-goal-box, .craft-mode-pill); optional comment pointing at CraftTelemetry / CraftFeedback helpers',
      shellIa: {
        benchHeader: '.bench-hd (title + sub ‖ #modeSelect)',
        sideGoal: '.side-goal-box > .side-goal-cap + #sideGoal',
        modePill: '.craft-mode-pill (探究模式 / 竞赛模式 | 剩余机会 N)',
        benchOrder: ['bench-hd', 'side-goal-box', 'sliders', 'actions', 'observe'],
      },
    },
    adapterNote: '后期可在 HTML 中嵌入 trace-adapter-lite.js；本期仅规格文档化。ingest 不白名单过滤类型，explore_success / attribution snapshot 会原样落盘。',
  };
}

function renderTelemetryMarkdown(spec) {
  if (!spec) return '';
  const lines = ['## 埋点规格（telemetrySpec）', '', spec.paperNotes, '', '### 事件列表', ''];
  for (const ev of spec.events || []) {
    lines.push(`- **${ev.type}** \`${ev.controlId || ev.type}\` → ${ev.kgId || ev.canonical || '—'}${ev.required ? '（必采）' : ''}`);
  }
  if (spec.dtCheckpoints?.length) {
    lines.push('', '### DT 检查点', '');
    for (const cp of spec.dtCheckpoints.slice(0, 8)) {
      lines.push(`- ${cp.type}: ${cp.name}`);
    }
  }
  return lines.join('\n');
}

module.exports = {
  buildTelemetrySpec,
  renderTelemetryMarkdown,
};

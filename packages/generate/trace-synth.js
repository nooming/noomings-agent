const { evaluateTraceRules } = require('../judge/evaluate-rules');
const { playConstraints } = require('../contract');

/** Agent A 合成轨迹冒烟：仅规则评判，不使用 LLM */

function buildDecisions(chapter, allTrue = true) {
  const constraints = playConstraints(chapter.kg?.nodes || []);
  const decisions = {};
  constraints.forEach(c => { decisions[c.id] = allTrue; });
  return decisions;
}

/** 沿 play 约束链合成规范轨迹（tuning/snapshot，与 fixture traceMap 对齐） */
function synthFromDtOutline(chapter) {
  const ch = chapter._ch ?? 0;
  const constraints = playConstraints(chapter.kg?.nodes || []);
  if (!constraints.length) {
    return { label: 'dt_outline', events: [], skipped: true };
  }
  const events = [{ ts: 1, ch, type: 'puzzle_open', payload: {} }];
  let ts = 2;
  const decisions = {};
  constraints.forEach(c => { decisions[c.id] = false; });

  for (let i = 0; i < constraints.length; i++) {
    events.push({
      ts: ts++, ch, type: 'tuning',
      payload: { control: `step_${i}`, value: i + 1 },
    });
    constraints.forEach((c, j) => { decisions[c.id] = j <= i; });
    events.push({
      ts: ts++, ch, type: 'snapshot',
      payload: {
        decisions: { ...decisions },
        hintKey: i < constraints.length - 1 ? 'retry' : 'ok',
        winOk: i === constraints.length - 1,
      },
    });
  }
  const finalDecisions = buildDecisions(chapter, true);
  events.push({
    ts: ts++, ch, type: 'win',
    payload: { snapshot: { decisions: finalDecisions, winOk: true, hintKey: 'ok' } },
  });
  return { label: 'dt_outline_good', events };
}

/** 多参交替调节、未过关 → 期望 in_progress / learning */
function synthTrapTrace(chapter) {
  const ch = chapter._ch ?? 0;
  const controls = Object.entries(chapter.traceMap?.controls || {})
    .filter(([, v]) => v?.role === 'operation' || v?.role === 'action')
    .map(([id]) => id);
  const ops = controls.length >= 2 ? controls.slice(0, 2) : ['step_0', 'step_1'];
  const events = [{ ts: 1, ch, type: 'puzzle_open', payload: {} }];
  let ts = 2;
  for (let i = 0; i < 6; i++) {
    const ctrl = ops[i % ops.length];
    events.push({ ts: ts++, ch, type: 'tuning', payload: { control: ctrl, value: String(10 + i) } });
    events.push({ ts: ts++, ch, type: 'action', payload: { control: 'btn-fire' } });
  }
  events.push({
    ts: ts++, ch, type: 'snapshot',
    payload: { winOk: false, hintKey: 'retry' },
  });
  return { label: 'trap_multi_param', events };
}

/** 单参扫值、未过关 → 期望 in_progress（主推单变量途径） */
function synthSingleVarMain(chapter) {
  const ch = chapter._ch ?? 0;
  const opEntry = Object.entries(chapter.traceMap?.controls || {})
    .find(([, v]) => v?.role === 'operation');
  const control = opEntry ? opEntry[0] : 'step_0';
  const events = [{ ts: 1, ch, type: 'puzzle_open', payload: {} }];
  let ts = 2;
  for (let i = 0; i < 5; i++) {
    events.push({ ts: ts++, ch, type: 'tuning', payload: { control, value: String(10 + i) } });
    events.push({ ts: ts++, ch, type: 'action', payload: { control: 'btn-fire' } });
  }
  events.push({
    ts: ts++, ch, type: 'snapshot',
    payload: { winOk: false, hintKey: 'retry' },
  });
  return { label: 'single_var_main', events };
}

function irrelevantControlId(chapter) {
  const controls = chapter?.traceMap?.controls || {};
  const entry = Object.entries(controls).find(([, v]) => v?.role === 'irrelevant');
  if (entry) return entry[0];
  return 'irrelevant_ctrl';
}

function shouldSynthIrrelevantTrace(chapter, gameHints) {
  const irr = (chapter.kg?.nodes || []).some(n => n.group === 'irrelevant');
  if (!irr) return false;
  if (gameHints?.hasCoupledControls && !gameHints?.hasIrrelevant) return false;
  return true;
}

function synthGenericIrrelevantTrace(chapter) {
  const ch = chapter._ch ?? 0;
  const irr = (chapter.kg?.nodes || []).find(n => n.group === 'irrelevant');
  if (!irr) return { label: 'generic_irrelevant', events: [], skipped: true };
  const control = irrelevantControlId(chapter);
  return {
    label: 'generic_irrelevant',
    events: [
      { ts: 1, ch, type: 'puzzle_open', payload: {} },
      { ts: 2, ch, type: 'irrelevant_touch', payload: { control, value: 1 } },
      { ts: 3, ch, type: 'tuning', payload: { control, value: 2 } },
    ],
  };
}

function summarizeSmokeResult(result, skipped) {
  if (skipped || result == null) return { skipped: true };
  return {
    skipped: false,
    verdict: result.verdict,
    dtPath: result.dtAlignment || [],
    routeGuess: result.inquiryPath?.strategyRouteGuess ?? null,
  };
}

async function validateWithSyntheticTraces(chapter, _opts = {}, gameHints = null) {
  const ch = 0;
  const tagged = { ...chapter, _ch: ch };
  const constraintCount = playConstraints(chapter.kg?.nodes || []).length;

  const traces = [synthFromDtOutline(tagged)];
  const synthIrrelevant = shouldSynthIrrelevantTrace(chapter, gameHints);
  if (synthIrrelevant) {
    traces.push(synthGenericIrrelevantTrace(tagged));
  }
  const notes = ['使用 DT 约束链通用合成轨迹（tuning/snapshot）'];
  if (!synthIrrelevant && gameHints?.hasCoupledControls && !gameHints?.hasIrrelevant) {
    notes.push('generic_irrelevant: 跳过（耦合模式无永久无关控件）');
  }

  if (!constraintCount) {
    return {
      feasible: null,
      notes: [...notes, '无 play 约束节点，跳过评判'],
      smokeCheck: {
        feasible: null,
        notes: [...notes, '无 play 约束节点，跳过评判'],
        main: { skipped: true },
        irrelevant: { skipped: true },
      },
    };
  }

  const judged = [];

  for (const t of traces) {
    if (t.skipped) {
      notes.push(`${t.label}: 跳过`);
      judged.push({ label: t.label, skipped: true, result: null });
      continue;
    }
    const result = evaluateTraceRules({
      ch,
      trace: t,
      chapter,
      graph: { mapping: chapter.mapping },
    });
    judged.push({ label: t.label, skipped: false, result });
  }

  const goodEntry = judged.find(r => r.label === 'dt_outline_good');
  const irrEntry = judged.find(r => r.label === 'generic_irrelevant');
  const good = goodEntry?.skipped ? null : goodEntry?.result;
  const irr = irrEntry?.skipped ? null : irrEntry?.result;

  const alignLen = (good?.dtAlignment || []).length;
  let feasible = !!good && alignLen >= Math.min(constraintCount, 2)
    && (good.verdict === 'pass' || (good.dtAlignment || []).includes('R1'));
  if (good?.dtAlignment?.includes('R1')) notes.push('主路径轨迹对齐 R1');
  else if (good) notes.push(`主路径 dtAlignment 长度 ${alignLen}（约束 ${constraintCount}）`);
  if (good?.inquiryPath?.strategyRouteGuess === 'main') {
    notes.push(`inquiryPath 途径: ${good.inquiryPath.strategyRouteGuess}`);
  }
  if (irrEntry?.skipped && gameHints?.hasCoupledControls && !gameHints?.hasIrrelevant) {
    notes.push('generic_irrelevant: 跳过（耦合模式无永久无关控件）');
  } else if (irr && !(irr.gaps || []).some(g => g.includes('无关'))) {
    notes.push('无关变量轨迹: 规则未明确扣分，可人工复核');
  }

  const smokeCheck = {
    feasible,
    notes: [...notes],
    main: summarizeSmokeResult(good, !goodEntry || goodEntry.skipped),
    irrelevant: summarizeSmokeResult(irr, !irrEntry || irrEntry.skipped),
  };

  return { feasible, notes, smokeCheck };
}

module.exports = {
  validateWithSyntheticTraces,
  synthFromDtOutline,
  synthTrapTrace,
  synthSingleVarMain,
  synthGenericIrrelevantTrace,
};

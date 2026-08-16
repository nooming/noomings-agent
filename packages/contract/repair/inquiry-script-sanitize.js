/**
 * Deterministic post-repair for inquiryScript / physicsModel contamination.
 * Fixes HTML/script formula garbage, cross-sample OV templates, hollow「调参操作」labels,
 * narrative formula spoilers, and AV semantic fields (priorityRank / monotonicity / affects).
 */

const HOLLOW_OP_RE = /^(?:调参操作|调参|调节|操作|Tune|Adjust)(?:\s*[×xX]\s*\d+)?$/i;
const PROJECTILE_OV_RE = /射程|最大高度/;
/** HTML/script pollution — allow physics comparisons like E > Ebd, reject tags/script. */
const HTML_JUNK_RE = /<\/?[a-zA-Z!]|Error\s*\(|Failed to load|function\s*\(|=>\s*reject|lang\s*=|position\s*:\s*fixed|requestAnimationFrame/i;
const CSS_JUNK_RE = /\{[^}]{0,40}:[^}]{0,80}\}|rgba?\(|#trans|#victory|\.prog-/i;

const {
  detectSourceDomain,
  isLikelyConfoundingControl,
  resolveAvLabel,
  inferLabelFromControlId,
} = require('../../generate/control-label');
const { isTraceMapExcludedControlId } = require('../../generate/hints');

/** Reject non-formula garbage scraped from HTML/JS/CSS. */
function isCleanFormula(text) {
  const s = String(text || '').trim();
  if (s.length < 3 || s.length > 120) return false;
  if (HTML_JUNK_RE.test(s) || CSS_JUNK_RE.test(s)) return false;
  if (/^g\s*=\s*["']/.test(s)) return false;
  // JS / DOM / CSS / canvas debris
  if (/window\.|document\.|createGain|getElementById|AudioContext|webkit|::-webkit|=range|viewport|appearance|flex\s*:|content\s*=/i.test(s)) {
    return false;
  }
  if (/\bnull\b|\bundefined\b|\bfunction\b|\bconst\b|\blet\b|\bvar\b|Math\.|\$\{|`|\[[^\]]*['"]/.test(s)) {
    return false;
  }
  if (/NEAR\s*=|tick\*|g\.gx|topY|createElement|addEventListener/i.test(s)) return false;
  // Lone JS assign like "c = src" (must start with known physics LHS)
  if (/^[a-z]\s*=\s*/i.test(s) && !/^(?:C|E|R|Ek|Ep|v0|θ|ε)/.test(s)) return false;
  // Prefer physics equation tokens
  const physicsEq = /(?:^|[;；]\s*)(?:C|E|R|Ek|Ep|v0|θ)\s*=|C\s*=\s*ε|E\s*=\s*V|R\s*=\s*\(|E\s*=\s*E[kp]|击穿|电容|动能|势能|∝|≈/;
  if (!physicsEq.test(s)) return false;
  if (!/[A-Za-zα-ωΑ-Ωε₀εᵣθ]/.test(s)) return false;
  return true;
}

function sanitizeFormulaList(list) {
  const out = [];
  for (const f of list || []) {
    const s = String(f || '').trim();
    if (!isCleanFormula(s)) continue;
    if (!out.includes(s)) out.push(s);
  }
  return out.slice(0, 6);
}

function chapterDomainBlob(chapter) {
  const nodes = chapter?.kg?.nodes || [];
  const parts = [
    chapter?.kg?.title,
    chapter?.kg?.sub,
    chapter?.winSync?.title,
    chapter?.inquiryScript?.summary,
    ...nodes.map(n => `${n.label || ''} ${n.desc || ''}`),
  ];
  return parts.join('\n');
}

function detectDomain(chapter, gameHints) {
  const blob = `${chapterDomainBlob(chapter)}\n${gameHints?.projectTitle || ''}\n${(gameHints?.sliderControlIds || []).join(' ')}`;
  return detectSourceDomain(blob, gameHints);
}

/** Domain-aware dependent/observable variables — never reuse cross-sample templates. */
function buildOutputVariablesForChapter(chapter, gameHints) {
  const domain = detectDomain(chapter, gameHints);
  const blob = chapterDomainBlob(chapter);
  if (domain === 'capacitor') {
    return [
      { id: 'OV1', label: '电容读数', symbol: 'C', unit: 'pF', role: 'primary', mapsToKg: 'R1', source: 'observe' },
      { id: 'OV2', label: '是否击穿', symbol: 'E>Ebd', unit: '', role: 'secondary', mapsToKg: 'C1', source: 'constraint' },
    ];
  }
  if (domain === 'projectile') {
    const ovs = [{ id: 'OV1', label: '射程', symbol: 'R', unit: 'm', role: 'primary', mapsToKg: 'R1', source: 'formula' }];
    if (/高度|height|H\b/.test(blob)) {
      ovs.push({ id: 'OV2', label: '最大高度', symbol: 'H', unit: 'm', role: 'secondary', mapsToKg: 'R1', source: 'formula' });
    }
    return ovs;
  }
  if (domain === 'energy') {
    return [
      { id: 'OV1', label: '过环/停稳结果', symbol: '', unit: '', role: 'primary', mapsToKg: 'R1', source: 'observe' },
    ];
  }
  // generic: prefer outcome constraint labels
  const constraints = (chapter?.kg?.nodes || []).filter(n => n.group === 'constraint' && n.layer === 'play');
  const outcome = constraints.find(c => /达标|命中|进洞|过关|读数|结果/.test(`${c.label}${c.desc}`));
  if (outcome) {
    return [{
      id: 'OV1',
      label: String(outcome.label || '过关结果').replace(/\?$/, ''),
      symbol: '',
      unit: '',
      role: 'primary',
      mapsToKg: outcome.id,
      source: 'constraint',
    }];
  }
  return [{ id: 'OV1', label: '过关结果', symbol: '', unit: '', role: 'primary', mapsToKg: 'R1', source: 'observe' }];
}

function isCrossDomainOutputPollution(chapter, outputVariables) {
  const domain = detectDomain(chapter);
  if (domain === 'capacitor' || domain === 'energy') {
    return (outputVariables || []).some(o => PROJECTILE_OV_RE.test(String(o?.label || '')));
  }
  return false;
}

function inferAffectsAndNotes(av, domain) {
  const blob = `${av.controlId || ''} ${av.label || ''} ${av.symbol || ''}`.toLowerCase();
  if (domain === 'capacitor') {
    if (/mat|介质|材料|κ|kappa|ε/.test(blob)) {
      return {
        monotonicity: av.monotonicity && av.monotonicity !== 'unknown' ? av.monotonicity : 'discrete',
        affects: ['C', 'Ebd'],
        notes: '离散选介质：εᵣ 改 C，击穿场强 Ebd 随材料变；与连续滑条 A/d 不等价',
      };
    }
    if (/dist|间距|d\b/.test(blob)) {
      return {
        monotonicity: av.monotonicity && av.monotonicity !== 'unknown' ? av.monotonicity : 'monotone',
        affects: ['C', 'E'],
        notes: 'd 双作用：C∝1/d（读数）且 E=V/d（击穿风险）；与只改 A 不等价',
      };
    }
    if (/area|面积|a\b/.test(blob)) {
      return {
        monotonicity: av.monotonicity && av.monotonicity !== 'unknown' ? av.monotonicity : 'monotone',
        affects: ['C'],
        notes: 'A 单调抬高 C，不直接改击穿场强；优先级通常低于换介质/调 d',
      };
    }
  }
  if (domain === 'projectile') {
    if (/angle|角度|θ|theta/.test(blob)) {
      return {
        monotonicity: 'non-monotone',
        affects: ['R', 'H'],
        notes: 'θ 对射程非单调（约 45° 附近峰值），与 v0/h 不等价',
      };
    }
    if (/speed|velocity|速度|v0/.test(blob)) {
      return {
        monotonicity: 'monotone',
        affects: ['R', 'H'],
        notes: 'v0 抬高射程与高度，通常优先单变量调节',
      };
    }
    if (/height|高度|h\b/.test(blob)) {
      return {
        monotonicity: 'monotone',
        affects: ['R', 'H'],
        notes: '发射高度单调影响落点/高度，作用弱于 v0',
      };
    }
  }
  return {
    monotonicity: av.monotonicity || 'unknown',
    affects: av.affects || [],
    notes: av.notes || '',
  };
}

function enrichAdjustmentVariableSemantics(avs, chapter, gameHints) {
  const domain = detectDomain(chapter, gameHints);
  return (avs || []).map((av, i) => {
    const inferred = inferAffectsAndNotes(av, domain);
    const label = resolveAvLabel(av, domain);
    return {
      ...av,
      label,
      priorityRank: av.priorityRank != null ? av.priorityRank : i + 1,
      monotonicity: inferred.monotonicity,
      responseShape: av.responseShape || undefined,
      affects: (av.affects && av.affects.length) ? av.affects : inferred.affects,
      notes: av.notes || inferred.notes,
      role: av.role || ((av.priorityRank === 1 || i === 0) ? 'primary' : 'secondary'),
    };
  });
}

/**
 * Move confounding controls out of AV; demote them in traceMap to irrelevant.
 */
function separateConfoundingFromAdjustment(chapter, gameHints) {
  const script = chapter?.inquiryScript || {};
  const domain = detectDomain(chapter, gameHints);
  let avs = [...(script.adjustmentVariables || [])];
  let cvs = [...(script.confoundingVariables || [])];
  const cvIds = new Set(cvs.map(c => c.controlId).filter(Boolean));

  const kept = [];
  for (const av of avs) {
    const cid = av.controlId;
    const asCv = (cid && cvIds.has(cid))
      || isLikelyConfoundingControl(cid, '', domain);
    if (asCv && cid) {
      if (!cvIds.has(cid)) {
        cvIds.add(cid);
        cvs.push({
          id: `CV${cvs.length + 1}`,
          controlId: cid,
          label: inferLabelFromControlId(cid, domain),
          reason: '混淆/装饰控件：不参与单变量主路径',
        });
      }
      continue;
    }
    kept.push(av);
  }

  // Re-index AV ids / ranks
  const adjustmentVariables = kept.map((av, i) => ({
    ...av,
    id: av.id && /^AV\d+$/.test(av.id) ? `AV${i + 1}` : av.id,
    priorityRank: i + 1,
    role: i === 0 ? 'primary' : (av.role || 'secondary'),
    label: resolveAvLabel(av, domain),
  }));

  let result = {
    ...chapter,
    inquiryScript: {
      ...script,
      adjustmentVariables,
      confoundingVariables: cvs,
    },
  };

  // Demote CV controlIds in traceMap from operation → irrelevant
  const controls = result.traceMap?.controls;
  if (controls && typeof controls === 'object' && cvIds.size) {
    let irrNode = (result.kg?.nodes || []).find(n => n.group === 'irrelevant' && n.layer === 'play');
    let nodes = result.kg?.nodes || [];
    if (!irrNode) {
      irrNode = {
        id: 'I1',
        label: '无关/混淆控件',
        group: 'irrelevant',
        layer: 'play',
        level: 0,
        r: 18,
        desc: '混淆或装饰控件，不进入主探究归因',
      };
      nodes = [...nodes, irrNode];
    }
    const nextControls = { ...controls };
    let changed = false;
    for (const cid of cvIds) {
      // HUD / mode toggles stay out of traceMap (purged by ensureTraceMap)
      if (isTraceMapExcludedControlId(cid)) {
        if (nextControls[cid]) {
          delete nextControls[cid];
          changed = true;
        }
        continue;
      }
      const cur = nextControls[cid];
      if (cur?.role === 'operation') {
        nextControls[cid] = { ...cur, role: 'irrelevant', kgId: irrNode.id };
        changed = true;
      } else if (!cur) {
        nextControls[cid] = { kgId: irrNode.id, role: 'irrelevant' };
        changed = true;
      }
    }
    if (changed) {
      result = {
        ...result,
        kg: result.kg ? { ...result.kg, nodes } : result.kg,
        traceMap: { ...result.traceMap, controls: nextControls },
      };
    }
  }

  return result;
}

function buildOperationLabelFromAvs(avs) {
  const labels = (avs || [])
    .map(a => a.label || a.controlId)
    .filter(l => l && !HOLLOW_OP_RE.test(String(l)));
  if (!labels.length) return null;
  if (labels.length === 1) return `调节${labels[0]}`;
  if (labels.length === 2) return `调节${labels[0]}/${labels[1]}`;
  return `调节${labels.slice(0, 3).join('、')}`;
}

/** Replace hollow O1 / DT「调参操作」with real control labels. */
function repairHollowOperationLabels(chapter) {
  const avs = chapter?.inquiryScript?.adjustmentVariables || [];
  const opLabel = buildOperationLabelFromAvs(avs);
  if (!opLabel) return chapter;

  const nodes = (chapter.kg?.nodes || []).map(n => {
    if (n.group === 'operation' && HOLLOW_OP_RE.test(String(n.label || '').trim())) {
      return { ...n, label: opLabel };
    }
    return n;
  });

  let mapping = chapter.mapping;
  if (typeof mapping === 'string' && /调参操作/.test(mapping)) {
    mapping = mapping.replace(/调参操作/g, opLabel);
  }

  let tree = chapter.dt?.tree;
  if (tree) {
    tree = JSON.parse(JSON.stringify(tree));
    const walk = (node) => {
      if (!node) return;
      if (HOLLOW_OP_RE.test(String(node.n || '').trim())) node.n = opLabel;
      (node.children || []).forEach(walk);
    };
    walk(tree);
  }

  return {
    ...chapter,
    ...(mapping !== chapter.mapping ? { mapping } : {}),
    kg: chapter.kg ? { ...chapter.kg, nodes } : chapter.kg,
    dt: tree ? { ...chapter.dt, tree } : chapter.dt,
  };
}

/**
 * Phenomenon-first narrative for inquiry (avoid formula spoilers).
 * Formulas stay on teach S* / KP.formulas.
 */
function buildPhenomenologicalNarrative(script, chapter) {
  const domain = detectDomain(chapter);
  const kps = script.knowledgePoints || [];
  const avs = script.adjustmentVariables || [];
  const cvs = script.confoundingVariables || [];
  const ovs = script.outputVariables || [];

  let intro;
  if (domain === 'capacitor') {
    intro = '观察电容读数高低与是否击穿，弄清介质、间距、面积各自如何改变现象；每次只改一项。';
  } else if (domain === 'projectile') {
    intro = '观察落点远近与轨迹高低，弄清初速度、高度、角度各自如何改变现象；每次只改一项。';
  } else {
    intro = script.summary
      || (kps.length ? `本关探究：${kps.map(k => k.label).slice(0, 3).join('、')}` : '互动探究关卡');
    // Strip formula-like spoilers from intro
    if (/=/.test(intro) && /C\s*=|E\s*=|R\s*=/.test(intro)) {
      intro = '先观察现象与读数变化，再归纳各调节量的作用；公式见 teach 层。';
    }
  }

  const steps = [
    {
      order: 1,
      title: '明确探究焦点',
      body: domain === 'capacitor'
        ? '关注：读数是否进入目标带、是否出现击穿警告（现象，勿先背公式）。'
        : (kps.length
          ? `关注知识点方向：${kps.map(k => k.label).join('；')}（具体关系在 teach 推导）。`
          : '明确本关要解释的现象与过关判据。'),
      mapsToKg: kps.flatMap(k => k.mapsToKg || []).slice(0, 4),
    },
    {
      order: 2,
      title: '识别调节变量',
      body: `可调节：${avs.map(a => a.label || a.controlId).join('、') || '（无）'}；控制变量法，每次只改一项。${
        avs.some(a => a.notes) ? `要点：${avs.filter(a => a.notes).map(a => `${a.label}≠其它（${a.notes.slice(0, 40)}）`).slice(0, 2).join('；')}` : ''
      }`,
      mapsToKg: [...new Set(avs.map(a => a.mapsToKg).filter(Boolean))],
    },
  ];
  if (cvs.length) {
    steps.push({
      order: 3,
      title: '识别混淆变量',
      body: `混淆项：${cvs.map(c => `${c.label}（${c.reason || '不影响结论'}）`).join('；')}`,
      mapsToKg: [...new Set(cvs.map(c => c.mapsToKg).filter(Boolean))],
    });
  }
  steps.push({
    order: steps.length + 1,
    title: '观察—调整—再测',
    body: ovs.length
      ? `操作后观察「${ovs.map(o => o.label).join('、')}」；未达标则只微调一个调节变量并重复。`
      : '操作后观察结果，未达标则微调单一调节变量并重复，直至满足约束过关。',
    mapsToKg: avs[0]?.mapsToKg ? [avs[0].mapsToKg] : ['O1'],
  });

  return { intro, steps };
}

function shouldReplaceNarrative(narrative) {
  if (!narrative || typeof narrative !== 'object') return true;
  const intro = String(narrative.intro || '');
  const bodies = (narrative.steps || []).map(s => s.body || '').join('\n');
  const blob = `${intro}\n${bodies}`;
  if (/调参操作/.test(blob)) return true;
  if (/C\s*=\s*ε|E\s*=\s*V\/d|R\s*=\s*\(/.test(blob)) return true;
  if (/射程|最大高度/.test(blob) && /电容|击穿/.test(blob)) return true;
  return false;
}

function dedupeInquiryFlow(flow, avs, cvs, kps) {
  const avIds = new Set((avs || []).map(a => a.id));
  const cvIds = new Set((cvs || []).map(c => c.id));
  const kpIds = new Set((kps || []).map(k => k.id));
  const seen = new Set();
  const out = [];
  for (const id of flow || []) {
    const s = String(id);
    if (seen.has(s)) continue;
    // CV must not duplicate as AV step; keep CV once at end
    if (avIds.has(s) || kpIds.has(s) || cvIds.has(s) || /^OV/.test(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  if (out.length < 2) {
    const fallback = [];
    if (kps?.[0]?.id) fallback.push(kps[0].id);
    for (const a of (avs || []).slice(0, 4)) if (a?.id) fallback.push(a.id);
    if (cvs?.[0]?.id) fallback.push(cvs[0].id);
    return fallback.length >= 2 ? fallback : ['KP1', 'AV1'];
  }
  return out;
}

function formulasFromTeachNodes(chapter) {
  const teach = (chapter?.kg?.nodes || []).filter(
    n => n.layer === 'teach' && (n.group === 'core' || n.group === 'method'),
  );
  const out = [];
  for (const n of teach) {
    const desc = String(n.desc || '');
    // Prefer explicit formula sentences
    const chunks = desc.split(/[;；。\n]/).map(s => s.trim()).filter(Boolean);
    for (const c of chunks) {
      if (/=/.test(c) && isCleanFormula(c)) {
        if (!out.includes(c)) out.push(c.slice(0, 100));
      }
    }
  }
  return out.slice(0, 4);
}

function domainDefaultFormulas(domain) {
  if (domain === 'capacitor') {
    return ['C = ε₀εᵣA / d', 'E = V/d（击穿：E > Ebd）'];
  }
  if (domain === 'projectile') {
    return ['R = (v0² · sin(2θ)) / g'];
  }
  return [];
}

function sanitizeKnowledgePoints(kps, chapter) {
  const domain = detectDomain(chapter);
  const teachFormulas = formulasFromTeachNodes(chapter);
  const defaults = domainDefaultFormulas(domain);
  return (kps || []).map((kp, i) => {
    let formulas = sanitizeFormulaList(kp.formulas);
    if (!formulas.length) {
      formulas = sanitizeFormulaList(teachFormulas.length ? teachFormulas : defaults);
    }
    let label = String(kp.label || '').trim();
    if (!label || HOLLOW_OP_RE.test(label)) {
      label = chapter?.kg?.title || `知识点${i + 1}`;
    }
    return { ...kp, label, formulas };
  }).filter(kp => kp.label);
}

function sanitizePhysicsModel(chapter, script) {
  const existing = chapter.physicsModel || {};
  // Prefer cleaned KP formulas as source of truth (avoid reintroducing scraped JS)
  const kpFormulas = sanitizeFormulaList(
    (script.knowledgePoints || []).flatMap(k => k.formulas || []),
  );
  const scraped = sanitizeFormulaList([
    ...(existing.formulas || []),
    ...(existing.core?.formulas || []),
  ]);
  const finalFormulas = (kpFormulas.length ? kpFormulas : scraped).slice(0, 6);

  const core = existing.core
    ? {
      ...existing.core,
      formulas: finalFormulas,
      snippets: undefined,
      winConditionSummary: /Courier|font-family|rgba\(|viewport|::-webkit|Math\.|getElementById/.test(
        String(existing.core.winConditionSummary || ''),
      )
        ? (chapter.kg?.nodes?.find(n => n.group === 'result')?.desc || '满足约束过关')
        : existing.core.winConditionSummary,
      constants: (existing.core.constants || []).filter(c => {
        const v = String(c?.value || '');
        if (!v || HTML_JUNK_RE.test(v)) return false;
        if (c.name === 'g' && (v === '0' || !/^[\d.]+$/.test(v))) return false;
        return true;
      }),
    }
    : existing.core;

  return {
    ...existing,
    formulas: finalFormulas,
    independentVariables: (script.adjustmentVariables || []).map(a => a.id).filter(Boolean),
    confoundingVariables: (script.confoundingVariables || []).map(c => c.id).filter(Boolean),
    dependentVariables: (script.outputVariables || []).map(o => o.id).filter(Boolean),
    ...(core ? { core } : {}),
  };
}

/**
 * Tag play constraints: physics (core inquiry) vs gameLimit (engineering/UI limits).
 */
function tagConstraintLayers(chapter) {
  const nodes = (chapter?.kg?.nodes || []).map(n => {
    if (n.group !== 'constraint' || n.layer !== 'play') return n;
    if (n.constraintKind === 'physics' || n.constraintKind === 'gameLimit') return n;
    const blob = `${n.label || ''} ${n.desc || ''}`;
    const isLimit = /塔体限位|工程限位|UI|滑条范围|最小间距|最大面积|必须选用|≥\s*[\d.]+|≤\s*[\d.]+/.test(blob)
      && !/击穿|达标|读数|命中|进洞|过关判定/.test(blob);
    const isPhysics = /击穿|达标|读数|命中|进洞|过关|场强|电容在目标|落点/.test(blob);
    const constraintKind = isPhysics ? 'physics' : (isLimit ? 'gameLimit' : 'physics');
    const desc = n.desc && !/\[constraintKind=/.test(n.desc)
      ? `${n.desc} 〔${constraintKind === 'physics' ? '物理核心' : '玩法/工程限位'}〕`
      : n.desc;
    return { ...n, constraintKind, desc };
  });
  return chapter?.kg ? { ...chapter, kg: { ...chapter.kg, nodes } } : chapter;
}

/**
 * Main entry: sanitize inquiryScript + related fields after backfill/merge.
 */
function sanitizeInquiryScriptChapter(chapter, gameHints) {
  if (!chapter || typeof chapter !== 'object') return chapter;
  let result = separateConfoundingFromAdjustment(chapter, gameHints);
  const existing = result.inquiryScript || {};

  let knowledgePoints = sanitizeKnowledgePoints(existing.knowledgePoints, result);
  if (!knowledgePoints.length) {
    knowledgePoints = [{
      id: 'KP1',
      label: result.kg?.title || '本关知识点',
      formulas: domainDefaultFormulas(detectDomain(result, gameHints)),
      mapsToKg: ['S1'],
    }];
  }

  let adjustmentVariables = enrichAdjustmentVariableSemantics(
    existing.adjustmentVariables || [],
    result,
    gameHints,
  );

  let outputVariables = existing.outputVariables || [];
  if (!outputVariables.length || isCrossDomainOutputPollution(result, outputVariables)) {
    outputVariables = buildOutputVariablesForChapter(result, gameHints);
  }

  const confoundingVariables = existing.confoundingVariables || [];
  const inquiryFlow = dedupeInquiryFlow(
    existing.inquiryFlow,
    adjustmentVariables,
    confoundingVariables,
    knowledgePoints,
  );

  let narrative = existing.narrative;
  if (shouldReplaceNarrative(narrative)) {
    narrative = buildPhenomenologicalNarrative({
      knowledgePoints,
      adjustmentVariables,
      confoundingVariables,
      outputVariables,
      summary: existing.summary,
    }, result);
  }

  const inquiryScript = {
    ...existing,
    summary: existing.summary || result.kg?.title || '',
    knowledgePoints,
    adjustmentVariables,
    confoundingVariables,
    outputVariables,
    inquiryFlow,
    narrative,
  };

  result = { ...result, inquiryScript };
  result = repairHollowOperationLabels(result);
  result = tagConstraintLayers(result);
  result = {
    ...result,
    physicsModel: sanitizePhysicsModel(result, inquiryScript),
  };
  return result;
}

module.exports = {
  sanitizeInquiryScriptChapter,
  sanitizeFormulaList,
  isCleanFormula,
  isCrossDomainOutputPollution,
  buildOutputVariablesForChapter,
  enrichAdjustmentVariableSemantics,
  buildPhenomenologicalNarrative,
  repairHollowOperationLabels,
  tagConstraintLayers,
  separateConfoundingFromAdjustment,
  detectDomain,
  HOLLOW_OP_RE,
};

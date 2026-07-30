const {
  hasInvalidStrategyMermaidSyntax,
  extractStratResultNodeIds,
  routeIsMisconceptionRoute,
  detectMacroRouteFanOut,
  parseStrategyMermaidEdges,
  failureGateRetrySameBranch,
  shortestPathEdgeKeys,
  edgeExistsInMermaid,
} = require('../../shared/strategy-mermaid-parse.js');
const { isFailureDecision, isProgressCheckpointDecision } = require('../repair/dt-branch-normalize');
const { countConstraintGateTypes } = require('../classify/constraint-gate-classify');
const { validateRouteFeedbackHighlights } = require('./quality-route-feedback');
const { validateOptionalToggleConstraints } = require('./quality-optional-toggles');
const { validateInquiryScript } = require('./validate-inquiry-script');
const {
  playConstraints, teachNodes, verifyLinks, reachableFrom, collectDtStats, walkDt,
  textIncludesAny, orderedPlayPathIds, playPathMonotonic,
} = require('../graph/play-graph');
const { countSemanticStrategyRoutes } = require('../../generate/strategy-route-plan');
const {
  validateStrategyMermaidLayering,
  uniqueMacroStrategyCount,
  hasObservationFeedbackLoop,
  hasMechanicalFeedbackScaffold,
  isMentalBackboneStrong,
  buildStrategyNarrativeWarnings,
  validateControlVariableRoutes,
  validateSingleVariableRoutes,
  resolveConditionalParamProfile,
  validateStrategyTeacherAlignment,
  validateObserveAdjustControlVarConsistency,
} = require('../strategy/strategy-rules');
const {
  validateDtEnvAlignment,
  validateDtConditionalParamBranch,
  validateKgConditionalParamCoupling,
  validateKgEnvBeforeOperation,
  validateDtHasOperationStep,
} = require('../graph/dt-kg-coupling');
const { validateChapterScope } = require('./validate-scope');

const DESIGN_MODE_SOFTEN_RE = [
  /strategy needs observation->adjust->retest feedback loop/,
  /strategy needs >=2 distinct macro strategy routes/,
  /strategy\.routes need >=/,
  /DT retry should return to tune\/operate/,
  /prioritize outcome constraints/,
  /decision-dominant backbone/,
  /strategy\.routes \(\S+\): spine has Observe but expanded highlight lacks/,
  /too few nodes \(\d+\)/,
];

function softenDesignModeQuality(errors, warnings, chapter, hints) {
  const minNodes = hints.minNodes ?? 8;
  const kept = [];
  for (const err of errors) {
    const soften = DESIGN_MODE_SOFTEN_RE.some(re => re.test(err));
    const nodeShortfall = /^quality: too few nodes \((\d+)\)/.exec(err);
    const allowNodeShortfall = nodeShortfall
      && Number(nodeShortfall[1]) >= 6
      && Number(nodeShortfall[1]) >= minNodes - 1;
    if (soften || allowNodeShortfall) {
      warnings.push(`design-mode (soft): ${err.replace(/^quality: /, '')}`);
    } else {
      kept.push(err);
    }
  }
  errors.length = 0;
  errors.push(...kept);
}

function dtHasFeedbackToOperation(chapter) {
  const mapping = String(chapter?.mapping || '');
  if (/retry[^|\n]*\|[^|\n]*O1|O1[^|\n]*retry|重新|调整|再试|反馈/i.test(mapping)) return true;
  let found = false;
  walkDt(chapter?.dt?.tree, n => {
    if (n.t !== 'retry') return;
    if (/反馈|adjust|observe|重试|微调|调参|发射|再测/i.test(`${n.n || ''} ${n.d || ''}`)) found = true;
  });
  return found;
}

function validateChapterQuality(chapter, gameHints) {
  const errors = [];
  const warnings = [];
  const checklist = {};
  const hints = gameHints || {};
  const nodes = chapter?.kg?.nodes || [];
  const links = chapter?.kg?.links || [];
  const constraints = playConstraints(nodes);
  const strat = chapter?.strategy || {};
  const mermaidBody = String(strat.mermaid || '');
  const ids = new Set(nodes.map(n => n.id));

  const minNodes = hints.minNodes ?? 8;
  const maxNodes = hints.maxNodes ?? 30;
  const minConstraints = hints.minConstraints ?? 2;
  const minTeach = hints.minTeachNodes ?? 2;
  const minVerify = hints.minVerifyLinks ?? 1;

  checklist.nodeCount = nodes.length >= minNodes && nodes.length <= maxNodes;
  if (nodes.length < minNodes) {
    errors.push(`quality: too few nodes (${nodes.length})`);
  }
  if (nodes.length > maxNodes) {
    errors.push(`quality: too many nodes (${nodes.length})`);
  }

  checklist.constraints = constraints.length >= minConstraints;
  if (!checklist.constraints) {
    errors.push(`quality: need >= ${minConstraints} play constraints, got ${constraints.length}`);
  }

  const teach = teachNodes(nodes);
  checklist.teachNodes = teach.length >= minTeach;
  if (!checklist.teachNodes) {
    errors.push(`quality: need >= ${minTeach} teach nodes, got ${teach.length}`);
  }

  const vlinks = verifyLinks(links);
  checklist.verifyLinks = vlinks.length >= minVerify;
  if (!checklist.verifyLinks) {
    errors.push(`quality: need >= ${minVerify} verify links, got ${vlinks.length}`);
  }

  const p1 = nodes.find(n => n.id === 'P1' || (n.group === 'premise' && n.layer === 'play'));
  const o1 = nodes.find(n => n.group === 'operation' && n.layer === 'play');
  const r1 = nodes.find(n => n.group === 'result' && n.layer === 'play');
  const fromP1 = p1 ? reachableFrom(p1.id, links, ids) : new Set();
  checklist.playChain = !!(p1 && o1 && r1
    && fromP1.has(o1.id)
    && constraints.some(c => fromP1.has(c.id))
    && fromP1.has(r1.id));

  checklist.strategyMermaid = !!mermaidBody.trim();
  if (!checklist.strategyMermaid) checklist.strategyStartNode = true;

  checklist.strategyMermaidSyntax = !checklist.strategyMermaid || !hasInvalidStrategyMermaidSyntax(mermaidBody);
  if (checklist.strategyMermaid && !checklist.strategyMermaidSyntax) {
    errors.push('quality: strategy.mermaid has invalid syntax (quote labels containing |, (), :, etc.)');
  }

  validateStrategyMermaidLayering(mermaidBody).forEach(e => errors.push(e));

  const minRoutes = hints.minStrategyRoutes ?? 2;
  const semanticRouteCount = countSemanticStrategyRoutes(chapter, hints);
  const rawRouteCount = strat?.routes?.length ?? 0;
  checklist.strategyRoutes = Array.isArray(strat?.routes)
    && semanticRouteCount >= minRoutes
    && rawRouteCount >= Math.min(minRoutes, 2);
  if (!checklist.strategyMermaid) errors.push('quality: strategy.mermaid required');
  if (!checklist.strategyRoutes) {
    errors.push(
      `quality: strategy.routes need >= ${minRoutes} semantic entries, got semantic=${semanticRouteCount} raw=${rawRouteCount}`,
    );
  }

  const avCount = hints.variableKindSummary?.sliderCount ?? hints.sliderControlIds?.length ?? 0;
  const perAvRoutes = (strat?.routes || []).filter(r => /单变量·/.test(String(r?.label || '')));
  const expectedPerAv = Math.min(avCount, (chapter?.inquiryScript?.adjustmentVariables || []).length || avCount);
  checklist.strategyPerAvRoutes = avCount < 2 || expectedPerAv < 2 || perAvRoutes.length >= Math.min(expectedPerAv, 2);
  if (avCount >= 2 && expectedPerAv >= 2 && !checklist.strategyPerAvRoutes) {
    errors.push(`quality: multi-AV sample needs >=2 per-AV single-var routes (单变量·), got ${perAvRoutes.length}`);
  }

  const observeAdjustCheck = validateObserveAdjustControlVarConsistency(chapter, hints);
  checklist.strategyObserveAdjustCvar = observeAdjustCheck.ok;
  observeAdjustCheck.errors.forEach(e => errors.push(e));
  observeAdjustCheck.warnings.forEach(w => warnings.push(w));

  const macroCount = uniqueMacroStrategyCount(strat);
  checklist.strategyMacroPaths = !checklist.strategyMermaid || macroCount >= minRoutes;
  if (checklist.strategyMermaid && !checklist.strategyMacroPaths) {
    errors.push(`quality: strategy needs >=${minRoutes} distinct macro strategy routes, got ${macroCount}`);
  }

  checklist.strategyFeedbackLoop = hasObservationFeedbackLoop(mermaidBody);
  if (!checklist.strategyFeedbackLoop) {
    errors.push('quality: strategy needs observation->adjust->retest feedback loop');
  }
  // 降权：纯 LoopObserve/LoopAdjust/LoopRetest 凑数不再算合格（见 hasObservationFeedbackLoop）；
  // 若域环已合格但仍残留机械脚手架，记 warning，推动 surgical 清理。
  checklist.strategyFeedbackDomainOnly = checklist.strategyFeedbackLoop
    && !hasMechanicalFeedbackScaffold(mermaidBody);
  if (checklist.strategyFeedbackLoop && hasMechanicalFeedbackScaffold(mermaidBody)) {
    warnings.push(
      'quality: mechanical LoopObserve/LoopAdjust/LoopRetest scaffold is leftover; prefer domain Observe→Adjust→Fire (or AV tune) loop only',
    );
  }
  checklist.strategyRouteIsolation = !checklist.strategyMermaid || !detectMacroRouteFanOut(mermaidBody);
  if (checklist.strategyMermaid && !checklist.strategyRouteIsolation) {
    warnings.push('quality: macro routes should not share one Fire/Observe hub; use StrategySelect |途径| → per-route subgraph');
  }
  checklist.strategyMentalBackbone = isMentalBackboneStrong(mermaidBody);
  if (checklist.strategyMermaid && !checklist.strategyMentalBackbone) {
    errors.push('quality: decision-dominant backbone required (use :::stratCond diamonds, not long linear chains)');
  }

  if (hints.actionObserveLoop) {
    checklist.dtFeedbackToOperation = dtHasFeedbackToOperation(chapter);
    if (!checklist.dtFeedbackToOperation) {
      errors.push('quality: DT retry should return to tune/operate (O1), not only chain adjacent constraint gates');
    }
  } else {
    checklist.dtFeedbackToOperation = true;
  }

  const coupledMode = !!hints.hasCoupledControls;
  const conditionalParamProfile = resolveConditionalParamProfile(chapter, hints);
  const strategyHasEnv = /Env|环境|阻力|模式|星球|planet/i.test(mermaidBody);
  const envSelectMode = !!(hints.levelContext?.envSelectMode || hints.levelContext?.activeToggles?.planetSelect);

  warnings.push(...buildStrategyNarrativeWarnings(strat, mermaidBody, hints));

  const dtEnvErrors = (coupledMode || envSelectMode) && strategyHasEnv
    ? validateDtEnvAlignment(chapter, coupledMode || envSelectMode)
    : [];
  checklist.dtEnvAlignment = !(coupledMode || envSelectMode) || !strategyHasEnv || dtEnvErrors.length === 0;
  dtEnvErrors.forEach(e => errors.push(e));

  const kgCondErrors = coupledMode && conditionalParamProfile && strategyHasEnv
    ? validateKgConditionalParamCoupling(chapter, coupledMode, conditionalParamProfile)
    : [];
  checklist.kgConditionalParamCoupling = !conditionalParamProfile || !coupledMode || !strategyHasEnv || kgCondErrors.length === 0;
  checklist.kgMassEnvCoupling = checklist.kgConditionalParamCoupling;
  kgCondErrors.forEach(e => errors.push(e));

  const dtCondParamErrors = coupledMode && conditionalParamProfile && strategyHasEnv
    ? validateDtConditionalParamBranch(chapter, coupledMode, conditionalParamProfile)
    : [];
  checklist.dtConditionalParamBranch = !conditionalParamProfile || !coupledMode || !strategyHasEnv || dtCondParamErrors.length === 0;
  dtCondParamErrors.forEach(e => errors.push(e));

  const teacherErrors = coupledMode
    ? validateStrategyTeacherAlignment(mermaidBody, { coupledMode, conditionalParamProfile })
    : [];
  checklist.strategyTeacherAlignment = !coupledMode || teacherErrors.length === 0;
  teacherErrors.forEach(e => errors.push(e));

  const hasStratInvalid = /:::stratInvalid\b/.test(mermaidBody);
  checklist.coupledStratInvalid = !coupledMode || hasStratInvalid;
  if (coupledMode && conditionalParamProfile && !hasStratInvalid) {
    errors.push('quality: coupled conditional-param profile needs :::stratInvalid misconception loop in strategy.mermaid');
  }
  const invalidLoop = /:::stratInvalid[\s\S]{0,240}?-->/i.test(mermaidBody);
  checklist.strategyMisconceptionLoop = !coupledMode || !conditionalParamProfile || invalidLoop;

  if (checklist.strategyRoutes && Array.isArray(strat.routes)) {
    let mapsOk = true;
    const mermaidHasStartEnv = /\bStart\b/.test(mermaidBody) && /\bEnv\b/.test(mermaidBody);
    const resultKgIds = new Set(
      nodes.filter(n => n.group === 'result' && n.layer === 'play').map(n => n.id),
    );
    const stratResultIds = extractStratResultNodeIds(mermaidBody);
    strat.routes.forEach((r, i) => {
      (r.mapsTo || []).forEach(kid => {
        if (!ids.has(kid)) {
          mapsOk = false;
          errors.push(`quality: strategy.routes[${i}].mapsTo unknown KG id ${kid}`);
        }
      });
      if (mermaidHasStartEnv && r.warn !== 'irrelevant') {
        const hl = new Set(r.highlightNodes || []);
        if (!hl.has('Start') && !hl.has('Env')) {
          warnings.push(`strategy.routes[${i}] (${r.id}): highlightNodes 应含 Start/Env（多关环境分叉时）`);
        }
      }
      const mapsToResult = (r.mapsTo || []).some(kid => resultKgIds.has(kid));
      const misconceptionRoute = routeIsMisconceptionRoute(r, mermaidBody);
      if (misconceptionRoute && stratResultIds.size) {
        const hl = new Set(r.highlightNodes || []);
        const stray = [...stratResultIds].filter(id => hl.has(id));
        if (stray.length) {
          errors.push(
            `quality: strategy.routes[${i}] (${r.id}): misconception/trap route must not highlight stratResult (${stray.join(', ')})`,
          );
        }
      }
      if (mapsToResult && r.warn !== 'irrelevant' && !misconceptionRoute && stratResultIds.size) {
        const hl = new Set(r.highlightNodes || []);
        const missing = [...stratResultIds].filter(id => !hl.has(id));
        if (missing.length) {
          warnings.push(
            `strategy.routes[${i}] (${r.id}): mapsTo 含 result 时 highlightNodes 宜含 stratResult/过关节点（${missing.join(', ')}）`,
          );
        }
      }
      if (r.warn !== 'irrelevant' && mermaidBody) {
        const hl = new Set(r.highlightNodes || []);
        const hlEdgePairs = new Set(
          (r.highlightEdges || [])
            .filter(p => Array.isArray(p) && p.length >= 2)
            .map(p => `${p[0]}->${p[1]}`),
        );
        const mEdges = parseStrategyMermaidEdges(mermaidBody);
        for (const pair of r.highlightEdges || []) {
          if (!Array.isArray(pair) || pair.length < 2) continue;
          const [from, to] = pair;
          if (edgeExistsInMermaid(mermaidBody, from, to)) continue;
          const pathKeys = shortestPathEdgeKeys(from, to, mEdges);
          if (!pathKeys.length) {
            errors.push(
              `quality: strategy.routes[${i}] (${r.id}): highlightEdges [${from}, ${to}] 不在 Mermaid 中可达`,
            );
            continue;
          }
          const pathNodes = new Set();
          pathKeys.forEach(k => {
            const j = k.indexOf('->');
            if (j < 0) return;
            pathNodes.add(k.slice(0, j));
            pathNodes.add(k.slice(j + 2));
          });
          pathNodes.delete(from);
          pathNodes.delete(to);
          for (const mid of pathNodes) {
            if (hl.has(mid)) continue;
            warnings.push(
              `strategy.routes[${i}] (${r.id}): highlightEdges 从 ${from}->${to} 经由 ${mid}；建议把 ${mid} 加入 highlightNodes 或改用 spine 路径`,
            );
          }
        }
        for (const nodeId of hl) {
          if (!/^Observe[A-Za-z]*\d*$/i.test(nodeId)) continue;
          for (const e of mEdges) {
            if (e.from !== nodeId || !/^Retry[A-Za-z]*\d*$/i.test(e.to)) continue;
            if (!failureGateRetrySameBranch(e.from, e.to)) continue;
            if (!/否|未|不|retry|再试|重试|miss|no/i.test(String(e.label || ''))) continue;
            if (hl.has(e.to) || hlEdgePairs.has(e.key)) continue;
            warnings.push(
              `strategy.routes[${i}] (${r.id}): highlightNodes 含 ${nodeId} 但缺 ${e.to}；建议补边 ${e.key}或把 RetryN 改为环路节点`,
            );
          }
        }
      }
    });
    checklist.strategyMapsTo = mapsOk;
  } else {
    checklist.strategyMapsTo = false;
  }

  const controlVarCheck = validateControlVariableRoutes(strat, hints, mermaidBody);
  checklist.strategyControlVarRoutes = controlVarCheck.ok;
  checklist.strategySingleVarRoutes = controlVarCheck.ok;
  warnings.push(...controlVarCheck.warnings);

  const kgEnvWarnings = validateKgEnvBeforeOperation(chapter);
  checklist.kgEnvBeforeOperation = kgEnvWarnings.length === 0;
  warnings.push(...kgEnvWarnings);

  const dtOpWarnings = validateDtHasOperationStep(chapter);
  checklist.dtHasOperationStep = dtOpWarnings.length === 0;
  warnings.push(...dtOpWarnings);

  const playPath = orderedPlayPathIds(nodes, links);
  let kgPathAligned = true;
  if (checklist.strategyRoutes && playPath.length) {
    for (const r of strat?.routes || []) {
      if (!playPathMonotonic(r.mapsTo, playPath)) {
        kgPathAligned = false;
        warnings.push(`strategy.routes[${r.id}]: mapsTo 与 KG play 链顺序不一致（应沿 premise→operation→constraint→result）`);
      }
    }
  }
  checklist.strategyKgPathAligned = kgPathAligned;

  if (chapter?.dt?.tree) {
    const walkDtWithParent = (node, parent, branch, visit) => {
      visit(node, parent, branch);
      (node.children || []).forEach(c => walkDtWithParent(c, node, c, visit));
    };

    walkDt(chapter.dt.tree, n => {
      if (n.t !== 'decision' || !n.children) return;
      const isEnvFork = /阻力|环境|模式|空气|星球|planet|gravity/i.test(`${n.n || ''}${n.d || ''}`);
      const isFailure = isFailureDecision(n);
      n.children.forEach(c => {
        if (c._e == null || c._e === '') return;
        const yes = c._e === '是' || c._e === 'Path A';
        const no = c._e === '否' || c._e === 'Path B';
        if (isEnvFork) {
          if (!['decision', 'result', 'step', 'junction', 'retry'].includes(c.t)) {
            errors.push(`quality: env decision "${n.n}" branch should be decision/result/step/junction/retry`);
          }
          return;
        }
        if (no && c.t !== 'retry') {
          if (isProgressCheckpointDecision(n)) {
            if (!['step', 'junction', 'decision', 'result'].includes(c.t)) {
              errors.push(`quality: progress checkpoint "${n.n}" 否 branch should be step/junction continue`);
            }
          } else if (isFailure) {
            if (!['decision', 'result', 'step', 'junction'].includes(c.t)) {
              errors.push(`quality: failure decision "${n.n}" 否 branch should be retry or continue (decision/result/step/junction)`);
            }
          } else {
            errors.push(`quality: decision "${n.n}" 否 branch should be retry`);
          }
        }
        if (yes) {
          if (isFailure && c.t !== 'retry') {
            errors.push(`quality: failure decision "${n.n}" 是 branch should be retry`);
          } else if (!isFailure && c.t !== 'decision' && c.t !== 'result' && c.t !== 'step' && c.t !== 'junction') {
            errors.push(`quality: decision "${n.n}" 是 branch should lead to decision/result/step/junction`);
          }
        }
      });
    });

    walkDtWithParent(chapter.dt.tree, null, null, (node, parent, branch) => {
      if (!isFailureDecision(node) || !parent || parent.t !== 'decision') return;
      if (branch?._e !== '是') return;
      const isEnvFork = /阻力|环境|模式|空气|星球|planet|gravity/i.test(`${parent.n || ''}${parent.d || ''}`);
      if (isEnvFork) return;
      warnings.push(
        `quality: 失败类 decision「${node.n}」嵌套在「${parent.n}」的是-分支内，疑似并列退出错排为嵌套，建议改为同级 decision 序列`,
      );
    });
  }

  if (!checklist.playChain) errors.push('quality: P1→O1→C*/K*→R1 play chain not connected via links');

  const toggleErrors = validateOptionalToggleConstraints(constraints, hints);
  checklist.optionalToggleNotConstraint = toggleErrors.length === 0;
  toggleErrors.forEach(e => errors.push(e));

  const { paramGates, outcomeGates } = countConstraintGateTypes(constraints);
  const needsOutcomeOriented = hints.hasScoringTargetWin
    || hints.actionObserveLoop
    || hints.levelContext?.config?.ballCount != null;
  checklist.dtOutcomeOriented = !needsOutcomeOriented
    || (outcomeGates >= 1 && outcomeGates >= paramGates);
  if (needsOutcomeOriented && !checklist.dtOutcomeOriented) {
    errors.push(
      'quality: DT/KG should prioritize outcome constraints (pocket/boundary/collision) over param-range gate chain',
    );
  }

  const irr = nodes.filter(n => n.group === 'irrelevant');
  if (irr.length && hints.hasIrrelevant) {
    irr.forEach(n => {
      const out = (links || []).filter(l => l.s === n.id);
      if (out.length) warnings.push(`quality: irrelevant node ${n.id} should be isolated`);
    });
  }

  const scopeResult = validateChapterScope(chapter, hints);
  scopeResult.errors.forEach(e => errors.push(e));
  (scopeResult.warnings || []).forEach(w => warnings.push(w));
  Object.assign(checklist, scopeResult.checklist);

  const feedbackResult = validateRouteFeedbackHighlights(chapter, hints);
  checklist.routeFeedbackLoopHighlighted = feedbackResult.ok;
  feedbackResult.errors.forEach(e => errors.push(e));
  feedbackResult.warnings.forEach(w => warnings.push(w));

  const inquiryResult = validateInquiryScript(chapter, hints);
  Object.assign(checklist, inquiryResult.checklist);
  inquiryResult.errors.forEach(e => errors.push(e));
  inquiryResult.warnings.forEach(w => warnings.push(w));

  // Multi-AV: preferred routes must carry differentiated score/weight (path grading)
  const preferredRoutes = (strat?.routes || []).filter(r =>
    r.warn !== 'irrelevant'
    && r.tier !== 'suboptimal'
    && !/trap|盲调|多参|多滑/i.test(`${r.id || ''}${r.label || ''}`),
  );
  if (preferredRoutes.length >= 2) {
    const scores = preferredRoutes.map(r => r.score ?? r.weight);
    const missing = scores.some(s => s == null);
    const allSame = !missing && scores.every(s => s === scores[0]);
    checklist.strategyRouteScores = !missing && !allSame;
    if (!checklist.strategyRouteScores) {
      errors.push('quality: multi-AV strategy.routes need differentiated score/weight by priorityRank (trap lowest)');
    }
  } else {
    checklist.strategyRouteScores = true;
  }

  if (hints.designMode) {
    softenDesignModeQuality(errors, warnings, chapter, hints);
  }

  const passed = Object.values(checklist).filter(Boolean).length;
  const total = Object.keys(checklist).length;
  const score = total ? Math.round((passed / total) * 100) : 0;
  const ok = errors.length === 0;

  return { ok, errors, warnings, checklist, score, total, passed };
}

module.exports = { validateChapterQuality };

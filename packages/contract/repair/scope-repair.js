/**
 * Post-enrich scope repairs (generic, from levelContext.config).
 */
const { normalizeDtBranchPolarity } = require('./dt-branch-normalize');

function normalizeKgLinkTypes(kg) {
  return require('../enrich/index').normalizeKgLinkTypes(kg);
}

const CHALLENGE_NOISE_IRRELEVANT_RE =
  /教程|自由模式|模式切换|帮助按钮|重新开始|当前关卡|进球数|剩余球|已进球|HUD/i;
const DISPLAY_HUD_IRRELEVANT_RE = /显示|展示|当前关卡|进球数|剩余|已进球|toast|label|计数/i;
const PREVIEW_OPERATION_RE = /预览|虚线瞄准|mouse/i;
const CHALLENGE_MODE_UI_RE = /模式切换|教程\s*HUD|自由模式/i;
const FIRE_OPERATION_RE = /击球|发射|fire|shoot|launch|施加|空格/i;

function playResultNode(kg) {
  return (kg?.nodes || []).find(n => n.group === 'result' && n.layer === 'play')
    || (kg?.nodes || []).find(n => n.id === 'R1');
}

function nextConstraintId(nodes) {
  let max = 0;
  for (const n of nodes || []) {
    const m = /^C(\d+)$/.exec(String(n.id || ''));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `C${max + 1}`;
}

function nodeText(n) {
  return `${n?.label || ''} ${n?.desc || ''}`;
}

function corpusHasObstacle(chapter) {
  const text = [
    JSON.stringify(chapter?.kg?.nodes || []),
    JSON.stringify(chapter?.dt?.tree || {}),
    chapter?.mapping,
    chapter?.strategy?.mermaid,
  ].filter(Boolean).join('\n');
  return /障碍|碰撞|obstacle|绕障|rect/i.test(text);
}

function maxPlayOperations(gameHints) {
  const tunable = gameHints?.tunableInputCount ?? 0;
  const actionN = (gameHints?.actionTriggerControlIds || []).length > 0 ? 1 : 0;
  return Math.max(3, tunable + actionN);
}

function maxIrrelevantNodes(gameHints) {
  const optional = (gameHints?.optionalUiToggleIds || []).length;
  return Math.min(3, optional + 1);
}

function shouldRemoveIrrelevantNode(n, gameHints) {
  if (n.group !== 'irrelevant' || n.layer !== 'play') return false;
  const text = nodeText(n);
  const lc = gameHints?.levelContext;
  if (DISPLAY_HUD_IRRELEVANT_RE.test(text)) return true;
  if (lc?.focusMode === 'challenge' && CHALLENGE_NOISE_IRRELEVANT_RE.test(text)) return true;
  return false;
}

function isOptionalToggleIrrelevant(n, controls, optionalIds) {
  const optionalSet = new Set(optionalIds || []);
  return Object.entries(controls || {}).some(
    ([cid, v]) => v?.kgId === n.id && v?.role === 'irrelevant' && optionalSet.has(cid),
  );
}

function stripMappingRows(mapping, removeIds) {
  let out = String(mapping || '');
  for (const id of removeIds) {
    const re = new RegExp(`^\\|[^\\n]*\\|\\s*${id}\\s*\\|[^\\n]*\\n`, 'gm');
    out = out.replace(re, '');
  }
  return out;
}

function stripTraceMapControls(traceMap, removeIds) {
  if (!traceMap?.controls) return traceMap;
  const controls = { ...traceMap.controls };
  for (const [cid, v] of Object.entries(controls)) {
    if (removeIds.has(v?.kgId)) delete controls[cid];
  }
  return { ...traceMap, controls };
}

function retargetTeachVerifyLinks(links, nodes, primaryOpId) {
  const opIds = new Set(nodes.filter(n => n.group === 'operation' && n.layer === 'play').map(n => n.id));
  return links.map(link => {
    const s = nodes.find(n => n.id === link.s);
    if (s?.layer !== 'teach') return link;
    if (opIds.has(link.t)) return link;
    if (link.tp === 'verify' && primaryOpId) return { ...link, t: primaryOpId };
    return link;
  });
}

function rebuildPlayChain(nodes, links) {
  const p1 = nodes.find(n => n.id === 'P1' || (n.group === 'premise' && n.layer === 'play'));
  const r1 = playResultNode({ kg: { nodes } });
  const constraints = nodes
    .filter(n => n.group === 'constraint' && n.layer === 'play')
    .sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
  const ops = nodes
    .filter(n => n.group === 'operation' && n.layer === 'play')
    .sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
  const irrelevantLinks = links.filter(l => {
    const s = nodes.find(n => n.id === l.s);
    const t = nodes.find(n => n.id === l.t);
    return s?.group === 'irrelevant' || t?.group === 'irrelevant';
  });
  const teachLinks = retargetTeachVerifyLinks(
    links.filter(l => {
      const s = nodes.find(n => n.id === l.s);
      return s?.layer === 'teach';
    }),
    nodes,
    ops[0]?.id,
  );

  const playLinks = [];
  if (p1 && ops.length) {
    playLinks.push({ s: p1.id, t: ops[0].id, tp: 'premise' });
    let prev = ops[0].id;
    for (let i = 1; i < ops.length; i += 1) {
      playLinks.push({ s: prev, t: ops[i].id, tp: 'method' });
      prev = ops[i].id;
    }
    if (constraints.length) {
      playLinks.push({ s: prev, t: constraints[0].id, tp: 'premise' });
    } else if (r1) {
      playLinks.push({ s: prev, t: r1.id, tp: 'core' });
    }
  }
  for (let i = 0; i < constraints.length; i += 1) {
    const next = i < constraints.length - 1 ? constraints[i + 1] : r1;
    if (next) {
      playLinks.push({
        s: constraints[i].id,
        t: next.id,
        tp: i === constraints.length - 1 ? 'core' : 'premise',
      });
    }
  }

  return [...playLinks, ...teachLinks, ...irrelevantLinks];
}

function collapseChallengeOperations(nodes, removeIds) {
  const ops = nodes
    .filter(n => n.group === 'operation' && n.layer === 'play' && !removeIds.has(n.id))
    .sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
  if (ops.length <= 2) return nodes;

  const fireOp = ops.find(n => FIRE_OPERATION_RE.test(nodeText(n)));
  const tuneOps = ops.filter(n => n !== fireOp);
  const keepIds = new Set([tuneOps[0]?.id, fireOp?.id || tuneOps[1]?.id].filter(Boolean));

  return nodes
    .filter(n => !(n.group === 'operation' && n.layer === 'play' && !keepIds.has(n.id)))
    .map(n => {
      if (n.id === tuneOps[0]?.id && tuneOps.length > 1) {
        return {
          ...n,
          label: n.label.includes('调参') ? n.label : '调参瞄准',
          desc: n.desc.length >= 8
            ? n.desc
            : '调整本关可调参数并锁定瞄准方向，为本关 puzzle 做准备',
        };
      }
      if (fireOp && n.id === fireOp.id) {
        return {
          ...n,
          label: /击球|发射/.test(n.label) ? n.label : '施加电场击球',
          desc: n.desc.length >= 8 ? n.desc : '在参数与瞄准就绪后执行击球，观察轨迹与进球结果',
        };
      }
      return n;
    })
    .map((n, _i, arr) => {
      if (n.group !== 'operation' || n.layer !== 'play') return n;
      const playOps = arr.filter(x => x.group === 'operation' && x.layer === 'play');
      const idx = playOps.indexOf(n);
      if (idx === 0) return { ...n, id: 'O1', label: n.id === 'O1' ? n.label : n.label };
      if (idx === 1) return { ...n, id: 'O2', label: n.label };
      return n;
    });
}

function pruneLevelKgNoise(chapter, gameHints) {
  if (!chapter?.kg?.nodes) return chapter;

  const lc = gameHints?.levelContext;
  const optionalIds = gameHints?.optionalUiToggleIds || [];
  const maxIrr = maxIrrelevantNodes(gameHints);
  const maxOps = maxPlayOperations(gameHints);
  const controls = chapter.traceMap?.controls || {};
  const removeIds = new Set();

  for (const n of chapter.kg.nodes) {
    if (shouldRemoveIrrelevantNode(n, gameHints)) removeIds.add(n.id);
  }

  for (const n of chapter.kg.nodes) {
    if (n.group === 'operation' && n.layer === 'play' && PREVIEW_OPERATION_RE.test(nodeText(n))) {
      removeIds.add(n.id);
    }
  }

  let nodes = chapter.kg.nodes.filter(n => !removeIds.has(n.id));

  let irrRemaining = nodes.filter(n => n.group === 'irrelevant' && n.layer === 'play');
  if (irrRemaining.length > maxIrr) {
    const ranked = [...irrRemaining].sort((a, b) => {
      const aOpt = isOptionalToggleIrrelevant(a, controls, optionalIds) ? 1 : 0;
      const bOpt = isOptionalToggleIrrelevant(b, controls, optionalIds) ? 1 : 0;
      return bOpt - aOpt || String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
    });
    for (const n of ranked.slice(maxIrr)) removeIds.add(n.id);
    nodes = chapter.kg.nodes.filter(n => !removeIds.has(n.id));
    irrRemaining = nodes.filter(n => n.group === 'irrelevant' && n.layer === 'play');
  }

  let ops = nodes.filter(n => n.group === 'operation' && n.layer === 'play');
  if (ops.length > maxOps) {
    const ranked = [...ops].sort((a, b) => {
      const aFire = FIRE_OPERATION_RE.test(nodeText(a)) ? 1 : 0;
      const bFire = FIRE_OPERATION_RE.test(nodeText(b)) ? 1 : 0;
      if (bFire !== aFire) return bFire - aFire;
      return String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
    });
    for (const n of ranked.slice(maxOps)) removeIds.add(n.id);
    nodes = chapter.kg.nodes.filter(n => !removeIds.has(n.id));
  }

  if (lc?.focusMode === 'challenge') {
    nodes = collapseChallengeOperations(chapter.kg.nodes.filter(n => !removeIds.has(n.id)), removeIds);
    const idRemap = new Map();
    const oldOps = chapter.kg.nodes.filter(n => n.group === 'operation' && n.layer === 'play' && !removeIds.has(n.id));
    const newOps = nodes.filter(n => n.group === 'operation' && n.layer === 'play');
    oldOps.forEach((old, i) => {
      if (newOps[i] && old.id !== newOps[i].id) idRemap.set(old.id, newOps[i].id);
    });
    for (const [oldId, newId] of idRemap) {
      for (const n of chapter.kg.nodes) {
        if (removeIds.has(n.id) && n.id === oldId) removeIds.delete(n.id);
      }
      if (oldId !== newId) removeIds.add(oldId);
    }
    nodes = nodes.map(n => {
      if (idRemap.has(n.id)) return { ...n, id: idRemap.get(n.id) };
      return n;
    });
    const survivingIds = new Set(nodes.map(n => n.id));
    nodes = nodes.filter(n => survivingIds.has(n.id));
  } else {
    nodes = chapter.kg.nodes.filter(n => !removeIds.has(n.id));
  }

  const p1FanOut = (chapter.kg.links || []).filter(l => l.s === 'P1' && nodes.some(n => n.id === l.t && n.group === 'operation'));
  const needsRebuild = removeIds.size > 0 || p1FanOut.length > 1
    || (lc?.focusMode === 'challenge' && nodes.filter(n => n.group === 'operation' && n.layer === 'play').length > 2);

  if (!needsRebuild && !removeIds.size) return chapter;

  let links = (chapter.kg.links || []).filter(l => {
    const nodeIds = new Set(nodes.map(n => n.id));
    return nodeIds.has(l.s) && nodeIds.has(l.t);
  });
  if (needsRebuild) {
    links = rebuildPlayChain(nodes, links);
  }

  let mapping = stripMappingRows(chapter.mapping, removeIds);
  let traceMap = stripTraceMapControls(chapter.traceMap, removeIds);

  const kg = normalizeKgLinkTypes({ ...chapter.kg, nodes, links });
  return { ...chapter, kg, mapping, traceMap };
}

function repairWinSemantics(chapter, gameHints) {
  const config = gameHints?.levelContext?.config || {};
  const expectsScoring = gameHints?.hasScoringTargetWin || config.ballCount != null;
  if (!expectsScoring || !chapter?.kg?.nodes) return chapter;

  const ballCount = config.ballCount ?? 1;
  const nodes = chapter.kg.nodes.map(n => {
    if (n.id !== 'R1' && !(n.group === 'result' && n.layer === 'play')) return n;
    const desc = `全部 ${ballCount} 颗计分目标球进洞后过关（非白球作主目标）`;
    return { ...n, desc: desc.length >= 8 ? desc : `${desc}，达成本关 puzzle 目标` };
  });
  return { ...chapter, kg: { ...chapter.kg, nodes } };
}

function ensureObstacleConstraint(chapter) {
  if (!chapter?.kg?.nodes || corpusHasObstacle(chapter)) return chapter;

  const nodes = [...chapter.kg.nodes];
  const cid = nextConstraintId(nodes);
  nodes.push({
    id: cid,
    label: cid,
    group: 'constraint',
    layer: 'play',
    level: 2,
    r: 22,
    desc: '击球路径须避开障碍物碰撞，否则需重新调整再击',
  });

  const links = [...(chapter.kg.links || [])];
  const o1 = nodes.find(n => n.id === 'O1' || n.group === 'operation');
  const r1 = playResultNode({ kg: { nodes } });
  if (o1 && !links.some(l => l.s === o1.id && l.t === cid)) {
    links.push({ s: o1.id, t: cid, tp: 'method' });
  }
  if (r1 && !links.some(l => l.s === cid && l.t === r1.id)) {
    links.push({ s: cid, t: r1.id, tp: 'core' });
  }

  let mapping = String(chapter.mapping || '');
  if (!mapping.includes(cid)) {
    mapping += `\n| 击中障碍? | ${cid} | constraint | 碰撞/绕障判定 | skip retry`;
  }

  let ch = {
    ...chapter,
    kg: { ...chapter.kg, nodes, links },
    mapping,
  };

  if (ch.dt?.tree) {
    const tree = JSON.parse(JSON.stringify(ch.dt.tree));
    const attachRetry = (node) => {
      if (!node?.children?.length) return;
      for (const child of node.children) {
        if (child.t === 'decision' && /进洞|达标|过关|目标/.test(`${child.n}${child.d}`)) {
          const hasObstacleBranch = (child.children || []).some(c =>
            /障碍|碰撞|obstacle/i.test(`${c.n}${c.d}${c._e || ''}`),
          );
          if (!hasObstacleBranch) {
            child.children = [
              ...(child.children || []),
              { _e: '是', n: '击中障碍', t: 'retry', d: '碰撞障碍后重新调整击球' },
            ];
          }
        }
        attachRetry(child);
      }
    };
    attachRetry(tree);
    ch = { ...ch, dt: { ...ch.dt, tree: normalizeDtBranchPolarity(tree) } };
  }

  return ch;
}

function repairStrategyObservation(chapter) {
  let mm = String(chapter?.strategy?.mermaid || '');
  if (!mm.trim() || !/Observe/i.test(mm)) return chapter;
  if (/-->\|(?:偏近|偏远|未命中|不足|未达标)/.test(mm)) return chapter;

  const observeEdge = mm.match(/(\w+)\s*-->\s*(\w+)/g)?.find(e => /Observe/.test(e));
  if (observeEdge && !/-->\|/.test(mm.split(/Observe/i)[1]?.slice(0, 400) || '')) {
    mm += '\nObserve -->|偏远/未命中| Adjust\nObserve -->|偏近/不足| Adjust\nObserve -->|达标| Win';
  } else if (!observeEdge) {
    mm += '\nObserve{观察落点?}:::stratCond\nObserve -->|偏远/未命中| Adjust\nObserve -->|偏近| Adjust\nObserve -->|达标| Win';
  }

  if (mm === chapter.strategy.mermaid) return chapter;
  return { ...chapter, strategy: { ...chapter.strategy, mermaid: mm } };
}

function repairChapterScope(chapter, gameHints) {
  if (!chapter || typeof chapter !== 'object') return chapter;
  const config = gameHints?.levelContext?.config || {};
  let ch = chapter;
  ch = repairWinSemantics(ch, gameHints);
  if (config.hasObstacle) ch = ensureObstacleConstraint(ch);
  ch = repairStrategyObservation(ch);
  ch = pruneLevelKgNoise(ch, gameHints);
  if (ch.dt?.tree) {
    ch = {
      ...ch,
      dt: { ...ch.dt, tree: normalizeDtBranchPolarity(ch.dt.tree) },
    };
  }
  return ch;
}

module.exports = {
  repairChapterScope,
  repairWinSemantics,
  ensureObstacleConstraint,
  repairStrategyObservation,
  pruneLevelKgNoise,
  maxPlayOperations,
  maxIrrelevantNodes,
  CHALLENGE_MODE_UI_RE,
};

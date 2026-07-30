/**
 * Expert ↔ Agent chapter matching helpers.
 * Prefer controlId / role / semantic normalize over raw label equality.
 */

function stripSpace(s) {
  return String(s || '').replace(/[\s\u3000_\-·•./]/g, '').toLowerCase();
}

function stripSingleVarPrefix(s) {
  return String(s || '')
    .replace(/^单变量[·•.]/, '')
    .replace(/^试探混淆[·•.]/, '')
    .replace(/^拧混淆[·•.]?/, '')
    .trim();
}

/** Synonym buckets for common physics UI labels (lightweight). */
const SYN_GROUPS = [
  ['速度', '初速度', '速率', 'speed', 'v0', 'velocity'],
  ['角度', '发射角', '倾角', 'angle', 'theta'],
  ['质量', 'mass', 'm'],
  ['电容', '电容值', 'c', 'capacitance'],
  ['电压', '充电电压', 'volt', 'voltage', 'v'],
  ['时间', '充电时间', 'time', 't'],
  ['音量', '主音量', 'volume', 'audio'],
  ['馈线', '馈线长度', 'cable', 'l'],
];

function synKey(label) {
  const n = stripSpace(stripSingleVarPrefix(label));
  if (!n) return '';
  for (const g of SYN_GROUPS) {
    if (g.some(x => stripSpace(x) === n || n.includes(stripSpace(x)))) {
      return `syn:${g[0]}`;
    }
  }
  return `lab:${n}`;
}

/**
 * Match rule documentation (also embedded in eval reports).
 */
const MATCH_RULES_DOC = [
  '1. controlId 精确相等（最高优先）',
  '2. 语义归一 label：去空白/下划线/间隔符后小写；去掉「单变量·」「试探混淆·」前缀',
  '3. 同义词桶（速度/初速度、角度/倾角、音量/主音量等）',
  '4. KG 节点：优先 id；其次归一 label；再同义词',
  '5. AV/CV 角色：adjustment / confounding / operation / irrelevant 辅助配对 priority',
  '说明：不以「仅 label 字符串全等」为唯一依据；报告中的 matchedBy 标明规则。',
].join('\n');

function nodeKeys(node) {
  const keys = new Set();
  if (node?.id) keys.add(`id:${String(node.id).trim()}`);
  const lab = stripSingleVarPrefix(node?.label || '');
  const n = stripSpace(lab);
  if (n) keys.add(`lab:${n}`);
  const syn = synKey(lab);
  if (syn) keys.add(syn);
  if (node?.group) keys.add(`grp:${node.group}:${n || node.id}`);
  return keys;
}

function avKeys(av) {
  const keys = new Set();
  if (av?.controlId) keys.add(`cid:${String(av.controlId).trim()}`);
  if (av?.id) keys.add(`avid:${String(av.id).trim()}`);
  const lab = stripSingleVarPrefix(av?.label || '');
  const n = stripSpace(lab);
  if (n) keys.add(`lab:${n}`);
  const syn = synKey(lab);
  if (syn) keys.add(syn);
  return keys;
}

function f1FromKeySets(expertItems, agentItems, keyFn) {
  const eMaps = expertItems.map(it => ({ it, keys: keyFn(it) }));
  const aMaps = agentItems.map(it => ({ it, keys: keyFn(it) }));
  if (!eMaps.length && !aMaps.length) {
    return { f1: 1, precision: 1, recall: 1, matched: 0, matchedBy: [] };
  }
  const usedA = new Set();
  const matchedBy = [];
  let tp = 0;
  for (const e of eMaps) {
    let hit = -1;
    let how = null;
    for (let i = 0; i < aMaps.length; i++) {
      if (usedA.has(i)) continue;
      for (const k of e.keys) {
        if (aMaps[i].keys.has(k)) {
          hit = i;
          how = k.startsWith('cid:') ? 'controlId'
            : k.startsWith('id:') ? 'nodeId'
              : k.startsWith('syn:') ? 'synonym'
                : k.startsWith('lab:') ? 'normalizedLabel'
                  : 'other';
          break;
        }
      }
      if (hit >= 0) break;
    }
    if (hit >= 0) {
      usedA.add(hit);
      tp += 1;
      matchedBy.push({
        expert: e.it.label || e.it.id || e.it.controlId,
        agent: aMaps[hit].it.label || aMaps[hit].it.id || aMaps[hit].it.controlId,
        by: how,
      });
    }
  }
  const precision = aMaps.length ? tp / aMaps.length : 0;
  const recall = eMaps.length ? tp / eMaps.length : 0;
  const f1 = (!precision && !recall) ? 0 : (2 * precision * recall) / (precision + recall);
  return {
    f1: Math.round(f1 * 1000) / 1000,
    precision: Math.round(precision * 1000) / 1000,
    recall: Math.round(recall * 1000) / 1000,
    matched: tp,
    matchedBy,
  };
}

function matchNodes(expertChapter, agentChapter) {
  const eNodes = expertChapter?.kg?.nodes || [];
  const aNodes = agentChapter?.kg?.nodes || [];
  return f1FromKeySets(eNodes, aNodes, nodeKeys);
}

function matchAvs(expertChapter, agentChapter) {
  const e = expertChapter?.inquiryScript?.adjustmentVariables || [];
  const a = agentChapter?.inquiryScript?.adjustmentVariables || [];
  return f1FromKeySets(e, a, avKeys);
}

function findAvPair(ev, aList) {
  const eKeys = avKeys(ev);
  for (const av of aList) {
    const aKeys = avKeys(av);
    for (const k of eKeys) {
      if (aKeys.has(k)) {
        const by = k.startsWith('cid:') ? 'controlId'
          : k.startsWith('syn:') ? 'synonym'
            : 'normalizedLabel';
        return { av, by };
      }
    }
  }
  return null;
}

function spearmanOnPairs(pairs) {
  if (!pairs || pairs.length < 2) return null;
  const n = pairs.length;
  let d2 = 0;
  for (const [a, b] of pairs) d2 += (a - b) ** 2;
  const denom = n * (n ** 2 - 1);
  if (!denom) return null;
  return Math.round((1 - (6 * d2) / denom) * 1000) / 1000;
}

function pearsonOnPairs(pairs) {
  if (!pairs || pairs.length < 2) return null;
  const xs = pairs.map(p => p[0]);
  const ys = pairs.map(p => p[1]);
  const n = xs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (!dx || !dy) return dx === dy ? 1 : null;
  return Math.round((num / Math.sqrt(dx * dy)) * 1000) / 1000;
}

function priorityCorrelation(expert, agent) {
  const eAv = expert?.inquiryScript?.adjustmentVariables || [];
  const aAv = agent?.inquiryScript?.adjustmentVariables || [];
  const pairs = [];
  const pairMeta = [];
  for (const ev of eAv) {
    if (ev?.priorityRank == null) continue;
    const hit = findAvPair(ev, aAv);
    if (hit?.av?.priorityRank == null) continue;
    pairs.push([Number(ev.priorityRank), Number(hit.av.priorityRank)]);
    pairMeta.push({
      expert: ev.label || ev.controlId,
      agent: hit.av.label || hit.av.controlId,
      by: hit.by,
      eRank: Number(ev.priorityRank),
      aRank: Number(hit.av.priorityRank),
    });
  }
  return {
    spearman: spearmanOnPairs(pairs),
    pearson: pearsonOnPairs(pairs),
    pairCount: pairs.length,
    pairs: pairMeta,
  };
}

function perAvRouteRecall(expert, agent) {
  const labels = (expert?.inquiryScript?.adjustmentVariables || [])
    .map(a => a.label)
    .filter(Boolean);
  if (!labels.length) return null;
  const routes = agent?.strategy?.routes || [];
  const routeLabels = routes.map(r => String(r.label || ''));
  let hit = 0;
  for (const lab of labels) {
    const n = stripSpace(lab);
    const syn = synKey(lab);
    if (routeLabels.some(rl => {
      const rn = stripSpace(stripSingleVarPrefix(rl));
      return rn.includes(n) || synKey(rl) === syn || rl.includes(`单变量·${lab}`) || rl.includes(lab);
    })) hit += 1;
  }
  return Math.round((hit / labels.length) * 1000) / 1000;
}

module.exports = {
  MATCH_RULES_DOC,
  stripSpace,
  stripSingleVarPrefix,
  synKey,
  matchNodes,
  matchAvs,
  priorityCorrelation,
  perAvRouteRecall,
  findAvPair,
  avKeys,
  nodeKeys,
};

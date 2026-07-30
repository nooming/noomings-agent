/** �?snapshot.decisions 还原 DT/KG 路径（无 trace-path-align 依赖�?*/

function alignFromGeneratedSnapshot(snapshot, kgNodes) {
  if (!snapshot?.decisions) return { dtPath: [], hintKey: snapshot?.hintKey || 'unknown' };
  const path = [];
  const ops = (kgNodes || []).filter(n => n.group === 'operation').map(n => n.id);
  if (ops.length) path.push(ops[0]);
  const constraints = (kgNodes || []).filter(n => n.group === 'constraint' && n.layer === 'play');
  for (const c of constraints.sort((a, b) => a.level - b.level)) {
    const key = c.id;
    if (snapshot.decisions[key] === true) path.push(key);
    else if (snapshot.decisions[key] === false) break;
  }
  if (snapshot.winOk) path.push('R1');
  return { dtPath: path, hintKey: snapshot.hintKey || 'unknown' };
}

function alignFromDecisionsOnly(snapshot) {
  if (!snapshot?.decisions) return { dtPath: [], hintKey: snapshot?.hintKey || 'unknown' };
  const path = [];
  for (const [id, ok] of Object.entries(snapshot.decisions)) {
    if (ok === true) path.push(id);
  }
  if (snapshot.winOk) path.push('R1');
  return { dtPath: path, hintKey: snapshot.hintKey || 'unknown', decisions: snapshot.decisions };
}

module.exports = { alignFromGeneratedSnapshot, alignFromDecisionsOnly };

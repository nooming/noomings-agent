/** DT decision branch polarity — generic failure/success semantics, no game ids. */

const FAILURE_DECISION_RE = /失败|出界|边界|飞出|超时|未命中|击穿|invalid|fail|超出|越界|out\s*of/i;
const SUCCESS_DECISION_RE = /进洞|靠近|达标|命中|速度低|过关|success|win|入洞|滚入/i;

const RECOVERABLE_GATE_RE = /出界|复位|犯规|撞框|落袋|白球|越界复位/i;
const TERMINAL_FAIL_RE = /游戏结束|彻底失败|本局结束|不可继续|立即失败/i;

const PROGRESS_CHECKPOINT_RE = /进洞|碰撞|障碍|得分|击中|触|越过|未越过|未越|山顶|挡|复位|撞|出界|落地/i;
const TERMINAL_GOAL_RE = /全部|过关|达标|胜利|win|所有/i;

function isFailureDecision(node) {
  if (!node || node.t !== 'decision') return false;
  const text = `${node.n || ''}${node.d || ''}`;
  if (isProgressCheckpointDecision(node)) return false;
  if (RECOVERABLE_GATE_RE.test(text) && !TERMINAL_FAIL_RE.test(text)) return false;
  return FAILURE_DECISION_RE.test(text);
}

function isSuccessOutcomeDecision(node) {
  if (!node || node.t !== 'decision') return false;
  if (isFailureDecision(node)) return false;
  return SUCCESS_DECISION_RE.test(`${node.n || ''}${node.d || ''}`);
}

function isProgressCheckpointDecision(node) {
  if (!node || node.t !== 'decision') return false;
  const text = `${node.n || ''}${node.d || ''}`;
  if (TERMINAL_GOAL_RE.test(text)) return false;
  return PROGRESS_CHECKPOINT_RE.test(text);
}

/** Pipeline progress gates: normalize 否 branch to junction for intermediate checks. */
function normalizeDtProgressGates(tree) {
  if (!tree) return tree;
  const root = JSON.parse(JSON.stringify(tree));
  const walk = (node) => {
    if (node.t === 'decision' && isProgressCheckpointDecision(node)) {
      node.children = (node.children || []).map(c => {
        if (c._e === '否' && (c.t === 'step' || c.t === 'junction')) {
          return { ...c, t: 'junction' };
        }
        return c;
      });
    }
    (node.children || []).forEach(walk);
  };
  walk(root);
  return root;
}

function branchByEdge(children, edge) {
  return (children || []).find(c => c._e === edge);
}

/** Swap yes/no when failure decision wrongly uses success polarity (是→result, 否→retry). */
function fixInvertedFailureBranches(decision) {
  if (!isFailureDecision(decision) || !decision.children?.length) return false;
  const yes = branchByEdge(decision.children, '是');
  const no = branchByEdge(decision.children, '否');
  if (!yes || !no) return false;
  if (yes.t !== 'result' || no.t !== 'retry') return false;
  decision.children = decision.children.map(c => {
    if (c._e === '是') return { ...no, _e: '是' };
    if (c._e === '否') return { ...yes, _e: '否' };
    return c;
  });
  return true;
}

/** Progress gate: 是-branch must not be retry — use junction continue. */
function fixProgressCheckpointYesBranch(decision) {
  if (!isProgressCheckpointDecision(decision) || !decision.children?.length) return false;
  const yes = branchByEdge(decision.children, '是');
  if (!yes || yes.t !== 'retry') return false;
  decision.children = decision.children.map(c => {
    if (c._e !== '是') return c;
    return { ...c, t: 'junction' };
  });
  return true;
}

/** Success/outcome gate: 是→result but 否 not retry — convert 否 to retry. */
function fixSuccessOutcomeNoBranch(decision) {
  if (!isSuccessOutcomeDecision(decision) || !decision.children?.length) return false;
  const yes = branchByEdge(decision.children, '是');
  const no = branchByEdge(decision.children, '否');
  if (!yes || yes.t !== 'result' || !no || no.t === 'retry') return false;
  const retryLabel = /重试|调整|调参/.test(`${no.n || ''}${no.d || ''}`)
    ? (no.n || '未达标重试')
    : '未达标重试';
  decision.children = decision.children.map(c => {
    if (c._e !== '否') return c;
    return {
      n: retryLabel,
      t: 'retry',
      d: no.d || '调整参数后重试',
      _e: '否',
      children: [],
    };
  });
  return true;
}

function normalizeDtBranchPolarity(tree) {
  if (!tree) return tree;
  const root = JSON.parse(JSON.stringify(tree));
  const walk = (node) => {
    if (node.t === 'decision') {
      fixInvertedFailureBranches(node);
      if (isProgressCheckpointDecision(node)) {
        fixProgressCheckpointYesBranch(node);
      } else {
        fixSuccessOutcomeNoBranch(node);
      }
    }
    (node.children || []).forEach(walk);
  };
  walk(root);
  return normalizeDtProgressGates(root);
}

function normalizeDtChapter(chapter) {
  if (!chapter?.dt?.tree) return chapter;
  let ch = {
    ...chapter,
    dt: { ...chapter.dt, tree: normalizeDtBranchPolarity(chapter.dt.tree) },
  };
  ch = repairDtOperationStep(ch);
  return ch;
}

const ENV_DECISION_RE = /模式|环境|开关|阻力|空气|星球|planet|mode|feature|gravity/i;
const OUTCOME_DECISION_RE = /失败|出界|边界|命中|达标|过关|碰撞|invalid|fail|win|success/i;

function dtSubtreeHasOperationStep(subtree, operationLabel) {
  if (!subtree || !operationLabel) return false;
  let found = false;
  const walk = n => {
    if (found) return;
    const text = `${n.n || ''}${n.d || ''}`;
    if (n.t === 'step' && text.includes(operationLabel)) found = true;
    if (n.t !== 'decision' && operationLabel.length >= 4 && text.includes(operationLabel.slice(0, 8))) {
      found = true;
    }
    (n.children || []).forEach(walk);
  };
  walk(subtree);
  return found;
}

function dtSubtreeHasOutcomeDecision(subtree) {
  if (!subtree) return false;
  let found = false;
  const walk = n => {
    if (found) return;
    if (n.t === 'decision' && OUTCOME_DECISION_RE.test(`${n.n || ''}${n.d || ''}`)) found = true;
    (n.children || []).forEach(walk);
  };
  walk(subtree);
  return found;
}

function insertOperationStepBefore(children, index, opLabel, opDesc) {
  const opNode = {
    n: opLabel,
    t: 'step',
    d: opDesc || opLabel,
    children: [],
  };
  children.splice(index, 0, opNode);
}

function canHostOperationInsert(node) {
  return node && node.t !== 'decision' && node.t !== 'result';
}

function repairDtOperationStepOnSubtree(subtree, opLabel, opDesc) {
  if (!subtree || !canHostOperationInsert(subtree) || dtSubtreeHasOperationStep(subtree, opLabel)) {
    return false;
  }
  const children = subtree.children || [];
  for (let i = 0; i < children.length; i++) {
    const c = children[i];
    if (c.t === 'decision' && OUTCOME_DECISION_RE.test(`${c.n || ''}${c.d || ''}`)) {
      insertOperationStepBefore(children, i, opLabel, opDesc);
      return true;
    }
    if (canHostOperationInsert(c) && repairDtOperationStepOnSubtree(c, opLabel, opDesc)) return true;
  }
  if (children.length) {
    insertOperationStepBefore(children, 0, opLabel, opDesc);
    return true;
  }
  return false;
}

function repairDtOperationStep(chapter) {
  const tree = chapter?.dt?.tree;
  const nodes = chapter?.kg?.nodes || [];
  const op = nodes.find(n => n.group === 'operation' && n.layer === 'play');
  if (!tree || !op) return chapter;

  const opLabel = op.label || op.id;
  const opDesc = op.desc || opLabel;
  if (dtSubtreeHasOperationStep(tree, opLabel)) return chapter;

  const root = JSON.parse(JSON.stringify(tree));
  const envDecision = (root.children || []).find(
    c => c.t === 'decision' && ENV_DECISION_RE.test(`${c.n || ''}${c.d || ''}`),
  );

  if (envDecision) {
    const onBranch = (envDecision.children || []).find(
      c => /^(是|开|on|1|true)$/i.test(String(c._e || '').trim()),
    ) || (envDecision.children || [])[1];
    if (onBranch && !dtSubtreeHasOperationStep(onBranch, opLabel) && dtSubtreeHasOutcomeDecision(onBranch)) {
      const opNode = {
        n: opLabel,
        t: 'step',
        d: opDesc,
        children: onBranch.children || [],
      };
      onBranch.children = [opNode];
      return { ...chapter, dt: { ...chapter.dt, tree: root } };
    }
  }

  if (repairDtOperationStepOnSubtree(root, opLabel, opDesc)) {
    return { ...chapter, dt: { ...chapter.dt, tree: root } };
  }

  return chapter;
}

function repairDtRetryToOperation(chapter, gameHints) {
  if (!gameHints?.actionObserveLoop || !chapter?.dt?.tree) return chapter;
  const nodes = chapter?.kg?.nodes || [];
  const op = nodes.find(n => n.group === 'operation' && n.layer === 'play');
  if (!op) return chapter;

  const opLabel = op.label || op.id;
  const mapping = String(chapter.mapping || '');
  if (/retry[^|\n]*\|[^|\n]*O1|调参|调整参数|重新操作/i.test(mapping)) return chapter;

  const root = JSON.parse(JSON.stringify(chapter.dt.tree));
  let changed = false;
  const walk = node => {
    if (node.t !== 'retry') {
      (node.children || []).forEach(walk);
      return;
    }
    const text = `${node.n || ''}${node.d || ''}`;
    const mentionsOp = opLabel.length >= 4
      ? text.includes(opLabel.slice(0, 8)) || text.includes(opLabel)
      : text.includes(opLabel);
    if (!mentionsOp && !/调参|调整|操作|发射|再测|观察|微调/i.test(text)) {
      node.d = [node.d, `回到${opLabel}后重试`].filter(Boolean).join('，');
      if (!node.children?.length) {
        node.children = [{
          n: opLabel,
          t: 'step',
          d: op.desc || opLabel,
          children: [],
        }];
      }
      changed = true;
    }
    (node.children || []).forEach(walk);
  };
  walk(root);
  if (!changed) return chapter;
  return { ...chapter, dt: { ...chapter.dt, tree: root } };
}

module.exports = {
  FAILURE_DECISION_RE,
  SUCCESS_DECISION_RE,
  isFailureDecision,
  isSuccessOutcomeDecision,
  isProgressCheckpointDecision,
  normalizeDtProgressGates,
  normalizeDtBranchPolarity,
  normalizeDtChapter,
  repairDtOperationStep,
  repairDtRetryToOperation,
};

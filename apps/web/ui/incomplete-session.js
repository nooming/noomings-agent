/**
 * Browser mirror of packages/judge/incomplete-session.js (badge labels + kind fallback).
 */
(function (global) {
  const KIND_LABEL_ZH = {
    touch_only: '点开即走',
    explore_dropout: '探究未完',
    challenge_active: '竞赛未完',
    rich_unjudged: '有过程',
  };

  function incompleteKindLabelZh(kind) {
    return KIND_LABEL_ZH[kind] || '未完成';
  }

  function eventCountOf(session) {
    const n = Number(session?.eventCount);
    if (Number.isFinite(n) && n >= 0) return n;
    return Array.isArray(session?.events) ? session.events.length : 0;
  }

  /** 无服务端写入时，用索引字段粗分（详情以 session.incompleteKind 为准）。 */
  function inferIncompleteKindClient(session) {
    if (session?.incompleteKind && KIND_LABEL_ZH[session.incompleteKind]) {
      return session.incompleteKind;
    }
    const n = eventCountOf(session);
    if (n <= 3) return 'touch_only';
    if (session?.currentPhase === 'challenge'
      || session?.scoredPhase === 'challenge'
      || session?.strategyPathByPhase?.challenge) {
      return 'challenge_active';
    }
    if (session?.currentPhase === 'explore'
      || session?.strategyPathSummaryExplore
      || session?.strategyPathByPhase?.explore) {
      return 'explore_dropout';
    }
    return 'rich_unjudged';
  }

  global.IncompleteSession = {
    incompleteKindLabelZh,
    inferIncompleteKindClient,
    KIND_LABEL_ZH,
  };
})(typeof window !== 'undefined' ? window : globalThis);

/**
 * Compact multi-level tab labels (generic; no game-specific ids).
 */

const LEVEL_WITH_TAIL_RE = /^(?:关卡|第)\s*(\d+)\s*[：:]\s*(.+)$/;

function compactTabLabel(text, opts = {}) {
  const maxTail = opts.maxTail ?? 14;
  const maxLen = opts.maxLen ?? 18;
  const full = String(text || '').trim();
  if (!full) {
    const fallback = opts.fallbackIndex != null ? `第 ${opts.fallbackIndex + 1} 关` : '关卡';
    return { short: fallback, full: fallback };
  }

  const m = full.match(LEVEL_WITH_TAIL_RE);
  if (m) {
    const num = m[1];
    const tail = m[2].trim();
    const short = tail.length <= maxTail ? `第 ${num} 关：${tail}` : `第 ${num} 关`;
    return { short, full };
  }

  if (full.length <= maxLen) return { short: full, full };
  return { short: `${full.slice(0, maxLen)}…`, full };
}

if (typeof window !== 'undefined') {
  window.TabLabel = { compactTabLabel };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    compactTabLabel,
    LEVEL_WITH_TAIL_RE,
  };
}

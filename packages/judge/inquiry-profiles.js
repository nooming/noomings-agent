/** 探究测评指标配置（仅 generic profile�?*/

const PROFILES = {
  generic: {
    id: 'generic',
    /** null = 任一�?ok �?hintKey �?!winOk 视为失败�?*/
    failureHints: null,
    useMatBoundary: false,
  },
};

function resolveInquiryProfile(chapter) {
  const p = chapter?.inquiryProfile;
  if (p && PROFILES[p]) return p;
  return 'generic';
}

function getProfileConfig(chapter) {
  const id = resolveInquiryProfile(chapter);
  return PROFILES[id] || PROFILES.generic;
}

function isFailureSnapshot(payload, chapter) {
  if (!payload || payload.winOk) return false;
  const cfg = getProfileConfig(chapter);
  const hk = payload.hintKey;
  if (!hk || hk === 'ok') {
    return !payload.winOk;
  }
  if (hk === 'unknown') return false;
  if (cfg.failureHints === null) return true;
  return cfg.failureHints.has(hk);
}

function profileUsesMatBoundary(_chapter) {
  return false;
}

module.exports = {
  PROFILES,
  resolveInquiryProfile,
  getProfileConfig,
  isFailureSnapshot,
  profileUsesMatBoundary,
};

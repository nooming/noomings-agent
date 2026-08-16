/**
 * Publish gate: playability + dual-mode explore_success before catalog publish.
 * Soft by default (warnings); set PLATFORM_PUBLISH_STRICT=1 to block.
 */
const fs = require('fs');
const path = require('path');
const { getPackageGamePath, getPackagesRoot } = require('../shared/data-paths');
const { resolvePackageId } = require('../shared/package-layout');
const { auditHtmlContent } = require('./legacy-trace-inject');

function isStrict() {
  return String(process.env.PLATFORM_PUBLISH_STRICT || '').trim() === '1';
}

function resolveGameHtmlPath(graphId, playUrl) {
  const packageId = resolvePackageId(graphId);
  const pkgPath = getPackageGamePath(packageId);
  if (fs.existsSync(pkgPath)) return pkgPath;
  if (playUrl && String(playUrl).includes('/packages/')) {
    const m = String(playUrl).match(/\/packages\/([^/]+)\//);
    if (m) {
      const alt = getPackageGamePath(m[1]);
      if (fs.existsSync(alt)) return alt;
    }
  }
  return pkgPath;
}

function isDualModeHtml(html) {
  return /modeSelect|dual-mode|playMode|自由探究|竞赛模式/.test(html)
    && /explore/.test(html)
    && /challenge|竞赛|挑战/.test(html);
}

function isObserveOnlyHtml(html, sampleTags) {
  if ((sampleTags || []).includes('observe-only')) return true;
  return /observe-only|单阶段观察/.test(html);
}

function hasExploreSuccess(html) {
  return /explore_success/.test(html)
    || /__noteExploreSuccess/.test(html);
}

/**
 * @returns {{ ok: boolean, warnings: string[], errors: string[], blocked: boolean }}
 */
function assertPublishReady({ graphId, playUrl, sampleTags, published = true } = {}) {
  const warnings = [];
  const errors = [];
  if (!published) {
    return { ok: true, warnings, errors, blocked: false };
  }
  const htmlPath = resolveGameHtmlPath(graphId, playUrl);
  if (!fs.existsSync(htmlPath)) {
    errors.push('game_html_missing');
  } else {
    const html = fs.readFileSync(htmlPath, 'utf8');
    const audit = auditHtmlContent(html, { id: resolvePackageId(graphId) });
    if (!audit.hasTraceHook) warnings.push('no_trace_hook');
    if (!audit.hasWinEmit && !isObserveOnlyHtml(html, sampleTags)) {
      warnings.push('no_win_emit');
    }
    if (isDualModeHtml(html) && !isObserveOnlyHtml(html, sampleTags) && !hasExploreSuccess(html)) {
      const msg = 'dual_mode_missing_explore_success';
      if (isStrict()) errors.push(msg);
      else warnings.push(msg);
    }
  }
  const blocked = errors.length > 0;
  return {
    ok: !blocked,
    warnings,
    errors,
    blocked,
    strict: isStrict(),
    htmlPath: path.relative(getPackagesRoot(), htmlPath),
  };
}

module.exports = {
  assertPublishReady,
  isDualModeHtml,
  hasExploreSuccess,
  isStrict,
};

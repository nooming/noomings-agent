/**
 * Audit HTML controls ↔ chapter AV/CV/traceMap alignment for 23 yangben.
 * Optionally --fix to drop synthetic AVs missing from HTML (e.g. capacitor-era-ch4).
 *
 *   node tests/scripts/audit-control-alignment.js
 *   node tests/scripts/audit-control-alignment.js --fix
 *   node tests/scripts/audit-control-alignment.js --id capacitor-era-ch4 --fix
 */
const fs = require('fs');
const path = require('path');
const YANG_MAP = require('../lib/yangben-sample-map');
const { getPackagesRoot, getReportsRoot } = require('../../packages/shared/data-paths');
const { extractHtmlControls } = require('../lib/html-controls');

const ROOT = path.resolve(__dirname, '../..');
const YANG = path.join(ROOT, '样本html');
const REPORTS = getReportsRoot();

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : null;
}

function loadHtml(entry) {
  const pkgGame = path.join(getPackagesRoot(), entry.id, 'game.html');
  const sampleGame = path.join(YANG, entry.dir, entry.game);
  const p = fs.existsSync(pkgGame) ? pkgGame : sampleGame;
  if (!fs.existsSync(p)) return { html: '', path: null };
  return { html: fs.readFileSync(p, 'utf8'), path: p };
}

function auditOne(entry) {
  const chapterPath = path.join(getPackagesRoot(), entry.id, 'chapter.json');
  if (!fs.existsSync(chapterPath)) {
    return { id: entry.id, ok: false, error: 'chapter_missing' };
  }
  const chapter = JSON.parse(fs.readFileSync(chapterPath, 'utf8'));
  const { html, path: htmlPath } = loadHtml(entry);
  const controls = extractHtmlControls(html);
  const htmlIds = new Set(controls.map(c => c.id));
  const avs = chapter?.inquiryScript?.adjustmentVariables || [];
  const cvs = chapter?.inquiryScript?.confoundingVariables || [];
  const tm = chapter?.traceMap?.controls || {};

  const avMissingInHtml = avs.filter(a => a.controlId && !htmlIds.has(a.controlId));
  const cvMissingInHtml = cvs.filter(c => c.controlId && !htmlIds.has(c.controlId));
  const tmMissingInHtml = Object.keys(tm).filter(id => !htmlIds.has(id) && !/^btn-fire|btn_fire|fire$/i.test(id));

  // HTML tunable-looking ids not mapped
  const mapped = new Set([
    ...avs.map(a => a.controlId),
    ...cvs.map(c => c.controlId),
    ...Object.keys(tm),
  ].filter(Boolean));
  const htmlUnmapped = controls.filter(c => {
    if (mapped.has(c.id)) return false;
    if (/mode|volume|audio|sfx|theme|btn-|fire|launch|test|select/i.test(c.id)) return false;
    return /^(s-|slider|range)/i.test(c.id) || c.tag?.includes('range');
  });

  const issues = [];
  for (const a of avMissingInHtml) {
    issues.push({ severity: 'error', kind: 'av_missing_in_html', controlId: a.controlId, label: a.label });
  }
  for (const c of cvMissingInHtml) {
    issues.push({ severity: 'warn', kind: 'cv_missing_in_html', controlId: c.controlId, label: c.label });
  }
  for (const id of tmMissingInHtml) {
    issues.push({ severity: 'warn', kind: 'tracemap_missing_in_html', controlId: id });
  }
  for (const c of htmlUnmapped) {
    issues.push({ severity: 'info', kind: 'html_unmapped_slider', controlId: c.id, label: c.label });
  }

  return {
    id: entry.id,
    ok: true,
    htmlPath,
    htmlControlCount: controls.length,
    avCount: avs.length,
    cvCount: cvs.length,
    avMissingInHtml: avMissingInHtml.map(a => a.controlId),
    cvMissingInHtml: cvMissingInHtml.map(c => c.controlId),
    issues,
    errorCount: issues.filter(i => i.severity === 'error').length,
  };
}

function fixChapter(entry, audit) {
  if (!audit.ok || !audit.avMissingInHtml?.length) return { id: entry.id, fixed: false };
  const chapterPath = path.join(getPackagesRoot(), entry.id, 'chapter.json');
  const chapter = JSON.parse(fs.readFileSync(chapterPath, 'utf8'));
  const { html } = loadHtml(entry);
  const htmlIds = new Set(extractHtmlControls(html).map(c => c.id));

  const before = (chapter.inquiryScript.adjustmentVariables || []).length;
  chapter.inquiryScript.adjustmentVariables = (chapter.inquiryScript.adjustmentVariables || [])
    .filter(a => !a.controlId || htmlIds.has(a.controlId));
  const after = chapter.inquiryScript.adjustmentVariables.length;

  // Drop routes for removed synthetic AVs
  const keepLabs = new Set(
    chapter.inquiryScript.adjustmentVariables.map(a => `单变量·${a.label}`),
  );
  if (Array.isArray(chapter.strategy?.routes)) {
    chapter.strategy.routes = chapter.strategy.routes.filter(r => {
      const lab = String(r.label || '');
      if (!/^单变量/.test(lab)) return true;
      return [...keepLabs].some(k => lab === k || lab.includes(k.replace('单变量·', '')));
    });
    // Re-rank remaining AV routes
    let rank = 1;
    for (const r of chapter.strategy.routes) {
      if (/^单变量/.test(String(r.label || ''))) {
        r.priorityRank = rank;
        rank += 1;
      }
    }
  }
  // Re-rank AVs
  chapter.inquiryScript.adjustmentVariables.forEach((a, i) => {
    a.priorityRank = i + 1;
  });

  // Clean mermaid edge labels for removed AVs (best-effort note in meta)
  chapter._alignmentFix = {
    at: new Date().toISOString(),
    removedAvControlIds: audit.avMissingInHtml,
    note: 'Removed synthetic AVs not present in game HTML; routes re-ranked.',
  };

  fs.writeFileSync(chapterPath, JSON.stringify(chapter, null, 2), 'utf8');
  return { id: entry.id, fixed: true, avBefore: before, avAfter: after, removed: audit.avMissingInHtml };
}

function toMarkdown(rows, fixes) {
  const errRows = rows.filter(r => r.ok && r.errorCount > 0);
  const lines = [
    '# 控件 ↔ chapter AV/CV 对齐审计',
    '',
    `生成时间：${new Date().toISOString()}`,
    '',
    `覆盖 ${rows.filter(r => r.ok).length}/${rows.length}；存在合成 AV 缺失 HTML：**${errRows.length}**`,
    '',
    '| id | HTML 控件数 | AV | CV | AV∉HTML | 错误数 |',
    '| --- | ---: | ---: | ---: | --- | ---: |',
  ];
  for (const r of rows) {
    if (!r.ok) {
      lines.push(`| ${r.id} | — | — | — | — | ${r.error} |`);
      continue;
    }
    lines.push(
      `| ${r.id} | ${r.htmlControlCount} | ${r.avCount} | ${r.cvCount} | ${(r.avMissingInHtml || []).join(', ') || '—'} | ${r.errorCount} |`,
    );
  }
  if (fixes?.length) {
    lines.push('', '## 自动修复', '');
    for (const f of fixes) {
      lines.push(`- **${f.id}**：AV ${f.avBefore}→${f.avAfter}，移除 ${ (f.removed || []).join(', ') }`);
    }
  }
  lines.push('', '## 说明', '', '- `av_missing_in_html`：chapter 声明了 HTML 中不存在的 controlId（典型：电容纪元合成 AV）。', '- `--fix` 会删除缺失 AV 并重排同包 routes/priorityRank；mermaid 全文可能仍含旧标签，需后续 surgical 清理。', '');
  return lines.join('\n');
}

function main() {
  const doFix = process.argv.includes('--fix');
  const filterId = argValue('--id');
  const entries = filterId ? YANG_MAP.filter(e => e.id === filterId) : YANG_MAP;
  const rows = entries.map(auditOne);
  const fixes = [];
  if (doFix) {
    for (const entry of entries) {
      const audit = rows.find(r => r.id === entry.id);
      if (audit?.errorCount > 0) {
        const f = fixChapter(entry, audit);
        if (f.fixed) fixes.push(f);
      }
    }
  }
  fs.mkdirSync(REPORTS, { recursive: true });
  const payload = { generatedAt: new Date().toISOString(), rows, fixes };
  fs.writeFileSync(path.join(REPORTS, 'control-alignment-audit.json'), JSON.stringify(payload, null, 2), 'utf8');
  const md = toMarkdown(rows, fixes);
  fs.writeFileSync(path.join(REPORTS, 'control-alignment-audit.md'), md, 'utf8');
  console.log(md);
}

main();

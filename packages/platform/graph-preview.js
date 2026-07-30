const fs = require('fs');
const path = require('path');
const { getPackagesRoot } = require('../shared/data-paths');
const { resolvePackageId } = require('../shared/package-layout');

function tabMeta(c, i) {
  const full = c.slotName || c.title || (`关卡 ${c.ch != null ? c.ch : i + 1}`);
  return { _tabLabel: full, _tabTitleFull: full };
}

function buildSinglePayload(chapter, meta = {}) {
  const title = (meta.title || chapter.kg?.title || '草稿预览').trim();
  const fullTab = title;
  return {
    ok: true,
    mode: 'single',
    title,
    headerTag: 'AGENT A · KNOWLEDGE GRAPH & DECISION TREE',
    batchWarn: '',
    kgChapters: [Object.assign({}, chapter.kg, { _tabLabel: fullTab, _tabTitleFull: fullTab })],
    dtChapters: [chapter.dt],
    metaChapters: [{ winSync: chapter.winSync, mapping: chapter.mapping, strategy: chapter.strategy }],
  };
}

function buildFullBatchWarn(meta, okCount) {
  if (meta.failedChapters?.length) {
    const failedLabels = meta.failedChapters.map(n => `关卡 ${n}`);
    return `（部分关卡结构未通过：${failedLabels.join('、')}）`;
  }
  if (meta.stats?.qualityFailed > 0 || meta.qualityFailedChapters?.length) {
    const qf = (meta.qualityFailedChapters || meta.stats?.qualityFailedChapters || [])
      .map(n => `关卡 ${n + 1}`);
    const passed = meta.stats?.qualityPassed ?? 0;
    const total = meta.stats?.passed ?? okCount;
    return `（结构 ${total}/${total} 关已入库；质量达标 ${passed}/${total}；未达标：${qf.join('、')}）`;
  }
  return '';
}

function buildFullPayload(chapters, meta = {}) {
  const ok = chapters.filter(c => c.ok && c.kg && c.dt).sort((a, b) => a.ch - b.ch);
  const title = (meta.title || ok[0]?.kg?.title || 'Agent A 完整图谱').trim();
  if (!ok.length) {
    return {
      ok: true,
      mode: 'full',
      title,
      headerTag: 'AGENT A · FULL GRAPH · KNOWLEDGE GRAPH & DECISION TREE',
      batchWarn: '（无可用章节，请查看 report.json）',
      kgChapters: [],
      dtChapters: [],
      metaChapters: [],
    };
  }
  return {
    ok: true,
    mode: 'full',
    title,
    headerTag: 'AGENT A · FULL GRAPH · KNOWLEDGE GRAPH & DECISION TREE',
    batchWarn: buildFullBatchWarn(meta, ok.length),
    kgChapters: ok.map((c, i) => Object.assign({}, c.kg, tabMeta(c, i))),
    dtChapters: ok.map(c => c.dt),
    metaChapters: ok.map(c => ({ winSync: c.winSync, mapping: c.mapping, strategy: c.strategy })),
  };
}

function readJsonFile(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function loadGraphPreviewPayload(graphId) {
  const id = String(graphId || '').trim();
  if (!id) return { ok: false, error: 'graphId_required' };

  const packageId = resolvePackageId(id);
  const root = getPackagesRoot();
  const dir = path.join(root, packageId);
  const chaptersPath = path.join(dir, 'chapters.json');
  const chapterPath = path.join(dir, 'chapter.json');
  const metaPath = path.join(dir, 'meta.json');
  const meta = readJsonFile(metaPath) || {};

  if (fs.existsSync(chaptersPath)) {
    const chapters = readJsonFile(chaptersPath);
    if (!Array.isArray(chapters)) {
      return { ok: false, error: 'invalid_chapters_json', graphId: id };
    }
    return buildFullPayload(chapters, meta);
  }

  if (fs.existsSync(chapterPath)) {
    const chapter = readJsonFile(chapterPath);
    if (!chapter?.kg || !chapter?.dt) {
      return { ok: false, error: 'chapter_not_found', graphId: id };
    }
    return buildSinglePayload(chapter, meta);
  }

  return { ok: false, error: 'graph_not_found', graphId: id };
}

module.exports = {
  loadGraphPreviewPayload,
  buildSinglePayload,
  buildFullPayload,
};

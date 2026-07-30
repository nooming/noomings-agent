/**
 * Agent A 图谱生成 UI（教师工作台 Agent 工具 Tab）
 */
(function (global) {
  const API = location.origin + '/api/generate-graph';
  const PROJECT_API = location.origin + '/api/create-graph-project';
  const APPEND_API = location.origin + '/api/append-graph-chapter';
  const GRAPHS_API = location.origin + '/api/generated-graphs';
  const PROJECT_STORAGE_KEY = 'nus-graph-project-id';

  let initialized = false;
  let opts = {};
  let lastPromptBundle = null;
  let lastChapter = null;
  let lastQualityOk = false;
  let generationInProgress = false;
  let lastSavedGraph = null;

  function isDesignMode() {
    return document.getElementById('modeDesign')?.checked;
  }

  const PREVIEW_HINT_DESIGN = '生成后可打开独立预览；仅需离线包请用导出。';
  const PREVIEW_HINT_ANALYZE = '生成后可「打开独立预览」；离线包请用「导出」。多关卡将自动拼合为多关图谱；单章追加请用「追加到多关图谱」。';
  const ADVANCED_HINT_DESIGN = '留空将由 Agent A 根据知识点自动补全。';
  const ADVANCED_HINT_ANALYZE = '留空将由 Agent A 根据源码自动推断。';

  function syncGenModeUi() {
    const design = isDesignMode();
    const designPanel = document.getElementById('designPanel');
    const analyzePanel = document.getElementById('analyzePanel');
    if (designPanel) designPanel.style.display = design ? 'block' : 'none';
    if (analyzePanel) analyzePanel.style.display = design ? 'none' : 'block';
    const singleRow = document.getElementById('singleLevelRow');
    if (singleRow) singleRow.style.display = design ? 'none' : '';
    document.querySelectorAll('.agent-mode-tab').forEach(tab => {
      const active = tab.dataset.mode === (design ? 'design' : 'analyze');
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    const goFull = document.getElementById('goDesignFull');
    const go = document.getElementById('go');
    if (goFull) goFull.style.display = design ? '' : 'none';
    if (go) {
      go.style.display = '';
      go.classList.toggle('edu-btn-primary', !design);
      go.classList.toggle('edu-btn-outline', design);
      go.textContent = design ? '仅生成图谱' : '生成图谱';
    }
    const appendPanel = document.getElementById('projectAppendPanel');
    const saveToProject = document.getElementById('saveToProject');
    const generateGameHtml = document.getElementById('generateGameHtml');
    if (appendPanel) appendPanel.style.display = design ? 'none' : '';
    if (saveToProject) saveToProject.style.display = design ? 'none' : '';
    if (generateGameHtml) generateGameHtml.style.display = design ? 'none' : '';
    const advancedHint = document.getElementById('advancedHint');
    if (advancedHint) {
      advancedHint.textContent = design ? ADVANCED_HINT_DESIGN : ADVANCED_HINT_ANALYZE;
    }
    const previewHint = document.getElementById('previewHint');
    if (previewHint) {
      previewHint.textContent = design ? PREVIEW_HINT_DESIGN : PREVIEW_HINT_ANALYZE;
    }
  }

  function setGenMode(mode) {
    const analyze = document.getElementById('modeAnalyze');
    const design = document.getElementById('modeDesign');
    if (mode === 'design') {
      if (design) design.checked = true;
    } else if (analyze) {
      analyze.checked = true;
    }
    syncGenModeUi();
  }

  function getUiCopy() {
    const AgentCopy = global.AgentCopy || { fmt: { fail: msg => '失败：' + msg }, previewHintA: '', downloadReadyHintOk: '', downloadReadyHintQcFail: '' };
    return {
      formatDetectionSource(src) {
        if (!src) return '';
        const map = {
          configArray: 'config',
          selectOptions: 'select',
          branchSwitch: 'branch',
          uiTotal: 'ui',
        };
        return src.split('+').map(s => map[s] || s).join('+');
      },
      filesSelected: n => '已选 ' + n + ' 个文件',
      tierRecognized: (label, levels, detectionSource) => {
        let line = '项目：' + label + ' · 通用管线';
        if (levels?.length >= 2) {
          line += ' · 检测到 ' + levels.length + ' 关';
          const srcLabel = getUiCopy().formatDetectionSource(detectionSource);
          if (srcLabel) line += '（' + srcLabel + '）';
          line += '：' + levels.map(l => l.slotName).join('、');
          if (levels.length > 8) line += '（关卡较多，生成耗时与 token 消耗较高）';
        }
        return line;
      },
      tierGenerated: (label, mode) => {
        const base = mode === 'project' ? '已生成项目图谱 · ' : '已生成 · 项目：';
        return base + label;
      },
      graphTitle: title => '图谱标题：' + title,
      genericHints: h => {
        const parts = ['约束与过关文案须来自上传源码；DT 须含 decision、retry、result；须含 strategy（Mermaid + routes）。'];
        if (h?.hasMultipleLevels && h.levelCount >= 2) {
          parts.push('检测到 ' + h.levelCount + ' 个关卡，生成时将自动拼合为多标签项目预览。');
        }
        if (h?.hasIrrelevant) parts.push('检测到可能含无关控件。');
        return parts.join(' ');
      },
      previewFailed: msg => '源码预览失败：' + msg,
      copyPromptOk: '已复制 LLM prompt 包到剪贴板',
      copyPromptFail: msg => '复制失败：' + msg,
      generating: '正在生成事理图谱（约 30–90 秒）…',
      generatingDesign: '设计模式：识别变量并生成事理图谱（约 30–90 秒）…',
      generatingMulti: n => '多关卡项目生成中（共 ' + n + ' 关，约 ' + n + '×60 秒）…',
      generatingKeepTab: '生成进行中，请保持本页打开直至完成。',
      leaveWhileGenerating: '生成进行中，离开本页将中断生成。',
      done: (attempts, teachRepair, dtRepair) => '生成完成 · 共 ' + attempts + ' 次'
        + (dtRepair ? ' · 含 DT 骨架补全' : '')
        + (teachRepair ? ' · 含教案层补全' : ''),
      inferredAll: ' · 未填项已自动推断',
      savedDraft: ' · 已保存草稿',
      savedDraftWeak: ' · 已保存预览草稿（质检未通过，仅供审阅）',
      notSaved: ' · 未保存草稿',
      saveDraftFailed: err => ' · 草稿保存失败：' + err,
      fail: AgentCopy.fmt.fail,
      linkPreview: id => '打开独立预览 · ' + (id || ''),
      linkPreviewDraft: id => '打开预览（未过质检）· ' + (id || ''),
      linkProjectPreview: (name, draft) => '打开项目预览（多标签）· ' + (name || '') + (draft ? '（含未过质检关卡）' : ''),
      linkProject: (name, replaced) => '打开项目预览 · ' + (name || '') + (replaced ? '（已覆盖）' : ''),
      projectPrompt: '项目名称',
      projectDefaultTitle: '网页游戏项目图谱',
      projectCreated: id => '已创建项目：' + id,
      projectCreateFail: msg => '新建项目失败：' + msg,
      projectSaved: (name, replaced, url) => '已写入项目 · 「' + name + '」' + (replaced ? '（覆盖）' : '') + '\n预览：' + url,
      projectSaveFail: msg => '保存到项目失败：' + msg,
      reportStructure: ok => '结构校验：' + (ok ? '通过' : '失败'),
      reportQuality: (ok, score) => '质量校验：' + (ok ? '通过' : '失败')
        + (score != null ? '（得分 ' + score + '）' : ''),
      reportStructureErrors: '结构问题：',
      reportQualityErrors: '质量问题：',
      reportChecklist: '--- 质量检查项 ---',
      reportSmokeTitle: '--- 虚拟轨迹自检 ---',
      reportFeasible: v => '虚拟轨迹可行：' + v,
      reportNotes: notes => '备注：' + notes.join('; '),
      reportSmokeHint: '完整过程评价请在「学情数据中心」对学生会话使用 Agent B 评判。',
      downloadHtmlPreparing: '正在打包预览 HTML…',
      downloadHtmlFail: msg => '导出失败：' + msg,
      downloadReadyHintOk: AgentCopy.downloadReadyHintOk,
      downloadReadyHintQcFail: AgentCopy.downloadReadyHintQcFail,
      previewHintText: AgentCopy.previewHintA,
    };
  }

  function setAgentMenuDisabled(menuEl, disabled) {
    if (!menuEl) return;
    menuEl.classList.toggle('is-disabled', disabled);
    if (disabled) menuEl.removeAttribute('open');
  }

  function updateDownloadButtons() {
    const hasStrategy = !!(lastChapter?.strategy?.mermaid?.trim());
    const dl = document.getElementById('downloadHtml');
    if (dl) dl.disabled = !lastChapter || !hasStrategy;
    const promptBtn = document.getElementById('copyPromptBundle');
    if (promptBtn) promptBtn.disabled = !lastPromptBundle?.markdown;
    const htmlGenBtn = document.getElementById('generateGameHtml');
    if (htmlGenBtn) htmlGenBtn.disabled = !lastChapter;
    setAgentMenuDisabled(document.getElementById('exportMenu'), !lastChapter);
  }

  function exportTitleForDownload() {
    return document.getElementById('title')?.value.trim()
      || lastChapter?.kg?.title?.trim()
      || 'generated-graph';
  }

  async function fetchGraphViewerAssets() {
    const base = location.origin;
    const paths = [
      '/static/viewer/js/strategy-mermaid-theme.js',
      '/static/shared/strategy-mermaid-parse.js',
      '/static/shared/strategy-priority-mermaid.js',
      '/static/viewer/js/viewer.js',
      '/static/viewer/js/graph-shell.css',
    ];
    const res = await Promise.all(paths.map(p => fetch(base + p)));
    if (res.some(r => !r.ok)) {
      throw new Error('无法加载图谱脚本（含策略全景依赖）');
    }
    const texts = await Promise.all(res.map(r => r.text()));
    return {
      viewerJs: texts.slice(0, 4).join('\n'),
      graphCss: texts[4],
    };
  }

  const ERROR_ZH = {
    'dt needs at least 1 result': '决策树缺少过关节点（t:"result"）',
    'dt needs at least 1 retry branch': '决策树缺少重试分支（t:"retry"）',
    'dt needs at least 1 decision': '决策树缺少判定节点（t:"decision"）',
    'dt.tree missing': '缺少 dt.tree',
    'winSync.title missing': '缺少 winSync.title',
    'mapping must be non-empty string': 'mapping 不能为空',
  };

  function translateErrors(errors) {
    return (errors || []).map(e => {
      const key = Object.keys(ERROR_ZH).find(k => String(e).includes(k));
      return key ? ERROR_ZH[key] + '（' + e + '）' : e;
    });
  }

  function setGenerationInProgress(on) {
    generationInProgress = !!on;
  }

  function resolveChForRequest() {
    return null;
  }

  function showPublishShortcut(saved) {
    const btn = document.getElementById('goPublishTask');
    if (!btn || !saved?.id) {
      if (btn) btn.hidden = true;
      lastSavedGraph = null;
      return;
    }
    const title = document.getElementById('title')?.value.trim()
      || saved.title
      || lastChapter?.kg?.title?.trim()
      || saved.id;
    lastSavedGraph = { graphId: saved.id, title };
    btn.hidden = false;
    opts.onGraphSaved?.(lastSavedGraph);
  }

  async function refreshTierPreview() {
    const UI_COPY = getUiCopy();
    const tp = document.getElementById('tierPreview');
    const hp = document.getElementById('hintsPreview');
    if (!global._sources?.length) {
      if (tp) tp.style.display = 'none';
      if (hp) hp.style.display = 'none';
      return;
    }
    try {
      const r = await fetch(location.origin + '/api/preview-hints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sources: global._sources, ch: resolveChForRequest() }),
      });
      const j = await r.json();
      if (!j.ok || !j.gameHints) throw new Error(j.error || 'preview failed');
      const h = j.gameHints;
      global._resolvedHints = h;
      if (tp) {
        tp.style.display = 'block';
        tp.textContent = UI_COPY.tierRecognized(
          h.chLabel || '未知',
          j.detectedLevels || h.levels,
          h.detectionSource,
        );
      }
      if (hp) {
        hp.style.display = 'block';
        hp.textContent = UI_COPY.genericHints(h);
      }
    } catch (e) {
      if (tp) {
        tp.style.display = 'block';
        tp.textContent = UI_COPY.previewFailed(e.message);
      }
    }
  }

  async function addFiles(list) {
    const UI_COPY = getUiCopy();
    if (!global._sources) global._sources = [];
    for (const f of list) {
      const rel = f.webkitRelativePath || f.name;
      global._sources.push({ path: rel.replace(/\\/g, '/'), content: await f.text() });
    }
    const fl = document.getElementById('fileList');
    if (fl) {
      fl.textContent = global._sources.length
        ? UI_COPY.filesSelected(global._sources.length) : '';
    }
    await refreshTierPreview();
  }

  function slotNameForRequest() {
    const raw = document.getElementById('slotName')?.value.trim();
    if (raw) return raw;
    return document.getElementById('title')?.value.trim();
  }

  async function refreshSlotNameList() {
    const list = document.getElementById('slotNameList');
    if (!list) return;
    list.innerHTML = '';
    const pid = currentProjectId();
    if (!pid) return;
    try {
      const r = await fetch(location.origin + '/output/' + encodeURIComponent(pid) + '/chapters.json');
      if (!r.ok) return;
      const chapters = await r.json();
      const names = new Set();
      (chapters || []).forEach(c => {
        const n = c.slotName || c.title;
        if (n && String(n).trim()) names.add(String(n).trim());
      });
      names.forEach(n => {
        const o = document.createElement('option');
        o.value = n;
        list.appendChild(o);
      });
    } catch (e) {
      console.warn('refreshSlotNameList', e);
    }
  }

  function currentProjectId() {
    return document.getElementById('projectSelect')?.value || '';
  }

  function updateSaveToProjectBtn() {
    const btn = document.getElementById('saveToProject');
    if (btn) btn.disabled = !lastChapter || !lastQualityOk || !currentProjectId();
  }

  async function loadProjectList(selectProjectId) {
    const sel = document.getElementById('projectSelect');
    if (!sel) return;
    try {
      const r = await fetch(GRAPHS_API);
      const j = await r.json();
      const items = (j.items || []).filter(i => i.mode === 'incremental');
      sel.innerHTML = '<option value="">— 请选择或新建 —</option>';
      items.forEach(i => {
        const o = document.createElement('option');
        o.value = i.id;
        o.textContent = (i.title || i.id) + (i.stats ? ' · ' + i.stats.passed + ' 关' : '');
        sel.appendChild(o);
      });
      if (selectProjectId && items.some(i => i.id === selectProjectId)) {
        sel.value = selectProjectId;
      } else {
        sel.value = '';
      }
    } catch (e) {
      console.warn('load projects', e);
    }
    await refreshSlotNameList();
    updateSaveToProjectBtn();
  }

  function renderAnalyzeSteps(steps) {
    const panel = document.getElementById('analyzeStepsPanel');
    const list = document.getElementById('analyzeStepsList');
    if (!panel || !list) return;
    if (!steps?.length) {
      panel.hidden = true;
      list.innerHTML = '';
      return;
    }
    panel.hidden = false;
    list.innerHTML = steps.map(s => {
      const cls = s.status === 'done' ? 'is-done' : (s.status === 'warn' ? 'is-warn' : 'is-pending');
      return `<li class="analyze-step ${cls}"><span class="analyze-step-label">${s.label || s.id}</span><span class="analyze-step-summary">${s.summary || ''}</span></li>`;
    }).join('');
  }

  async function loadAnalyzePackageOptions() {
    const sel = document.getElementById('analyzePackageSelect');
    if (!sel) return;
    try {
      const r = await fetch('/static/packages/manifest.json');
      if (!r.ok) return;
      const manifest = await r.json();
      for (const s of manifest.samples || []) {
        const o = document.createElement('option');
        o.value = s.id;
        o.textContent = `${s.id} · ${s.topic || ''}`;
        sel.appendChild(o);
      }
    } catch (e) {
      console.warn('loadAnalyzePackageOptions', e);
    }
  }

  async function loadPackageSourceForAnalyze(packageId) {
    const UI_COPY = getUiCopy();
    const st = document.getElementById('status');
    if (!packageId) return;
    if (st) st.textContent = '正在加载探究包源码…';
    const r = await fetch('/api/platform/package-source?packageId=' + encodeURIComponent(packageId));
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'load failed');
    global._sources = [{ path: j.path || 'game.html', content: j.content }];
    const fl = document.getElementById('fileList');
    if (fl) fl.textContent = UI_COPY.filesSelected(1) + '（' + packageId + '）';
    await refreshTierPreview();
    if (st) st.textContent = '已加载 ' + packageId + '/game.html，可点「生成图谱」。';
  }

  function showReport(data) {
    const UI_COPY = getUiCopy();
    const el = document.getElementById('report');
    if (!el) return;
    el.style.display = 'block';
    const lines = [];

    if (data.mode === 'project' && data.levelResults?.length) {
      lines.push('模式：多关卡项目图谱（' + (data.stats?.passed || 0) + '/' + data.levelResults.length + ' 关成功）');
      if (data.timings) {
        lines.push('耗时：LLM ' + (data.timings.llmCalls || 0) + ' 次 · '
          + Math.round((data.timings.totalMs || 0) / 1000) + 's'
          + (data.levelConcurrency ? ' · 并发 ' + data.levelConcurrency : ''));
      }
      data.levelResults.forEach(r => {
        const vOk = !!r.validation?.ok;
        const qOk = !!r.quality?.ok;
        const tag = r.failed ? '失败' : (r.draftOnly ? '草稿' : '通过');
        lines.push('· ' + r.slotName + '：结构' + (vOk ? '✓' : '✗') + ' 质量' + (qOk ? '✓' : '✗') + ' [' + tag + ']');
        if (!vOk && r.validation?.errors?.length) {
          lines.push('  ' + translateErrors(r.validation.errors).join('; '));
        }
        if (!qOk && (r.qualityErrors?.length || r.quality?.errors?.length)) {
          lines.push('  质量：' + translateErrors(r.qualityErrors || r.quality.errors).join('; '));
        }
        const checklist = r.qualityChecklist || r.quality?.checklist;
        if (!qOk && checklist) {
          const failedItems = Object.entries(checklist).filter(([, v]) => !v).map(([k]) => k);
          if (failedItems.length) lines.push('  未过项：' + failedItems.join(', '));
        }
      });
      el.textContent = lines.join('\n');
      lastQualityOk = !!(data.stats?.passed > 0 && data.levelResults.some(r => r.quality?.ok));
      lastChapter = data.levelResults.find(r => r.saved && !r.failed)?.chapter || null;
      updateSaveToProjectBtn();
      return;
    }

    lines.push(UI_COPY.reportStructure(!!data.validation?.ok));
    if (data.validation?.errors?.length) {
      lines.push(UI_COPY.reportStructureErrors);
      lines.push(translateErrors(data.validation.errors).join('\n'));
      if (!data.validation.ok) {
        lines.push('提示：检查 DT 是否含 decision / retry / result；失败时系统会自动尝试 DT 骨架补全。');
      }
    }
    lines.push(UI_COPY.reportQuality(!!data.quality?.ok, data.quality?.score));
    if (data.quality?.errors?.length) {
      lines.push(UI_COPY.reportQualityErrors);
      lines.push(translateErrors(data.quality.errors).join('\n'));
    }
    if (data.quality?.checklist) {
      lines.push('\n' + UI_COPY.reportChecklist);
      Object.entries(data.quality.checklist).forEach(([k, v]) => lines.push((v ? '✓' : '✗') + ' ' + k));
    }
    if (data.timings) {
      lines.push('\n耗时：LLM ' + (data.timings.llmCalls || 0) + ' 次 · '
        + Math.round((data.timings.totalMs || data.timings.llmMs || 0) / 1000) + 's');
    }
    if (data.feasible != null || data.notes?.length) {
      lines.push('\n' + UI_COPY.reportSmokeTitle);
      if (data.feasible != null) lines.push(UI_COPY.reportFeasible(data.feasible));
      if (data.notes?.length) lines.push(UI_COPY.reportNotes(data.notes));
      lines.push(UI_COPY.reportSmokeHint);
    }
    el.textContent = lines.join('\n');
    lastQualityOk = !!(data.validation?.ok && data.quality?.ok);
    updateSaveToProjectBtn();
  }

  function applySavedDraftLink(saved, saveError) {
    const UI_COPY = getUiCopy();
    const link = document.getElementById('openSaved');
    const hint = document.getElementById('previewHint');
    if (saved?.viewUrl) {
      const fullUrl = location.origin + saved.viewUrl;
      if (link) {
        link.href = fullUrl;
        if (saved.project) {
          link.textContent = UI_COPY.linkProjectPreview(saved.id, saved.draftOnly);
        } else {
          link.textContent = saved.draftOnly
            ? UI_COPY.linkPreviewDraft(saved.id)
            : UI_COPY.linkPreview(saved.id);
        }
        link.style.display = 'inline';
      }
      if (hint) {
        hint.style.display = 'block';
        hint.textContent = UI_COPY.previewHintText;
      }
      showPublishShortcut(saved);
      return { fullUrl, autosaved: true, draftOnly: !!saved.draftOnly };
    }
    if (link) link.style.display = 'none';
    if (hint) hint.style.display = 'none';
    document.getElementById('goPublishTask')?.setAttribute('hidden', '');
    lastSavedGraph = null;
    if (saveError) return { autosaved: false, saveError };
    return { autosaved: false };
  }

  async function doGenerate(chOverride) {
    const UI_COPY = getUiCopy();
    const st = document.getElementById('status');
    const btn = document.getElementById('go');
    const design = isDesignMode();
    if (!design && !global._sources?.length) {
      if (st) st.textContent = '请先上传源码文件或选择文件夹。';
      return null;
    }
    if (design && !document.getElementById('knowledgePoints')?.value.trim()) {
      if (st) st.textContent = '设计模式请填写实验知识点。';
      return null;
    }
    const chReq = chOverride !== undefined ? chOverride : resolveChForRequest();
    if (typeof chReq === 'number') global._gameCh = chReq;
    if (btn) btn.disabled = true;
    setGenerationInProgress(true);
    const hints = global._resolvedHints;
    const multi = !design && hints?.hasMultipleLevels && !document.getElementById('singleLevel')?.checked;
    if (st) {
      st.textContent = (design
        ? UI_COPY.generatingDesign
        : (multi && hints.levelCount >= 2
          ? UI_COPY.generatingMulti(hints.levelCount)
          : UI_COPY.generating)) + ' ' + UI_COPY.generatingKeepTab;
    }
    try {
      const payload = {
        mode: design ? 'design' : 'analyze',
        ch: chReq,
        title: document.getElementById('title')?.value.trim(),
        hint: document.getElementById('hint')?.value.trim(),
        teachingObjectives: document.getElementById('teachingObjectives')?.value.trim(),
        singleLevel: document.getElementById('singleLevel')?.checked,
      };
      if (design) {
        payload.knowledgePoints = document.getElementById('knowledgePoints').value.trim();
      } else {
        payload.sources = global._sources;
      }
      const r = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || j.message);
      lastChapter = j.chapter || (j.levelResults?.find(r => r.saved)?.chapter ?? null);
      lastPromptBundle = j.promptBundle || null;
      if (j.gameHints) {
        global._resolvedHints = j.gameHints;
        const tp = document.getElementById('tierPreview');
        if (tp) {
          tp.style.display = 'block';
          let tierLine = UI_COPY.tierGenerated(
            j.gameHints?.projectTitle || j.gameHints?.chLabel || j.inquiryDraft?.title || '未知',
            j.mode,
          );
          if (j.detectedLevels?.length >= 2) {
            tierLine += ' · ' + j.detectedLevels.length + ' 关';
          }
          const ic = j.inferredContext;
          if (ic && !ic.titleProvided && ic.kgTitle) {
            tierLine += ' · ' + UI_COPY.graphTitle(ic.kgTitle);
          }
          tp.textContent = tierLine;
        }
      }
      showReport(j);
      renderAnalyzeSteps(j.analyzeSteps);
      let statusLine = j.mode === 'project'
        ? '项目生成完成 · ' + (j.stats?.passed || 0) + '/' + (j.levelResults?.length || 0) + ' 关'
        : UI_COPY.done(j.attempts, j.teachRepairUsed, j.dtRepairUsed);
      const ic = j.inferredContext;
      if (ic && !ic.titleProvided && !ic.hintProvided && !ic.teachingObjectivesProvided) {
        statusLine += UI_COPY.inferredAll;
      }
      const draftLink = applySavedDraftLink(j.saved, j.saveError);
      if (draftLink.fullUrl) {
        statusLine += draftLink.draftOnly ? UI_COPY.savedDraftWeak : UI_COPY.savedDraft;
      } else if (j.saveError) {
        statusLine += UI_COPY.saveDraftFailed(j.saveError);
      } else if (!draftLink.autosaved && j.chapter) {
        statusLine += UI_COPY.notSaved;
      }
      if (j.chapter) {
        statusLine += draftLink.fullUrl
          ? (draftLink.draftOnly ? UI_COPY.downloadReadyHintQcFail : UI_COPY.downloadReadyHintOk)
          : UI_COPY.downloadReadyHintQcFail;
      }
      if (st) st.textContent = statusLine;
      updateDownloadButtons();
      return j;
    } catch (e) {
      if (st) st.textContent = UI_COPY.fail(e.message);
      return null;
    } finally {
      setGenerationInProgress(false);
      if (btn) btn.disabled = false;
    }
  }

  async function doDesignFull() {
    if (!isDesignMode()) setGenMode('design');
    const st = document.getElementById('status');
    const btn = document.getElementById('goDesignFull');
    const goBtn = document.getElementById('go');
    if (btn) btn.disabled = true;
    if (goBtn) goBtn.disabled = true;
    try {
      const graph = await doGenerate();
      if (!graph?.ok || !graph.chapter) return;
      const saved = graph.saved;
      if (!saved?.id) {
        if (st) {
          st.textContent = graph.saveError
            ? `图谱未保存：${graph.saveError}`
            : '图谱未保存，无法继续生成游戏';
        }
        return;
      }
      if (st) st.textContent = '图谱已生成，DeepSeek 正在写游戏 HTML…（约 1–3 分钟）';
      const title = document.getElementById('title')?.value.trim()
        || graph.inquiryDraft?.title
        || graph.chapter?.kg?.title
        || saved.id;
      const r = await fetch('/api/generate-game-html', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chapter: graph.chapter,
          title,
          promptBundle: graph.promptBundle || lastPromptBundle,
          save: true,
          graphId: saved.id,
        }),
      });
      const html = await r.json();
      if (!html.ok) throw new Error(html.error || 'HTML 生成失败');
      if (!html.playUrl) throw new Error('未返回游戏 URL');
      const publishPayload = {
        graphId: saved.id,
        title,
        playUrl: html.playUrl,
        description: document.getElementById('hint')?.value.trim() || graph.inquiryDraft?.topic || '',
      };
      lastSavedGraph = publishPayload;
      if (st) st.textContent = `全流程完成 · 图谱 ${saved.id} · 游戏已生成，正在打开发布页…`;
      opts.onGoPublish?.(publishPayload);
    } catch (e) {
      if (st) st.textContent = '一键流程失败：' + e.message;
    } finally {
      if (btn) btn.disabled = false;
      if (goBtn) goBtn.disabled = false;
    }
  }

  function closeAgentMenus() {
    document.getElementById('exportMenu')?.removeAttribute('open');
  }

  function bindEvents() {
    document.getElementById('modeAnalyze')?.addEventListener('change', syncGenModeUi);
    document.getElementById('modeDesign')?.addEventListener('change', syncGenModeUi);
    // Event delegation: tabs remain clickable even if DOM is re-synced; do not
    // force analyze here — HTML default + any early user click must be preserved.
    document.querySelector('#panel-agents .agent-mode-tabs')?.addEventListener('click', e => {
      const tab = e.target.closest('.agent-mode-tab');
      if (!tab || tab.disabled) return;
      setGenMode(tab.dataset.mode);
    });
    syncGenModeUi();
    loadAnalyzePackageOptions();

    global._sources = global._sources || [];

    window.addEventListener('beforeunload', e => {
      if (!generationInProgress) return;
      e.preventDefault();
      e.returnValue = getUiCopy().leaveWhileGenerating;
    });

    document.getElementById('loadAnalyzePackage')?.addEventListener('click', async () => {
      const pid = document.getElementById('analyzePackageSelect')?.value;
      if (!pid) {
        const st = document.getElementById('status');
        if (st) st.textContent = '请先选择探究包。';
        return;
      }
      try {
        await loadPackageSourceForAnalyze(pid);
      } catch (e) {
        const st = document.getElementById('status');
        if (st) st.textContent = getUiCopy().fail(e.message);
      }
    });

    const filesEl = document.getElementById('files');
    if (filesEl) {
      filesEl.onchange = async e => { global._sources = []; await addFiles(e.target.files); };
    }
    document.getElementById('pickFolder')?.addEventListener('click', () => document.getElementById('folder')?.click());
    const folderEl = document.getElementById('folder');
    if (folderEl) {
      folderEl.onchange = async e => { global._sources = []; await addFiles(e.target.files); };
    }

    document.getElementById('projectSelect')?.addEventListener('change', async () => {
      const id = currentProjectId();
      if (id) localStorage.setItem(PROJECT_STORAGE_KEY, id);
      await refreshSlotNameList();
      updateSaveToProjectBtn();
    });
    document.getElementById('refreshProjects')?.addEventListener('click', () => loadProjectList());
    document.getElementById('newProject')?.addEventListener('click', async () => {
      const UI_COPY = getUiCopy();
      const title = prompt(UI_COPY.projectPrompt, document.getElementById('title')?.value.trim() || UI_COPY.projectDefaultTitle);
      if (title == null) return;
      try {
        const r = await fetch(PROJECT_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: title.trim() || UI_COPY.projectDefaultTitle }),
        });
        const j = await r.json();
        if (!j.ok) throw new Error(j.error || 'create failed');
        await loadProjectList(j.projectId);
        localStorage.setItem(PROJECT_STORAGE_KEY, j.projectId);
        const link = document.getElementById('openSaved');
        if (link) {
          link.href = j.viewUrl;
          link.textContent = UI_COPY.linkProject(j.projectId, false);
          link.style.display = 'inline';
        }
        alert(UI_COPY.projectCreated(j.projectId));
        updateSaveToProjectBtn();
      } catch (e) {
        alert(UI_COPY.projectCreateFail(e.message));
      }
    });

    document.getElementById('go')?.addEventListener('click', () => doGenerate());
    document.getElementById('goDesignFull')?.addEventListener('click', () => doDesignFull());

    document.getElementById('copyPromptBundle')?.addEventListener('click', async () => {
      const UI_COPY = getUiCopy();
      const st = document.getElementById('status');
      const text = lastPromptBundle?.markdown;
      if (!text) {
        if (st) st.textContent = UI_COPY.copyPromptFail('无 prompt 包，请先生成图谱');
        return;
      }
      try {
        await navigator.clipboard.writeText(text);
        if (st) st.textContent = UI_COPY.copyPromptOk;
      } catch (e) {
        if (st) st.textContent = UI_COPY.copyPromptFail(e.message);
      }
    });

    document.getElementById('generateGameHtml')?.addEventListener('click', async () => {
      const st = document.getElementById('status');
      const btn = document.getElementById('generateGameHtml');
      if (!lastChapter) {
        if (st) st.textContent = '请先生成图谱';
        return;
      }
      if (btn) btn.disabled = true;
      if (st) st.textContent = 'DeepSeek 正在生成 HTML…（约 1–3 分钟）';
      try {
        const r = await fetch('/api/generate-game-html', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chapter: lastChapter,
            title: document.getElementById('title')?.value.trim() || lastChapter.kg?.title,
            promptBundle: lastPromptBundle,
            save: true,
            graphId: lastSavedGraph?.graphId,
          }),
        });
        const j = await r.json();
        if (!j.ok) throw new Error(j.error || 'generate failed');
        if (st) {
          st.textContent = j.playUrl
            ? `HTML 已生成 · ${j.playUrl}`
            : 'HTML 已生成（未落盘）';
        }
        if (j.playUrl) window.open(j.playUrl, '_blank');
      } catch (e) {
        if (st) st.textContent = 'HTML 生成失败：' + e.message;
      } finally {
        if (btn) btn.disabled = false;
        updateDownloadButtons();
      }
    });

    document.getElementById('saveToProject')?.addEventListener('click', async () => {
      const UI_COPY = getUiCopy();
      if (!lastChapter || !currentProjectId()) return;
      const btn = document.getElementById('saveToProject');
      if (btn) btn.disabled = true;
      try {
        const r = await fetch(APPEND_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: currentProjectId(),
            slotName: slotNameForRequest(),
            chapter: lastChapter,
            title: document.getElementById('title')?.value.trim(),
            sources: global._sources,
          }),
        });
        const j = await r.json();
        if (!j.ok) throw new Error(j.errors?.join('; ') || j.error || 'append failed');
        const link = document.getElementById('openSaved');
        if (link) {
          link.href = j.viewUrl;
          link.textContent = UI_COPY.linkProject(j.slotName, j.replaced);
          link.style.display = 'inline';
        }
        await loadProjectList();
        await refreshSlotNameList();
        alert(UI_COPY.projectSaved(j.slotName || '', j.replaced, j.viewUrl));
      } catch (e) {
        alert(UI_COPY.projectSaveFail(e.message));
      }
      updateSaveToProjectBtn();
    });

    document.getElementById('downloadHtml')?.addEventListener('click', async () => {
      const UI_COPY = getUiCopy();
      if (!lastChapter || !global.GraphExport) {
        alert(UI_COPY.downloadHtmlFail('导出模块未加载'));
        return;
      }
      if (!lastChapter.strategy?.mermaid?.trim()) {
        alert(UI_COPY.downloadHtmlFail('本章缺少 strategy.mermaid，无法导出策略全景'));
        return;
      }
      const st = document.getElementById('status');
      const btn = document.getElementById('downloadHtml');
      const prev = st?.textContent;
      if (btn) btn.disabled = true;
      if (st) st.textContent = UI_COPY.downloadHtmlPreparing;
      try {
        const assets = await fetchGraphViewerAssets();
        global.GraphExport.downloadStandaloneGraphHtml({
          chapter: lastChapter,
          title: exportTitleForDownload(),
          viewerJs: assets.viewerJs,
          graphCss: assets.graphCss,
          filename: global.GraphExport.slugifyFilename(exportTitleForDownload()),
        });
        closeAgentMenus();
        if (st) st.textContent = prev;
      } catch (e) {
        if (st) st.textContent = prev;
        alert(UI_COPY.downloadHtmlFail(e.message));
      }
      updateDownloadButtons();
    });

    document.getElementById('goPublishTask')?.addEventListener('click', () => {
      if (lastSavedGraph) opts.onGoPublish?.(lastSavedGraph);
    });

    loadProjectList();
  }

  function init(options = {}) {
    if (initialized) return;
    initialized = true;
    opts = options;
    bindEvents();
  }

  global.AgentGenerate = {
    init,
    setMode: setGenMode,
    getLastSavedGraph: () => lastSavedGraph,
  };
})(typeof window !== 'undefined' ? window : global);

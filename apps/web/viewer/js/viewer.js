/* GraphViewer — shared KG/DT renderer */
const GraphViewer = (function () {
  let KG_CHAPTERS = [], DT_CHAPTERS = [], metaChapters = [];
  let currentCh = 0, currentView = 'strategy', kgFilter = 'all';
  let simulation, nodeG, linkG, zoomBeh, gRoot, svgEl, d3svg;
  let mermaidReady = false, mermaidLoadPromise = null, strategyRenderId = 0, activeStrategyRouteId = null;
  let strategyZoomBeh = null, strategyResizeTimer = null;
  let lastKgNodes = null, lastKgLinks = null, pendingRouteId = null;
  let lastStrategyDisplayMermaid = '';

  function isStudentAudience() {
    if (typeof window !== 'undefined' && window.__GRAPH_AUDIENCE__ === 'student') return true;
    if (typeof document !== 'undefined' && document.body?.dataset?.audience === 'student') return true;
    try {
      return new URLSearchParams(location.search).get('audience') === 'student';
    } catch {
      return false;
    }
  }
  const KG_COLORS = { premise:'#5577aa', operation:'#0d9488', method:'#2266bb', core:'#7744cc', result:'#228855', constraint:'#bb6622', junction:'#cc4488', irrelevant:'#888888' };
  const KG_NAMES = { premise:'已知前提', operation:'游玩操作', method:'推导步骤', core:'核心方程', result:'结果/目标', constraint:'约束条件', junction:'殊途同归', irrelevant:'无关变量' };
  const LAYER_NAMES = { play:'游玩子图', teach:'教案子图' };
  const DT_COLORS = { root:'#007baa', step:'#2266bb', core:'#7744cc', decision:'#aa6600', result:'#228855', retry:'#884433', junction:'#884488' };
  const DT_NAMES = { root:'问题根节点', step:'推导步骤', core:'核心方程/洞察', decision:'决策判断', result:'成功结果', retry:'死路/回退', junction:'路径汇合' };
  const KG_NODE_LEGEND_GROUPS = [
    { title: '游玩子图', items: [
      {color:'#5577aa',label:'已知前提'},{color:'#0d9488',label:'游玩操作'},
      {color:'#bb6622',label:'约束条件'},{color:'#228855',label:'结果/目标'},
    ]},
    { title: '教案子图', items: [
      {color:'#2266bb',label:'推导步骤',dashed:true},{color:'#7744cc',label:'核心方程',dashed:true},
      {color:'#cc4488',label:'殊途同归',dashed:true},
    ]},
    { title: null, items: [
      {color:'#888888',label:'无关变量',hollow:true},
    ]},
  ];
  const KG_LINK_LEGEND_GROUPS = [
    { title: '实线', items: [
      {color:'#6688aa',label:'前提进入'},{color:'#3388dd',label:'推导主链'},
      {color:'#8855cc',label:'关键结论'},{color:'#33aa66',label:'结果/目标'},
    ]},
    { title: null, items: [
      {color:'#dd66aa',label:'验证回扣',dashed:true},
    ]},
  ];
  const DT_LEGEND = [
    {color:'#007baa',label:'问题根节点'},{color:'#2266bb',label:'推导步骤'},
    {color:'#7744cc',label:'核心方程/洞察'},{color:'#aa6600',label:'决策判断',diamond:true},
    {color:'#228855',label:'成功结果'},{color:'#884433',label:'死路/回退'},{color:'#884488',label:'路径汇合'},
  ];
  const STRATEGY_COLOR_LEGEND = [
    { bg: '#e2e8f0', border: '#475569', label: '起点' },
    { bg: '#eff6ff', border: '#1d4ed8', label: '决策/判断' },
    { bg: '#fff7ed', border: '#ea580c', label: '核心分水岭' },
    { bg: '#fff7ed', border: '#ea580c', label: '偏出重试' },
    { bg: '#f8fafc', border: '#94a3b8', label: '流程步骤' },
    { bg: '#fef2f2', border: '#dc2626', label: '无效操作' },
    { bg: '#f0fdf4', border: '#16a34a', label: '成功解决' },
  ];
  const PRIORITY_LINE_LEGEND = [
    { cls: 'high', label: '高优（优先1）· 粗实线' },
    { cls: 'mid', label: '次优 · 中实线' },
    { cls: 'low', label: '较低优 · 细实线' },
    { cls: 'trap', label: '陷阱/盲调 · 虚线警示' },
    { cls: 'confound', label: '试探混淆 · 虚线旁路' },
  ];

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
function cssVarNum(name, fallback) {
  const v = parseFloat(cssVar(name));
  return Number.isFinite(v) ? v : fallback;
}
function dtLabelFill(type) {
  if (type === 'result') return cssVar('--dt-label-result');
  if (type === 'retry') return cssVar('--dt-label-retry');
  return cssVar('--dt-label');
}

function defaultTabLabel(ch, i) {
  const title = (ch.title || '').split('·')[0].trim();
  if (title) return title;
  return KG_CHAPTERS.length > 1 ? `第 ${i + 1} 关` : '草稿预览';
}

function buildTabs() {
  const container = document.getElementById('tabs');
  if (!container) return;
  container.innerHTML = '';
  const multi = KG_CHAPTERS.length > 1;
  container.style.display = multi ? '' : 'none';
  KG_CHAPTERS.forEach((ch, i) => {
    const btn = document.createElement('div');
    btn.className = 'tab' + (i===0?' active':'');
    const fullLabel = ch._tabTitleFull || ch._tabLabel || defaultTabLabel(ch, i);
    const compact = (typeof TabLabel !== 'undefined' && TabLabel.compactTabLabel)
      ? TabLabel.compactTabLabel(fullLabel, { fallbackIndex: i })
      : { short: fullLabel, full: fullLabel };
    btn.textContent = compact.short;
    if (compact.full && compact.full !== compact.short) btn.title = compact.full;
    btn.addEventListener('click', () => loadChapter(i));
    container.appendChild(btn);
  });
  syncStrategyTabVisibility();
}

function chapterHasStrategy(idx) {
  return !!(metaChapters[idx]?.strategy?.mermaid?.trim());
}

function syncStrategyTabVisibility() {
  const vt = document.getElementById('vt-strategy');
  const structWrap = document.querySelector('.view-struct-wrap');
  if (!vt) return;
  const show = chapterHasStrategy(currentCh);
  vt.style.display = show ? '' : 'none';
  if (structWrap) structWrap.style.display = '';
  if (!show && currentView === 'strategy') switchView('dt');
  else if (show && currentView !== 'strategy' && currentView !== 'kg' && currentView !== 'dt') {
    switchView('strategy');
  }
}

function priorityApi() {
  return (typeof StrategyPriorityMermaid !== 'undefined') ? StrategyPriorityMermaid : null;
}

function annotateDisplayMermaid(body, routes) {
  const api = priorityApi();
  if (api?.annotateStrategyMermaidPriority) {
    return api.annotateStrategyMermaidPriority(body, routes);
  }
  return body || '';
}

function setLegendTitle(text) {
  const el = document.getElementById('legend-title') || document.querySelector('#legend .ltitle');
  if (el) el.textContent = text;
}

function closeStructMenu() {
  const menu = document.getElementById('struct-menu');
  const btn = document.getElementById('btn-struct-toggle');
  menu?.classList.add('hidden');
  btn?.setAttribute('aria-expanded', 'false');
}

function toggleStructMenu() {
  const menu = document.getElementById('struct-menu');
  const btn = document.getElementById('btn-struct-toggle');
  if (!menu) return;
  const open = menu.classList.contains('hidden');
  menu.classList.toggle('hidden', !open);
  btn?.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function panelTitleForView(idx) {
  const meta = metaChapters[idx] || null;
  if (currentView === 'kg') return KG_CHAPTERS[idx].title;
  if (currentView === 'strategy') return meta?.strategy?.title || KG_CHAPTERS[idx].title;
  return DT_CHAPTERS[idx].title;
}
function panelSubForView(idx) {
  const meta = metaChapters[idx] || null;
  let sub;
  if (currentView === 'kg') sub = KG_CHAPTERS[idx].sub;
  else if (currentView === 'strategy') sub = meta?.strategy?.sub || '';
  else sub = DT_CHAPTERS[idx].sub;
  const winTitle = meta?.winSync?.title?.trim();
  const kgTitle = KG_CHAPTERS[idx]?.title?.trim();
  const winHint = winTitle && winTitle !== kgTitle ? ` · 过关：${winTitle}` : '';
  return sub + winHint;
}
function setGraphChrome() {
  const isStrategy = currentView === 'strategy';
  document.getElementById('svg')?.classList.toggle('hidden', isStrategy);
  document.getElementById('strategy-panel')?.classList.toggle('visible', isStrategy);
  document.getElementById('graph')?.classList.toggle('strategy-active', isStrategy);
  document.getElementById('gctrl')?.classList.toggle('strategy-mode', isStrategy);
  const legendTitle = document.getElementById('legend-title');
  if (legendTitle) {
    legendTitle.classList.toggle('hidden', currentView === 'kg');
    if (currentView !== 'kg') legendTitle.textContent = isStrategy ? '解题途径' : '节点类型';
  }
}

function ensureStrategyViewport() {
  const panel = document.getElementById('strategy-panel');
  if (!panel) return null;
  let viewport = document.getElementById('strategy-viewport');
  let mount = document.getElementById('strategy-mermaid');
  if (!viewport) {
    viewport = document.createElement('div');
    viewport.id = 'strategy-viewport';
    if (mount) {
      panel.insertBefore(viewport, mount);
      viewport.appendChild(mount);
    } else {
      mount = document.createElement('div');
      mount.id = 'strategy-mermaid';
      viewport.appendChild(mount);
      panel.appendChild(viewport);
    }
  }
  return viewport;
}

function bindStrategyZoom() {
  if (typeof d3 === 'undefined') return;
  ensureStrategyViewport();
  const viewport = d3.select('#strategy-viewport');
  const mount = document.getElementById('strategy-mermaid');
  if (!viewport.node() || !mount) return;
  if (!strategyZoomBeh) {
    strategyZoomBeh = d3.zoom()
      .scaleExtent([0.15, 2.5])
      .on('zoom', (event) => {
        mount.style.transform = `translate(${event.transform.x}px, ${event.transform.y}px) scale(${event.transform.k})`;
        mount.style.transformOrigin = '0 0';
      });
    viewport.call(strategyZoomBeh);
    viewport.on('dblclick.zoom', null);
  }
}

function getStrategySvgBBox() {
  const svg = document.querySelector('#strategy-mermaid svg');
  if (!svg) return null;
  try {
    const bb = svg.getBBox();
    if (bb.width > 0 && bb.height > 0) return bb;
  } catch (_) { /* ignore */ }
  const r = svg.getBoundingClientRect();
  if (r.width > 0 && r.height > 0) return { x: 0, y: 0, width: r.width, height: r.height };
  return null;
}

function fitStrategyToPanel() {
  if (typeof d3 === 'undefined') return;
  bindStrategyZoom();
  const panel = document.getElementById('strategy-panel');
  const viewport = d3.select('#strategy-viewport');
  const bbox = getStrategySvgBBox();
  if (!panel || !bbox || !strategyZoomBeh || !viewport.node()) return;

  const padX = 24;
  const padY = 24;
  const pw = panel.clientWidth - padX * 2;
  const ph = panel.clientHeight - padY * 2;
  if (pw <= 0 || ph <= 0) return;

  const k = Math.min(1, pw / bbox.width, ph / bbox.height);
  const tx = padX + (pw - bbox.width * k) / 2 - bbox.x * k;
  const ty = padY + (ph - bbox.height * k) / 2 - bbox.y * k;
  viewport.call(strategyZoomBeh.transform, d3.zoomIdentity.translate(tx, ty).scale(k));
}

function clearStrategyTransform() {
  const mount = document.getElementById('strategy-mermaid');
  if (mount) {
    mount.style.transform = '';
    mount.style.transformOrigin = '';
    mount.style.minWidth = '';
    mount.style.minHeight = '';
    mount.style.marginBottom = '';
  }
}

function resetStrategyScale() {
  fitStrategyToPanel();
}

function scheduleStrategyResizeFit() {
  if (currentView !== 'strategy') return;
  clearTimeout(strategyResizeTimer);
  strategyResizeTimer = setTimeout(() => fitStrategyToPanel(), 150);
}

function strategyGraphBgFill() {
  return cssVar('--bg-graph') || '#eef2f8';
}

function patchStrategyEdgeLabelBackground(svg) {
  if (!svg) return;
  const fill = strategyGraphBgFill();
  svg.querySelectorAll('.labelBkg rect, .edgeLabel rect').forEach(rect => {
    rect.setAttribute('fill', fill);
    rect.style.fill = fill;
  });
  svg.querySelectorAll('span.edgeLabel').forEach(span => {
    span.style.backgroundColor = fill;
    span.style.background = fill;
  });
  svg.querySelectorAll('g.edgeLabel foreignObject, g.edgeLabel foreignObject > div').forEach(el => {
    el.style.backgroundColor = fill;
    el.style.background = fill;
  });
}

function getStrategyEdgePathGroups(svg) {
  const edgePaths = svg.querySelector('g.edgePaths');
  if (!edgePaths) return [];
  return Array.from(edgePaths.children);
}

function getStrategyEdgeLabelGroups(svg) {
  const edgeLabels = svg.querySelector('g.edgeLabels');
  if (!edgeLabels) return [];
  return Array.from(edgeLabels.children);
}

function pathsInEdgeGroup(group) {
  if (!group) return [];
  if (group.tagName === 'path') return [group];
  return Array.from(group.querySelectorAll('path'));
}

function infoEmptyHtml() {
  if (currentView === 'strategy') {
    return '<div class="info-empty">← 点击左侧途径<br>查看教学说明</div>';
  }
  return '<div class="info-empty">← 点击节点<br>查看推导细节</div>';
}

function escText(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Match route → adjustmentVariable / confoundingVariable for teaching copy. */
function resolveRouteVarContext(route) {
  const meta = metaChapters[currentCh] || {};
  const script = meta.inquiryScript || {};
  const avs = script.adjustmentVariables || [];
  const cvs = script.confoundingVariables || [];
  const label = String(route?.label || '');
  const shortLab = label
    .replace(/^单变量[·•.]/, '')
    .replace(/^试探混淆[·•.]/, '')
    .replace(/\s*·\s*(优先\d+|陷阱|旁路).*$/u, '')
    .trim();

  const avHit = avs.find(a => {
    if (!a) return false;
    const lab = `单变量·${a.label || ''}`;
    if (lab === label || (a.label && label.includes(a.label))) return true;
    if (a.controlId && (route.id || '').includes(a.controlId)) return true;
    return !!(a.label && shortLab && (shortLab === a.label || shortLab.includes(a.label) || a.label.includes(shortLab)));
  }) || null;

  const cvHit = cvs.find(c => {
    if (!c) return false;
    if (c.controlId && /confound|probe|cv/i.test(String(route?.id || '')) && String(route.id).includes(c.controlId)) return true;
    if (c.label && (label.includes(c.label) || shortLab === c.label)) return true;
    if (c.controlId && String(route?.id || '').includes(c.controlId)) return true;
    return false;
  }) || null;

  return { avHit, cvHit, shortLab, avs, cvs };
}

function monoToneZh(m) {
  const key = String(m || '').toLowerCase();
  if (key === 'monotone' || key === 'mono') return '大致单调：拧同一方向，现象朝同一方向变';
  if (key === 'nonmonotone' || key === 'non-mono' || key === 'peak') return '非单调：中间可能有最佳区，两端都可能失败';
  if (key === 'unknown' || !m) return '';
  return String(m);
}

function buildRouteTeachingHtml(route) {
  const student = isStudentAudience();
  const nodes = KG_CHAPTERS[currentCh]?.nodes || [];
  const prioApi = priorityApi();
  const meta = prioApi?.routePriorityMeta ? prioApi.routePriorityMeta(route) : null;
  const { avHit, cvHit, shortLab } = resolveRouteVarContext(route);
  const score = meta?.score != null ? Number(meta.score).toFixed(2) : (route.score != null ? Number(route.score).toFixed(2) : null);

  let badge = '';
  let kindTitle = escText(route.label || '途径');
  if (meta?.confound) {
    badge = student
      ? '<span class="i-badge" style="background:#64748b">旁路试探</span>'
      : '<span class="i-badge route-badge-cv">试探混淆 · 旁路</span>';
  } else if (meta?.trap) {
    badge = '<span class="i-badge route-badge-trap">典型误区 · 盲调</span>';
  } else if (meta && meta.rank <= 20) {
    badge = student
      ? '<span class="i-badge layer-play">探究途径</span>'
      : `<span class="i-badge layer-play">优先 ${meta.rank}${score != null ? ` · 得分 ${score}` : ''}</span>`;
  } else if (route.warn === 'irrelevant') {
    badge = student
      ? '<span class="i-badge" style="background:#888">界面控件</span>'
      : '<span class="i-badge" style="background:#888">无关操作</span>';
  } else if (route.layer === 'teach') {
    badge = student
      ? '<span class="i-badge layer-play">探究途径</span>'
      : '<span class="i-badge layer-teach">教案途径</span>';
  } else {
    badge = '<span class="i-badge layer-play">探究途径</span>';
  }

  // 1) 调什么
  let adjustBlock = '';
  if (meta?.confound || route.kind === 'confoundProbe') {
    if (student) {
      const name = cvHit?.label || shortLab || '该控件';
      adjustBlock = `<p>本路径会拧到<strong>${escText(name)}</strong>。自己对照：拧了之后过关有没有变得更容易？</p>`;
    } else {
      const cvName = cvHit?.label || shortLab || '混淆控件';
      const ctrl = cvHit?.controlId ? `（控件 ${escText(cvHit.controlId)}）` : '';
      adjustBlock = `<p>本路径试探的是<strong>${escText(cvName)}</strong>${ctrl}。它通常是装饰/无关量，用来对照「拧了有没有用」。</p>`;
    }
  } else if (meta?.trap || /盲调|多参|trap/i.test(`${route.id || ''}${route.label || ''}`)) {
    adjustBlock = '<p>本路径会<strong>同时拧多个滑条</strong>，而不是每次只改一个变量。</p>';
  } else if (avHit) {
    const ctrl = (!student && avHit.controlId) ? `（控件 ${escText(avHit.controlId)}）` : '';
    adjustBlock = `<p>本路径主要调节：<strong>${escText(avHit.label || shortLab)}</strong>${ctrl}。建议每次只动这一个量，其它先固定。</p>`;
  } else {
    const name = shortLab || route.label || '该变量';
    adjustBlock = `<p>本路径关注：<strong>${escText(name)}</strong>。尽量单变量调节，便于归因。</p>`;
  }

  // 2) 为何优先 / 得分
  let whyBits = [];
  if (student) {
    if (meta?.confound) {
      whyBits.push('这是对照路径：用来检验某个控件是否真能帮你过关。');
    } else if (meta?.trap) {
      whyBits.push('同时拧多量时现象难归因；可对照「每次只改一项」的路径看看差异。');
    } else {
      whyBits.push('用控制变量法：固定其余，只改一项，观察结果是否跟着变。');
      if (avHit?.monotonicity) {
        const zh = monoToneZh(avHit.monotonicity);
        if (zh) whyBits.push(escText(zh));
      }
    }
  } else if (meta?.confound) {
    whyBits.push(`旁路得分约 <strong>${score ?? '0.15'}</strong>：故意压低，避免把混淆拧法当成「主策略」。`);
    if (cvHit?.reason) whyBits.push(escText(cvHit.reason));
    whyBits.push('教学用途：让学生自己发现「这个量几乎不帮过关」，再回到单变量主路径。');
  } else if (meta?.trap) {
    whyBits.push(`陷阱得分约 <strong>${score ?? '0.20'}</strong>：效率低、难归因，图谱里用虚线警示。`);
    whyBits.push('分数越低越不建议作为常规探究顺序；对比高优实线路径即可。');
  } else {
    if (meta?.rank != null) {
      whyBits.push(`优先序 <strong>${meta.rank}</strong>：数字越小越建议先试（优先 1 通常是最有信息量的单变量）。`);
    }
    if (score != null) {
      whyBits.push(`路径得分 <strong>${score}</strong>：越高表示越符合「先关键、易归因」的探究策略（不是考试分数）。`);
    }
    if (avHit?.monotonicity) {
      const zh = monoToneZh(avHit.monotonicity);
      if (zh) whyBits.push(`响应形态：${escText(zh)}。`);
    }
    if (avHit?.affects?.length) {
      whyBits.push(`主要牵动：${escText(avHit.affects.join('、'))}。`);
    }
    if (avHit?.notes) whyBits.push(escText(avHit.notes));
  }
  const whyBlock = whyBits.length
    ? whyBits.map(t => `<p>${t}</p>`).join('')
    : '<p>按图中线宽与颜色对比即可：粗实线优先，虚线为旁路或陷阱。</p>';

  // 3) 典型误区
  let trapBits = [];
  if (!student && route.warn && route.warn !== 'irrelevant') {
    trapBits.push(escText(route.warn));
  }
  if (meta?.confound) {
    trapBits.push(student
      ? '提示：若拧了很久却几乎看不到过关变化，可以换一个控件再试。'
      : '误区：把混淆量当成「还没拧够的关键参数」反复试，会浪费发射次数、也学不到因果。');
  } else if (meta?.trap) {
    trapBits.push('误区：多滑条一起拧，现象变了却说不清是谁导致的；失败后也难复盘。');
  } else {
    trapBits.push(student
      ? '提示：还没看清这一变量的作用时，先不要同时改很多控件。'
      : '误区：还没看清这一变量的作用，就同时改其它量，或过早去拧外观/装饰类控件。');
  }
  const trapBlock = trapBits.map(t => `<p>${t}</p>`).join('');

  // 4) KG 映射（可折叠）
  const mapped = (route.mapsTo || []).map(id => {
    const n = nodes.find(x => x.id === id);
    if (n) {
      return `<li><span class="route-kg-id">${escText(id)}</span> ${escText(n.label)}${n.desc ? `<span class="route-kg-desc"> — ${escText(n.desc)}</span>` : ''}</li>`;
    }
    return `<li><span class="route-kg-id">${escText(id)}</span></li>`;
  }).join('');
  const kgBlock = student
    ? ''
    : (mapped
      ? `<details class="route-teach-kg"><summary>事理图谱对应（可展开）</summary><ul class="route-kg-list">${mapped}</ul></details>`
      : `<details class="route-teach-kg"><summary>事理图谱对应（可展开）</summary><p class="i-desc">本路径未直接挂 KG 节点（常见于混淆旁路）。</p></details>`);

  let h = `<div class="i-title">${kindTitle}</div><div class="i-badges">${badge}</div>`;
  h += `<section class="route-teach-sec"><h3 class="route-teach-h">1. 本路径调什么</h3>${adjustBlock}</section>`;
  h += `<section class="route-teach-sec"><h3 class="route-teach-h">${student ? '2. 怎么探究' : '2. 为何优先 / 得分含义'}</h3>${whyBlock}</section>`;
  h += `<section class="route-teach-sec"><h3 class="route-teach-h">${student ? '3. 小提示' : '3. 典型误区'}</h3>${trapBlock}</section>`;
  if (kgBlock) h += `<section class="route-teach-sec">${kgBlock}</section>`;
  if ((route.mapsTo || []).length) {
    h += `<button type="button" class="route-kg-btn" id="btn-route-kg">在事理图谱中查看</button>`;
  }
  return h;
}

function refreshInfoEmptyIfBare() {
  const infoEl = document.getElementById('info');
  if (infoEl?.querySelector('.info-empty')) infoEl.innerHTML = infoEmptyHtml();
}

function resetPanelForViewChange() {
  document.getElementById('p-title').textContent = panelTitleForView(currentCh);
  document.getElementById('p-sub').textContent = panelSubForView(currentCh);
  clearInfoPanel();
  setGraphChrome();
  updateLegend();
}

function strategyParseApi() {
  return typeof StrategyMermaidParse !== 'undefined' ? StrategyMermaidParse : null;
}

function parseStrategyMermaidEdges(body) {
  const api = strategyParseApi();
  return api ? api.parseStrategyMermaidEdges(body) : [];
}

function buildRouteHighlightEdgeKeys(route, mermaidBody) {
  const api = strategyParseApi();
  return api ? api.buildRouteHighlightEdgeKeys(route, mermaidBody) : new Set();
}

function expandRouteHighlight(route, mermaidBody, opts) {
  const api = strategyParseApi();
  if (api?.expandRouteHighlight) return api.expandRouteHighlight(route, mermaidBody, opts);
  return {
    highlightNodes: route.highlightNodes || [],
    edgeKeys: buildRouteHighlightEdgeKeys(route, mermaidBody),
  };
}

function syncGraphHash() {
  const params = new URLSearchParams();
  params.set('ch', String(currentCh));
  params.set('view', currentView);
  if (currentView === 'strategy' && activeStrategyRouteId) params.set('route', activeStrategyRouteId);
  const next = '#' + params.toString();
  if (location.hash !== next) history.replaceState(null, '', next);
}

function parseGraphHash() {
  const raw = (location.hash || '').replace(/^#/, '').trim();
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  const ch = parseInt(params.get('ch'), 10);
  return {
    ch: Number.isFinite(ch) ? ch : 0,
    view: params.get('view') || 'dt',
    route: params.get('route') || null,
  };
}

function applyGraphHashFromUrl() {
  const h = parseGraphHash();
  if (!h) return;
  if (h.ch >= 0 && h.ch < KG_CHAPTERS.length) currentCh = h.ch;
  document.querySelectorAll('.tab').forEach((t, i) => t.classList.toggle('active', i === currentCh));
  pendingRouteId = h.view === 'strategy' ? h.route : null;
  if (['dt', 'kg', 'strategy'].includes(h.view) && h.view !== currentView) {
    currentView = h.view;
    document.getElementById('vt-kg').classList.toggle('active', h.view === 'kg');
    document.getElementById('vt-dt').classList.toggle('active', h.view === 'dt');
    document.getElementById('vt-strategy')?.classList.toggle('active', h.view === 'strategy');
    setGraphChrome();
  }
}

function activatePendingRoute() {
  if (!pendingRouteId || currentView !== 'strategy') return;
  const routes = metaChapters[currentCh]?.strategy?.routes || [];
  const route = routes.find(r => r.id === pendingRouteId);
  pendingRouteId = null;
  if (!route) return;
  const legendEl = document.getElementById('legend-items');
  const btn = legendEl?.querySelector(`[data-route-id="${route.id}"]`);
  if (btn) {
    legendEl.querySelectorAll('.route-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }
  showRouteInfo(route);
}

function edgeKeyFromMermaidSvgId(id) {
  const api = strategyParseApi();
  if (api?.edgeKeyFromMermaidSvgId) return api.edgeKeyFromMermaidSvgId(id);
  if (!id) return null;
  let m = id.match(/edge-label-([^-]+)-([^-]+)/i);
  if (m) return `${m[1]}->${m[2]}`;
  m = id.match(/(?:^|[-])L_([^_]+)_([^_]+)_/);
  return m ? `${m[1]}->${m[2]}` : null;
}

function edgeKeyFromMermaidClassName(className) {
  const api = strategyParseApi();
  if (api?.edgeKeyFromMermaidClassName) return api.edgeKeyFromMermaidClassName(className);
  if (!className) return null;
  const cls = String(className);
  const from = cls.match(/(?:^|\s)LS-([A-Za-z][A-Za-z0-9_]*)\b/);
  const to = cls.match(/(?:^|\s)LE-([A-Za-z][A-Za-z0-9_]*)\b/);
  if (from && to) return `${from[1]}->${to[1]}`;
  return null;
}

function edgeKeyFromSvgElement(el) {
  let cur = el;
  for (let i = 0; i < 6 && cur; i++) {
    const idKey = edgeKeyFromMermaidSvgId(cur.getAttribute?.('id') || '');
    if (idKey) return idKey;
    const clsObj = cur.className;
    const cls = typeof clsObj === 'string' ? clsObj : (clsObj?.baseVal || '');
    const clsKey = edgeKeyFromMermaidClassName(cls);
    if (clsKey) return clsKey;
    cur = cur.parentElement;
  }
  return null;
}

function svgPathEdgeKey(pathEl) {
  return edgeKeyFromSvgElement(pathEl);
}

function edgeKeyFromPathGroup(group) {
  if (!group) return null;
  const fromGroup = edgeKeyFromSvgElement(group);
  if (fromGroup) return fromGroup;
  const path = group.querySelector?.('path');
  if (!path) return null;
  return edgeKeyFromSvgElement(path);
}

function rectCenter(el) {
  if (!el?.getBoundingClientRect) return null;
  const r = el.getBoundingClientRect();
  if (!Number.isFinite(r.left) || !Number.isFinite(r.top)) return null;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function buildEdgePathGeoEntries(svg) {
  const edgeSel = 'g.edgePaths path, g.edgePath path, path.flowchart-link, .edgePath path';
  return Array.from(svg.querySelectorAll(edgeSel)).map(pathEl => ({
    key: edgeKeyFromSvgElement(pathEl),
    center: rectCenter(pathEl),
  })).filter(x => x.key && x.center);
}

function nearestEdgeKeyForLabel(labelEl, pathGeo) {
  const center = rectCenter(labelEl);
  if (!center || !pathGeo.length) return null;
  let best = null;
  for (const entry of pathGeo) {
    const dx = entry.center.x - center.x;
    const dy = entry.center.y - center.y;
    const dist2 = dx * dx + dy * dy;
    if (!best || dist2 < best.dist2) best = { key: entry.key, dist2 };
  }
  // If nearest path is too far, avoid accidental mis-association.
  return best && best.dist2 <= 240 * 240 ? best.key : null;
}

function clearStrategyRouteHighlightVisual() {
  const svg = document.querySelector('#strategy-mermaid svg');
  if (!svg) return;
  svg.querySelectorAll('.strategy-dim, .strategy-hl').forEach(el => {
    el.classList.remove('strategy-dim', 'strategy-hl');
  });
  patchStrategyEdgeLabelBackground(svg);
}

function afterStrategyRender() {
  const svg = document.querySelector('#strategy-mermaid svg');
  patchStrategyEdgeLabelBackground(svg);
  clearStrategyRouteHighlightVisual();
  applyPriorityEdgeStyles();
  requestAnimationFrame(() => {
    fitStrategyToPanel();
    if (pendingRouteId) {
      activatePendingRoute();
      return;
    }
    const routeId = activeStrategyRouteId
      || document.querySelector('#legend-items .route-btn.active[data-route-id]')?.dataset.routeId;
    if (!routeId) return;
    const routes = metaChapters[currentCh]?.strategy?.routes || [];
    const route = routes.find(r => r.id === routeId);
    if (route) applyStrategyRouteHighlight(route);
  });
}

function applyPriorityEdgeStyles() {
  const svg = document.querySelector('#strategy-mermaid svg');
  const api = priorityApi();
  const routes = metaChapters[currentCh]?.strategy?.routes || [];
  if (!svg || !api?.strategySelectPriorityStyles || !routes.length) return;
  const styleMap = api.strategySelectPriorityStyles(routes);
  if (!styleMap.size) return;

  const pathGroups = getStrategyEdgePathGroups(svg);
  pathGroups.forEach(group => {
    const key = edgeKeyFromPathGroup(group);
    const meta = key && styleMap.get(key);
    pathsInEdgeGroup(group).forEach(pathEl => {
      pathEl.classList.remove('prio-edge-high', 'prio-edge-mid', 'prio-edge-low', 'prio-edge-trap', 'prio-edge-confound');
      if (!meta) return;
      let cls = 'prio-edge-low';
      if (meta.confound) cls = 'prio-edge-confound';
      else if (meta.trap) cls = 'prio-edge-trap';
      else if (meta.rank <= 1) cls = 'prio-edge-high';
      else if (meta.rank === 2) cls = 'prio-edge-mid';
      pathEl.classList.add(cls);
      pathEl.style.stroke = meta.stroke;
      pathEl.style.strokeWidth = `${meta.strokeWidth}px`;
      if (meta.trap || meta.confound) pathEl.style.strokeDasharray = '7 5';
      else pathEl.style.strokeDasharray = '';
    });
  });
}

function mermaidNodeIdFromSvgGroup(gEl) {
  const dataId = gEl.getAttribute?.('data-id');
  if (dataId) return dataId;
  const id = gEl.getAttribute('id') || '';
  const m = id.match(/flowchart-([A-Za-z][A-Za-z0-9_]*)-/i);
  return m ? m[1] : null;
}

function clearStrategyRouteHighlight() {
  activeStrategyRouteId = null;
  clearStrategyRouteHighlightVisual();
}

function applyStrategyRouteHighlight(route) {
  const svg = document.querySelector('#strategy-mermaid svg');
  if (!svg || !route) return;
  clearStrategyRouteHighlightVisual();
  activeStrategyRouteId = route.id;
  const mermaidBody = metaChapters[currentCh]?.strategy?.mermaid || '';
  const resultKgIds = new Set(
    (KG_CHAPTERS[currentCh]?.nodes || []).filter(n => n.group === 'result').map(n => n.id),
  );
  const expanded = expandRouteHighlight(route, mermaidBody, { resultKgIds });
  const idSet = new Set(expanded.highlightNodes);
  const edgeKeys = expanded.edgeKeys;
  const parsed = parseStrategyMermaidEdges(mermaidBody);

  svg.querySelectorAll('g.node').forEach(gEl => {
    const nid = mermaidNodeIdFromSvgGroup(gEl);
    if (nid && idSet.has(nid)) gEl.classList.add('strategy-hl');
    else gEl.classList.add('strategy-dim');
  });

  const pathGroups = getStrategyEdgePathGroups(svg);
  const labelGroups = getStrategyEdgeLabelGroups(svg);
  const parsedByIndex = pathGroups.map((group, i) => ({
    group,
    key: edgeKeyFromPathGroup(group),
    fallbackKey: parsed[i]?.key || null,
  }));
  const markedPaths = new Set();
  const markedLabelGroups = new Set();
  parsedByIndex.forEach((entry, i) => {
    const key = entry.key || entry.fallbackKey;
    const hl = key && edgeKeys.has(key);
    pathsInEdgeGroup(entry.group).forEach(pathEl => {
      pathEl.classList.add(hl ? 'strategy-hl' : 'strategy-dim');
      markedPaths.add(pathEl);
    });
    const labelGroup = labelGroups[i];
    if (labelGroup) {
      labelGroup.classList.add(hl ? 'strategy-hl' : 'strategy-dim');
      markedLabelGroups.add(labelGroup);
    }
  });

  const edgeSel = 'g.edgePaths path, g.edgePath path, path.flowchart-link, .edgePath path';
  svg.querySelectorAll(edgeSel).forEach(pathEl => {
    if (markedPaths.has(pathEl)) return;
    const key = edgeKeyFromSvgElement(pathEl);
    pathEl.classList.add(key && edgeKeys.has(key) ? 'strategy-hl' : 'strategy-dim');
  });

  const pathGeo = buildEdgePathGeoEntries(svg);
  svg.querySelectorAll('g.edgeLabel').forEach(gEl => {
    if (markedLabelGroups.has(gEl)) return;
    const key = edgeKeyFromSvgElement(gEl) || nearestEdgeKeyForLabel(gEl, pathGeo);
    gEl.classList.add(key && edgeKeys.has(key) ? 'strategy-hl' : 'strategy-dim');
  });

  patchStrategyEdgeLabelBackground(svg);
  syncGraphHash();
}

function switchView(v) {
  currentView = v;
  document.getElementById('vt-kg')?.classList.toggle('active', v === 'kg');
  document.getElementById('vt-dt')?.classList.toggle('active', v === 'dt');
  document.getElementById('vt-strategy')?.classList.toggle('active', v === 'strategy');
  if (v === 'strategy') closeStructMenu();
  if (v !== 'strategy') {
    clearStrategyTransform();
    clearStrategyRouteHighlight();
  }
  resetPanelForViewChange();
  render();
  syncGraphHash();
}

function loadChapter(idx) {
  currentCh = idx;
  document.querySelectorAll('.tab').forEach((t,i) => t.classList.toggle('active', i===idx));
  syncStrategyTabVisibility();
  document.getElementById('p-title').textContent = panelTitleForView(idx);
  document.getElementById('p-sub').textContent = panelSubForView(idx);
  clearInfoPanel();
  clearStrategyRouteHighlight();
  updateLegend();
  render();
  syncGraphHash();
}

function render() {
  if (simulation) { simulation.stop(); simulation = null; }
  d3svg.selectAll('*').remove();
  document.getElementById('p-title').textContent = panelTitleForView(currentCh);
  document.getElementById('p-sub').textContent = panelSubForView(currentCh);
  if (currentView === 'kg') renderKG(KG_CHAPTERS[currentCh]);
  else if (currentView === 'strategy') renderStrategy();
  else renderDT(DT_CHAPTERS[currentCh]);
}

function getStrategyClassDefs() {
  return (typeof STRATEGY_MERMAID_CLASS_DEFS !== 'undefined' ? STRATEGY_MERMAID_CLASS_DEFS : '');
}

function sanitizeStrategyMermaidBody(body) {
  const api = strategyParseApi();
  if (api?.sanitizeStrategyMermaid) return api.sanitizeStrategyMermaid(body);
  return body || '';
}

function buildStrategyMermaidSource(body, defs) {
  const trimmed = sanitizeStrategyMermaidBody(body).trim();
  if (!defs) return trimmed;
  const nl = trimmed.indexOf('\n');
  const header = nl === -1 ? trimmed : trimmed.slice(0, nl);
  const rest = nl === -1 ? '' : trimmed.slice(nl + 1);
  if (/^(graph|flowchart)\s+(LR|TD)/i.test(header)) {
    return rest ? header + '\n' + rest + '\n' + defs : header + '\n' + defs;
  }
  return trimmed + '\n' + defs;
}

function ensureMermaid() {
  if (mermaidReady || typeof mermaid === 'undefined') return;
  mermaid.initialize({
    startOnLoad: false,
    theme: 'neutral',
    themeVariables: {
      edgeLabelBackground: '#eef2f8',
      primaryColor: '#f1f5f9',
      primaryTextColor: '#1e293b',
      primaryBorderColor: '#475569',
    },
    securityLevel: 'loose',
    flowchart: {
      curve: 'basis',
      htmlLabels: true,
      useMaxWidth: false,
      nodeSpacing: 55,
      rankSpacing: 70,
    },
  });
  mermaidReady = true;
}

/** Load Mermaid only when entering strategy view (graph.html / preview-shell omit sync tag). */
function loadMermaidLib() {
  if (typeof mermaid !== 'undefined') return Promise.resolve();
  if (mermaidLoadPromise) return mermaidLoadPromise;
  const src = (typeof window !== 'undefined' && window.__MERMAID_SRC__)
    || '/static/viewer/vendor/mermaid.min.js';
  mermaidLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-mermaid-loader]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Mermaid 加载失败')));
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.dataset.mermaidLoader = '1';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Mermaid 加载失败'));
    document.head.appendChild(s);
  });
  return mermaidLoadPromise;
}

function renderStrategy() {
  ensureStrategyViewport();
  const mount = document.getElementById('strategy-mermaid');
  if (!mount) return;
  const strat = metaChapters[currentCh]?.strategy;
  const rid = ++strategyRenderId;
  if (!strat?.mermaid?.trim()) {
    mount.innerHTML = '<div id="strategy-empty">本章暂无策略全景</div>';
    return;
  }
  mount.innerHTML = '<div class="strategy-loading">正在渲染策略图…</div>';
  loadMermaidLib().then(() => {
    if (rid !== strategyRenderId) return;
    ensureMermaid();
    if (typeof mermaid === 'undefined') {
      mount.innerHTML = '<div id="strategy-empty">需要联网加载 Mermaid</div>';
      return;
    }
    const id = 'strategy-diagram-' + currentCh + '-' + rid;
    const displayBody = annotateDisplayMermaid(strat.mermaid, strat.routes || []);
    lastStrategyDisplayMermaid = displayBody;
    const src = buildStrategyMermaidSource(displayBody, getStrategyClassDefs());
    return mermaid.render(id, src).then(({ svg }) => {
      if (rid !== strategyRenderId) return;
      mount.innerHTML = svg;
      const svgEl = mount.querySelector('svg');
      if (svgEl) {
        svgEl.removeAttribute('width');
        svgEl.style.width = '';
        svgEl.style.maxWidth = '';
        requestAnimationFrame(() => {
          afterStrategyRender();
          activatePendingRoute();
        });
      }
    });
  }).catch(err => {
    if (rid !== strategyRenderId) return;
    mount.innerHTML = '<div id="strategy-empty">策略图渲染失败：' + (err.message || err) + '</div>';
  });
}

function showRouteInfo(route) {
  const infoEl = document.getElementById('info');
  if (!infoEl || !route) return;
  infoEl.innerHTML = buildRouteTeachingHtml(route);
  document.getElementById('btn-route-kg')?.addEventListener('click', () => showRouteInKg(route));
  if (window.MathJax) MathJax.typesetPromise([infoEl]).catch(() => {});
  applyStrategyRouteHighlight(route);
}

function showRouteInKg(route) {
  const ids = route?.mapsTo || [];
  if (!ids.length) return;
  switchView('kg');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => kgHighlightIds(ids));
  });
}

function kgHighlightIds(ids) {
  if (!nodeG || !linkG || !lastKgNodes) return;
  const idSet = new Set(ids);
  nodeG.selectAll('circle').transition().duration(260)
    .attr('opacity', n => !kgNodeVisible(n) ? 0 : (idSet.has(n.id) ? 1 : cssVarNum('--graph-dim-opacity', 0.22)))
    .attr('stroke-width', n => idSet.has(n.id) ? 3 : 1)
    .attr('stroke', cssVar('--graph-node-stroke') || '#fff');
  linkG.transition().duration(260).attr('opacity', l => {
    if (!kgLinkVisible(l)) return 0;
    const s = typeof l.source === 'object' ? l.source.id : l.source;
    const t = typeof l.target === 'object' ? l.target.id : l.target;
    return idSet.has(s) && idSet.has(t) ? 0.75 : cssVarNum('--graph-link-dim-opacity', 0.12);
  });
}

function renderNodeLegendRow(d) {
  const cls = `${d.diamond ? ' diamond' : ''}${d.dashed ? ' dashed' : ''}${d.hollow ? ' hollow' : ''}`;
  const style = d.hollow
    ? `border-color:${d.color}`
    : d.dashed
      ? `background:${d.color};border-color:rgba(255,255,255,0.95)`
      : `background:${d.color}`;
  return `<div class="lr"><div class="ld${cls}" style="${style}"></div>${d.label}</div>`;
}

function renderLinkLegendRow(d) {
  const cls = d.dashed ? ' dashed' : '';
  const style = d.dashed ? `border-color:${d.color}` : `background:${d.color}`;
  return `<div class="lr"><div class="ll${cls}" style="${style}"></div>${d.label}</div>`;
}

function renderLegendGroup(title, items, rowFn) {
  const subtitle = title ? `<div class="legend-subtitle">${title}</div>` : '';
  return `<div class="legend-subsection">${subtitle}<div class="legend-grid">${items.map(rowFn).join('')}</div></div>`;
}

function updateLegend() {
  const legendEl = document.getElementById('legend-items');
  if (currentView === 'strategy') {
    setLegendTitle('调节优先级');
    const routes = metaChapters[currentCh]?.strategy?.routes || [];
    const prioApi = priorityApi();
    const ranked = prioApi?.rankedStrategySelectRoutes
      ? prioApi.rankedStrategySelectRoutes(routes)
      : [...routes];
    // Compact: line legend only (drop bulky color chips by default)
    const prioLines = PRIORITY_LINE_LEGEND.map(c =>
      `<div class="prio-lr"><div class="prio-line ${c.cls}"></div>${c.label}</div>`
    ).join('');
    const DEFAULT_VISIBLE = 5;
    const routeBtns = ranked.map((r, i) => {
      const meta = prioApi?.routePriorityMeta ? prioApi.routePriorityMeta(r) : { rank: r.priorityRank, score: r.score, trap: false };
      const scoreTxt = meta?.score != null ? Number(meta.score).toFixed(2) : '';
      const prioCls = meta?.confound
        ? 'confound'
        : (meta?.trap ? 'warn' : (meta?.rank <= 3 ? `prio-${meta.rank}` : ''));
      const label = prioApi?.formatPriorityEdgeLabel ? prioApi.formatPriorityEdgeLabel(r) : r.label;
      const studentSafeLabel = isStudentAudience()
        ? String(label || r.label || '')
          .replace(/·\s*优先\d+/g, '')
          .replace(/试探混淆/g, '旁路试探')
        : label;
      const hiddenCls = i >= DEFAULT_VISIBLE ? ' route-btn-extra hidden' : '';
      return `<button type="button" class="route-btn ${prioCls}${meta?.trap || meta?.confound ? ' warn' : ''}${hiddenCls}" data-route-id="${r.id}">${studentSafeLabel}${!isStudentAudience() && scoreTxt && !prioApi?.formatPriorityEdgeLabel ? `<span class="route-score">${scoreTxt}</span>` : ''}</button>`;
    }).join('');
    const moreBtn = ranked.length > DEFAULT_VISIBLE
      ? `<button type="button" class="route-more-btn" id="btn-route-more" aria-expanded="false">展开全部途径（${ranked.length}）</button>`
      : '';
    legendEl.innerHTML = `<div class="priority-legend">${prioLines}</div><div class="strategy-route-list">${routeBtns}${moreBtn}</div>`;
    legendEl.querySelector('#btn-route-more')?.addEventListener('click', (e) => {
      const btn = e.currentTarget;
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      legendEl.querySelectorAll('.route-btn-extra').forEach(el => el.classList.toggle('hidden', expanded));
      btn.setAttribute('aria-expanded', expanded ? 'false' : 'true');
      btn.textContent = expanded ? `展开全部途径（${ranked.length}）` : '收起途径列表';
    });
    legendEl.querySelectorAll('.route-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const route = routes.find(x => x.id === btn.dataset.routeId);
        const isToggleOff = btn.classList.contains('active') && activeStrategyRouteId === route?.id;
        legendEl.querySelectorAll('.route-btn').forEach(b => b.classList.remove('active'));
        if (isToggleOff) {
          clearStrategyRouteHighlight();
          clearInfoPanel();
          applyPriorityEdgeStyles();
          syncGraphHash();
          return;
        }
        btn.classList.add('active');
        if (route) showRouteInfo(route);
      });
    });
    document.getElementById('kg-filter').classList.add('hidden');
    document.getElementById('legend-hint').classList.add('hidden');
    return;
  }
  if (currentView === 'kg') {
    setLegendTitle('节点类型');
    const nodeGroups = KG_NODE_LEGEND_GROUPS.map(g => renderLegendGroup(g.title, g.items, renderNodeLegendRow)).join('');
    const linkGroups = KG_LINK_LEGEND_GROUPS.map(g => renderLegendGroup(g.title, g.items, renderLinkLegendRow)).join('');
    legendEl.innerHTML = `<div class="kg-legend">
      <div class="legend-section">
        <div class="ltitle">节点类型</div>
        ${nodeGroups}
      </div>
      <div class="legend-section">
        <div class="ltitle">连线类型</div>
        ${linkGroups}
      </div>
    </div>`;
    document.getElementById('kg-filter').classList.remove('hidden');
    document.getElementById('legend-hint').classList.add('hidden');
    return;
  }
  setLegendTitle('节点类型');
  legendEl.innerHTML = `<div class="legend-section"><div class="legend-grid">${DT_LEGEND.map(renderNodeLegendRow).join('')}</div></div>`;
  document.getElementById('kg-filter').classList.add('hidden');
  document.getElementById('legend-hint').classList.add('hidden');
}

function kgNodeVisible(d) {
  return kgFilter === 'all' || d.layer === kgFilter;
}
function kgLinkVisible(l) {
  const sid = typeof l.source==='object' ? l.source.id : l.source;
  const tid = typeof l.target==='object' ? l.target.id : l.target;
  const nodes = KG_CHAPTERS[currentCh]?.nodes || [];
  const sn = nodes.find(n=>n.id===sid), tn = nodes.find(n=>n.id===tid);
  return sn && tn && kgNodeVisible(sn) && kgNodeVisible(tn);
}
function kgForceX(d, W) {
  if (d.id === 'P1' || d.id === 'R1') return W * 0.5;
  if (d.layer === 'play') return W * 0.28;
  if (d.layer === 'teach') return W * 0.72;
  return W * 0.5;
}

function kgForceY(d, H, maxLv) {
  const lv = maxLv > 0 ? (d.level ?? 0) / maxLv : 0;
  if (d.layer === 'teach') return H * (0.12 + lv * 0.28);
  if (d.layer === 'play') return H * (0.52 + lv * 0.32);
  return H * (0.08 + lv * 0.80);
}

function kgNodeRadius(d) {
  const n = Number(d?.r);
  if (Number.isFinite(n) && n > 0) return n;
  return d?.group === 'irrelevant' ? 18 : 22;
}

function kgCanvasLabel(d) {
  const id = d.id || '';
  const raw = (d.label || '').trim();
  if (!raw || raw === id) return id;
  if (raw.startsWith(id)) return raw.length > 16 ? raw.slice(0, 14) + '…' : raw;
  const short = raw.length > 10 ? raw.slice(0, 8) + '…' : raw;
  return id + ' ' + short;
}

function kgCollideRadius(d) {
  const label = kgCanvasLabel(d);
  return kgNodeRadius(d) + 20 + Math.min(48, label.length * 4);
}
function setKgFilter(f) {
  kgFilter = f;
  document.querySelectorAll('#kg-filter .fbtn').forEach(b =>
    b.classList.toggle('active', b.dataset.kgFilter === f));
  if (currentView === 'kg') render();
}

// ══════════════════════════════════════════════════════════════════════════════
//  力导向图 (事理图谱)
// ══════════════════════════════════════════════════════════════════════════════
function renderKG(chData) {
  const W = svgEl.clientWidth||900, H = svgEl.clientHeight||600;
  d3svg.attr('viewBox',[0,0,W,H]);
  gRoot = d3svg.append('g');

  const defs = d3svg.append('defs');
  ['premise','method','core','result','verify'].forEach(t => {
    const col = t==='premise'?'#6688aa':t==='method'?'#3388dd':t==='core'?'#8855cc':t==='result'?'#33aa66':'#dd66aa';
    defs.append('marker').attr('id','arr-'+t).attr('viewBox','0 -5 10 10').attr('refX',28).attr('refY',0)
      .attr('markerWidth',7).attr('markerHeight',7).attr('orient','auto')
      .append('path').attr('d','M0,-5L10,0L0,5').attr('fill',col);
  });

  const nodes = chData.nodes.map(n=>({...n}));
  lastKgNodes = nodes;
  lastKgLinks = chData.links.map(l => ({...l}));
  const links = chData.links.map(l=>({...l, source:l.s, target:l.t}));
  const maxLv = Math.max(...nodes.map(n=>n.level));

  linkG = gRoot.append('g').selectAll('line').data(links).join('line')
    .attr('class',d=>'link '+d.tp)
    .attr('marker-end',d=>'url(#arr-'+d.tp+')')
    .attr('opacity',d=>kgLinkVisible(d)?(d.tp==='verify'?0.62:0.52):0)
    .style('pointer-events',d=>kgLinkVisible(d)?'stroke':'none');

  nodeG = gRoot.append('g').selectAll('g').data(nodes).join('g')
    .attr('class', d => {
      let c = 'node';
      if (d.layer === 'teach') c += ' teach-node';
      if (d.id === 'P1' || d.id === 'R1') c += ' hub-node';
      if (d.group === 'irrelevant') c += ' irrelevant-node';
      return c;
    })
    .attr('opacity',d=>kgNodeVisible(d)?1:0)
    .style('pointer-events',d=>kgNodeVisible(d)?'all':'none')
    .call(d3.drag()
      .on('start',(ev,d)=>{ if(!kgNodeVisible(d))return; if(!ev.active)simulation.alphaTarget(0.3).restart(); d.fx=d.x; d.fy=d.y; })
      .on('drag', (ev,d)=>{ if(!kgNodeVisible(d))return; d.fx=ev.x; d.fy=ev.y; })
      .on('end',  (ev,d)=>{ if(!ev.active)simulation.alphaTarget(0); d.fx=d.x; d.fy=d.y; }));

  nodeG.append('circle')
    .attr('r', d => {
      const r = kgNodeRadius(d);
      return (d.id === 'P1' || d.id === 'R1') ? r + 2 : r;
    })
    .attr('fill', d => (d.group === 'irrelevant' ? 'none' : (KG_COLORS[d.group] || '#446688')));

  nodeG.append('text').text(d => kgCanvasLabel(d)).attr('dy', d => {
    const r = kgNodeRadius(d);
    const hub = (d.id === 'P1' || d.id === 'R1') ? r + 2 : r;
    return hub + 13;
  }).style('font-size', '10px');

  simulation = d3.forceSimulation(nodes)
    .force('link',   d3.forceLink(links).id(d=>d.id).distance(95).strength(0.65))
    .force('charge', d3.forceManyBody().strength(-620))
    .force('collide',d3.forceCollide().radius(kgCollideRadius).strength(0.95))
    .force('x',      d3.forceX(d=>kgForceX(d,W)).strength(0.38))
    .force('y',      d3.forceY(d=>kgForceY(d,H,maxLv)).strength(0.58))
    .force('center', d3.forceCenter(W/2,H/2).strength(0.03));
  simulation.alpha(0.92).restart();

  simulation.on('tick',()=>{
    linkG.attr('x1',d=>d.source.x).attr('y1',d=>d.source.y)
         .attr('x2',d=>d.target.x).attr('y2',d=>d.target.y);
    nodeG.attr('transform',d=>`translate(${d.x},${d.y})`);
  });

  zoomBeh = d3.zoom().scaleExtent([0.25,3]).on('zoom',e=>gRoot.attr('transform',e.transform));
  d3svg.call(zoomBeh);

  nodeG.on('click',(ev,d)=>{
    if(!kgNodeVisible(d))return;
    ev.stopPropagation();
    kgHighlight(d,nodes,links);
    showKGInfo(d,links,nodes);
  });
  d3svg.on('dblclick', kgClearHL);
}

function kgGetConn(id,links){
  const v=new Set([id]); const q=[id];
  while(q.length){ const c=q.shift();
    links.forEach(l=>{
      const s=typeof l.source==='object'?l.source.id:l.source;
      const t=typeof l.target==='object'?l.target.id:l.target;
      if(s===c&&!v.has(t)){v.add(t);q.push(t);}
      if(t===c&&!v.has(s)){v.add(s);q.push(s);}
    });
  } return v;
}
function kgHighlight(d,nodes,links){
  const conn=kgGetConn(d.id,links);
  nodeG.selectAll('circle').transition().duration(260)
    .attr('opacity',n=>!kgNodeVisible(n)?0:(conn.has(n.id)?1:cssVarNum('--graph-dim-opacity',0.22)))
    .attr('stroke-width',n=>conn.has(n.id)?3:1);
  linkG.transition().duration(260).attr('opacity',l=>{
    if(!kgLinkVisible(l))return 0;
    const s=typeof l.source==='object'?l.source.id:l.source,t=typeof l.target==='object'?l.target.id:l.target;
    return conn.has(s)&&conn.has(t)?(l.tp==='verify'?0.85:0.75):cssVarNum('--graph-link-dim-opacity',0.12);
  });
}
function kgClearHL(){
  if(!nodeG)return;
  nodeG.selectAll('circle').transition().duration(260)
    .attr('opacity',n=>kgNodeVisible(n)?1:0).attr('stroke-width',n=>(n.id==='P1'||n.id==='R1')?2.5:2);
  linkG.transition().duration(260).attr('opacity',d=>kgLinkVisible(d)?(d.tp==='verify'?0.62:0.52):0);
}
function showKGInfo(d,links,nodes){
  const col=KG_COLORS[d.group]||'#446688';
  const layerCol=d.layer==='play'?'layer-play':'layer-teach';
  const ups=links.filter(l=>(typeof l.target==='object'?l.target.id:l.target)===d.id).map(l=>{ const s=typeof l.source==='object'?l.source.id:l.source; const nd=nodes.find(n=>n.id===s); return `<span style="color:${KG_COLORS[nd?.group]||'#aaa'}">${nd?.label||s}</span>`; });
  const dns=links.filter(l=>(typeof l.source==='object'?l.source.id:l.source)===d.id).map(l=>{ const t=typeof l.target==='object'?l.target.id:l.target; const nd=nodes.find(n=>n.id===t); return `<span style="color:${KG_COLORS[nd?.group]||'#aaa'}">${nd?.label||t}</span>`; });
  let h=`<div class="i-title">${d.label}</div><div class="i-badges"><span class="i-badge" style="background:${col}">${KG_NAMES[d.group]||d.group}</span>`;
  if(d.layer) h+=`<span class="i-badge ${layerCol}">${LAYER_NAMES[d.layer]||d.layer}</span>`;
  h+=`</div><div class="i-desc">${d.desc}</div>`;
  if(ups.length) h+=`<div class="i-rel-lbl">↑ 逻辑依赖</div><div class="i-rel-list">${ups.join(' · ')}</div>`;
  if(dns.length) h+=`<div class="i-rel-lbl" style="margin-top:10px">↓ 逻辑导出</div><div class="i-rel-list">${dns.join(' · ')}</div>`;
  document.getElementById('info').innerHTML = h;
  if(window.MathJax) MathJax.typesetPromise([document.getElementById('info')]).catch(()=>{});
}

// ══════════════════════════════════════════════════════════════════════════════
//  决策�?(horizontal d3.tree layout)
// ══════════════════════════════════════════════════════════════════════════════
function renderDT(chData) {
  // Use minimum dimensions so layout is correct even in constrained viewports
  const W = Math.max(svgEl.clientWidth||0, 900), H = Math.max(svgEl.clientHeight||0, 600);
  d3svg.attr('viewBox',[0,0,W,H]);
  gRoot = d3svg.append('g');

  // Build hierarchy (uid = tree path �?duplicate labels across mode branches stay distinct)
  function toHier(n, path = '0') {
    const obj = { name: n.n, type: n.t, desc: n.d || '', edgeLabel: n._e || '', uid: path };
    if (n.children && n.children.length) {
      obj.children = n.children.map((c, i) => toHier(c, `${path}/${i}`));
    }
    return obj;
  }
  const root = d3.hierarchy(toHier(chData.tree));

  // Estimate sizes �?nodeW is the per-node horizontal margin
  const nodeW = 160;
  const treeH = H - 80;
  const treeW = Math.max(W - 80, 400);

  const treeLayout = d3.tree().size([treeH, treeW - nodeW]);
  treeLayout(root);

  const nodes = root.descendants();
  const links = root.links();

  // Draw links (curved elbow)
  const linkGroup = gRoot.append('g');
  linkGroup.selectAll('path').data(links).join('path')
    .attr('class', d => {
      const el = d.target.data.edgeLabel||'';
      if(el==='是'||el==='Path A') return 'tree-link decision-yes';
      if(el==='否'||el==='Path B') return 'tree-link decision-no';
      if(el==='Path A') return 'tree-link path-a';
      if(el==='Path B') return 'tree-link path-b';
      return 'tree-link';
    })
    .attr('d', d => {
      const sx = d.source.y + 30, sy = d.source.x;
      const tx = d.target.y + 30, ty = d.target.x;
      const mx = (sx + tx) / 2;
      return `M${sx},${sy} C${mx},${sy} ${mx},${ty} ${tx},${ty}`;
    });

  // Edge labels
  linkGroup.selectAll('text.edge-lbl').data(links.filter(d=>d.target.data.edgeLabel)).join('text')
    .attr('class', d => {
      const el = d.target.data.edgeLabel;
      if(el==='是') return 'edge-lbl yes';
      if(el==='否') return 'edge-lbl no';
      if(el==='Path A') return 'edge-lbl path-a';
      if(el==='Path B') return 'edge-lbl path-b';
      return 'edge-lbl';
    })
    .attr('x', d => (d.source.y + d.target.y) / 2 + 30)
    .attr('y', d => (d.source.x + d.target.x) / 2 - 5)
    .attr('text-anchor','middle')
    .text(d => d.target.data.edgeLabel);

  // Draw nodes
  const nodeGroup = gRoot.append('g').selectAll('g').data(nodes).join('g')
    .attr('class','tree-node')
    .attr('transform', d => `translate(${d.y + 30},${d.x})`);

  // Node shape: diamond for decision, circle for others
  nodeGroup.each(function(d) {
    const g = d3.select(this);
    const col = DT_COLORS[d.data.type] || '#446688';
    const r = d.data.type==='root' ? 24 : d.data.type==='result' ? 22 : 18;
    if(d.data.type === 'decision') {
      const s = r * 1.35;
      g.append('path').attr('class','diamond-path')
        .attr('d', `M0,${-s} L${s},0 L0,${s} L${-s},0 Z`)
        .attr('fill', col);
    } else {
      g.append('circle').attr('r', r).attr('fill', col);
    }
  });

  // Node labels (multi-line, below/beside)
  nodeGroup.each(function(d) {
    const g = d3.select(this);
    const lines = d.data.name.split('\n');
    const r = d.data.type==='root'?24:d.data.type==='result'?22:18;
    const baseY = (d.data.type==='decision' ? r*1.35 : r) + 12;
    lines.forEach((line, i) => {
      g.append('text')
        .attr('dy', baseY + i * 13)
        .attr('text-anchor','middle')
        .style('font-size', d.data.type==='root'?'11px':'10px')
        .style('fill', dtLabelFill(d.data.type))
        .text(line);
    });
  });

  // Click handler
  nodeGroup.on('click', (ev, d) => {
    ev.stopPropagation();
    dtHighlight(d, nodeGroup, linkGroup, links);
    showDTInfo(d.data);
  });

  zoomBeh = d3.zoom().scaleExtent([0.15, 3]).on('zoom', e => gRoot.attr('transform', e.transform));
  d3svg.call(zoomBeh);
  d3svg.on('dblclick', () => { dtClearHL(nodeGroup, linkGroup); });

  // Auto-fit
  const bbox = gRoot.node().getBBox();
  const scale = Math.min(0.88, Math.min(W/bbox.width, H/bbox.height));
  const tx = (W - bbox.width*scale)/2 - bbox.x*scale;
  const ty = (H - bbox.height*scale)/2 - bbox.y*scale;
  d3svg.call(zoomBeh.transform, d3.zoomIdentity.translate(tx,ty).scale(scale));
}

function dtHighlight(d, nodeGroup, linkGroup, links) {
  const ids = new Set();
  let n = d;
  while (n) { ids.add(n.data.uid); n = n.parent; }
  function addDesc(node) {
    ids.add(node.data.uid);
    if (node.children) node.children.forEach(addDesc);
  }
  addDesc(d);

  nodeGroup.selectAll('circle,path.diamond-path').transition().duration(240)
    .attr('opacity', nd => ids.has(nd.data.uid) ? 1 : cssVarNum('--graph-dim-opacity', 0.22))
    .attr('stroke-width', nd => ids.has(nd.data.uid) ? 3 : 1);
  linkGroup.selectAll('path').transition().duration(240)
    .attr('opacity', l => ids.has(l.source.data.uid) && ids.has(l.target.data.uid) ? 1 : cssVarNum('--graph-link-dim-opacity', 0.12));
}
function dtClearHL(nodeGroup, linkGroup) {
  if (!nodeGroup) return;
  nodeGroup.selectAll('circle,path.diamond-path').transition().duration(240).attr('opacity',1).attr('stroke-width',2);
  linkGroup.selectAll('path').transition().duration(240).attr('opacity',1);
}

function showDTInfo(data) {
  const col = DT_COLORS[data.type]||'#446688';
  let h = `<div class="i-title">${data.name.replace(/\n/g,'<br>')}</div>`;
  h += `<span class="i-badge" style="background:${col}">${DT_NAMES[data.type]||data.type}</span>`;
  if(data.desc) h += `<div class="i-desc">${data.desc}</div>`;
  document.getElementById('info').innerHTML = h;
  if(window.MathJax) MathJax.typesetPromise([document.getElementById('info')]).catch(()=>{});
}

function kgResetLayout() {
  if (!simulation || currentView !== 'kg') return;
  simulation.nodes().forEach(d => { d.fx = null; d.fy = null; });
  simulation.alpha(1).restart();
}

function clearInfoPanel() {
  document.getElementById('info').innerHTML = infoEmptyHtml();
}


  function bindControls() {
    document.getElementById('btn-zoom')?.addEventListener('click', () => {
      if (currentView === 'strategy') {
        fitStrategyToPanel();
        return;
      }
      if (currentView === 'kg') kgResetLayout();
      if (zoomBeh) d3svg.transition().duration(600).call(zoomBeh.transform, d3.zoomIdentity);
    });
    document.getElementById('btn-hl')?.addEventListener('click', () => {
      if (currentView === 'kg') kgClearHL();
      const ng = d3svg.selectAll('.tree-node');
      const lg = d3svg.select('.tree-link').node() ? d3svg.selectAll('path.tree-link') : null;
      if (ng && lg) {
        ng.selectAll('circle,path.diamond-path').transition().duration(240).attr('opacity', 1).attr('stroke-width', 2);
        lg.transition().duration(240).attr('opacity', 1);
      }
    });
    document.querySelectorAll('#kg-filter .fbtn').forEach(btn => {
      btn.addEventListener('click', () => setKgFilter(btn.dataset.kgFilter));
    });
    document.getElementById('vt-dt')?.addEventListener('click', () => {
      closeStructMenu();
      switchView('dt');
    });
    document.getElementById('vt-kg')?.addEventListener('click', () => {
      closeStructMenu();
      switchView('kg');
    });
    document.getElementById('vt-strategy')?.addEventListener('click', () => switchView('strategy'));
    document.getElementById('btn-struct-toggle')?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleStructMenu();
    });
    document.addEventListener('click', (e) => {
      const wrap = document.querySelector('.view-struct-wrap');
      if (wrap && !wrap.contains(e.target)) closeStructMenu();
    });
  }

  function init(opts) {
    KG_CHAPTERS = opts.kgChapters || [];
    DT_CHAPTERS = opts.dtChapters || [];
    metaChapters = opts.metaChapters || [];
    svgEl = document.getElementById('svg');
    d3svg = d3.select(svgEl);
    // Only explicit defaultView:'strategy' (standalone 图谱.html) opens strategy-first.
    // graph.html / preview-shell omit defaultView → start on dt (or kg) to avoid mermaid.render on first paint.
    if (opts.defaultView === 'strategy' && chapterHasStrategy(0)) currentView = 'strategy';
    else if (opts.defaultView === 'kg' || opts.defaultView === 'dt') currentView = opts.defaultView;
    else currentView = DT_CHAPTERS[0]?.tree ? 'dt' : 'kg';
    document.getElementById('vt-kg')?.classList.toggle('active', currentView === 'kg');
    document.getElementById('vt-dt')?.classList.toggle('active', currentView === 'dt');
    document.getElementById('vt-strategy')?.classList.toggle('active', currentView === 'strategy');
    bindControls();
    setGraphChrome();
    if (opts.onReady) opts.onReady({ buildTabs, loadChapter, render, switchView, setChapters });
    applyGraphHashFromUrl();
    buildTabs();
    syncStrategyTabVisibility();
    updateLegend();
    refreshInfoEmptyIfBare();
    render();
    window.addEventListener('hashchange', () => {
      applyGraphHashFromUrl();
      resetPanelForViewChange();
      render();
    });
    window.addEventListener('resize', scheduleStrategyResizeFit);
  }

  function setChapters(kg, dt, meta) {
    KG_CHAPTERS = kg;
    DT_CHAPTERS = dt;
    if (meta) metaChapters = meta;
    const tabs = document.getElementById('tabs');
    if (tabs) tabs.innerHTML = '';
    buildTabs();
    currentCh = 0;
    render();
  }

  return { init, setChapters, render, switchView, loadChapter };
})();

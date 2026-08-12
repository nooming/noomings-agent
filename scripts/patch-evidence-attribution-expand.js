/**
 * Expand evidence + short-attribution minset across craft packages.
 * Idempotent: skips packages that already have craftAttr.
 * Run: node scripts/patch-evidence-attribution-expand.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PKG_ROOT = path.join(ROOT, 'data', 'runtime', 'packages');
const SAMPLE_ROOT = path.join(ROOT, '样本html');

const CSS_BLOCK = `
.craft-card button:disabled{opacity:.45;cursor:not-allowed;filter:none;}
.craft-evidence{margin:0 0 12px;padding:10px 12px;border-radius:10px;background:rgba(0,0,0,.22);border:1px solid color-mix(in srgb,var(--craft-accent) 32%,transparent);font-size:.88rem;line-height:1.55;color:var(--craft-text);}
.craft-evidence strong{color:var(--craft-accent);font-weight:600;}
.craft-attr{margin:0 0 12px;}
.craft-attr-label{margin:0 0 8px;font-size:.9rem;color:var(--craft-muted);}
.craft-attr-options{display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;}
@media (max-width:420px){.craft-attr-options{grid-template-columns:1fr;}}
.craft-attr label{display:flex;align-items:flex-start;gap:8px;margin:0;font-size:.86rem;line-height:1.4;color:var(--craft-text);cursor:pointer;}
.craft-attr input{margin-top:3px;accent-color:var(--craft-accent);}
.craft-attr-hint{margin:8px 0 0;font-size:.78rem;line-height:1.45;color:var(--craft-muted);}
.craft-attr-hint[hidden]{display:none!important;}
.craft-reveal{margin-top:4px;}
.craft-reveal[hidden]{display:none!important;}
.craft-cv,#craft-cv{font-size:.8rem;color:var(--craft-muted);border:1px dashed color-mix(in srgb,var(--craft-accent) 35%,transparent);
  border-radius:10px;padding:8px 10px;margin:0 0 4px;line-height:1.45;}
.craft-actions{display:flex;gap:10px;margin-top:14px;}
.craft-actions button{flex:1;width:auto;padding:11px 10px;font-size:.95rem;}
.craft-btn-secondary{background:transparent!important;border:1px solid color-mix(in srgb,var(--craft-accent) 45%,transparent)!important;color:var(--craft-text)!important;font-weight:600!important;}
.craft-btn-secondary:hover{filter:brightness(1.08);background:rgba(255,255,255,.04)!important;}
`;

/** @typedef {{ id: string, label: string, option: string }} AvOpt */

/**
 * @type {Record<string, {
 *   wave: 2|3,
 *   question: string,
 *   avs: AvOpt[],
 *   readingLabel: string,
 *   readingSel?: string,
 *   actionLabel?: string,
 *   cv?: string,
 *   sample?: { dir: string, file: string },
 *   skip?: string,
 *   extraTuneSel?: string,
 * }>}
 */
const PACKAGES = {
  // —— Wave 2 ——
  'circular-motion': {
    wave: 2,
    question: '就你这几发的对照来看，线速度/向心力主要跟着哪一项变？',
    avs: [
      { id: 's-radius', label: '半径', option: '主要是半径 r' },
      { id: 's-omega', label: '角速度', option: '主要是角速度 ω' },
    ],
    readingLabel: '读数',
    readingSel: '#craftGaugeVal, .observe-box .state, .gauge .gval, #g-T',
    cv: '底座倾角只改观感倾斜，不改 v/F 物理（视觉旁路）。',
    sample: { dir: '圆周运动', file: '圆周运动.html' },
  },
  'pendulum-target': {
    wave: 2,
    question: '就你这几发的对照来看，落点/命中主要跟着哪一项变？',
    avs: [
      { id: 's-length', label: '摆长', option: '主要是摆长' },
      { id: 's-angle', label: '释放角', option: '主要是释放角' },
    ],
    readingLabel: '落点读数',
    cv: '质量 m 不改变落点（视觉旁路）。',
    sample: { dir: '单摆投靶', file: '单摆投靶.html' },
  },
  'pendulum-clock': {
    wave: 2,
    question: '就你这几发的对照来看，周期主要跟着哪一项变？',
    avs: [
      { id: 's-len', label: '摆长', option: '主要是摆长' },
      { id: 's-angle', label: '摆角', option: '主要是摆角' },
    ],
    readingLabel: '周期',
    readingSel: '#g-T, #craftGaugeVal, .gauge .gval',
    cv: '质量对小角度周期影响可忽略（旁路）。',
    sample: { dir: '钟表铺校时', file: '钟表铺校时.html' },
  },
  'momentum-collision': {
    wave: 2,
    question: '就你这几发的对照来看，碰后动量分配主要跟着哪一项变？',
    avs: [
      { id: 's-vel1', label: '入射速度', option: '主要是入射速度' },
      { id: 's-vel2', label: '靶速', option: '主要是靶体速度' },
      { id: 's-mass1', label: '入射质量', option: '主要是入射质量' },
      { id: 's-mass2', label: '靶质量', option: '主要是靶体质量' },
    ],
    readingLabel: '动量读数',
    cv: '轨温只改观感，不改一维动量分配（旁路）。',
    sample: { dir: '动量碰撞', file: '动量碰撞.html' },
  },
  'refraction-snell': {
    wave: 2,
    question: '就你这几发的对照来看，折射角/命中主要跟着哪一项变？',
    avs: [
      { id: 's-incident-angle', label: '入射角', option: '主要是入射角' },
      { id: 's-refractive-index', label: '折射率', option: '主要是折射率' },
    ],
    readingLabel: '折射读数',
    cv: '水温只改观感，不改 Snell 关系（旁路）。',
    sample: { dir: '折射', file: '折射.html' },
  },
  'heat-conduction': {
    wave: 2,
    question: '就你这几发的对照来看，热流主要跟着哪一项变？',
    avs: [
      { id: 's-thermal-conductivity', label: '导热系数', option: '主要是导热系数 κ' },
      { id: 's-area', label: '截面积', option: '主要是截面积 A' },
      { id: 's-temperature-diff', label: '温差', option: '主要是温差 ΔT' },
    ],
    readingLabel: '热流读数',
    sample: { dir: '热传导', file: '热传导.html' },
  },
  'rc-circuit': {
    wave: 2,
    question: '就你这几发的对照来看，时间常数/电流主要跟着哪一项变？',
    avs: [
      { id: 's-resistance', label: '电阻', option: '主要是电阻 R' },
      { id: 's-capacitance', label: '电容', option: '主要是电容 C' },
      { id: 's-supply-v', label: '电源电压', option: '主要是电源电压' },
    ],
    readingLabel: 'RC 读数',
    sample: { dir: 'RC电路', file: 'RC电路.html' },
  },
  photoelectric: {
    wave: 2,
    question: '就你这几发的对照来看，光电流主要跟着哪一项变？',
    avs: [
      { id: 's-frequency', label: '频率', option: '主要是光频率' },
      { id: 's-intensity', label: '光强', option: '主要是光强' },
      { id: 's-workfunction', label: '逸出功', option: '主要是逸出功' },
    ],
    readingLabel: '光电流读数',
    sample: { dir: '光电效应', file: '光电效应.html' },
  },
  'cyclotron-radius': {
    wave: 2,
    question: '就你这几发的对照来看，轨道半径主要跟着哪一项变？',
    avs: [
      { id: 's-magnetic', label: '磁场 B', option: '主要是磁场 B' },
      { id: 's-velocity', label: '入射速度', option: '主要是入射速度' },
    ],
    readingLabel: '半径读数',
    cv: '腔压只改观感，不改 r=mv/(qB)（旁路）。',
    sample: { dir: '回旋加速器', file: '回旋加速器.html' },
  },
  'magnetic-force': {
    wave: 2,
    question: '就你这几发的对照来看，安培力主要跟着哪一项变？',
    avs: [
      { id: 's-current', label: '电流', option: '主要是电流 I' },
      { id: 's-magnetic', label: '磁场', option: '主要是磁场 B' },
    ],
    readingLabel: '安培力读数',
    cv: '导线温度只改观感，不改 F=BIL（旁路）。',
    sample: { dir: '安培力', file: '安培力.html' },
  },
  'friction-incline': {
    wave: 2,
    question: '就你这几发的对照来看，能否进接货区主要跟着哪一项变？',
    avs: [
      { id: 's-angle', label: '倾角', option: '主要是倾角 θ' },
      { id: 's-friction', label: '摩擦系数', option: '主要是摩擦系数 μ' },
    ],
    readingLabel: '滑动读数',
    cv: '质量不改变临界 μ–θ 关系（旁路）。',
    sample: { dir: '斜面摩擦', file: '斜面摩擦.html' },
  },
  'gas-ideal': {
    wave: 2,
    question: '就你这几发的对照来看，pV 关系主要跟着哪一项变？',
    avs: [
      { id: 's-pressure', label: '压强', option: '主要是压强 p' },
      { id: 's-volume', label: '体积', option: '主要是体积 V' },
      { id: 's-piston-mass', label: '活塞质量', option: '主要是活塞质量' },
    ],
    readingLabel: 'pV 读数',
    sample: { dir: '理想气体', file: '理想气体.html' },
  },

  // —— Wave 3 ——
  'capacitor-era-ch1': {
    wave: 3,
    question: '就你这几发的对照来看，电容/击穿主要跟着哪一项变？',
    avs: [
      { id: 's-area', label: '极板面积', option: '主要是极板面积 A' },
      { id: 's-dist', label: '极距', option: '主要是极板间距 d' },
      { id: 's-thickness', label: '介质厚度', option: '主要是介质厚度' },
    ],
    readingLabel: '电容读数',
    sample: { dir: '电容_介质与击穿', file: '电容_介质与击穿.html' },
  },
  'capacitor-era-ch2': {
    wave: 3,
    question: '就你这几发的对照来看，等效电容主要跟着哪一项变？',
    avs: [
      { id: 's-c1', label: 'C1', option: '主要是 C1' },
      { id: 's-c2', label: 'C2', option: '主要是 C2' },
      { id: 's-c3', label: 'C3', option: '主要是 C3' },
    ],
    readingLabel: '等效电容',
    cv: '线缆长度多为旁路观感，不主导串并联公式。',
    sample: { dir: '电容_串并联', file: '电容_串并联.html' },
  },
  'capacitor-era-ch4': {
    wave: 3,
    question: '就你这几发的对照来看，储能主要跟着哪一项变？',
    avs: [
      { id: 'c4-c', label: '电容量 C', option: '主要是电容量 C' },
      { id: 'c4-v', label: '充电电压 V', option: '主要是充电电压 V' },
      { id: 's-cable', label: '馈线长度', option: '主要是馈线长度' },
    ],
    readingLabel: '储能',
    readingSel: '#c4-readout, #craftGaugeVal',
    extraTuneSel: '#c4-c-grid button, #c4-c-grid .c4-choice, #c4-v-grid button, #c4-v-grid .c4-choice, #c4-c-grid [data-c], #c4-v-grid [data-v]',
    sample: { dir: '电容_储能与充电', file: '电容_储能与充电.html' },
  },
  'capacitor-confound-ui': {
    wave: 3,
    question: '就你这几发的对照来看，电容读数主要跟着哪一项变？',
    avs: [
      { id: 's-area', label: '极板面积', option: '主要是极板面积 A' },
      { id: 's-distance', label: '极距', option: '主要是极板间距 d' },
    ],
    readingLabel: '电容读数',
    cv: '极板质量不进入 C=εA/d（混淆旁路）。',
    sample: { dir: '电容混淆', file: '电容混淆.html' },
  },
  'series-parallel': {
    wave: 3,
    question: '就你这几发的对照来看，总电阻/电流主要跟着哪一项变？',
    avs: [
      { id: 's-r1', label: 'R1', option: '主要是 R1' },
      { id: 's-r2', label: 'R2', option: '主要是 R2' },
    ],
    readingLabel: '电路读数',
    readingSel: '#obs-rtotal, #obs-current, #craftGaugeVal',
    cv: '电表内阻多为测量旁路，不主导串并联结论。',
    sample: { dir: '串并联电路', file: '串并联电路.html' },
  },
  'transformer-turns': {
    wave: 3,
    question: '就你这几发的对照来看，副边电压比主要跟着哪一项变？',
    avs: [
      { id: 's-n1', label: '原边匝数', option: '主要是原边匝数 N1' },
      { id: 's-n2', label: '副边匝数', option: '主要是副边匝数 N2' },
      { id: 's-U1', label: '原边电压', option: '主要是原边电压 U1' },
    ],
    readingLabel: '电压比读数',
    cv: '绕组温度只改观感，不改匝比关系（旁路）。',
    sample: { dir: '变压器', file: '变压器.html' },
  },
  'efield-charge': {
    wave: 3,
    question: '就你这几发的对照来看，偏转主要跟着哪一项变？',
    avs: [
      { id: 's-fieldStrength', label: '场强', option: '主要是场强 E' },
      { id: 's-charge', label: '电荷量', option: '主要是电荷量 q' },
    ],
    readingLabel: '偏转读数',
    cv: '极板间距不改变偏转（E 独立设定，旁路）。',
    sample: { dir: '电场', file: '电场.html' },
  },
  'thin-lens-implicit': {
    wave: 3,
    question: '就你这几发的对照来看，像距/清晰度主要跟着哪一项变？',
    avs: [
      { id: 's-object-distance', label: '物距', option: '主要是物距 u' },
      { id: 's-focal-length', label: '焦距', option: '主要是焦距 f' },
    ],
    readingLabel: '像距读数',
    cv: '光圈主要改亮度/景深观感，不改 1/f=1/u+1/v。',
    sample: { dir: '透镜', file: '透镜.html' },
  },
  'projectile-cannon': {
    wave: 3,
    question: '就你这几发的对照来看，落点主要跟着哪一项变？',
    avs: [
      { id: 'in-angle', label: '发射角', option: '主要是发射角' },
      { id: 'in-power', label: '初速/火力', option: '主要是初速/火力' },
      { id: 'in-drag', label: '阻力', option: '主要是空气阻力' },
      { id: 'in-wind', label: '风速', option: '主要是风速' },
    ],
    readingLabel: '射程',
    readingSel: '#hud-dist, #craftGaugeVal',
    sample: { dir: '抛体大炮', file: '抛体大炮.html' },
  },
  'multi-kp': {
    wave: 3,
    question: '就你这几发的对照来看，过环并停减速带主要跟着哪一项变？',
    avs: [
      { id: 's-height', label: '起始高度', option: '主要是起始高度 h' },
      { id: 's-speed', label: '释放速度', option: '主要是释放速度 v' },
    ],
    readingLabel: '过环/停靠',
    readingSel: '#observeText, #winMessage, #craftGaugeVal, .observe-box .state, .observe-value',
    actionLabel: '发射',
    cv: '小车质量只改观感大小，不改过环能量判据（旁路）。',
    sample: { dir: '机械能', file: '机械能.html' },
  },
};

function findCraftWinBlock(html) {
  const start = html.search(/<div\s+id=["']craft-win["']/i);
  if (start < 0) return null;
  const openAngle = html.indexOf('>', start);
  if (openAngle < 0) return null;
  let i = openAngle + 1;
  let depth = 1;
  while (i < html.length && depth > 0) {
    const nextOpen = html.indexOf('<div', i);
    const nextClose = html.indexOf('</div>', i);
    if (nextClose < 0) break;
    if (nextOpen >= 0 && nextOpen < nextClose) {
      depth += 1;
      i = nextOpen + 4;
    } else {
      depth -= 1;
      i = nextClose + 6;
    }
  }
  if (depth !== 0) return null;
  return { block: html.slice(start, i), index: start, length: i - start };
}

function extractCraftWinParts(html) {
  const found = findCraftWinBlock(html);
  if (!found) return null;
  const block = found.block;
  const formula = (block.match(/id="craftWinFormula"[^>]*>([\s\S]*?)<\/div>/) || [])[1] || '';
  const winText = (block.match(/id="craftWinText"[^>]*>([\s\S]*?)<\/p>/) || [])[1] || '';
  return { block, formula: formula.trim(), winText: winText.trim(), index: found.index, length: found.length };
}

function buildCraftWinHtml(cfg, formula, winText) {
  const opts = cfg.avs
    .map((a) => `        <label><input type="radio" name="craftAttr" value="${a.id}"> ${a.option}</label>`)
    .concat([
      '        <label><input type="radio" name="craftAttr" value="mixed"> 多参一起在变，说不清</label>',
      '        <label><input type="radio" name="craftAttr" value="unsure"> 还不确定</label>',
    ])
    .join('\n');
  const cv = cfg.cv
    ? `\n      <p id="craftCv" class="craft-cv">${cfg.cv}</p>`
    : `\n      <p id="craftCv" class="craft-cv" hidden></p>`;
  return `<div id="craft-win" hidden>
  <div class="craft-card">
    <h2>过关 · 本局对照</h2>
    <p id="craftEvidenceLine" class="craft-evidence">本局证据将自动填入</p>
    <div class="craft-attr" id="craftAttribution">
      <p class="craft-attr-label">${cfg.question}</p>
      <div class="craft-attr-options">
${opts}
      </div>
      <p id="craftAttrHint" class="craft-attr-hint" hidden></p>
    </div>
    <div class="craft-reveal" id="craftReveal" hidden>
      <div class="formula" id="craftWinFormula">${formula}</div>
      <p id="craftWinText">${winText}</p>${cv}
    </div>
    <div class="craft-actions">
      <button type="button" id="craftWinBtn" disabled>再玩一次</button>
      <button type="button" id="craftBackBtn" class="craft-btn-secondary">返回列表</button>
    </div>
  </div>
</div>`;
}

function buildHelperScript(pkgId, cfg) {
  const avLabels = {};
  cfg.avs.forEach((a) => {
    avLabels[a.id] = a.label;
  });
  const readingSel = cfg.readingSel || '#craftGaugeVal, .observe-box .state, .observe-value, #hud-dist, #g-T, .gauge .gval, #c4-readout, #obs-rtotal, #obs-current';
  const actionLabel = cfg.actionLabel || '操作';
  const readingLabel = cfg.readingLabel || '读数';
  const extraTuneSel = cfg.extraTuneSel || '';

  return `<script>
/* === ea-minset-helper (${pkgId}) === */
(function(){
  if (window.__eaMinset) return; window.__eaMinset = true;
  var AV_LABELS = ${JSON.stringify(avLabels)};
  var READING_SEL = ${JSON.stringify(readingSel)};
  var READING_LABEL = ${JSON.stringify(readingLabel)};
  var ACTION_LABEL = ${JSON.stringify(actionLabel)};
  var EXTRA_TUNE_SEL = ${JSON.stringify(extraTuneSel)};
  var sessionEvidence = {
    tuneCounts: {},
    fireCount: 0,
    lastReading: '',
    attribution: null,
    evidenceSummary: ''
  };
  Object.keys(AV_LABELS).forEach(function(id){ sessionEvidence.tuneCounts[id] = 0; });

  function noteAvTune(controlId){
    if (!sessionEvidence.tuneCounts.hasOwnProperty(controlId)) return;
    sessionEvidence.tuneCounts[controlId] += 1;
  }
  function noteFire(){ sessionEvidence.fireCount += 1; }
  function dominantAv(){
    var bestId = null, bestN = 0;
    Object.keys(sessionEvidence.tuneCounts).forEach(function(id){
      var n = sessionEvidence.tuneCounts[id];
      if (n > bestN) { bestN = n; bestId = id; }
    });
    return bestId ? { id: bestId, label: AV_LABELS[bestId] || bestId, count: bestN } : null;
  }
  function readObservation(){
    var nodes = document.querySelectorAll(READING_SEL);
    for (var i = 0; i < nodes.length; i++){
      var t = (nodes[i].textContent || '').replace(/\\s+/g, ' ').trim();
      if (t && t !== '待测' && t !== '--' && t !== '—.———' && t !== '观测中') return t;
    }
    return sessionEvidence.lastReading || '--';
  }
  function modeIsChallenge(){
    var s = document.getElementById('modeSelect');
    var v = s ? String(s.value || '') : '';
    if (v === 'challenge') return true;
    try {
      if (typeof window.__platformTraceGetPhase === 'function') {
        return String(window.__platformTraceGetPhase() || '') === 'challenge';
      }
    } catch (e) {}
    return false;
  }
  function buildEvidenceSummary(reading){
    var dom = dominantAv();
    var mainTxt = dom && dom.count > 0 ? (dom.label + '×' + dom.count) : '未集中调节';
    var r = reading || readObservation();
    sessionEvidence.lastReading = r;
    if (modeIsChallenge()) {
      return '竞赛证据：' + READING_LABEL + ' ' + r + ' · 主调 ' + mainTxt + ' · ' + ACTION_LABEL + ' ' + sessionEvidence.fireCount + ' 次';
    }
    return '探究证据：' + READING_LABEL + ' ' + r + ' · 主调节 ' + mainTxt + ' · ' + ACTION_LABEL + ' ' + sessionEvidence.fireCount + ' 次';
  }
  function setCraftSettleOpen(open){
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'craft-settle', open: !!open }, '*');
      }
    } catch (e) {}
  }
  function navigateToStudentList(){
    try {
      if (window.parent && window.parent !== window) {
        try { window.parent.postMessage({ type: 'platform-navigate', to: 'student-list' }, '*'); } catch (e1) {}
        try { window.parent.location.href = '/student.html'; return; } catch (e2) {}
        return;
      }
    } catch (e3) {}
    window.location.href = '../index.html';
  }
  function updateAttrHint(selected){
    var hintEl = document.getElementById('craftAttrHint');
    if (!hintEl) return;
    var dom = dominantAv();
    if (!dom || dom.count <= 0 || !selected || selected === 'mixed' || selected === 'unsure' || selected === dom.id) {
      hintEl.hidden = true; hintEl.textContent = ''; return;
    }
    hintEl.hidden = false;
    hintEl.textContent = '本局证据主调是' + dom.label + '；若答物理上谁更灵敏可另说——此处问的是本局对照';
  }
  function setCraftRevealVisible(visible){
    var reveal = document.getElementById('craftReveal');
    if (reveal) reveal.hidden = !visible;
  }
  function prepareCraftWin(extraReading){
    var reading = extraReading || readObservation();
    sessionEvidence.evidenceSummary = buildEvidenceSummary(reading);
    sessionEvidence.attribution = null;
    var line = document.getElementById('craftEvidenceLine');
    if (line) line.innerHTML = '<strong>本局证据</strong>　' + sessionEvidence.evidenceSummary;
    document.querySelectorAll('input[name="craftAttr"]').forEach(function(el){ el.checked = false; });
    var wbtn = document.getElementById('craftWinBtn');
    if (wbtn) wbtn.disabled = true;
    setCraftRevealVisible(false);
    updateAttrHint(null);
    window.__eaSessionEvidence = sessionEvidence;
  }
  function emitAttributionSnapshot(){
    if (!window.__emit || !sessionEvidence.attribution) return;
    var c = window.__snapControls ? window.__snapControls() : {};
    window.__emit('snapshot', {
      controls: c,
      winOk: true,
      attribution: sessionEvidence.attribution,
      evidenceSummary: sessionEvidence.evidenceSummary
    });
  }

  function bindTunes(){
    Object.keys(AV_LABELS).forEach(function(id){
      var el = document.getElementById(id);
      if (!el) return;
      var handler = function(){ noteAvTune(id); };
      el.addEventListener('input', handler);
      el.addEventListener('change', handler);
    });
    // capacitor ch4 choice grids
    if (EXTRA_TUNE_SEL) {
      document.addEventListener('click', function(ev){
        var t = ev.target;
        if (!t || !t.closest) return;
        if (t.closest('#c4-c-grid')) noteAvTune('c4-c');
        else if (t.closest('#c4-v-grid')) noteAvTune('c4-v');
      }, true);
    }
    var fireSel = '#btnLaunch,#btn-test,#btn-fire,#btnFire,#btnTest,#fireBtn,#btn-run,#btnRun,#c4-discharge-btn,[data-action="fire"],[data-action="test"],[data-action="launch"]';
    document.addEventListener('click', function(ev){
      var t = ev.target;
      if (!t || !t.closest) return;
      if (t.closest(fireSel)) noteFire();
    }, true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindTunes);
  else bindTunes();

  window.__eaPrepareCraftWin = prepareCraftWin;
  window.__eaEmitAttribution = emitAttributionSnapshot;
  window.__eaSessionEvidence = sessionEvidence;
  window.__eaSetCraftSettleOpen = setCraftSettleOpen;
  window.__eaNavigateToStudentList = navigateToStudentList;
  window.__eaUpdateAttrHint = updateAttrHint;
  window.__eaSetCraftRevealVisible = setCraftRevealVisible;
  window.__eaNoteAvTune = noteAvTune;
  window.__eaNoteFire = noteFire;
})();
</script>`;
}

function buildGoldRuntime() {
  return `<script>
/* === craft-gold-runtime === */
(function(){
  if (window.__craftGold) return; window.__craftGold = true;
  var intro = document.getElementById('craft-intro');
  var win = document.getElementById('craft-win');
  var btn = document.getElementById('craftIntroBtn');
  var wbtn = document.getElementById('craftWinBtn');
  var bbtn = document.getElementById('craftBackBtn');
  if (btn) btn.addEventListener('click', function(){ if(intro) intro.hidden = true; });
  function setSettle(open){
    if (typeof window.__eaSetCraftSettleOpen === 'function') window.__eaSetCraftSettleOpen(open);
  }
  function replayLevel(){
    if (typeof window.__craftReplay === 'function') {
      try { window.__craftReplay(); return; } catch (e) {}
    }
    var rbtn = document.getElementById('btn-reset')
      || document.querySelector('#btnReset, button.btn-reset, [data-action="reset"]');
    if (rbtn) { try { rbtn.click(); } catch (e) {} }
  }
  if (wbtn) wbtn.addEventListener('click', function(){
    if (wbtn.disabled) return;
    try { if (typeof window.__platformTraceRequestNewRound === 'function') window.__platformTraceRequestNewRound('craft_win_replay'); } catch (__nr) {}
    window.__craftWinDismissed = true;
    if (win) win.hidden = true;
    setSettle(false);
    replayLevel();
  });
  if (bbtn) bbtn.addEventListener('click', function(){
    if (typeof window.__eaNavigateToStudentList === 'function') window.__eaNavigateToStudentList();
  });
  document.querySelectorAll('input[name="craftAttr"]').forEach(function(el){
    el.addEventListener('change', function(){
      if (!el.checked) return;
      var ev = window.__eaSessionEvidence;
      if (ev) ev.attribution = el.value;
      if (typeof window.__eaSetCraftRevealVisible === 'function') window.__eaSetCraftRevealVisible(true);
      if (typeof window.__eaUpdateAttrHint === 'function') window.__eaUpdateAttrHint(el.value);
      if (typeof window.__eaEmitAttribution === 'function') window.__eaEmitAttribution();
      if (wbtn) wbtn.disabled = false;
    });
  });

  function showWin(extra){
    if (win) {
      window.__craftWinDismissed = false;
      if (typeof window.__eaPrepareCraftWin === 'function') {
        var ev0 = window.__eaSessionEvidence;
        if (!ev0 || !ev0.evidenceSummary) window.__eaPrepareCraftWin();
      }
      try {
        var msg = document.getElementById('messageBox');
        if (msg) msg.classList.add('hidden');
      } catch (e) {}
      // prefer craft-win over long chapter summaries when both exist
      try {
        ['summary4','summary1','summary2','summary3','victory'].forEach(function(id){
          var el = document.getElementById(id);
          if (el) el.style.display = 'none';
        });
      } catch (e2) {}
      win.hidden = false;
      setSettle(true);
      var ev = window.__eaSessionEvidence;
      if (!(ev && ev.attribution)) {
        if (typeof window.__eaSetCraftRevealVisible === 'function') window.__eaSetCraftRevealVisible(false);
        if (wbtn) wbtn.disabled = true;
      }
      var t = document.getElementById('craftWinText');
      if (t && typeof extra === 'string' && extra) t.textContent = extra;
    }
  }
  window.__craftShowWin = showWin;

  var _emit = window.__emit;
  window.__emit = function(type, payload){
    if (typeof _emit === 'function') _emit(type, payload);
    if (type === 'win') showWin();
  };
  var obs = new MutationObserver(function(){
    if (window.__craftWinDismissed) return;
    var el = document.querySelector('.win-banner,.win-badge,#winBanner,[data-win="1"]');
    if (el && el.offsetParent !== null) showWin();
  });
  obs.observe(document.body, {childList:true, subtree:true, attributes:true, attributeFilter:['class','style','hidden']});

  function tick(){
    var src = document.querySelector('.observe-box .state, .observe-value, #hud-dist, #g-T, .gauge .gval, #c4-readout, #obs-rtotal');
    var gval = document.getElementById('craftGaugeVal');
    if (gval && src && src !== gval) gval.textContent = (src.textContent || '').trim() || '观测中';
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
</script>`;
}

function injectCss(html) {
  if (html.includes('.craft-evidence{') || html.includes('.craft-evidence {')) return html;
  // Prefer insert after craft-win hidden rule
  const markers = [
    '#craft-intro[hidden],#craft-win[hidden]{display:none!important;}',
    '#craft-intro[hidden], #craft-win[hidden] { display: none !important; }',
  ];
  for (const mk of markers) {
    if (html.includes(mk)) {
      return html.replace(mk, mk + '\n' + CSS_BLOCK);
    }
  }
  // fallback: before craft-gold-runtime comment end of style? inject before </style> nearest to craft-gold
  const idx = html.indexOf('/* === craft-gold-shell === */');
  if (idx >= 0) {
    const styleEnd = html.indexOf('</style>', idx);
    if (styleEnd >= 0) {
      return html.slice(0, styleEnd) + CSS_BLOCK + '\n' + html.slice(styleEnd);
    }
  }
  return html.replace('</head>', `<style>${CSS_BLOCK}</style>\n</head>`);
}

function replaceGoldRuntime(html) {
  const re = /<script>\s*\/\* === craft-gold-runtime === \*\/[\s\S]*?<\/script>/;
  if (!re.test(html)) {
    // append before </body>
    return html.replace(/<\/body>/i, buildHelperPlaceholder() + buildGoldRuntime() + '\n</body>');
  }
  return html.replace(re, '___EA_HELPER___' + buildGoldRuntime());
}

function buildHelperPlaceholder() {
  return '___EA_HELPER___';
}

function patchHtml(html, pkgId, cfg) {
  if (/name="craftAttr"/.test(html) && /craftEvidenceLine/.test(html) && /ea-minset-helper/.test(html)) {
    return { html, status: 'already' };
  }
  // If partially patched from pilot style without helper, still re-apply carefully
  const parts = extractCraftWinParts(html);
  if (!parts) return { html, status: 'no-craft-win' };

  let next = html;
  next = injectCss(next);

  const newWin = buildCraftWinHtml(cfg, parts.formula || '核心关系', parts.winText || '通过对照读数，你摸清了本实验的关键变量。');
  const found2 = findCraftWinBlock(next);
  if (!found2) return { html, status: 'no-craft-win' };
  next = next.slice(0, found2.index) + newWin + next.slice(found2.index + found2.length);

  next = replaceGoldRuntime(next);
  const helper = buildHelperScript(pkgId, cfg);
  if (next.includes('___EA_HELPER___')) {
    next = next.replace('___EA_HELPER___', helper + '\n');
  } else if (!next.includes('ea-minset-helper')) {
    next = next.replace(/<\/body>/i, helper + '\n</body>');
  }

  // Ensure craftWinBtn starts disabled if present in leftover markup — already in newWin
  return { html: next, status: 'patched' };
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function syncSample(pkgId, cfg, runtimeHtml) {
  if (!cfg.sample) return { status: 'no-sample-cfg' };
  const destDir = path.join(SAMPLE_ROOT, cfg.sample.dir);
  const destFile = path.join(destDir, cfg.sample.file);
  if (!fs.existsSync(destDir)) return { status: 'no-sample-dir' };
  // Always write/overwrite mirror game file
  fs.writeFileSync(destFile, runtimeHtml, 'utf8');
  return { status: 'synced', path: path.relative(ROOT, destFile) };
}

function staticCheck(html) {
  const checks = {
    craftAttr: /name="craftAttr"/.test(html),
    evidence: /craftEvidenceLine|evidenceSummary/.test(html),
    reveal: /craft-reveal|craftReveal/.test(html),
    emitAttr: /attribution:\s*sessionEvidence\.attribution|attribution:\s*ev\.attribution|attribution:\s*sessionEvidence/.test(html)
      || /attribution:\s*[a-zA-Z.]+attribution/.test(html),
    gate: /wbtn\.disabled\s*=\s*true|disabled>再玩一次/.test(html),
  };
  checks.ok = checks.craftAttr && checks.evidence && checks.reveal && checks.emitAttr && checks.gate;
  return checks;
}

function main() {
  const onlyId = process.argv[2] || '';
  const completed = [];
  const skipped = [];
  const failed = [];

  // Always skip pilots
  if (!onlyId) {
    skipped.push({ id: 'ramp-rolling-collision', reason: '已有完整归因试点', wave: 1 });
    skipped.push({ id: 'projectile-basic', reason: '已有完整归因试点', wave: 1 });
  }

  const ids = Object.keys(PACKAGES);
  for (const id of ids) {
    if (onlyId && id !== onlyId) continue;
    const cfg = PACKAGES[id];
    if (cfg.skip) {
      skipped.push({ id, reason: cfg.skip, wave: cfg.wave });
      continue;
    }
    const file = path.join(PKG_ROOT, id, 'game.html');
    if (!fs.existsSync(file)) {
      skipped.push({ id, reason: 'runtime 包不存在', wave: cfg.wave });
      continue;
    }
    const raw = fs.readFileSync(file, 'utf8');
    const { html, status } = patchHtml(raw, id, cfg);
    if (status === 'no-craft-win') {
      skipped.push({ id, reason: '无 #craft-win 结算卡', wave: cfg.wave });
      continue;
    }
    if (status === 'already') {
      const chk = staticCheck(raw);
      completed.push({ id, wave: cfg.wave, status: 'already', checks: chk, sample: null });
      continue;
    }
    fs.writeFileSync(file, html, 'utf8');
    const sample = syncSample(id, cfg, html);
    const chk = staticCheck(html);
    if (!chk.ok) {
      failed.push({ id, wave: cfg.wave, checks: chk });
    } else {
      completed.push({ id, wave: cfg.wave, status: 'patched', checks: chk, sample });
    }
  }

  // Also scan remaining craft packages not in list
  if (!onlyId) {
    const allDirs = fs.readdirSync(PKG_ROOT, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .filter((n) => !['reports', 'vendor'].includes(n));
    for (const id of allDirs) {
      if (PACKAGES[id] || id === 'ramp-rolling-collision' || id === 'projectile-basic') continue;
      const file = path.join(PKG_ROOT, id, 'game.html');
      if (!fs.existsSync(file)) continue;
      const raw = fs.readFileSync(file, 'utf8');
      if (!raw.includes('id="craft-win"')) {
        skipped.push({ id, reason: '无 #craft-win（未列入批次且无结算卡）', wave: '?' });
        continue;
      }
      if (/name="craftAttr"/.test(raw)) {
        completed.push({ id, wave: '?', status: 'already-other', checks: staticCheck(raw), sample: null });
        continue;
      }
      skipped.push({ id, reason: '有 craft-win 但未列入本波配置（需人工补配置）', wave: '?' });
    }
  }

  const reportPath = path.join(PKG_ROOT, 'reports', 'evidence-attribution-expand.md');
  if (!onlyId) {
    ensureDir(path.join(PKG_ROOT, 'reports'));
    const lines = [];
    lines.push('# 证据 + 短归因扩包 · 短报');
    lines.push('');
    lines.push('日期：2026-08-08 · 未 commit');
    lines.push('');
    lines.push('## 完成');
    lines.push('');
    lines.push('| 波次 | 包 id | 状态 | 样本同步 | 静态检查 |');
    lines.push('|------|-------|------|----------|----------|');
    for (const c of completed) {
      const sampleTxt = c.sample && c.sample.status === 'synced' ? c.sample.path : (c.sample && c.sample.status) || '-';
      const chk = c.checks && c.checks.ok ? 'OK' : JSON.stringify(c.checks);
      lines.push(`| ${c.wave} | \`${c.id}\` | ${c.status} | ${sampleTxt} | ${chk} |`);
    }
    lines.push('');
    lines.push('## 跳过');
    lines.push('');
    lines.push('| 波次 | 包 id | 原因 |');
    lines.push('|------|-------|------|');
    for (const s of skipped) {
      lines.push(`| ${s.wave} | \`${s.id}\` | ${s.reason} |`);
    }
    if (failed.length) {
      lines.push('');
      lines.push('## 静态检查未过');
      lines.push('');
      for (const f of failed) {
        lines.push(`- \`${f.id}\`: ${JSON.stringify(f.checks)}`);
      }
    }
    lines.push('');
    lines.push('## 约定（与试点一致）');
    lines.push('');
    lines.push('1. 过关自动「本局证据」一行（读数 + 主调控件次数）');
    lines.push('2. 归因单选：本局对照问法（含 mixed/unsure）');
    lines.push('3. 点选前隐藏 `.craft-reveal`；「再玩一次」需先点选');
    lines.push("4. 点选后 `__emit('snapshot', { attribution, evidenceSummary, winOk: true })`");
    lines.push('5. 不改 judge 用 attribution 判分');
    lines.push('');
    fs.writeFileSync(reportPath, lines.join('\n'), 'utf8');
  }

  console.log(JSON.stringify({ onlyId: onlyId || null, completed: completed.length, skipped: skipped.length, failed: failed.length, reportPath }, null, 2));
  for (const c of completed) console.log('OK', c.wave, c.id, c.status, c.sample && c.sample.status);
  for (const s of skipped) console.log('SKIP', s.wave, s.id, s.reason);
  for (const f of failed) console.log('FAIL', f.id, f.checks);
}

main();

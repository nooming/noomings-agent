/**
 * Apply copy-voice-table.json → game.html / chapter.json / manifest (+ 样本html mirror).
 *
 * Usage:
 *   node tests/scripts/copy-voice-apply.js
 *   node tests/scripts/copy-voice-apply.js --pkg transformer-turns
 *   node tests/scripts/copy-voice-apply.js --no-mirror
 *   node tests/scripts/copy-voice-apply.js --platform-only
 */
'use strict';

const fs = require('fs');
const path = require('path');
const YANG_MAP = require('../lib/yangben-sample-map');
const { THEMES } = require('./craft-scene-themes');

const ROOT = path.resolve(__dirname, '../..');
const PKG = path.join(ROOT, 'data/runtime/packages');
const YANG = path.join(ROOT, '样本html');
const TABLE_PATH = path.join(__dirname, 'copy-voice-table.json');
const MANIFEST = path.join(PKG, 'manifest.json');

const MIRROR = Object.fromEntries(YANG_MAP.map((e) => [e.id, path.join(e.dir, e.game)]));

function loadTable() {
  const raw = JSON.parse(fs.readFileSync(TABLE_PATH, 'utf8'));
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k.startsWith('_')) continue;
    out[k] = v;
  }
  return out;
}

function introParagraph(v) {
  return `${v.introHook}${v.introExplore}`;
}

function patchCraftIntro(html, v) {
  let out = html;
  const title = v.title || (THEMES[v._id] && THEMES[v._id].title) || v.metaphor;
  if (/<div id="craft-intro">[\s\S]*?<h2>[^<]+<\/h2>/.test(out)) {
    out = out.replace(
      /(<div id="craft-intro">[\s\S]*?<h2>)[^<]+(<\/h2>)/,
      `$1${title}$2`
    );
  }
  if (/<div id="craft-intro">[\s\S]*?<p>[\s\S]*?<\/p>/.test(out)) {
    out = out.replace(
      /(<div id="craft-intro">[\s\S]*?<p>)[\s\S]*?(<\/p>)/,
      `$1${introParagraph(v)}$2`
    );
  }
  return out;
}

function patchSideGoalDefault(html, v) {
  // Default HTML text in #sideGoal (explore voice; challenge filled by JS)
  return html.replace(
    /(<p[^>]*id="sideGoal"[^>]*>)([\s\S]*?)(<\/p>)/,
    `$1${v.exploreSide}$3`
  );
}

function patchGoalMissionDefault(html, v) {
  let out = html;
  // essence-sub with id=goalMission
  out = out.replace(
    /(<div[^>]*class="essence-sub"[^>]*id="goalMission"[^>]*>)([\s\S]*?)(<\/div>)/,
    `$1${v.exploreHud}$3`
  );
  out = out.replace(
    /(<div[^>]*id="goalMission"[^>]*class="essence-sub"[^>]*>)([\s\S]*?)(<\/div>)/,
    `$1${v.exploreHud}$3`
  );
  // other goalMission divs that look like explore defaults (not display:none only stubs)
  out = out.replace(
    /(<div id="goalMission"[^>]*>)([^<]{8,120})(<\/div>)/g,
    (m, a, text, c) => {
      if (/display\s*:\s*none/.test(a)) return m;
      if (/急单|本局|锁定|竞赛/.test(text) && !/自由|试|观察|对比|调/.test(text)) return m;
      return `${a}${v.exploreHud}${c}`;
    }
  );
  return out;
}

function patchEssenceTitle(html, v, pkg) {
  const hud = v.hudTitle || v.metaphor;
  let out = html;
  // pendulum-target keeps mode tag
  if (pkg === 'pendulum-target') {
    out = out.replace(
      /(<div class="essence-title">)[\s\S]*?(<strong id="hudModeTag">)/,
      `$1${hud} · $2`
    );
    return out;
  }
  out = out.replace(
    /(<div class="essence-title">)[^<]+(<\/div>)/,
    `$1${hud}$2`
  );
  // craft card / bench h1 if clearly a scene title (short)
  out = out.replace(
    /(<div id="essence-bench-hd"[\s\S]*?<h1>)([^<]{2,40})(<\/h1>)/,
    (m, a, t, c) => {
      if (/测试|观察|控制|参数/.test(t)) return m;
      return `${a}${hud}${c}`;
    }
  );
  return out;
}

function patchModeGoalsObject(html, v) {
  // MODE_GOALS / similar: explore + challenge with hud/side
  let out = html;
  const re = /(explore\s*:\s*\{\s*hud\s*:\s*')([^']*)('\s*,\s*side\s*:\s*')([^']*)(')/;
  if (re.test(out)) {
    out = out.replace(re, `$1${v.exploreHud}$3${v.exploreSide}$5`);
  }
  const reC = /(challenge\s*:\s*\{\s*hud\s*:\s*')([^']*)('\s*,\s*side\s*:\s*')([^']*)(')/;
  if (reC.test(out)) {
    out = out.replace(reC, `$1${v.challengeHud}$3${v.challengeSide}$5`);
  }
  // alt key order side then hud (rare)
  const re2 = /(explore\s*:\s*\{\s*side\s*:\s*')([^']*)('\s*,\s*hud\s*:\s*')([^']*)(')/;
  if (re2.test(out)) {
    out = out.replace(re2, `$1${v.exploreSide}$3${v.exploreHud}$5`);
  }
  const re2c = /(challenge\s*:\s*\{\s*side\s*:\s*')([^']*)('\s*,\s*hud\s*:\s*')([^']*)(')/;
  if (re2c.test(out)) {
    out = out.replace(re2c, `$1${v.challengeSide}$3${v.challengeHud}$5`);
  }
  return out;
}

function patchInlineGoalStrings(html, v) {
  let out = html;
  // Common explore side assignments that still use boilerplate
  const exploreSideAssigns = [
    /side\.textContent\s*=\s*'探究[^']*'/,
    /side\.textContent\s*=\s*"探究[^"]*"/,
    /if\s*\(side\)\s*side\.textContent\s*=\s*'探究[^']*'/,
  ];
  // Replace explore-only assignments carefully: only when string starts with 探究
  out = out.replace(
    /(side\.textContent\s*=\s*)'(探究[^']*)'(\s*;)/g,
    (m, pref, s, end) => {
      if (/试着弄清|不必先|自由|试/.test(s) || /^探究/.test(s)) {
        return `${pref}'${v.exploreSide}'${end}`;
      }
      return m;
    }
  );
  out = out.replace(
    /(side\.textContent\s*=\s*)"(探究[^"]*)"(\s*;)/g,
    (m, pref, s, end) => {
      if (/试着弄清|不必先|自由|试/.test(s) || /^探究/.test(s)) {
        return `${pref}"${v.exploreSide}"${end}`;
      }
      return m;
    }
  );

  // explore mission assignments (whole-string only)
  out = out.replace(
    /(mission\.textContent\s*=\s*)'(探究[^']*|目标：自由[^']*|目标：对比[^']*|目标：自由试[^']*)'(\s*;)/g,
    `$1'${v.exploreHud}'$3`
  );

  // Static challenge side only when the string is the whole assignment (no concatenation)
  out = out.replace(
    /(side\.textContent\s*=\s*)'(竞赛[^']*)'(\s*;)/g,
    (m, pref, s, end) => {
      if (/本局|急单|限次|锁定/.test(s)) return `${pref}'${v.challengeSide}'${end}`;
      return m;
    }
  );

  // pendulum-clock / friction / cap-era specific explore strings already covered by 探究* replace

  // Cap-era explore mission
  out = out.replace(
    /(mission\.textContent\s*=\s*)'(探究：自由换介质[^']*|探究：自由[^']*)'/g,
    `$1'${v.exploreHud}'`
  );

  // friction explore mission hardcode
  out = out.replace(
    /(mission\.textContent\s*=\s*)'(目标：自由试卸[^']*)'/g,
    `$1'${v.exploreHud}'`
  );
  out = out.replace(
    /(side\.textContent\s*=\s*)'(探究·仓库试滑[^']*)'/g,
    `$1'${v.exploreSide}'`
  );

  // clock
  out = out.replace(
    /(side\.textContent\s*=\s*)'(探究·夜校时[^']*)'/g,
    `$1'${v.exploreSide}'`
  );
  out = out.replace(
    /(sub\.textContent\s*=\s*)'(目标：自由校时[^']*)'/g,
    `$1'${v.exploreHud}'`
  );

  // projectile-cannon refresh — look for explore strings
  out = out.replace(
    /(side\.textContent\s*=\s*)'(试着弄清：换阻力[^']*)'/g,
    `$1'${v.exploreSide}'`
  );
  out = out.replace(
    /(mission\.textContent\s*=\s*)'(目标：自由试射，对比落点[^']*)'/g,
    `$1'${v.exploreHud}'`
  );

  return out;
}

function patchFeedbackVoice(html, v) {
  let out = html;
  // Generic de-template
  out = out.replace(/ · 探究对比中/g, ' · 对照参数再测');
  out = out.replace(/· 探究对比中/g, '· 对照参数再测');
  out = out.replace(/探究对比中（不要求固定屏距）/g, '像位已出 · 对照物距与焦距再调');
  out = out.replace(/探究对比中/g, '对照参数再测');

  // Package-tuned replacements where easy
  if (v.feedbackExplore) {
    // transformer style: '本次 U₂=' + ... + ' V · 对照...'
    out = out.replace(
      /'本次 U₂='\s*\+\s*U2rounded\.toFixed\(2\)\s*\+\s*' V · 对照参数再测'/g,
      `'本次 U₂=' + U2rounded.toFixed(2) + ' V · 对照匝比与输入再看'`
    );
    out = out.replace(
      /'已观察到光电流 '\s*\+\s*I\.toFixed\(1\)\s*\+\s*' μA · 对照参数再测'/g,
      `'光电流 ' + I.toFixed(1) + ' μA · 对照频率与逸出功'`
    );
    out = out.replace(
      /'本次乘积 '\s*\+\s*pv\.toFixed\(2\)\s*\+\s*' · 对照参数再测'/g,
      `'乘积 ' + pv.toFixed(2) + ' · 对照 p、V 再测'`
    );
    out = out.replace(
      /'当前托力 · 对照参数再测'/g,
      `'托力已出 · 对照电流与磁场再测'`
    );
    out = out.replace(
      /'当前电流 · 继续对比串并联（探究）'/g,
      `'电流已出 · 对照接法与电阻再测'`
    );
    out = out.replace(
      /'光线掠过对照靶 · 对照参数再测'/g,
      `'光路已出 · 对照入射角与折射率再瞄'`
    );
    out = out.replace(
      /feedback\.textContent\s*=\s*'自由试供电：调匝比与输入，观察 U₂'/g,
      `feedback.textContent = '调匝比与输入，读 U₂'`
    );
    out = out.replace(
      /feedback\.textContent\s*=\s*'自由试吊：调 I、B 观察托力'/g,
      `feedback.textContent = '调 I、B，读托力'`
    );
    out = out.replace(
      /feedback\.textContent\s*=\s*'自由试配：切换串\/并联，观察电流变化。'/g,
      `feedback.textContent = '切换串/并联，读总电流。'`
    );
    out = out.replace(
      /feedback\.textContent\s*=\s*'自由试照 · 观察折射光路'/g,
      `feedback.textContent = '调入射角与折射率，看光路'`
    );
  }
  return out;
}

function scrubLegacyPlaceNames(html, v, pkg) {
  let out = html;
  // Title/hud mismatches called out in brief
  const scrubs = {
    'transformer-turns': [
      [/露营营地副边电压飘了/g, '副边供电不稳'],
      [/营地试供电/g, '台架试供电'],
      [/营地急单/g, '工地急单'],
      [/自由试供电：调匝比与输入，观察 U₂/g, '调匝比与输入，读 U₂'],
    ],
    'pendulum-target': [
      [/矿井投递/g, '单摆投靶台'],
      [/探究·矿井试投/g, '探究·投靶试摆'],
    ],
    'efield-charge': [
      [/霓虹试写/g, '偏转试射'],
      [/招牌急修/g, '偏转急单'],
      [/招牌管里的光点偏了/g, '偏转舱里光点偏了'],
    ],
    'momentum-collision': [
      [/探究·分拣试投/g, '探究·导轨对撞'],
      [/夜班分拣/g, '气垫导轨'],
    ],
    'refraction-snell': [
      [/探究·码头试照/g, '探究·水槽试照'],
      [/竞赛·夜潜急单/g, '竞赛·水下急单'],
      [/码头夜潜要照亮水下浮标/g, '水下浮标照不准'],
    ],
    'gas-ideal': [
      [/探究·压舱试压/g, '探究·气室试压'],
      [/下潜前压舱气室读数飘了/g, '压舱气室读数飘了'],
    ],
    'heat-conduction': [
      [/探究·守夜试调/g, '探究·导热试调'],
      [/竞赛·暴风雪急单/g, '竞赛·热流急单'],
      [/暴风雪夜里，炉膛侧偏热、值班舱偏凉。/g, '墙这边烫、那边凉——'],
    ],
    'series-parallel': [
      [/探究·后台试配/g, '探究·接线试配'],
      [/竞赛·开演急单/g, '竞赛·配流急单'],
      [/后台电源板要给灯带配流/g, '灯带电流不稳'],
    ],
    'thin-lens-implicit': [
      [/探究·幕布试映/g, '探究·光具试像'],
      [/竞赛·暗室急单/g, '竞赛·光屏急单'],
      [/露天电影幕布要重标定/g, '光屏上的像对不齐'],
    ],
    'magnetic-force': [
      [/夜班仓库磁轨吊运偏了/g, '磁轨吊运托力偏了'],
      [/探究·磁轨试吊/g, '探究·测力试吊'],
    ],
    'projectile-basic': [
      [/野战炮兵/g, '斜抛靶场'],
      [/郊外靶场上，/g, ''],
    ],
    'capacitor-confound-ui': [
      [/老式收音机调谐电容读数飘了/g, '平行板电容读数飘了'],
      [/探究·夜修试调/g, '探究·装配试调'],
      [/竞赛·夜修急单/g, '竞赛·读数急单'],
    ],
    'circular-motion': [
      [/探究·飞椅试转/g, '探究·转盘试转'],
    ],
    'multi-kp': [
      [/探究·夜场试车/g, '探究·环轨试车'],
      [/竞赛·首班发车/g, '竞赛·过环急单'],
      [/首班试车卡在出发台——/g, '环轨试车卡在出发台——'],
    ],
    'capacitor-era-ch1': [
      [/雷暴夜里信号塔电容组又飘了/g, '介质台读数飘了'],
      [/探究·信号塔试修/g, '探究·介质试修'],
    ],
    'capacitor-era-ch2': [
      [/城邦储能站电容组要重配/g, '电容组要重配'],
    ],
    'capacitor-era-ch4': [
      [/城门封印要精确储能/g, '储能台读数要卡准'],
    ],
  };
  for (const [re, to] of scrubs[pkg] || []) {
    out = out.replace(re, to);
  }
  return out;
}

function applyGameHtml(html, v, pkg) {
  let out = html;
  out = patchCraftIntro(out, v);
  out = patchSideGoalDefault(out, v);
  out = patchGoalMissionDefault(out, v);
  out = patchEssenceTitle(out, v, pkg);
  out = patchModeGoalsObject(out, v);
  out = patchInlineGoalStrings(out, v);
  out = scrubLegacyPlaceNames(out, v, pkg);
  out = patchFeedbackVoice(out, v);
  // After scrub, re-assert intro (scrub may have partially hit intro already replaced)
  // Ensure title tag matches
  if (v.title) {
    out = out.replace(/<title>[^<]*<\/title>/, `<title>${v.title}</title>`);
  }
  return out;
}

function applyChapterJson(pkg, v) {
  const p = path.join(PKG, pkg, 'chapter.json');
  if (!fs.existsSync(p)) return { changed: false };
  let text = fs.readFileSync(p, 'utf8');
  const before = text;
  const subs = v.oldChapterSubs || [];
  for (const old of subs) {
    // Only replace JSON string values equal to old sub/subtitle-like fields
    const esc = old.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text.replace(new RegExp(`("sub(?:title)?"\\s*:\\s*")${esc}(")`, 'g'), `$1${v.chapterSub}$2`);
    // Also replace exact title if it was the old place metaphor for projectile-cannon
    if (pkg === 'projectile-cannon' && old === '海防炮台 · 野战试射') {
      text = text.replace(new RegExp(`("title"\\s*:\\s*")${esc}(")`, 'g'), `$1${v.title}$2`);
      text = text.replace(new RegExp(`("summary"\\s*:\\s*")${esc}(")`, 'g'), `$1${v.title}$2`);
      text = text.replace(new RegExp(`("label"\\s*:\\s*")${esc}(")`, 'g'), `$1${v.title}$2`);
      text = text.replace(new RegExp(`("knowledgeSummary"\\s*:\\s*")${esc}(")`, 'g'), `$1${v.title}$2`);
    }
  }
  // Align top-level kg-ish subtitle if still mismatched metaphor leftovers
  if (v.chapterSub && pkg === 'transformer-turns') {
    text = text.replace(/营地供电 · 变压器柜/g, v.chapterSub);
  }
  if (text !== before) {
    fs.writeFileSync(p, text, 'utf8');
    return { changed: true };
  }
  return { changed: false };
}

function applyManifest(table) {
  if (!fs.existsSync(MANIFEST)) return { changed: false, n: 0 };
  const data = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  let n = 0;
  for (const s of data.samples || []) {
    const v = table[s.id];
    if (!v || !v.listLine) continue;
    if (s.knowledgeText !== v.listLine) {
      s.knowledgeText = v.listLine;
      n++;
    }
  }
  if (n) fs.writeFileSync(MANIFEST, JSON.stringify(data, null, 2) + '\n', 'utf8');
  return { changed: n > 0, n };
}

function mirrorGame(pkg, html) {
  const rel = MIRROR[pkg];
  if (!rel) return false;
  const mPath = path.join(YANG, rel);
  fs.mkdirSync(path.dirname(mPath), { recursive: true });
  fs.writeFileSync(mPath, html, 'utf8');
  return true;
}

function applyPlatform() {
  const files = {
    platform: path.join(ROOT, 'apps/web/ui/pages/platform.html'),
    teacher: path.join(ROOT, 'apps/web/ui/pages/teacher-login.html'),
    student: path.join(ROOT, 'apps/web/ui/pages/student-join.html'),
  };
  const changes = [];

  let p = fs.readFileSync(files.platform, 'utf8');
  const pBefore = p;
  p = p.replace(
    /<h1>事理图谱驱动的探究教学<\/h1>\s*<p>[^<]*<\/p>/,
    '<h1>事理图谱驱动的探究教学</h1>\n    <p>教师发布任务，学生进课堂做实验；操作轨迹自动上报，便于回看学情。</p>'
  );
  p = p.replace(
    /(<a class="platform-card teacher"[\s\S]*?<h2>教师登录<\/h2>\s*)<p>[^<]*<\/p>/,
    '$1<p>通行码进入工作台：发布探究任务，查看轨迹与评判。</p>'
  );
  p = p.replace(
    /(<a class="platform-card student"[\s\S]*?<h2>学生进入课堂<\/h2>\s*)<p>[^<]*<\/p>/,
    '$1<p>学号签到后进入教师发布的探究游戏。</p>'
  );
  if (p !== pBefore) {
    fs.writeFileSync(files.platform, p, 'utf8');
    changes.push('platform.html');
  }

  let t = fs.readFileSync(files.teacher, 'utf8');
  const tBefore = t;
  t = t.replace(
    /(<h1[^>]*>教师登录<\/h1>\s*)<p>[^<]*<\/p>/,
    '$1<p>输入课堂通行码进入教师工作台。</p>'
  );
  if (t !== tBefore) {
    fs.writeFileSync(files.teacher, t, 'utf8');
    changes.push('teacher-login.html');
  }

  let s = fs.readFileSync(files.student, 'utf8');
  const sBefore = s;
  s = s.replace(
    /(<h1[^>]*>学生进入课堂<\/h1>\s*)<p>[^<]*<\/p>/,
    '$1<p>填写学号即可查看探究任务；姓名选填，便于教师识别。</p>'
  );
  if (s !== sBefore) {
    fs.writeFileSync(files.student, s, 'utf8');
    changes.push('student-join.html');
  }

  return changes;
}

function applyOne(pkg, v, { mirror }) {
  const gamePath = path.join(PKG, pkg, 'game.html');
  if (!fs.existsSync(gamePath)) {
    console.warn('skip missing game', pkg);
    return { pkg, game: false, chapter: false, mirror: false };
  }
  v._id = pkg;
  const before = fs.readFileSync(gamePath, 'utf8');
  const after = applyGameHtml(before, v, pkg);
  let gameChanged = after !== before;
  if (gameChanged) fs.writeFileSync(gamePath, after, 'utf8');

  const ch = applyChapterJson(pkg, v);
  let mirrored = false;
  if (mirror) {
    const finalHtml = fs.readFileSync(gamePath, 'utf8');
    mirrored = mirrorGame(pkg, finalHtml);
  }
  console.log(
    `${pkg}: game=${gameChanged ? 'upd' : 'ok'} chapter=${ch.changed ? 'upd' : 'ok'} mirror=${mirrored ? 'yes' : 'no'}`
  );
  return { pkg, game: gameChanged, chapter: ch.changed, mirror: mirrored };
}

function main() {
  const args = process.argv.slice(2);
  const mirror = !args.includes('--no-mirror');
  const platformOnly = args.includes('--platform-only');
  const pkgIdx = args.indexOf('--pkg');

  if (platformOnly) {
    const c = applyPlatform();
    console.log('platform:', c.length ? c.join(', ') : 'no-op');
    return;
  }

  const table = loadTable();
  let list = Object.keys(table);
  if (pkgIdx >= 0) {
    list = [args[pkgIdx + 1]];
    if (!table[list[0]]) {
      console.error('unknown pkg', list[0]);
      process.exit(1);
    }
  }

  const results = list.map((pkg) => applyOne(pkg, table[pkg], { mirror }));
  const man = applyManifest(table);
  const plat = applyPlatform();

  const g = results.filter((r) => r.game).length;
  const c = results.filter((r) => r.chapter).length;
  const m = results.filter((r) => r.mirror).length;
  console.log(
    `\ncopy-voice: game ${g}/${results.length}, chapter ${c}, mirror ${m}, manifest ${man.n}, platform ${plat.join('|') || 'ok'}`
  );
}

if (require.main === module) main();
module.exports = { applyGameHtml, applyChapterJson, applyManifest, applyPlatform, loadTable };

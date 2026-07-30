/**
 * Strip inquiry spoilers from 样本html craft intros:
 * - remove formula block inside #craft-intro (keep win formula)
 * - remove #craft-cv and confound-note spoilers
 * - neutralize intro text that names 混淆 / 公式剧透
 * Writeback to packages via 清单 mapping.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const YANG = path.join(ROOT, '样本html');
const PKG = path.join(ROOT, 'data/runtime/packages');

const MAP = {
  '斜抛.html': 'projectile-basic',
  '抛体大炮.html': 'projectile-cannon',
  '斜面摩擦.html': 'friction-incline',
  '机械能.html': 'multi-kp',
  '圆周运动.html': 'circular-motion',
  '动量碰撞.html': 'momentum-collision',
  '钟表铺校时.html': 'pendulum-clock',
  '单摆投靶.html': 'pendulum-target',
  '电场.html': 'efield-charge',
  '回旋加速器.html': 'cyclotron-radius',
  '电容混淆.html': 'capacitor-confound-ui',
  '串并联电路.html': 'series-parallel',
  'RC电路.html': 'rc-circuit',
  '安培力.html': 'magnetic-force',
  '变压器.html': 'transformer-turns',
  '电容_介质与击穿.html': 'capacitor-era-ch1',
  '电容_串并联.html': 'capacitor-era-ch2',
  '电容_储能与充电.html': 'capacitor-era-ch4',
  '热传导.html': 'heat-conduction',
  '理想气体.html': 'gas-ideal',
  '透镜.html': 'thin-lens-implicit',
  '折射.html': 'refraction-snell',
  '光电效应.html': 'photoelectric',
};

const SAFE_INTRO = {
  'projectile-basic': '调节右侧参数并发射，观察轨迹如何变化，试着完成挑战目标。',
  'projectile-cannon': '调节发射参数命中目标；试着弄清哪些量真正影响弹道。',
  'friction-incline': '调节参数并测试下滑，观察物块何时静止、何时下滑。',
  'multi-kp': '调节参数，观察过山车能否通过环顶，试着找出关键变量。',
  'circular-motion': '调节参数，观察圆周运动相关现象，并完成目标读数。',
  'momentum-collision': '调节参数进行碰撞实验，观察碰撞前后的变化。',
  'pendulum-clock': '调节摆的参数，使计时逼近目标周期。',
  'pendulum-target': '调节摆参数，使摆球落入目标区域。',
  'efield-charge': '调节参数，使带电粒子进入目标区域。',
  'cyclotron-radius': '调节参数，使轨道落入目标范围。',
  'capacitor-confound-ui': '调节界面上的控件，弄清哪些量真正改变电容相关结果。',
  'series-parallel': '配置电路参数，使总效果落入目标区间。',
  'rc-circuit': '调节电路参数，观察充放电过程并完成目标。',
  'magnetic-force': '调节参数，使导线受力达到目标。',
  'transformer-turns': '调节匝数相关参数，观察电压如何变化。',
  'capacitor-era-ch1': '完成本章任务：调节相关参数，观察现象并过关。',
  'capacitor-era-ch2': '完成本章任务：调节相关参数，观察现象并过关。',
  'capacitor-era-ch4': '完成本章任务：调节相关参数，观察现象并过关。',
  'heat-conduction': '调节参数，观察热传导效果并完成目标。',
  'gas-ideal': '调节气体状态参量，观察它们如何彼此关联。',
  'thin-lens-implicit': '调节光学参数，使成像满足目标。',
  'refraction-snell': '调节参数，使光线按目标路径传播。',
  'photoelectric': '调节光与电路参数，探究阈值与光电流现象。',
};

function stripHtml(html, pkgId) {
  let out = html;
  let changed = false;

  // Remove craft-cv blocks
  const beforeCv = out;
  out = out.replace(/<div[^>]*id=["']craft-cv["'][^>]*>[\s\S]*?<\/div>\s*/gi, '');
  if (out !== beforeCv) changed = true;

  // Remove runtime that injects craft-cv
  const beforeRt = out;
  out = out.replace(
    /\s*\/\/ CV note in bench[\s\S]*?scroll\.insertBefore\(cv, scroll\.firstChild\);\s*\}\s*/g,
    '\n',
  );
  if (out !== beforeRt) changed = true;

  // Remove confound-note sections that spoil
  const beforeCn = out;
  out = out.replace(/<div[^>]*class=["'][^"']*confound-note[^"']*["'][^>]*>[\s\S]*?<\/div>\s*/gi, (m) => {
    if (/混淆|不影响/.test(m)) { changed = true; return ''; }
    return m;
  });
  if (out !== beforeCn) changed = true;

  // Within #craft-intro only: remove .formula blocks
  out = out.replace(/<div id="craft-intro">([\s\S]*?)<\/div>\s*<div id="craft-win"/i, (full, inner) => {
    let next = inner.replace(/<div class="formula">[\s\S]*?<\/div>\s*/i, '');
    if (SAFE_INTRO[pkgId]) {
      // replace first <p>...</p> after h2 with safe intro
      next = next.replace(/(<h2>[^<]*<\/h2>\s*)<p>[\s\S]*?<\/p>/i, `$1<p>${SAFE_INTRO[pkgId]}</p>`);
    } else {
      next = next.replace(/混淆[^。]*。?/g, '');
      next = next.replace(/质量为混淆[^。]*。?/g, '');
    }
    if (next !== inner) changed = true;
    return `<div id="craft-intro">${next}</div>\n<div id="craft-win"`;
  });

  // Soften remaining spoiler phrases in intro-adjacent text
  if (/质量为混淆|混淆说明|不影响结论|为混淆/.test(out)) {
    out = out.replace(/质量为混淆量[。.]?/g, '');
    out = out.replace(/质量为混淆控件[。.]?/g, '');
    out = out.replace(/[^。\n]*混淆说明：[^。\n]*。?/g, '');
    out = out.replace(/摆球质量为混淆变量[。.]?/g, '');
    out = out.replace(/质量为混淆变量[。.]?/g, '');
    out = out.replace(/弹药材质为混淆变量[。.]?/g, '');
    out = out.replace(/注意区分有效变量与混淆 UI[。.]?/g, '试着弄清哪些控件真正影响结果。');
    out = out.replace(/无关装饰控件为混淆[。.]?/g, '');
    out = out.replace(/部分控件为界面混淆[。.]?/g, '部分控件可能并不影响结果，请自行辨别。');
    changed = true;
  }

  return { html: out, changed };
}

function main() {
  let n = 0;
  for (const [file, id] of Object.entries(MAP)) {
    const src = path.join(YANG, file);
    if (!fs.existsSync(src)) {
      console.log('missing', file);
      continue;
    }
    const raw = fs.readFileSync(src, 'utf8');
    const { html, changed } = stripHtml(raw, id);
    if (changed) {
      fs.writeFileSync(src, html, 'utf8');
      const dst = path.join(PKG, id, 'game.html');
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
      console.log('stripped+writeback', file, '->', id);
      n++;
    } else {
      // still sync friction-like already-clean files? skip
      console.log('clean', file);
    }
  }
  // Always ensure 斜面摩擦 synced
  const fr = path.join(YANG, '斜面摩擦.html');
  if (fs.existsSync(fr)) {
    fs.copyFileSync(fr, path.join(PKG, 'friction-incline', 'game.html'));
  }
  console.log('done, changed', n);
}

if (require.main === module) main();

/**
 * Domain-aware control id → human label + confounding heuristics.
 * Shared by analyze-three-step and inquiry sanitize / repair.
 */
const { sliderParamLabel } = require('./strategy-route-plan');

/** Strong domain signals — avoid weak id-only matches that cross-pollute. */
function detectSourceDomain(allText, gameHints) {
  const blob = `${allText || ''}\n${gameHints?.projectTitle || ''}\n${(gameHints?.sliderControlIds || []).join(' ')}`;
  if (/电容纪元|电容混淆|介质与击穿|储能与充电|击穿|mat-grid|ε₀|ε0|极板间距|极板面积/i.test(blob)
    && /电容|介质|击穿|串并/i.test(blob)) {
    return 'capacitor';
  }
  if (/斜抛|抛体|大炮|抛物线|野战炮|试射场/i.test(blob)) return 'projectile';
  if (/机械能|过山车|过环|减速带|动能|势能/i.test(blob)) return 'energy';
  if (/斜面摩擦|斜面倾角|摩擦系数|μ\s*[<＜]\s*tan|卸货滑道|卡在滑道/i.test(blob)) return 'friction';
  if (/斜面/.test(blob) && /摩擦|下滑|μ/.test(blob)) return 'friction';
  if (/单摆|摆长|秒摆|钟表铺|投靶|矿车/i.test(blob)) return 'pendulum';
  if (/透镜|焦距|物距|像距|折射|斯涅尔|光电效应/i.test(blob)) return 'optics';
  if (/热传导|导热|热流/i.test(blob)) return 'heat';
  if (/理想气体|pV\s*=|标定带/i.test(blob)) return 'gas';
  if (/动量|碰撞/i.test(blob)) return 'momentum';
  if (/圆周|向心力|角速度/i.test(blob)) return 'circular';
  if (/电场|偏转|场强/i.test(blob)) return 'efield';
  if (/回旋|提取环/i.test(blob)) return 'cyclotron';
  if (/安培力|通电导线/i.test(blob)) return 'magnetic';
  if (/变压器|匝/i.test(blob)) return 'transformer';
  if (/RC|充放电|时间常数|τ\s*=/i.test(blob)) return 'rc';
  if (/串并联|欧姆|电阻R|s-r1|s-r2/i.test(blob) && /电路|电阻|电流/.test(blob)) return 'circuit';
  if (/串并联电路|欧姆定律/i.test(blob)) return 'circuit';
  // Weak capacitor only if both cues
  if (/电容/.test(blob) && /介质|极板|击穿/.test(blob)) return 'capacitor';
  if (/s-angle|s-speed/.test(blob) && /靶|发射|落点/.test(blob)) return 'projectile';
  return 'generic';
}

function isLikelyConfoundingControl(controlId, sourceText, domain = 'generic') {
  const id = String(controlId || '');
  if (!id) return false;

  // Capacitor: thickness / audio are CV; mat-grid is AV
  if (domain === 'capacitor') {
    if (/thickness|audio-volume|theme|bgm|sfx/i.test(id)) return true;
    if (/^mat-grid$/i.test(id)) return false;
  }

  // Momentum: mass1/mass2 are real AVs
  if (domain === 'momentum' && /mass/i.test(id)) return false;

  // Gas: s-volume is often AV (state variable)
  if (domain === 'gas' && /^s-volume$/i.test(id)) return false;

  if (/^(?:s-|in-)?mass\d*$/i.test(id)) return true;
  if (/thickness|audio-volume|theme|bgm|sfx/i.test(id)) return true;

  // Appearance decoys — always CV (capacitor AV medium is mat-grid / medium only)
  if (/plateTone|(?:^|[-_])(?:color|tone)(?:$|[-_])/i.test(id) && !/mat-grid|medium|material/i.test(id)) {
    return true;
  }
  if (domain !== 'capacitor' && /material|color|tone|plateTone|外观/i.test(id)) return true;

  if (!sourceText) return false;
  const nearby = sourceText.match(
    new RegExp(`.{0,80}${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.{0,120}`, 'i'),
  );
  return !!(nearby && /混淆|不影响(?:过关|轨迹|结论|判定)|仅改(?:变)?视觉|装饰/i.test(nearby[0]));
}

function looksLikeRawControlId(label) {
  const s = String(label || '').trim();
  if (!s) return true;
  return /^(?:s-|in-|input[-_])/i.test(s) || /^[a-z]+(?:-[a-z0-9]+)+$/i.test(s);
}

function isCrossDomainAvLabel(label, domain) {
  const s = String(label || '');
  if (!s) return false;
  if (domain !== 'capacitor' && /极板|介质材料|介质厚度/.test(s)) return true;
  if (!['projectile', 'energy'].includes(domain) && /发射角度|发射高度/.test(s)) {
    // energy may keep 初速度; friction/pendulum must not use 发射*
    if (domain === 'friction' || domain === 'pendulum' || domain === 'optics' || domain === 'heat') {
      return true;
    }
  }
  if (domain === 'heat' && /极板/.test(s)) return true;
  if (domain === 'optics' && /极板/.test(s)) return true;
  return false;
}

/**
 * Human label for a control id, scoped by domain to avoid capacitor/projectile bleed.
 */
function inferLabelFromControlId(controlId, domain = 'generic') {
  const id = String(controlId || '').toLowerCase();
  if (!id) return '调节变量';

  if (/audio-volume|bgm|sfx|theme/.test(id)) return '音量';
  if (/thickness/.test(id)) return '厚度';
  if (/(?:^|[-_])mass\d*(?:$|[-_])/.test(id)) return '质量';
  if (/friction/.test(id)) return '摩擦系数';

  if (domain === 'capacitor') {
    if (/mat|medium/.test(id)) return '介质材料';
    if (/area/.test(id)) return '极板面积';
    if (/dist|gap|spacing/.test(id)) return '极板间距';
    if (/cable/.test(id)) return '馈线长度';
    if (/^s-c(\d+)/.test(id)) return `电容C${RegExp.$1}`;
    if (/voltage|^s-v$|supply/.test(id)) return '电压';
  }

  if (domain === 'projectile') {
    if (/angle/.test(id)) return '发射角度';
    if (/speed|velocity|power/.test(id)) return '初速度';
    if (/height/.test(id)) return '发射高度';
    if (/grav/.test(id)) return '重力加速度';
    if (/wind/.test(id)) return '风速';
    if (/drag/.test(id)) return '空气阻力';
    if (/material|color|tone/.test(id)) return '外观材料';
  }

  if (domain === 'friction') {
    if (/angle|tilt/.test(id)) return '斜面倾角';
    if (/friction/.test(id)) return '摩擦系数';
  }

  if (domain === 'energy') {
    if (/speed|velocity/.test(id)) return '初速度';
    if (/height/.test(id)) return '起始高度';
  }

  if (domain === 'pendulum') {
    if (/len|length/.test(id)) return '摆长';
    if (/angle/.test(id)) return '摆角';
  }

  if (domain === 'optics') {
    if (/object|u-?dist|object-distance/.test(id)) return '物距';
    if (/focal|focus/.test(id)) return '焦距';
    if (/aperture/.test(id)) return '光圈';
    if (/incident|angle/.test(id)) return '入射角';
    if (/refract|index/.test(id)) return '折射率';
    if (/wavelength/.test(id)) return '波长';
    if (/frequency/.test(id)) return '频率';
    if (/workfunction|work-?function/.test(id)) return '逸出功';
    if (/intensity/.test(id)) return '光强';
  }

  if (domain === 'heat') {
    if (/area/.test(id)) return '截面积';
    if (/thermal|conduct/.test(id)) return '导热系数';
    if (/temp|temperature/.test(id)) return '温差';
  }

  if (domain === 'gas') {
    if (/pressure/.test(id)) return '压强';
    if (/temp/.test(id)) return '温度';
    if (/volume/.test(id)) return '体积';
  }

  if (domain === 'circular') {
    if (/omega|angular/.test(id)) return '角速度';
    if (/radius/.test(id)) return '半径';
    if (/tilt|angle/.test(id)) return '倾角';
  }

  if (domain === 'momentum') {
    if (/vel1|velocity1|v1/.test(id)) return '速度1';
    if (/vel2|velocity2|v2/.test(id)) return '速度2';
    if (/mass1/.test(id)) return '质量1';
    if (/mass2/.test(id)) return '质量2';
    if (/rail|temp/.test(id)) return '导轨温度';
    if (/vel|velocity|speed/.test(id)) return '速度';
  }

  if (domain === 'efield') {
    if (/field|strength/.test(id)) return '场强';
    if (/charge/.test(id)) return '电荷量';
    if (/gap|plate|dist/.test(id)) return '极板间距';
  }

  if (domain === 'cyclotron') {
    if (/velocity|speed/.test(id)) return '速度';
    if (/magnetic|b\b/.test(id)) return '磁感应强度';
    if (/chamber|pressure|p\b/.test(id)) return '腔室气压';
  }

  if (domain === 'magnetic') {
    if (/current/.test(id)) return '电流';
    if (/magnetic/.test(id)) return '磁场';
    if (/temp|wire/.test(id)) return '导线温度';
  }

  if (domain === 'transformer') {
    if (/n1/.test(id)) return '原边匝数';
    if (/n2/.test(id)) return '副边匝数';
    if (/u1|voltage/.test(id)) return '原边电压';
    if (/temp|winding/.test(id)) return '绕组温度';
  }

  if (domain === 'rc') {
    if (/resistance/.test(id)) return '电阻';
    if (/capacitance/.test(id)) return '电容';
    if (/supply|voltage/.test(id)) return '电源电压';
  }

  if (domain === 'circuit') {
    if (/r1/.test(id)) return '电阻R1';
    if (/r2/.test(id)) return '电阻R2';
    if (/meter/.test(id)) return '电表内阻';
  }

  // Safe generic fallbacks — never capacitor-specific
  if (/angle|tilt|incident/.test(id)) return '角度';
  if (/speed|velocity|omega|power/.test(id)) return '速度';
  if (/height/.test(id)) return '高度';
  if (/area/.test(id)) return '面积';
  if (/radius/.test(id)) return '半径';
  if (/len|length|dist|gap/.test(id)) return '长度';
  if (/temp/.test(id)) return '温度';
  if (/pressure|volume/.test(id)) return id.includes('volume') ? '体积' : '压强';
  if (/current/.test(id)) return '电流';
  if (/magnetic|field/.test(id)) return '磁场';
  if (/charge/.test(id)) return '电荷';
  if (/resistance/.test(id)) return '电阻';
  if (/r1/.test(id)) return '电阻R1';
  if (/r2/.test(id)) return '电阻R2';
  if (/capacitance/.test(id)) return '电容';
  if (/frequency/.test(id)) return '频率';
  if (/intensity/.test(id)) return '强度';
  if (/material|color|tone|plateTone/.test(id)) return '外观色调';

  if (/^s-/.test(id) || /^in-/.test(id)) return sliderParamLabel(controlId);
  return controlId || '调节变量';
}

function resolveAvLabel(av, domain) {
  const fresh = inferLabelFromControlId(av?.controlId, domain);
  const cur = String(av?.label || '').trim();
  if (!cur || looksLikeRawControlId(cur) || isCrossDomainAvLabel(cur, domain)) return fresh;
  // Prefer domain-specific over overly generic labels already on the chapter
  const GENERIC = new Set(['长度', '角度', '速度', '面积', '高度', '温度', '质量', '电阻', '电容']);
  if (GENERIC.has(cur) && fresh && fresh !== cur && !GENERIC.has(fresh)) return fresh;
  return cur;
}

module.exports = {
  detectSourceDomain,
  isLikelyConfoundingControl,
  inferLabelFromControlId,
  looksLikeRawControlId,
  isCrossDomainAvLabel,
  resolveAvLabel,
};

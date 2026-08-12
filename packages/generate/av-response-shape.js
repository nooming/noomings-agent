/**
 * Inquiry-path response shape for adjustment variables.
 * Priority expresses recommended inquiry path, not raw |∂y/∂x| alone.
 * Nonlinear-monotone primary physics vars must NOT be demoted.
 */

const RESPONSE_SHAPES = [
  'linear-approx',
  'nonlinear-monotone',
  'non-monotone',
  'discrete',
  'unknown',
];

/** Keep monotonicity consistent with responseShape. */
function monotonicityFromResponseShape(shape) {
  switch (shape) {
    case 'linear-approx':
    case 'nonlinear-monotone':
      return 'monotone';
    case 'non-monotone':
      return 'non-monotone';
    case 'discrete':
      return 'discrete';
    default:
      return 'unknown';
  }
}

function syncMonotonicityWithShape(av) {
  const shape = av.responseShape || 'unknown';
  if (!RESPONSE_SHAPES.includes(shape)) {
    return { ...av, responseShape: 'unknown', monotonicity: av.monotonicity || 'unknown' };
  }
  const mono = monotonicityFromResponseShape(shape);
  // Prefer shape-derived mono unless shape is unknown and mono already set
  if (shape === 'unknown' && av.monotonicity) {
    return { ...av, responseShape: shape, monotonicity: av.monotonicity };
  }
  return { ...av, responseShape: shape, monotonicity: mono };
}

/**
 * Heuristic responseShape from control id/label + domain.
 * Does NOT treat nonlinear as bad — only flags non-monotone / discrete / unknown.
 */
function inferResponseShape(av, domain) {
  if (av.responseShape && RESPONSE_SHAPES.includes(av.responseShape)) {
    return av.responseShape;
  }
  const blob = `${av.controlId || ''} ${av.label || ''} ${av.symbol || ''}`.toLowerCase();

  if (av.type === 'discrete' || /mat|介质|材料|κ|kappa/.test(blob)) return 'discrete';

  // Projectile launch angle: classic range extremum
  if (domain === 'projectile' && /angle|角度|θ|theta/.test(blob)) return 'non-monotone';

  // Pendulum angle: weak θ² correction — still monotone in T, not a range extremum
  if (domain === 'pendulum' && /angle|角度|θ|theta|摆角/.test(blob)) return 'nonlinear-monotone';

  // Friction incline angle: tanθ threshold — monotone in sliding tendency
  if (domain === 'friction' && /angle|角度|θ|theta|倾角/.test(blob)) return 'nonlinear-monotone';

  // Optics / circuits: nonlinear but monotone in physical regime
  if (/object-distance|物距|focal|焦距|refractive|折射率|incident|入射/.test(blob)) {
    return 'nonlinear-monotone';
  }
  if (/resistance|电阻|r1|r2|capacitance|电容(?!材料)/.test(blob)) {
    return 'nonlinear-monotone';
  }
  if (/dist|间距|d\b/.test(blob) && domain === 'capacitor') return 'nonlinear-monotone';

  // Inverse / sqrt style primaries
  if (/len|摆长|length|radius|半径|magnetic|磁场|current|电流/.test(blob)) {
    return 'nonlinear-monotone';
  }

  if (/speed|velocity|速度|v0|height|高度|area|面积|pressure|压强|volume|体积|temp|温度|field|场强|charge|电荷|omega|角速度|frequency|频率|workfunction|逸出功|friction|摩擦|n1|n2|匝数|supply|电压|grav|重力|wind|风速|drag|阻力|intensity|光强|thermal|导热|temperature-diff|温差/.test(blob)) {
    // intensity / ineffective CVs often still "linear" in their weak channel
    if (/intensity|光强/.test(blob)) return 'linear-approx';
    if (/speed|velocity|速度|v0|height|高度|area|面积|field|场强|charge|电荷|pressure|压强|volume|体积|friction|摩擦|thermal|导热|temperature-diff|温差|n1|n2|匝数|U1|原边电压|supply|电压/.test(blob)) {
      return 'linear-approx';
    }
    if (/grav|重力|wind|风速|omega|角速度|frequency|频率|workfunction|逸出功/.test(blob)) {
      return 'linear-approx';
    }
    if (/temp|温度|drag|阻力/.test(blob)) return 'unknown';
  }

  if (/angle|角度|θ|theta|tilt|倾角/.test(blob)) {
    // Default: do not assume projectile non-monotone outside projectile domain
    return domain === 'projectile' ? 'non-monotone' : 'nonlinear-monotone';
  }

  return av.monotonicity === 'non-monotone'
    ? 'non-monotone'
    : av.monotonicity === 'discrete'
      ? 'discrete'
      : av.monotonicity === 'monotone'
        ? 'nonlinear-monotone'
        : 'unknown';
}

/**
 * Inquiry-priority score: nonlinear-monotone is NOT penalized.
 * non-monotone / nearly-ineffective get lower inquiry priority.
 */
function inquiryPriorityScore(av, domain) {
  const shape = inferResponseShape(av, domain);
  const blob = `${av.controlId || ''} ${av.label || ''}`.toLowerCase();
  let score = 0;

  // Shape: discrete (material) high; monotone (linear or nonlinear) high; non-monotone low
  if (shape === 'discrete') score += 12;
  else if (shape === 'linear-approx') score += 10;
  else if (shape === 'nonlinear-monotone') score += 10; // NOT demoted
  else if (shape === 'non-monotone') score += 2;
  else score += 4;

  // Pedagogical / domain primaries
  if (domain === 'projectile') {
    if (/speed|velocity|速度|v0/.test(blob)) score += 8;
    if (/height|高度/.test(blob)) score += 5;
    if (/angle|角度/.test(blob)) score += 1; // non-monotone, keep available but not rank1
  } else if (domain === 'capacitor') {
    if (/mat|介质|材料/.test(blob)) score += 8;
    if (/dist|间距/.test(blob)) score += 6;
    if (/area|面积/.test(blob)) score += 3;
  } else if (domain === 'pendulum') {
    if (/len|摆长|length/.test(blob)) score += 8;
    if (/angle|角度|摆角/.test(blob)) score += 3;
  } else if (domain === 'optics' || domain === 'lens' || domain === 'refraction') {
    if (/object-distance|物距|incident|入射/.test(blob)) score += 7;
    if (/focal|焦距|refractive|折射率/.test(blob)) score += 6;
    if (/aperture|光圈|口径|depth|水深/.test(blob)) score -= 12;
  }

  // Nearly ineffective / decorative looking (keep out of top ranks)
  if (/meter-r|电表|内阻|aperture|光圈|口径|chamber|气压|rail-temp|导轨温度|winding-temp|绕组温度|cable|馈线|base-tilt|倾角|audio|volume|音量|thickness|厚度|plate-mass|极板质量/.test(blob)) {
    score -= 18;
  }
  // RC: supply V does not enter τ=RC
  if (/supply-v|电源电压/.test(blob) && domain === 'rc') score -= 16;
  // Gas: bypass slider unused in PV win (legacy T / piston mass)
  if (/s-temp|标称温度|s-piston-mass|活塞质量/.test(blob) && domain === 'gas') score -= 16;
  // Photoelectric intensity: scales I but not threshold
  if (/intensity|光强/.test(blob)) score -= 8;

  if (/mass|质量/.test(blob) && domain !== 'momentum' && domain !== 'collision') score -= 20;

  return { shape, score };
}

module.exports = {
  RESPONSE_SHAPES,
  monotonicityFromResponseShape,
  syncMonotonicityWithShape,
  inferResponseShape,
  inquiryPriorityScore,
};

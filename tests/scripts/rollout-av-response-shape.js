/**
 * Full rollout: stamp responseShape + inquiry-friendly priorityRank on all
 * runtime chapter.json AVs, remap strategy.routes scores, write audit report.
 *
 *   node tests/scripts/rollout-av-response-shape.js
 *   node tests/scripts/rollout-av-response-shape.js --id series-parallel
 *   node tests/scripts/rollout-av-response-shape.js --dry-run
 *
 * Does not export 图谱.html (run export-priority-graphs.js after).
 */
const fs = require('fs');
const path = require('path');
const { getPackagesRoot } = require('../../packages/shared/data-paths');
const { repairStrategyRouteScores } = require('../../packages/contract/repair/strategy-route-score-repair');
const { syncMonotonicityWithShape } = require('../../packages/generate/av-response-shape');

const ROOT = path.resolve(__dirname, '../..');
const REPORTS = path.join(getPackagesRoot(), 'reports');

/**
 * Curated per-package AV order (by controlId).
 * Rank = array index + 1. residual:true → shape unknown / soft physics judgment.
 */
const PACKAGE_AV_SPEC = {
  'series-parallel': [
    { controlId: 's-r1', responseShape: 'nonlinear-monotone', notes: 'rank1：I∝1/R 非线性单调，串联/并联下改 R1 归因清晰' },
    { controlId: 's-r2', responseShape: 'nonlinear-monotone', notes: 'rank2：与 R1 对称的非线性单调通道，次优先单变量' },
    { controlId: 's-meter-r', responseShape: 'linear-approx', notes: 'rank3：仪表内阻几乎不进过关电流公式，近无效，最低优先' },
  ],
  'refraction-snell': [
    { controlId: 's-incident-angle', responseShape: 'nonlinear-monotone', notes: 'rank1：θ₁ 经斯涅尔定律单调决定 θ₂（未全反射前），探究最直观' },
    { controlId: 's-refractive-index', responseShape: 'nonlinear-monotone', notes: 'rank2：n₂ 非线性单调改折射角；与 θ₁ 联立，次优先单变量' },
  ],
  'thin-lens-implicit': [
    { controlId: 's-object-distance', responseShape: 'nonlinear-monotone', notes: 'rank1：物距经 1/u+1/v=1/f 强非线性单调定像距，主探究量（近焦区敏感但不得因此降级）' },
    { controlId: 's-focal-length', responseShape: 'nonlinear-monotone', notes: 'rank2：焦距同样是成像主方程自变量，非线性单调' },
    { controlId: 's-aperture', responseShape: 'linear-approx', notes: 'rank3：口径多影响光束观感，不过关判据，近无效最低' },
  ],
  'projectile-basic': [
    { controlId: 's-speed', responseShape: 'linear-approx', notes: 'rank1：v0 单调抬高射程，归因最清晰' },
    { controlId: 's-height', responseShape: 'linear-approx', notes: 'rank2：发射高度单调影响落点，弱于 v0' },
    { controlId: 's-angle', responseShape: 'non-monotone', notes: 'rank3：θ 对射程非单调（约 45° 极值），不宜首选' },
  ],
  'projectile-cannon': [
    { controlId: 'in-power', responseShape: 'linear-approx', notes: 'rank1：初速度单调主导射程，首选单变量' },
    { controlId: 'in-grav', responseShape: 'linear-approx', notes: 'rank2：g 单调改落点/飞行时间，环境主参' },
    { controlId: 'in-wind', responseShape: 'linear-approx', notes: 'rank3：风速近似线性扰动水平位移' },
    { controlId: 'in-angle', responseShape: 'non-monotone', notes: 'rank4：发射角对射程非单调，靠后探究' },
    { controlId: 'in-drag', responseShape: 'nonlinear-monotone', notes: 'rank5：阻力非线性压射程，归因较绕，最低有效 AV' },
  ],
  'magnetic-force': [
    { controlId: 's-current', responseShape: 'linear-approx', notes: 'rank1：F∝I 近似线性，电流优先单变量' },
    { controlId: 's-magnetic', responseShape: 'linear-approx', notes: 'rank2：F∝B 同样线性，与 I 对称次优先' },
  ],
  'friction-incline': [
    { controlId: 's-angle', responseShape: 'nonlinear-monotone', notes: 'rank1：倾角经 tanθ 与 μ 比较，下滑倾向非线性单调（非抛体极值角）' },
    { controlId: 's-friction', responseShape: 'linear-approx', notes: 'rank2：μ 单调改临界条件；竞赛常锁定，探究次优先' },
  ],
  'pendulum-clock': [
    { controlId: 's-len', responseShape: 'nonlinear-monotone', notes: 'rank1：摆长主控，T∝√L 非线性单调，校时首选' },
    { controlId: 's-angle', responseShape: 'nonlinear-monotone', notes: 'rank2：摆角仅弱 θ² 修正周期，并需满足最小摆幅' },
  ],
  'pendulum-target': [
    { controlId: 's-length', responseShape: 'nonlinear-monotone', notes: 'rank1：摆长改周期与出手时机，非线性单调主控' },
    { controlId: 's-angle', responseShape: 'nonlinear-monotone', notes: 'rank2：摆角改振幅与落点包络，次优先（非抛体式非单调）' },
  ],
  'rc-circuit': [
    { controlId: 's-resistance', responseShape: 'linear-approx', notes: 'rank1：τ=RC，R 线性进时间常数，过关主控' },
    { controlId: 's-capacitance', responseShape: 'linear-approx', notes: 'rank2：C 同样线性进 τ，与 R 对称次优先' },
    { controlId: 's-supply-v', responseShape: 'linear-approx', notes: 'rank3：电源电压不进 τ 判据，近无效，最低优先' },
  ],
  'photoelectric': [
    { controlId: 's-frequency', responseShape: 'linear-approx', notes: 'rank1：频率相对阈值决定能否逸出，过关主控' },
    { controlId: 's-workfunction', responseShape: 'linear-approx', notes: 'rank2：逸出功改阈值，与频率对偶' },
    { controlId: 's-intensity', responseShape: 'linear-approx', notes: 'rank3：光强只缩放光电流幅值，不改阈值条件，最低' },
  ],
  'capacitor-confound-ui': [
    { controlId: 's-distance', responseShape: 'nonlinear-monotone', notes: 'rank1：d 使 C∝1/d 非线性单调，并改击穿风险' },
    { controlId: 's-area', responseShape: 'linear-approx', notes: 'rank2：A 近似线性改 C，次优先' },
  ],
  'capacitor-era-ch1': [
    { controlId: 's-dist', responseShape: 'nonlinear-monotone', notes: 'rank1：间距非线性单调改 C 与击穿风险（介质为离散操作，见策略图）' },
    { controlId: 's-area', responseShape: 'linear-approx', notes: 'rank2：面积近似线性改 C' },
  ],
  'capacitor-era-ch2': [
    { controlId: 's-c1', responseShape: 'nonlinear-monotone', notes: 'rank1：串并联等效电容主参，优先单变量 C1' },
    { controlId: 's-c2', responseShape: 'nonlinear-monotone', notes: 'rank2：并联支路电容，与 C1 对称' },
    { controlId: 's-c3', responseShape: 'nonlinear-monotone', notes: 'rank3：串联支路电容，继续单变量' },
    { controlId: 's-cable', responseShape: 'unknown', notes: 'rank4：馈线长度多为外观/次级，对等效 C 贡献弱，最低', residual: true },
  ],
  'capacitor-era-ch4': [
    { controlId: 's-cable', responseShape: 'unknown', notes: '本关仅馈线长度可调；响应形态依赖关卡脚本，标 unknown', residual: true },
  ],
  'circular-motion': [
    { controlId: 's-omega', responseShape: 'nonlinear-monotone', notes: 'rank1：向心力∝ω²，角速度优先' },
    { controlId: 's-radius', responseShape: 'linear-approx', notes: 'rank2：F∝r 近似线性，次优先' },
    { controlId: 's-base-tilt', responseShape: 'linear-approx', notes: 'rank3：底座倾角不进 F 计算，近无效最低' },
  ],
  'cyclotron-radius': [
    { controlId: 's-velocity', responseShape: 'linear-approx', notes: 'rank1：r=mv/qB，速度线性抬半径' },
    { controlId: 's-magnetic', responseShape: 'nonlinear-monotone', notes: 'rank2：B 使 r∝1/B 非线性单调，主方程对偶量' },
    { controlId: 's-chamber-p', responseShape: 'linear-approx', notes: 'rank3：腔室气压不进 r 公式，近无效最低' },
  ],
  'efield-charge': [
    { controlId: 's-fieldStrength', responseShape: 'linear-approx', notes: 'rank1：场强直接改偏转，线性主控' },
    { controlId: 's-charge', responseShape: 'linear-approx', notes: 'rank2：电荷量改受力，线性次控' },
  ],
  'gas-ideal': [
    { controlId: 's-pressure', responseShape: 'linear-approx', notes: 'rank1：过关看 p·V，压强线性主控' },
    { controlId: 's-volume', responseShape: 'linear-approx', notes: 'rank2：体积与压强对偶进 pV' },
    { controlId: 's-temp', responseShape: 'unknown', notes: 'rank3：标称温度滑条未进 pV 判据，近无效最低', residual: true },
  ],
  'heat-conduction': [
    { controlId: 's-thermal-conductivity', responseShape: 'linear-approx', notes: 'rank1：导热系数 k 线性进热流，材料主控' },
    { controlId: 's-area', responseShape: 'linear-approx', notes: 'rank2：截面积 A 线性进热流' },
    { controlId: 's-temperature-diff', responseShape: 'linear-approx', notes: 'rank3：温差 ΔT 线性进热流，与 k/A 等价通道靠后' },
  ],
  'momentum-collision': [
    { controlId: 's-vel1', responseShape: 'linear-approx', label: '速度1', notes: 'rank1：入射速度1直接改动量与落点' },
    { controlId: 's-vel2', responseShape: 'linear-approx', label: '速度2', notes: 'rank2：速度2（靶/第二球）次优先' },
    { controlId: 's-mass1', responseShape: 'linear-approx', label: '质量1', notes: 'rank3：质量1进动量交换，有效 AV' },
    { controlId: 's-mass2', responseShape: 'linear-approx', label: '质量2', notes: 'rank4：质量2对称通道' },
    { controlId: 's-rail-temp', responseShape: 'linear-approx', label: '导轨温度', notes: 'rank5：导轨温度不进碰撞公式，近无效最低' },
  ],
  'multi-kp': [
    { controlId: 's-speed', responseShape: 'linear-approx', notes: 'rank1：初速度改动能，过环/制动主控' },
    { controlId: 's-height', responseShape: 'linear-approx', notes: 'rank2：起始高度改势能，单调次优先' },
  ],
  'transformer-turns': [
    { controlId: 's-n2', responseShape: 'linear-approx', notes: 'rank1：副边匝数线性改 U2（U2=U1·n2/n1），变压比最直观' },
    { controlId: 's-n1', responseShape: 'nonlinear-monotone', notes: 'rank2：原边匝数使 U2∝1/n1，非线性单调' },
    { controlId: 's-U1', responseShape: 'linear-approx', notes: 'rank3：原边电压线性缩放 U2' },
    { controlId: 's-winding-temp', responseShape: 'unknown', notes: 'rank4：绕组温度不进 U2 公式，近无效最低', residual: true },
  ],
};

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : null;
}

function listPackageIds() {
  const root = getPackagesRoot();
  return fs.readdirSync(root).filter(name => {
    if (name === 'reports' || name === 'vendor') return false;
    return fs.existsSync(path.join(root, name, 'chapter.json'));
  }).sort();
}

function applySpecToChapter(chapter, specRows) {
  const byId = new Map(specRows.map((row, i) => [row.controlId, { ...row, priorityRank: i + 1 }]));
  const avs = chapter.inquiryScript?.adjustmentVariables || [];
  const nextAvs = avs.map(av => {
    const spec = byId.get(av.controlId);
    if (!spec) {
      return syncMonotonicityWithShape({
        ...av,
        responseShape: av.responseShape || 'unknown',
        notes: av.notes || '未在 rollout 表中标定，responseShape=unknown',
      });
    }
    const synced = syncMonotonicityWithShape({
      ...av,
      responseShape: spec.responseShape,
      priorityRank: spec.priorityRank,
      role: spec.priorityRank === 1 ? 'primary' : 'secondary',
      notes: spec.notes,
      ...(spec.label ? { label: spec.label } : {}),
    });
    return synced;
  });

  // Sort AVs by priorityRank for readability
  nextAvs.sort((a, b) => (a.priorityRank || 99) - (b.priorityRank || 99));

  // Re-id AV1..n in rank order (keep controlId/label)
  const renumbered = nextAvs.map((av, i) => ({
    ...av,
    id: /^AV\d+$/.test(String(av.id || '')) ? `AV${i + 1}` : av.id,
    priorityRank: av.priorityRank != null ? av.priorityRank : i + 1,
    role: (av.priorityRank === 1 || (av.priorityRank == null && i === 0)) ? 'primary' : 'secondary',
  }));

  // Sync 单变量·{label} when curated label renamed (e.g. 质量→质量1)
  let routes = chapter.strategy?.routes || [];
  if (routes.length && chapter.inquiryScript?.adjustmentVariables) {
    const oldByControl = new Map(
      (chapter.inquiryScript.adjustmentVariables || []).map(a => [a.controlId, a.label]),
    );
    routes = routes.map(r => {
      const m = String(r.label || '').match(/^单变量·(.+)$/);
      if (!m) return r;
      const hit = renumbered.find(a => {
        const old = oldByControl.get(a.controlId);
        return a.label === m[1] || old === m[1] || String(a.controlId || '').includes(m[1]);
      });
      if (hit && hit.label && `单变量·${hit.label}` !== r.label) {
        return { ...r, label: `单变量·${hit.label}` };
      }
      return r;
    });
  }

  let next = {
    ...chapter,
    inquiryScript: {
      ...chapter.inquiryScript,
      adjustmentVariables: renumbered,
    },
    strategy: chapter.strategy ? { ...chapter.strategy, routes } : chapter.strategy,
  };
  next = repairStrategyRouteScores(next, {});
  // Ensure confoundProbe has no priorityRank; strip student spoiler「混淆」
  if (next.strategy?.routes) {
    next.strategy.routes = next.strategy.routes.map(r => {
      let label = String(r.label || '').replace(/试探混淆·/g, '试探·');
      if (r.kind === 'confoundProbe' || /^试探·/.test(label)) {
        const { priorityRank, ...rest } = r;
        return {
          ...rest,
          label,
          score: Math.min(rest.score ?? 0.15, 0.15),
          weight: Math.min(rest.weight ?? 0.15, 0.15),
          kind: rest.kind || 'confoundProbe',
        };
      }
      if (isTrapLike(r)) {
        const { priorityRank, ...rest } = r;
        return { ...rest, label: rest.label, score: 0.2, weight: 0.2 };
      }
      return label !== r.label ? { ...r, label } : r;
    });
  }
  if (next.strategy?.mermaid) {
    next.strategy.mermaid = String(next.strategy.mermaid).replace(/试探混淆·/g, '试探·');
  }
  return next;
}

function isTrapLike(route) {
  return route?.tier === 'suboptimal'
    || /trap|盲调|多参|多滑/i.test(`${route?.id || ''}${route?.label || ''}`);
}

function summarize(chapter, pkgId, residuals) {
  const avs = chapter.inquiryScript?.adjustmentVariables || [];
  const routes = (chapter.strategy?.routes || [])
    .filter(r => /单变量·/.test(r.label || ''))
    .map(r => ({
      label: r.label,
      priorityRank: r.priorityRank,
      score: r.score,
      weight: r.weight,
    }));
  return {
    id: pkgId,
    avs: avs.map(a => ({
      controlId: a.controlId,
      label: a.label,
      priorityRank: a.priorityRank,
      role: a.role,
      responseShape: a.responseShape,
      monotonicity: a.monotonicity,
      notes: a.notes,
    })),
    routes,
    residuals,
  };
}

function main() {
  const filterId = argValue('--id');
  const dry = process.argv.includes('--dry-run');
  const ids = filterId ? [filterId] : listPackageIds();
  const report = { generatedAt: new Date().toISOString(), packages: [], residuals: [] };

  for (const id of ids) {
    const chapterPath = path.join(getPackagesRoot(), id, 'chapter.json');
    if (!fs.existsSync(chapterPath)) {
      console.log('SKIP', id, 'no chapter.json');
      continue;
    }
    const spec = PACKAGE_AV_SPEC[id];
    if (!spec) {
      console.log('WARN', id, 'no curated spec — stamp unknown only');
      const chapter = JSON.parse(fs.readFileSync(chapterPath, 'utf8'));
      const avs = (chapter.inquiryScript?.adjustmentVariables || []).map((av, i) => syncMonotonicityWithShape({
        ...av,
        responseShape: av.responseShape || 'unknown',
        priorityRank: av.priorityRank != null ? av.priorityRank : i + 1,
        role: (av.priorityRank === 1 || i === 0) ? 'primary' : (av.role || 'secondary'),
        notes: av.notes || '无 curated 表，保留原 rank，shape=unknown',
      }));
      let next = { ...chapter, inquiryScript: { ...chapter.inquiryScript, adjustmentVariables: avs } };
      next = repairStrategyRouteScores(next, {});
      const row = summarize(next, id, ['no_curated_spec']);
      report.packages.push(row);
      report.residuals.push({ id, reason: 'no_curated_spec' });
      if (!dry) fs.writeFileSync(chapterPath, JSON.stringify(next, null, 2) + '\n', 'utf8');
      console.log(dry ? 'DRY' : 'OK', id, '(fallback)');
      continue;
    }

    const chapter = JSON.parse(fs.readFileSync(chapterPath, 'utf8'));
    const missing = spec.filter(s => !(chapter.inquiryScript?.adjustmentVariables || [])
      .some(a => a.controlId === s.controlId));
    const extras = (chapter.inquiryScript?.adjustmentVariables || [])
      .filter(a => !spec.some(s => s.controlId === a.controlId));
    const residuals = [
      ...spec.filter(s => s.residual).map(s => s.controlId),
      ...missing.map(m => `missing_in_chapter:${m.controlId}`),
      ...extras.map(e => `extra_av:${e.controlId}`),
    ];

    const next = applySpecToChapter(chapter, spec);
    const row = summarize(next, id, residuals);
    report.packages.push(row);
    if (residuals.length) report.residuals.push({ id, items: residuals });

    if (!dry) fs.writeFileSync(chapterPath, JSON.stringify(next, null, 2) + '\n', 'utf8');
    const order = row.avs.map(a => `${a.priorityRank}:${a.label}(${a.responseShape})`).join(' > ');
    console.log(dry ? 'DRY' : 'OK', id, order);
  }

  fs.mkdirSync(REPORTS, { recursive: true });
  const jsonPath = path.join(REPORTS, 'av-response-shape-rollout.json');
  const mdPath = path.join(REPORTS, 'av-response-shape-rollout.md');
  const md = [
    '# AV responseShape / priorityRank rollout',
    '',
    `generated: ${report.generatedAt}`,
    '',
    ...report.packages.map(p => {
      const lines = [
        `## ${p.id}`,
        '',
        '| rank | label | controlId | responseShape | monotonicity | score |',
        '| --- | --- | --- | --- | --- | --- |',
        ...p.avs.map(a => {
          const route = p.routes.find(r => r.label === `单变量·${a.label}`);
          return `| ${a.priorityRank} | ${a.label} | ${a.controlId} | ${a.responseShape} | ${a.monotonicity} | ${route?.score ?? ''} |`;
        }),
        '',
        ...(p.residuals?.length ? [`residuals: ${p.residuals.join(', ')}`, ''] : []),
      ];
      return lines.join('\n');
    }),
  ].join('\n');

  if (!dry) {
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
    fs.writeFileSync(mdPath, md, 'utf8');
  }
  console.log(`Done: ${report.packages.length} packages${dry ? ' (dry-run)' : ''}`);
  console.log('Report:', dry ? '(skipped)' : jsonPath);
}

main();

function validateOptionalToggleConstraints(constraints, hints) {
  const errors = [];
  const coupled = hints?.optionalToggleWinCoupled || {};
  const togglePatterns = [
    { re: /辅助线|toggleGuide|guide.*开关/i, key: 'toggleGuideBtn' },
    { re: /电荷|toggleCharge|charge.*切换/i, key: 'toggleChargeBtn' },
    { re: /自由模式|教程模式|switchFree|switchTutorial|switchChallenge/i, key: 'switchMode' },
  ];
  for (const c of constraints) {
    const t = `${c.label || ''} ${c.desc || ''}`;
    for (const { re, key } of togglePatterns) {
      if (!re.test(t)) continue;
      const winCoupled = key === 'switchMode'
        ? Object.entries(coupled).some(([id, v]) => /^switch\w*Btn$/i.test(id) && v)
        : coupled[key];
      if (!winCoupled) {
        errors.push(`quality: optional UI toggle must not be play constraint: ${c.id} (${c.label})`);
      }
    }
  }
  return errors;
}

module.exports = { validateOptionalToggleConstraints };

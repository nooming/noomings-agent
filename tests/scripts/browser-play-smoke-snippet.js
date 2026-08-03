/** Paste into CDP Runtime.evaluate on student-play page after load */
(() => {
  const frame = document.getElementById('gameFrame');
  if (!frame?.contentDocument) return { ok: false, err: 'no_iframe' };
  const doc = frame.contentDocument;
  const clickIf = (el) => { if (el && el.offsetParent !== null) { el.click(); return true; } return false; };
  clickIf(doc.getElementById('msgBtn'));
  clickIf(doc.getElementById('craftIntroBtn'));
  const ranges = [...doc.querySelectorAll('input[type=range]')];
  const primary = ranges[0];
  const secondary = ranges[1];
  if (primary) {
    primary.value = String(Number(primary.min || 0) + (Number(primary.max || 100) - Number(primary.min || 0)) * 0.4);
    primary.dispatchEvent(new Event('input', { bubbles: true }));
    primary.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const fire = doc.querySelector('#btnLaunch, #btn-fire, #btnFire, #btnTest, #btn-test, #btnStart, button[id*=fire], button[id*=launch], button[id*=test]')
    || [...doc.querySelectorAll('button')].find(b => /发射|测试|开始|释放|运行|充电|碰撞/.test(b.textContent || ''));
  if (fire) fire.click();
  const mode = doc.getElementById('modeSelect');
  let phaseOk = false;
  if (mode) {
    const opts = [...mode.options].map(o => o.value);
    const challengeVal = opts.find(v => /challenge|compete|竞赛|挑战/.test(v)) || 'challenge';
    mode.value = challengeVal;
    mode.dispatchEvent(new Event('change', { bubbles: true }));
    phaseOk = document.body.dataset.playPhase === 'challenge' || mode.value === challengeVal;
  } else {
    const tab = [...doc.querySelectorAll('button,label,a')].find(el => /挑战|竞赛/.test(el.textContent || ''));
    if (tab) tab.click();
    phaseOk = document.body.dataset.playPhase === 'challenge';
  }
  // second fire in challenge, single-var
  if (primary) {
    primary.value = String(Number(primary.value) + 1);
    primary.dispatchEvent(new Event('input', { bubbles: true }));
    primary.dispatchEvent(new Event('change', { bubbles: true }));
  }
  if (fire) fire.click();
  const labels = [...doc.querySelectorAll('label, .ctrl-label, .slider-label, .var-label')]
    .map(el => (el.textContent || '').trim()).filter(Boolean).slice(0, 12);
  const spoilUi = /C\s*=|τ\s*=|½CV|mgh|最优|只需调/.test(doc.body?.innerText || '');
  const cvHints = labels.filter(t => /质量|颜色|音量|温度|深度|厚度|无关|装饰/.test(t));
  return {
    ok: true,
    title: doc.title,
    phase: document.body.dataset.playPhase,
    phaseOk,
    status: document.getElementById('playStatus')?.textContent || '',
    rangeCount: ranges.length,
    primaryId: primary?.id || null,
    secondaryId: secondary?.id || null,
    fireId: fire?.id || fire?.textContent?.trim()?.slice(0, 20) || null,
    labels,
    spoilUi,
    cvHints,
    modeOptions: mode ? [...mode.options].map(o => o.value + ':' + o.textContent.trim()) : [],
  };
})()

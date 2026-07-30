# -*- coding: utf-8 -*-
"""Fix capacitor-confound: must be Reroll (fail changes target C), not Fixed."""
from pathlib import Path
import shutil

ROOT = Path(r"c:\Users\20844\Desktop\agent")
src = ROOT / "样本html" / "电容混淆.html"
dst = ROOT / "data" / "runtime" / "packages" / "capacitor-confound-ui" / "game.html"
MARK = "BATCH4-REROLL-CAP-20260724"

t = src.read_text(encoding="utf-8")
if MARK in t and "RerollChallenge" in t and "rerollChallengeBand" in t:
    print("already Reroll")
else:
    t = t.replace(
        """    <h2>收音机电容标定</h2>
    <p>老式收音机调谐电容读数飘了。先自由改面积与间距摸清规律；竞赛时目标读数带本局锁定。</p>
    <p style="font-size:12px;color:var(--craft-muted)">探究与竞赛目标不同；竞赛进入后目标区间本局固定，未命中只扣次数。</p>""",
        """    <h2>收音机电容标定</h2>
    <p>老式收音机调谐电容读数飘了。先自由改面积与间距摸清规律；再接限次急单——每次打偏都会换新目标区间，防背滑条。</p>
    <p style="font-size:12px;color:var(--craft-muted)">探究与竞赛目标不同；竞赛失败会换目标 C 区间（Reroll）。</p>""",
    )

    t = t.replace(
        """      challenge: {
        hud: '竞赛：限次把读数打进本局锁定区间（打偏不换带）',
        side: '竞赛·急单标定：进入时锁定目标 pF 区间；打偏只扣次数——用 C∝A/d 算打法。'
      }""",
        """      challenge: {
        hud: '竞赛：限次把读数打进当前急单区间（打偏会换新目标）',
        side: '竞赛·夜修急单：每次未命中都会换新目标 C——不能背滑条，要会算。'
      }""",
    )

    t = t.replace(
        """      if (playMode === 'challenge' && lockedBand) {
        if (mission) mission.textContent = '急单区间：' + TARGET_LO + '–' + TARGET_HI + ' pF · 本局固定';
        if (side) side.textContent = '竞赛急单：把读数调进 ' + TARGET_LO + '–' + TARGET_HI + ' pF。区间已锁定，打偏不换带。';
      } else {""",
        """      if (playMode === 'challenge' && lockedBand) {
        if (mission) mission.textContent = '急单区间：' + TARGET_LO + '–' + TARGET_HI + ' pF · 打偏换题';
        if (side) side.textContent = '竞赛急单：把读数调进 ' + TARGET_LO + '–' + TARGET_HI + ' pF。未命中会换新目标区间。';
      } else {""",
    )

    old_lock = """    /** FixedChallenge：仅进入竞赛时锁定一次目标区间 */
    function lockChallengeBand() {
      const mid = 110 + Math.random() * 100; // 110–210
      const half = 15 + Math.random() * 15;  // 带宽 30–60
      TARGET_LO = Math.round(mid - half);
      TARGET_HI = Math.round(mid + half);
      lockedBand = { lo: TARGET_LO, hi: TARGET_HI };
      challengeWon = false;
      areaSlider.value = '0.03';
      distSlider.value = '0.008';
      toneSlider.value = '0';
      refreshCapGoals();
      updateUI(false);
      hintMsg.textContent = '急单已锁定目标区间（本局不变）';
      winContainer.innerHTML = '';
    }"""
    new_lock = """    function rollChallengeBand() {
      const mid = 90 + Math.random() * 140; // 90–230
      const half = 12 + Math.random() * 12; // 带宽 ~24–48
      TARGET_LO = Math.round(mid - half);
      TARGET_HI = Math.round(mid + half);
      lockedBand = { lo: TARGET_LO, hi: TARGET_HI };
    }
    /** RerollChallenge：进入竞赛抽一次；失败再换目标 C */
    function lockChallengeBand() {
      rollChallengeBand();
      challengeWon = false;
      areaSlider.value = '0.03';
      distSlider.value = '0.008';
      toneSlider.value = '0';
      refreshCapGoals();
      updateUI(false);
      hintMsg.textContent = '急单已下发：' + TARGET_LO + '–' + TARGET_HI + ' pF（打偏会换题）';
      winContainer.innerHTML = '';
    }
    function rerollChallengeBand() {
      rollChallengeBand();
      // 打乱滑条，避免贴旧解背题
      areaSlider.value = String((0.02 + Math.random() * 0.06).toFixed(2));
      distSlider.value = String((0.002 + Math.random() * 0.006).toFixed(3));
      challengeWon = false;
      refreshCapGoals();
      updateUI(false);
      hintMsg.textContent = '未命中 · 已换新急单 ' + TARGET_LO + '–' + TARGET_HI + ' pF';
      winContainer.innerHTML = '';
    }"""
    if old_lock not in t:
        raise SystemExit("lockChallengeBand block not found")
    t = t.replace(old_lock, new_lock)

    t = t.replace(
        """            if (typeof window.__craftShowWin === 'function') {
              window.__craftShowWin('急单区间本局锁定。面积增大、间距减小都会抬高电容；极板色调不参与计算。');
            }
          }
          hintMsg.textContent = '急单完成：读数落入锁定区间 ' + TARGET_LO + '–' + TARGET_HI + ' pF。';
          winContainer.innerHTML = '<div class="win-banner">过关 · 急单标定完成</div>';
        } else {
          // FixedChallenge：失败不换带
          hintMsg.textContent = C_pF < TARGET_LO
            ? '读数偏低 · 区间仍锁定 ' + TARGET_LO + '–' + TARGET_HI + ' pF'
            : '读数偏高 · 区间仍锁定 ' + TARGET_LO + '–' + TARGET_HI + ' pF';
          winContainer.innerHTML = '';
        }""",
        """            if (typeof window.__craftShowWin === 'function') {
              window.__craftShowWin('换目标后仍能命中：说明你掌握了 C 随 A、d 的关系，而不是背滑条。极板色调不参与计算。');
            }
          }
          hintMsg.textContent = '急单完成：读数落入 ' + TARGET_LO + '–' + TARGET_HI + ' pF。';
          winContainer.innerHTML = '<div class="win-banner">过关 · 夜修完成</div>';
        } else {
          // RerollChallenge：失败换目标 C
          rerollChallengeBand();
        }""",
    )

    t = t.replace(
        """      } else if (playMode === 'challenge') {
        if (inBand) hintMsg.textContent = '读数已在锁定区间附近，点击测试确认。';
        else hintMsg.textContent = '区间已锁定 ' + TARGET_LO + '–' + TARGET_HI + ' pF，调参后再测。';
        winContainer.innerHTML = '';
      } else {""",
        """      } else if (playMode === 'challenge') {
        if (inBand) hintMsg.textContent = '读数已在急单区间附近，点击测试确认。';
        else hintMsg.textContent = '当前急单 ' + TARGET_LO + '–' + TARGET_HI + ' pF，调参后再测（打偏会换题）。';
        winContainer.innerHTML = '';
      } else {""",
    )

    # canvas label
    t = t.replace(
        "ctx.fillText('急单 ' + TARGET_LO + '–' + TARGET_HI + ' pF', 28, benchY - 24);",
        "ctx.fillText('急单(可换) ' + TARGET_LO + '–' + TARGET_HI + ' pF', 28, benchY - 24);",
    )

    if MARK not in t:
        t = t.replace("</html>", "<!-- " + MARK + " RerollChallenge -->\n</html>")

    src.write_text(t.replace("\r\n", "\n"), encoding="utf-8")
    print("patched yangben")

shutil.copyfile(src, dst)
print("writeback capacitor-confound-ui")
print("done")

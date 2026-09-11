# -*- coding: utf-8 -*-
from pathlib import Path
ROOT = Path(r"c:\Users\20844\Desktop\myweb-re\agent")
FILE = ROOT / "data/runtime/packages/momentum-collision/game.html"
FRAG = ROOT / "tests/scripts/_frag_mom_draw3d.js"
html = FILE.read_text(encoding="utf-8")
frag = FRAG.read_text(encoding="utf-8")
frag_indented = "\n".join(("    " + line if line.strip() else line) for line in frag.splitlines()) + "\n"
start = html.find("    const canvas = document.getElementById('collisionCanvas');\n    const ctx = canvas.getContext('2d');")
end = html.find("    function fire() {")
keep_from = html.find("    let layoutMom = null;", start)
round_rect = html.find("    function roundRect(x, y, w, h, r) {", keep_from)
print("markers", start, end, keep_from, round_rect)
assert min(start, end, keep_from, round_rect) >= 0
head = """    const canvas = document.getElementById('collisionCanvas');
    const DESIGN_W = 760, DESIGN_H = 360;
    let W = DESIGN_W, H = DESIGN_H;

    const CRAFT3 = {
      bg: 0x120c12, mid: 0x2e2430, hi: 0xe8a8c8, glow: 0xe060a0,
      metal: 0x7a8490, accent: 0x0c8aad, ok: 0x6fae8f, ink: 0x141018
    };
    const TRACK_WORLD = 16;
    let threeReady = false;
    let renderer, scene, camera, orbit, clock;
    let railMesh, bayMesh, bayMat, block1, block2;
    let badgeSprite, lampPivot, dustPoints, sparkGroup, velArrow;

    function syncCanvasSize() {
      var stage = document.getElementById('essence-stage') || canvas.parentElement;
      var cssW = Math.max(2, (stage && stage.clientWidth) || canvas.clientWidth || DESIGN_W);
      var cssH = Math.max(2, (stage && stage.clientHeight) || canvas.clientHeight || DESIGN_H);
      W = cssW;
      H = cssH;
      if (renderer && camera) {
        var pr = Math.min(2, window.devicePixelRatio || 1);
        if (canvas.width !== Math.round(cssW * pr) || canvas.height !== Math.round(cssH * pr)) {
          renderer.setPixelRatio(pr);
          renderer.setSize(cssW, cssH, false);
          canvas.style.width = cssW + 'px';
          canvas.style.height = cssH + 'px';
          camera.aspect = cssW / cssH;
          camera.updateProjectionMatrix();
        }
      } else {
        canvas.style.width = cssW + 'px';
        canvas.style.height = cssH + 'px';
      }
    }

"""
middle = html[keep_from:round_rect]
html = html[:start] + head + middle + frag_indented + "\n" + html[end:]
old_boot = """    updateSliderLabels();
    refreshGoalUI();
    resetSim(true);
    drawScene();
    window.__momRedraw = drawScene;"""
new_boot = """    updateSliderLabels();
    refreshGoalUI();
    window.__momRedraw = function() {
      syncCanvasSize();
      if (!animating) drawScene();
    };

    if (!initThree()) {
      hintMsg.textContent = '3D engine missing: vendor/three.min.js';
    } else {
      resetSim(true);
      (function renderLoop() {
        const tNow = clock ? clock.getElapsedTime() : 0;
        if (lampPivot) lampPivot.rotation.z = Math.sin(tNow * 1.1) * 0.05;
        if (dustPoints) {
          const arr = dustPoints.geometry.attributes.position.array;
          for (let i = 0; i < arr.length; i += 3) {
            arr[i + 1] += 0.002 + ((i / 3) % 5) * 0.00015;
            if (arr[i + 1] > 8) arr[i + 1] = 0.4;
          }
          dustPoints.geometry.attributes.position.needsUpdate = true;
        }
        if (!animating) drawScene();
        if (orbit) orbit.update();
        if (renderer && scene && camera) renderer.render(scene, camera);
        requestAnimationFrame(renderLoop);
      })();
    }"""
assert old_boot in html, "boot missing"
html = html.replace(old_boot, new_boot, 1)
FILE.write_text(html, encoding="utf-8")
print("OK lines", html.count(chr(10))+1)
print("initThree", "function initThree" in html)
print("ctx leftover", "const ctx = canvas.getContext('2d')" in html)

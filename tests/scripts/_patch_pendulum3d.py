# -*- coding: utf-8 -*-
from pathlib import Path

ROOT = Path(r"c:\Users\20844\Desktop\myweb-re\agent")
FILE = ROOT / "data/runtime/packages/pendulum-target/game.html"
html = FILE.read_text(encoding="utf-8")

if "vendor/three.min.js" not in html:
    html = html.replace(
        "<title>投靶台 · 单摆</title>",
        '<title>投靶台 · 单摆</title>\n  <script src="vendor/three.min.js"></script>\n  <script src="vendor/OrbitControls.js"></script>',
        1,
    )

start = html.find(
    "    const canvas = document.getElementById('simCanvas');\n    const ctx = canvas.getContext('2d');"
)
ds = html.find("    function drawScene() {", start)
after_markers = [
    "    function update(dt)",
    "    function tick(",
    "    function animate(",
    "    releaseBtn.addEventListener",
]
end = -1
for m in after_markers:
    i = html.find(m, ds + 10)
    if i >= 0 and (end < 0 or i < end):
        end = i
print("markers", start, ds, end)
assert min(start, ds, end) >= 0

stage_line = html.find("    const stage = document.getElementById('stage');", start)
resize_start = html.find("    function resize() {", stage_line)
slider_line = html.find(
    "    const lengthSlider = document.getElementById('s-length');", resize_start
)
assert min(stage_line, resize_start, slider_line) >= 0

head = """    const canvas = document.getElementById('simCanvas');
    const stage = document.getElementById('stage');
"""

new_resize = r"""    let scale = 1, offX = 0, offY = 0;
    const CRAFT3 = {
      bg: 0x0f1c28, mid: 0x1e3347, hi: 0xfde68a, glow: 0xf59e0b,
      metal: 0x94a3b8, accent: 0x86efac, ok: 0x6fae8f, wood: 0x6b4f2a
    };
    let threeReady = false;
    let renderer, scene, camera, orbit, clock;
    let pivotMesh, rodMesh, bobMesh, cartMesh, badgeSprite, lampPivot, dustPoints, flyMesh;

    function resize() {
        const w = stage.clientWidth || innerWidth;
        const h = stage.clientHeight || innerHeight;
        scale = Math.min(w / DW, h / DH);
        offX = (w - DW * scale) / 2;
        offY = (h - DH * scale) / 2;
        if (renderer && camera) {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            renderer.setPixelRatio(dpr);
            renderer.setSize(w, h, false);
            canvas.style.width = w + 'px';
            canvas.style.height = h + 'px';
            camera.aspect = w / Math.max(1, h);
            camera.updateProjectionMatrix();
        } else {
            canvas.style.width = w + 'px';
            canvas.style.height = h + 'px';
        }
        if (typeof drawScene === 'function' && threeReady) drawScene();
    }

"""

middle = html[slider_line:ds]
draw3d = (ROOT / "tests/scripts/_frag_pendulum_draw3d.js").read_text(encoding="utf-8")
draw3d_ind = "\n".join(("    " + ln if ln.strip() else ln) for ln in draw3d.splitlines()) + "\n"

html2 = html[:start] + head + new_resize + middle + draw3d_ind + html[end:]

rel = html2.find("releaseBtn.addEventListener")
boot_at = html2.find("    resize();", rel if rel > 0 else 0)
if boot_at < 0:
    boot_at = html2.rfind("    resize();")
assert boot_at > 0

boot_insert = """    if (!initThree()) {
      if (statusMsg) statusMsg.textContent = '3D engine missing: vendor/three.min.js';
    } else {
      (function renderLoop() {
        const tNow = clock ? clock.getElapsedTime() : 0;
        if (lampPivot) lampPivot.rotation.z = Math.sin(tNow * 1.05) * 0.05;
        if (dustPoints) {
          const arr = dustPoints.geometry.attributes.position.array;
          for (let i = 0; i < arr.length; i += 3) {
            arr[i + 1] += 0.0015;
            if (arr[i + 1] > 7) arr[i + 1] = 0.3;
          }
          dustPoints.geometry.attributes.position.needsUpdate = true;
        }
        drawScene();
        if (orbit) orbit.update();
        if (renderer && scene && camera) renderer.render(scene, camera);
        requestAnimationFrame(renderLoop);
      })();
    }
"""
html2 = html2[:boot_at] + boot_insert + html2[boot_at:]
html2 = html2.replace(
    "window.__pendulumRedraw = drawScene",
    "window.__pendulumRedraw = function(){ resize(); if(threeReady) drawScene(); }",
)

FILE.write_text(html2, encoding="utf-8")
print("OK pendulum-target")
print("ctx leftover", "const ctx = canvas.getContext('2d')" in html2)
print("initThree", "function initThree" in html2)
print("explore_success", "explore_success" in html2)

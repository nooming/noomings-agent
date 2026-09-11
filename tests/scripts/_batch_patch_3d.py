# -*- coding: utf-8 -*-
"""Batch-patch projectile-cannon, cyclotron-radius, magnetic-force to Three.js."""
from pathlib import Path

ROOT = Path(r"c:\Users\20844\Desktop\myweb-re\agent")
PKG = ROOT / "data/runtime/packages"


def add_scripts(html: str, title_substr: str) -> str:
    if "vendor/three.min.js" in html:
        return html
    # insert after first <title>...</title>
    i = html.find("<title>")
    j = html.find("</title>", i)
    assert i >= 0 and j >= 0
    insert = '\n  <script src="vendor/three.min.js"></script>\n  <script src="vendor/OrbitControls.js"></script>'
    return html[: j + len("</title>")] + insert + html[j + len("</title>") :]


def patch_cannon():
    FILE = PKG / "projectile-cannon/game.html"
    html = FILE.read_text(encoding="utf-8")
    html = add_scripts(html, "炮台")

    # Replace constructor ctx init + resize setTransform + draw() with 3D
    old_ctx = """        this.ctx = this.dom.canvas.getContext('2d');
        this.ctx.imageSmoothingEnabled = false;"""
    new_ctx = """        this.ctx = null; // 3D presentation; physics stays in pixel space
        this.threeReady = false;
        this._three = {};"""
    assert old_ctx in html, "cannon ctx marker missing"
    html = html.replace(old_ctx, new_ctx, 1)

    old_resize_body = """            this.dom.canvas.style.width = this.width + 'px';
            this.dom.canvas.style.height = this.height + 'px';
            this.dom.canvas.width = Math.round(this.width * dpr);
            this.dom.canvas.height = Math.round(this.height * dpr);
            this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            this.groundY = this.height * 0.85;"""
    new_resize_body = """            this.dom.canvas.style.width = this.width + 'px';
            this.dom.canvas.style.height = this.height + 'px';
            this.groundY = this.height * 0.85;
            if (this.threeReady && this._three.renderer) {
                this._three.renderer.setPixelRatio(dpr);
                this._three.renderer.setSize(this.width, this.height, false);
                this._three.camera.aspect = this.width / Math.max(1, this.height);
                this._three.camera.updateProjectionMatrix();
            }"""
    assert old_resize_body in html, "cannon resize marker missing"
    html = html.replace(old_resize_body, new_resize_body, 1)

    # Inject 3D methods before drawCannon
    marker = "    drawCannon() {"
    assert marker in html
    methods = (ROOT / "tests/scripts/_frag_cannon3d.js").read_text(encoding="utf-8")
    # indent as class methods (4 spaces already in frag? we'll add 4)
    methods_ind = "\n".join(("    " + ln if ln.strip() else ln) for ln in methods.splitlines()) + "\n\n"
    html = html.replace(marker, methods_ind + marker, 1)

    # Replace draw() body to use sync3d + render
    old_draw = """    draw() {
        if(this.width === 0 || this.height === 0) return;

        this.ctx.clearRect(0, 0, this.width, this.height);
        
        this.drawEnvironment();
        this.drawObstacles();
        this.drawTarget();
        this.drawLandingPoints();
        this.drawCannon();
        this.drawMuzzleFlash();

        if (this.state === 'SIMULATING') {
            this.drawProj();
        }
        
        this.drawParticles();
    }"""
    new_draw = """    draw() {
        if(this.width === 0 || this.height === 0) return;
        if (!this.threeReady) {
            if (!this.initThree()) return;
        }
        this.sync3d();
        const T = this._three;
        if (T.orbit) T.orbit.update();
        if (T.renderer && T.scene && T.camera) T.renderer.render(T.scene, T.camera);
    }"""
    assert old_draw in html, "cannon draw marker missing"
    html = html.replace(old_draw, new_draw, 1)

    # Stub 2d helpers that still reference ctx so accidental calls don't crash
    # drawRect is used by old drawCannon - leave old methods but they won't be called from draw()
    # Guard drawRect
    old_drawRect = """    drawRect(x, y, w, h, color) {
        this.ctx.fillStyle = color;
        this.ctx.fillRect(Math.floor(x), Math.floor(y), w, h);
    }"""
    if old_drawRect in html:
        html = html.replace(
            old_drawRect,
            """    drawRect(x, y, w, h, color) {
        /* 2D legacy noop — stage is Three.js */
    }""",
            1,
        )

    FILE.write_text(html, encoding="utf-8")
    print("OK projectile-cannon", "initThree" in html, "vendor/three" in html)


def patch_cyclotron():
    FILE = PKG / "cyclotron-radius/game.html"
    html = FILE.read_text(encoding="utf-8")
    html = add_scripts(html, "加速舱")

    start = html.find("    const canvas = document.getElementById('simCanvas');\n    const ctx = canvas.getContext('2d');")
    # Some files may use different quote style
    if start < 0:
        start = html.find('    const canvas = document.getElementById(\'simCanvas\');\n    const ctx = canvas.getContext(\'2d\');')
    assert start >= 0, "cyclotron canvas start missing"

    # Find resize that uses ctx2
    # Replace from canvas/ctx through end of draw() function, keep physics after update(dt)
    draw_fn = html.find("    function draw() {", start)
    update_fn = html.find("    function update(dt) {", draw_fn)
    assert draw_fn > 0 and update_fn > draw_fn

    # Keep from canvasArea / DOM refs after ctx — find canvasArea line
    keep_from = html.find("    const canvasArea = document.getElementById('simCanvasArea');", start)
    if keep_from < 0:
        keep_from = html.find("    const sMag = document.getElementById('s-magnetic');", start)
    assert keep_from > start

    # We need to remove old draw helpers but keep state vars. Strategy:
    # 1) Replace canvas+ctx with three vars + sync size
    # 2) Replace drawStatic/draw/drawChamber... through just before update(dt)
    # Find first drawing function
    draw_chamber = html.find("    function drawChamber(", start)
    if draw_chamber < 0:
        draw_chamber = html.find("    function drawStatic()", start)
    assert draw_chamber > 0

    # Keep middle: from keep_from to draw_chamber (physics/state)
    middle = html[keep_from:draw_chamber]
    frag = (ROOT / "tests/scripts/_frag_cyclotron3d.js").read_text(encoding="utf-8")
    frag_ind = "\n".join(("    " + ln if ln.strip() else ln) for ln in frag.splitlines()) + "\n"

    head = """    const canvas = document.getElementById('simCanvas');
    const CRAFT3 = {
      bg: 0x0a1218, mid: 0x1a2834, hi: 0x80d8e0, glow: 0x30c8d8,
      metal: 0x7a8490, accent: 0xffb347, ok: 0x6fae8f
    };
    let threeReady = false;
    let renderer, scene, camera, orbit, clock;
    let chamberGroup, particleMesh, orbitRing, trailLine, poleN, poleS, badgeSprite, extractRing;
    let BArrowGroup;

    function syncRendererSize() {
      const area = document.getElementById('simCanvasArea') || canvas.parentElement;
      const cssW = Math.max(2, (area && area.clientWidth) || canvas.clientWidth || 640);
      const cssH = Math.max(2, (area && area.clientHeight) || canvas.clientHeight || 420);
      if (renderer && camera) {
        const pr = Math.min(2, window.devicePixelRatio || 1);
        renderer.setPixelRatio(pr);
        renderer.setSize(cssW, cssH, false);
        canvas.style.width = cssW + 'px';
        canvas.style.height = cssH + 'px';
        camera.aspect = cssW / Math.max(1, cssH);
        camera.updateProjectionMatrix();
      }
      // keep 2d layout vars used by physics labeling
      centerX = cssW / 2;
      centerY = cssH / 2;
      scale = Math.min(cssW, cssH) / 10;
    }

"""

    html = html[:start] + head + middle + frag_ind + html[update_fn:]

    # Replace 2D resizeCanvas with Three.js sync
    old_resize = """    function resizeCanvas() {
        const area = canvasArea;
        const dpr = window.devicePixelRatio || 1;
        const w = area.clientWidth;
        const h = area.clientHeight;
        if (w < 2 || h < 2) {
            scheduleCanvasResizeRetry();
            return false;
        }
        _canvasResizeRetry = 0;
        canvas.width = Math.max(1, Math.floor(w * dpr));
        canvas.height = Math.max(1, Math.floor(h * dpr));
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
        const ctx2 = canvas.getContext('2d');
        ctx2.setTransform(dpr, 0, 0, dpr, 0, 0);
        // 更新圆心 (画布坐标)
        centerX = w / 2;
        centerY = h / 2;
        // 根据画布大小调整scale，使半径可见
        const maxDim = Math.min(w, h) * 0.38;
        // 默认最大半径约 4m，scale = maxDim/4
        scale = Math.max(30, maxDim / 4.5);
        return true;
    }"""
    new_resize = """    function resizeCanvas() {
        const area = canvasArea || canvas.parentElement;
        const w = area ? area.clientWidth : 0;
        const h = area ? area.clientHeight : 0;
        if (w < 2 || h < 2) {
            scheduleCanvasResizeRetry();
            return false;
        }
        _canvasResizeRetry = 0;
        syncRendererSize();
        const maxDim = Math.min(w, h) * 0.38;
        scale = Math.max(30, maxDim / 4.5);
        centerX = w / 2;
        centerY = h / 2;
        return true;
    }"""
    if old_resize in html:
        html = html.replace(old_resize, new_resize, 1)
    else:
        html = html.replace("const ctx2 = canvas.getContext('2d');", "/* ctx2 removed */")
        html = html.replace("ctx2.setTransform(dpr, 0, 0, dpr, 0, 0);", "/* no 2d transform */")

    insert_at = html.find("    function startSim() {")
    assert insert_at > 0
    boot = """
    if (!initThree()) {
      if (feedbackMsg) feedbackMsg.textContent = '3D engine missing: vendor/three.min.js';
    } else {
      resizeCanvas();
      draw();
    }

"""
    html = html[:insert_at] + boot + html[insert_at:]

    FILE.write_text(html, encoding="utf-8")
    print("OK cyclotron-radius", "initThree" in html, "getContext('2d')" in html)


def patch_magnetic():
    FILE = PKG / "magnetic-force/game.html"
    html = FILE.read_text(encoding="utf-8")
    html = add_scripts(html, "磁轨")

    start = html.find("  const canvas = document.getElementById('simCanvas');\n  const ctx = canvas.getContext('2d');")
    assert start >= 0

    draw_start = html.find("  function drawCanvas(I, B, F) {", start)
    assert draw_start > 0
    # end of drawCanvas: next function after it
    # typically updateAll or animateFrame
    end = html.find("  // ----- 测试/发射 事件 (snapshot + win) -----", draw_start)
    if end < 0:
        end = html.find("  function onTest() {", draw_start)
    assert end > draw_start

    keep_from = html.find("  const L = 0.8;", start)
    assert keep_from > start
    # Keep physics/UI through resizeCanvas, but stop before old drawCanvas
    middle = html[keep_from:draw_start]

    head = """  const canvas = document.getElementById('simCanvas');
  const CRAFT3 = {
    bg: 0x0a1410, mid: 0x1e3428, hi: 0x80d0a0, glow: 0x40c878,
    metal: 0x6a7870, accent: 0x4aaa78, ok: 0x6fae8f
  };
  let threeReady = false;
  let renderer, scene, camera, orbit, clock;
  let wireMesh, magnetGroup, scaleGroup, springMesh, BFieldGroup, badgeSprite, lampPivot, dustPoints;
  let powerBox, liftGroup;

  function syncRendererSize() {
    const wrap = canvas.parentElement;
    const cssW = Math.max(2, (wrap && wrap.clientWidth) || canvas.clientWidth || 600);
    const cssH = Math.max(2, (wrap && wrap.clientHeight) || canvas.clientHeight || 360);
    W = cssW; H = cssH;
    if (renderer && camera) {
      const pr = Math.min(2, window.devicePixelRatio || 1);
      renderer.setPixelRatio(pr);
      renderer.setSize(cssW, cssH, false);
      canvas.style.width = cssW + 'px';
      canvas.style.height = cssH + 'px';
      camera.aspect = cssW / Math.max(1, cssH);
      camera.updateProjectionMatrix();
    }
  }

"""

    frag = (ROOT / "tests/scripts/_frag_magnetic3d.js").read_text(encoding="utf-8")
    frag_ind = "\n".join(("  " + ln if ln.strip() else ln) for ln in frag.splitlines()) + "\n"

    html = html[:start] + head + middle + frag_ind + html[end:]

    old_mag_resize = """  function resizeCanvas() {
    const rect = wrap.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    W = Math.max(320, rect.width);
    H = Math.max(240, rect.height);
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const I = parseFloat(sCurrent.value) || 0;
    const B = parseFloat(sMagnetic.value) || 0;
    drawCanvas(I, B, computeForce(I, B));
  }"""
    new_mag_resize = """  function resizeCanvas() {
    const rect = wrap.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    W = Math.max(320, rect.width);
    H = Math.max(240, rect.height);
    syncRendererSize();
    const I = parseFloat(sCurrent.value) || 0;
    const B = parseFloat(sMagnetic.value) || 0;
    drawCanvas(I, B, computeForce(I, B));
  }"""
    if old_mag_resize in html:
        html = html.replace(old_mag_resize, new_mag_resize, 1)
    else:
        html = html.replace("ctx.setTransform(dpr, 0, 0, dpr, 0, 0);", "/* no 2d */")

    # Boot once near the initial resizeCanvas(); updateAll(); pair
    first_draw = html.find("  resizeCanvas();\n  updateAll();")
    if first_draw < 0:
        first_draw = html.find("  resizeCanvas();")
    assert first_draw > 0
    boot = """
  if (!initThree()) {
    if (feedback) feedback.textContent = '3D engine missing: vendor/three.min.js';
  } else {
    (function renderLoop() {
      const tNow = clock ? clock.getElapsedTime() : 0;
      if (lampPivot) lampPivot.rotation.z = Math.sin(tNow * 1.1) * 0.04;
      if (dustPoints) {
        const arr = dustPoints.geometry.attributes.position.array;
        for (let i = 0; i < arr.length; i += 3) {
          arr[i + 1] += 0.0015;
          if (arr[i + 1] > 7) arr[i + 1] = 0.3;
        }
        dustPoints.geometry.attributes.position.needsUpdate = true;
      }
      const I = parseFloat(sCurrent.value) || 0;
      const B = parseFloat(sMagnetic.value) || 0;
      drawCanvas(I, B, computeForce(I, B));
      if (orbit) orbit.update();
      if (renderer && scene && camera) renderer.render(scene, camera);
      requestAnimationFrame(renderLoop);
    })();
  }
"""
    html = html[:first_draw] + boot + html[first_draw:]

    FILE.write_text(html, encoding="utf-8")
    print("OK magnetic-force", "initThree" in html, "const ctx =" in html)


if __name__ == "__main__":
    patch_cannon()
    patch_cyclotron()
    patch_magnetic()

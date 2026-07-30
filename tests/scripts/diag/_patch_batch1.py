# -*- coding: utf-8 -*-
"""Atomic batch-1 challenge-refresh patch for cannon + friction."""
from pathlib import Path
import re
import shutil
import time

MARK = "<!-- BATCH1-CHALLENGE-REFRESH-20260724 -->"
ROOT = Path(r"c:\Users\20844\Desktop\agent")


def atomic_write(path: Path, text: str) -> None:
    tmp = path.with_suffix(path.suffix + ".tmpwrite")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(path)
    time.sleep(0.05)


def patch_cannon(path: Path) -> bool:
    raw = path.read_text(encoding="utf-8")
    t = raw.replace("\r\n", "\n").replace("\r", "\n")
    t = t.replace("<!-- MARKERTEST -->\n", "")
    if "BATCH1-CHALLENGE-REFRESH-20260724" in t and "目标已刷新" in t and "this.playMode" in t:
        print("cannon already patched")
        return True

    if 'id="goalMission"' not in t:
        t = t.replace(
            '<div id="challengeStats"><span>剩余机会</span><span id="attemptsDisplay">5</span></div>\n</div>',
            '<div id="challengeStats"><span>剩余机会</span><span id="attemptsDisplay">6</span></div>\n'
            '<div id="goalMission" style="margin-top:6px;font-size:12px;line-height:1.35;max-width:340px;opacity:.95">'
            "目标：自由试射，对比落点，弄清阻力与风如何改变弹道</div>\n</div>",
        )

    if 'id="sideGoal"' not in t:
        t = t.replace(
            '<div class="ctrl-hd"><div class="dual-bench-row"><span>控制面板</span><select id="modeSelect" aria-label="探究阶段"><option value="explore">自由探究</option><option value="challenge">竞赛挑战</option></select></div></div>\n        <div class="ctrl-scroll">',
            '<div class="ctrl-hd"><div class="dual-bench-row"><span>炮台操控</span><select id="modeSelect" aria-label="探究阶段"><option value="explore">自由探究</option><option value="challenge">要塞突击</option></select></div></div>\n'
            '        <div id="sideGoalBox" style="padding:10px 12px 0">\n'
            '          <div style="border:1px solid rgba(122,242,204,.35);background:rgba(0,0,0,.28);border-radius:10px;padding:8px 10px">\n'
            '            <div style="font-size:11px;font-weight:700;color:#7af2cc;letter-spacing:.04em">当前目标</div>\n'
            '            <p id="sideGoal" style="margin:4px 0 0;font-size:12px;line-height:1.45;color:rgba(255,255,255,.88)">在开阔试射场自由打几发，读落点距离；换阻力/风速再比一次——不必打掩体。</p>\n'
            "          </div>\n"
            "        </div>\n"
            '        <div class="ctrl-scroll">',
        )

    old_state = """        this.state = 'READY';
        this.level = 1;
        
        this.totalScore = 0;
        this.attemptsInLevel = 0; 
        
        this.pixelsPerMeter = 4;
        this.timeScale = 0.05;
        
        this.proj = null;
        this.target = null;
        this.obstacles = []; 
        this.particles = [];
        this.muzzleFlash = null;
        this.recoil = 0;
        
        this.landingPoints = [];
        
        this.width = 0;
        this.height = 0;
        this.groundY = 0;"""
    new_state = """        this.state = 'READY';
        this.level = 1;
        this.playMode = 'explore'; // explore | challenge
        
        this.totalScore = 0;
        this.attemptsInLevel = 0; 
        
        this.pixelsPerMeter = 4;
        this.timeScale = 0.05;
        
        this.proj = null;
        this.target = null;
        this.obstacles = []; 
        this.particles = [];
        this.muzzleFlash = null;
        this.recoil = 0;
        
        this.landingPoints = [];
        this.rangePosts = [];
        this.exploreShots = 0;
        this.exploreDragSeen = new Set();
        this.exploreWindSeen = new Set();
        this.exploreWon = false;
        
        this.width = 0;
        this.height = 0;
        this.groundY = 0;"""
    if old_state in t:
        t = t.replace(old_state, new_state)
    else:
        print("WARN: cannon state block not found")

    old_init_tail = """        this.dom.levelClear.btnEnter.addEventListener('click', () => this.enterFreeMode());

        setTimeout(() => {
            this.resize();
            this.generateLevel(); 
            this.updateLevelTag();
            this.updateScoreDisplay();
            this.updateUI();
            this.loop();
        }, 100);
    }

    openGuide() { this.dom.guide.overlay.classList.add('active'); }"""
    new_init_tail = """        this.dom.levelClear.btnEnter.addEventListener('click', () => this.enterFreeMode());

        document.addEventListener('dual-mode-change', (ev) => {
            this.applyPlayMode(ev.detail && ev.detail.mode);
        });

        setTimeout(() => {
            this.resize();
            const dm = window.__dualModeGet ? window.__dualModeGet() : null;
            this.applyPlayMode(dm ? dm.mode : 'explore');
            this.updateScoreDisplay();
            this.updateUI();
            this.loop();
        }, 100);
    }

    applyPlayMode(mode) {
        this.playMode = mode === 'challenge' ? 'challenge' : 'explore';
        this.state = 'READY';
        this.proj = null;
        this.particles = [];
        this.landingPoints = [];
        this.attemptsInLevel = 0;
        if (this.playMode === 'explore') {
            this.level = 0;
            this.exploreShots = 0;
            this.exploreDragSeen = new Set();
            this.exploreWindSeen = new Set();
            this.exploreWon = false;
            this.dom.modal.overlay.classList.remove('active');
        } else {
            this.level = 1;
            this.exploreWon = false;
        }
        this.generateLevel();
        this.updateLevelTag();
        this.refreshGoalUI();
        if (this.dom.hud && this.dom.hud.panel) this.dom.hud.panel.style.display = 'none';
        this.draw();
    }

    refreshGoalUI() {
        const mission = document.getElementById('goalMission');
        const side = document.getElementById('sideGoal');
        if (this.playMode === 'challenge') {
            if (this.target) {
                const distM = ((this.target.x - 60) / this.pixelsPerMeter).toFixed(0);
                const heightM = Math.max(0, ((this.groundY - this.target.y) / this.pixelsPerMeter)).toFixed(0);
                const bunker = this.obstacles && this.obstacles.length ? '（需越过掩体）' : '（开阔）';
                if (mission) mission.textContent = `当前要塞：约 ${distM} m · 高度 ${heightM} m ${bunker} · 未中将换新目标`;
                if (side) side.textContent = `竞赛·要塞突击：命中约 ${distM} m、高度约 ${heightM} m 的标志物${bunker}。打偏后目标位置会重新抽取——不能死记上一发的瞄准。`;
            } else {
                if (mission) mission.textContent = '目标：限次打穿/绕过掩体，命中要塞标志物（未中即换新目标）';
                if (side) side.textContent = '竞赛·要塞突击：掩体后出现目标，机会有限，必须命中才过关——不是再自由测射程。';
            }
        } else {
            if (mission) mission.textContent = '目标：自由试射≥3发，并换过阻力或风速，对比落点归纳弹道规律';
            if (side) side.textContent = '探究·临海试射场：读落点米数；请至少换一组阻力或风速再打，归纳哪些量真正改弹道。不必打掩体。';
        }
    }

    openGuide() { this.dom.guide.overlay.classList.add('active'); }"""
    if old_init_tail in t:
        t = t.replace(old_init_tail, new_init_tail)
    else:
        print("WARN: cannon init tail not found")

    old_tag = """    updateLevelTag() {
        if (this.level > 4) {
            this.dom.level.innerText = "自由模式";
            this.dom.level.classList.add('free-mode');
        } else {
            this.dom.level.innerText = `第 ${this.level} 关`;
            this.dom.level.classList.remove('free-mode');
        }
    }"""
    new_tag = """    updateLevelTag() {
        if (this.playMode === 'explore') {
            this.dom.level.innerText = '试射场';
            this.dom.level.classList.add('free-mode');
            return;
        }
        if (this.level > 4) {
            this.dom.level.innerText = '随机要塞';
            this.dom.level.classList.add('free-mode');
        } else {
            this.dom.level.innerText = `突击 ${this.level}`;
            this.dom.level.classList.remove('free-mode');
        }
    }"""
    if old_tag in t:
        t = t.replace(old_tag, new_tag)

    old_gen = """    generateLevel() {
        if (this.width === 0) return;
        this.obstacles = [];
        
        const type = this.level % 4;
        const obstacleColor = '#5d4037'; 
        
        if (type === 0) this.highlightInputs(['drag', 'wind']);
        else this.highlightInputs([]);

        if (type === 1) {
            const minX = this.width * 0.3; const maxX = this.width * 0.9;
            const x = Math.random() * (maxX - minX) + minX;
            const isAir = Math.random() > 0.5;
            const y = isAir ? this.groundY - (100 + Math.random() * (this.height * 0.3)) : this.groundY;
            this.target = { x, y, w: 24, h: 24, color: '#e74c3c' };
        } else if (type === 2) {
            const wallW = 30, wallH = this.height * 0.6, wallX = this.width * 0.35;
            this.obstacles.push({ x: wallX, y: this.groundY - wallH, w: wallW, h: wallH, color: obstacleColor });
            const targetX = wallX + wallW + 20 + Math.random() * 100;
            const isAir = Math.random() > 0.3;
            const targetY = isAir ? this.groundY - (50 + Math.random() * 100) : this.groundY;
            this.target = { x: targetX, y: targetY, w: 24, h: 24, color: '#e74c3c' };
        } else if (type === 3) {
            const platW = 200, platH = 20, platY = this.height * 0.3, platX = this.width * 0.3;
            this.obstacles.push({ x: platX, y: platY, w: platW, h: platH, color: '#546e7a' });
            const targetX = platX + platW + 100 + Math.random() * 100;
            const targetY = this.groundY; 
            this.target = { x: targetX, y: targetY, w: 24, h: 24, color: '#e74c3c' };
        } else {
            const wallW = 30, wallH = this.height * 0.7, wallX = this.width * 0.4;
            this.obstacles.push({ x: wallX, y: this.groundY - wallH, w: wallW, h: wallH, color: obstacleColor });
            const targetX = wallX + wallW + 30; 
            const targetY = this.groundY - (80 + Math.random() * 100);
            this.target = { x: targetX, y: targetY, w: 24, h: 24, color: '#e74c3c' };
            this.dom.inputs.wind.value = 0; 
        }
    }"""
    new_gen = """    generateLevel() {
        if (this.width === 0) return;
        this.obstacles = [];
        this.rangePosts = [];
        this.target = null;

        if (this.playMode === 'explore') {
            this.highlightInputs(['drag', 'wind']);
            const marks = [40, 80, 120, 160];
            marks.forEach((m) => {
                const x = 60 + m * this.pixelsPerMeter;
                if (x < this.width - 30) this.rangePosts.push({ x, meters: m });
            });
            this.refreshGoalUI();
            return;
        }

        const type = ((Math.max(1, this.level) - 1) % 4) + 1;
        const obstacleColor = '#5d4037';
        if (type === 4) this.highlightInputs(['drag', 'wind']);
        else this.highlightInputs([]);

        if (type === 1) {
            const minX = this.width * 0.35; const maxX = this.width * 0.88;
            const x = Math.random() * (maxX - minX) + minX;
            const isAir = Math.random() > 0.45;
            const y = isAir ? this.groundY - (80 + Math.random() * (this.height * 0.28)) : this.groundY;
            this.target = { x, y, w: 26, h: 26, color: '#e74c3c' };
        } else if (type === 2) {
            const wallW = 32, wallH = this.height * 0.55, wallX = this.width * 0.38;
            this.obstacles.push({ x: wallX, y: this.groundY - wallH, w: wallW, h: wallH, color: obstacleColor });
            const targetX = wallX + wallW + 30 + Math.random() * 90;
            const isAir = Math.random() > 0.35;
            const targetY = isAir ? this.groundY - (50 + Math.random() * 110) : this.groundY;
            this.target = { x: targetX, y: targetY, w: 26, h: 26, color: '#e74c3c' };
        } else if (type === 3) {
            const platW = 180, platH = 18, platY = this.height * 0.32, platX = this.width * 0.32;
            this.obstacles.push({ x: platX, y: platY, w: platW, h: platH, color: '#546e7a' });
            const targetX = Math.min(this.width - 40, platX + platW + 80 + Math.random() * 100);
            this.target = { x: targetX, y: this.groundY, w: 26, h: 26, color: '#e74c3c' };
        } else {
            const wallW = 30, wallH = this.height * 0.65, wallX = this.width * 0.42;
            this.obstacles.push({ x: wallX, y: this.groundY - wallH, w: wallW, h: wallH, color: obstacleColor });
            const targetX = wallX + wallW + 36;
            const targetY = this.groundY - (90 + Math.random() * 100);
            this.target = { x: targetX, y: targetY, w: 26, h: 26, color: '#e74c3c' };
            const forcedWind = -15 - Math.floor(Math.random() * 20);
            this.dom.inputs.wind.value = String(forcedWind);
            this.updateUI();
        }
        this.refreshGoalUI();
    }"""
    if old_gen in t:
        t = t.replace(old_gen, new_gen)
    else:
        print("WARN: generateLevel not found")

    t = t.replace(
        """        if(p.y + p.size >= this.groundY) {
            this.endSim(false, "未命中!");
            this.createExplosion(p.x, p.y, p.color, 10);
            return;
        }
        if(p.x > this.width || p.x < 0) {
            let reason = p.x > this.width ? "飞出右边界" : "飞出左边界";
            this.endSim(false, reason);
            return;
        }

        const dx = p.x - this.target.x;
        const dy = p.y - this.target.y;
        if(Math.abs(dx) < (p.size + this.target.w/2) && Math.abs(dy) < (p.size + this.target.h/2)) {
            this.createExplosion(this.target.x, this.target.y, p.color, 30);
            this.shakeScreen();
            this.endSim(true, "目标击中!");
        }""",
        """        if(p.y + p.size >= this.groundY) {
            if (this.playMode === 'explore') {
                this.endSim(false, "落点已记录");
            } else {
                this.endSim(false, "未命中要塞!");
                this.createExplosion(p.x, p.y, p.color, 10);
            }
            return;
        }
        if(p.x > this.width || p.x < 0) {
            let reason = p.x > this.width ? "飞出右边界" : "飞出左边界";
            this.endSim(false, reason);
            return;
        }

        if (!this.target) return;
        const dx = p.x - this.target.x;
        const dy = p.y - this.target.y;
        if(Math.abs(dx) < (p.size + this.target.w/2) && Math.abs(dy) < (p.size + this.target.h/2)) {
            this.createExplosion(this.target.x, this.target.y, p.color, 30);
            this.shakeScreen();
            this.endSim(true, "要塞目标击中!");
        }""",
    )

    m = re.search(r"    endSim\(win, msg\) \{[\s\S]*?\n    \}\n\n    closeModal\(\)", t)
    if not m:
        print("ERROR: endSim block not found")
        return False

    new_end = r"""    maybeExploreWin() {
        if (this.exploreWon) return;
        const dragOk = this.exploreDragSeen.size >= 2;
        const windOk = this.exploreWindSeen.size >= 2;
        if (this.exploreShots < 3 || !(dragOk || windOk)) return;
        this.exploreWon = true;
        if (window.__emit) {
            var c = window.__snapControls ? window.__snapControls() : {};
            window.__emit('snapshot', { controls: c, winOk: true, hintKey: 'cannon_explore_compare' });
            window.__emit('win', { winOk: true });
        }
        this.dom.modal.title.innerText = '试射归纳完成';
        this.dom.modal.title.style.color = '#06d6a0';
        this.dom.modal.msg.innerText = '你已对比不同阻力/风速下的落点。可切换「要塞突击」——那里要限次命中掩体后的目标。';
        this.dom.modal.retry.style.display = 'none';
        this.dom.modal.next.style.display = 'inline-block';
        this.dom.modal.next.innerText = '继续试射';
        this.dom.modal.next.onclick = () => {
            this.closeModal();
            this.dom.modal.next.innerText = '下一关';
            this.dom.modal.next.onclick = () => this.nextLevel();
        };
        setTimeout(() => this.dom.modal.overlay.classList.add('active'), 400);
    }

    endSim(win, msg) {
        this.state = 'ENDED';
        this.proj.active = false;
        this.dom.btnFire.disabled = false;
        this.dom.btnFire.innerText = "发射!";

        let landX = this.proj ? this.proj.x : 0;
        let landY = this.proj ? this.proj.y : 0;
        if (landX > this.width) landX = this.width - 10;
        if (landX < 0) landX = 10;
        if (landY < 0) landY = 10;
        if (landY > this.groundY) landY = this.groundY;
        const dist = Math.floor((landX - 60) / this.pixelsPerMeter);
        this.landingPoints.push({ x: landX, y: landY, win: win, dist: dist, explore: this.playMode === 'explore' });

        if (this.playMode === 'explore') {
            const drag = parseFloat(this.dom.inputs.drag.value).toFixed(3);
            const wind = String(parseFloat(this.dom.inputs.wind.value));
            this.exploreDragSeen.add(drag);
            this.exploreWindSeen.add(wind);
            this.exploreShots += 1;
            const tip = document.createElement('div');
            tip.className = 'score-pop';
            tip.innerText = `落点 ${dist}m`;
            tip.style.left = '50%';
            tip.style.top = '28%';
            tip.style.transform = 'translateX(-50%)';
            tip.style.color = '#7af2cc';
            this.dom.stage.appendChild(tip);
            setTimeout(() => tip.remove(), 900);
            this.maybeExploreWin();
            this.state = 'READY';
            this.proj = null;
            this.dom.hud.panel.style.display = 'none';
            return;
        }

        let earnedScore = 0;
        if (win) {
            if (window.__emit) {
              var c = window.__snapControls ? window.__snapControls() : {};
              window.__emit('snapshot', { controls: c, winOk: true, hintKey: 'cannon_fort_hit' });
              window.__emit('win', { winOk: true });
            }
            earnedScore = this.calculatePotentialScore();
            this.totalScore += earnedScore;
            this.updateScoreDisplay();
            const scorePop = document.createElement('div');
            scorePop.className = 'score-pop';
            scorePop.innerText = `+${earnedScore}`;
            scorePop.style.left = '50%';
            scorePop.style.top = '30%';
            scorePop.style.transform = 'translateX(-50%)';
            this.dom.stage.appendChild(scorePop);
            setTimeout(() => scorePop.remove(), 1000);
        }

        this.dom.modal.title.innerText = win ? "突击成功!" : "未攻破";
        this.dom.modal.title.style.color = win ? "#06d6a0" : "#e74c3c";
        let msgContent = `${msg}`;
        if (win) {
            msgContent += `\n获得积分: +${earnedScore}`;
            msgContent += `\n当前总分: ${this.totalScore}`;
        } else {
            this.landingPoints = [];
            this.generateLevel();
            const distM = this.target ? ((this.target.x - 60) / this.pixelsPerMeter).toFixed(0) : '?';
            const heightM = this.target ? Math.max(0, ((this.groundY - this.target.y) / this.pixelsPerMeter)).toFixed(0) : '?';
            msgContent += `\n目标已刷新 → 约 ${distM} m / 高 ${heightM} m`;
            const dm = window.__dualModeGet ? window.__dualModeGet() : null;
            if (dm && typeof dm.attempts === 'number') msgContent += `\n剩余机会：${dm.attempts}`;
        }
        this.dom.modal.msg.innerText = msgContent;
        this.dom.modal.retry.style.display = win ? "none" : "inline-block";
        this.dom.modal.retry.innerText = '迎战新目标';
        this.dom.modal.next.style.display = win ? "inline-block" : "none";
        this.dom.modal.next.innerText = '下一关';
        this.dom.modal.next.onclick = () => this.nextLevel();
        setTimeout(() => { this.dom.modal.overlay.classList.add('active'); }, 500);
    }

    closeModal("""
    t = t[: m.start()] + new_end + t[m.end() - len("closeModal(") :]

    old_env = """    drawEnvironment() {
        this.ctx.fillStyle = '#87CEEB';
        this.ctx.fillRect(0, 0, this.width, this.height);

        this.drawRect(0, this.groundY, this.width, this.height - this.groundY, '#4CAF50');
        this.ctx.fillStyle = '#388E3C';
        this.ctx.fillRect(0, this.groundY, this.width, 4);

        this.ctx.fillStyle = 'rgba(255,255,255,0.6)';
        const time = Date.now() * 0.0005;
        const cx = (time * 50) % (this.width + 200) - 100;
        this.drawRect(cx, 50, 60, 20, '#fff');
        this.drawRect(cx + 20, 40, 40, 10, '#fff');
    }"""
    new_env = """    drawEnvironment() {
        const sky = this.ctx.createLinearGradient(0, 0, 0, this.groundY);
        sky.addColorStop(0, '#6eb6e0');
        sky.addColorStop(0.55, '#a8d4ef');
        sky.addColorStop(1, '#cfe8f5');
        this.ctx.fillStyle = sky;
        this.ctx.fillRect(0, 0, this.width, this.height);

        this.ctx.fillStyle = '#7fa3b8';
        this.ctx.beginPath();
        this.ctx.moveTo(0, this.groundY - 40);
        this.ctx.lineTo(this.width * 0.18, this.groundY - 95);
        this.ctx.lineTo(this.width * 0.32, this.groundY - 50);
        this.ctx.lineTo(this.width * 0.5, this.groundY - 110);
        this.ctx.lineTo(this.width * 0.7, this.groundY - 55);
        this.ctx.lineTo(this.width, this.groundY - 85);
        this.ctx.lineTo(this.width, this.groundY);
        this.ctx.lineTo(0, this.groundY);
        this.ctx.fill();

        this.drawRect(0, this.groundY, this.width, this.height - this.groundY, '#4a8f45');
        this.ctx.fillStyle = '#2f6b32';
        this.ctx.fillRect(0, this.groundY, this.width, 3);

        const seaX = this.width * 0.72;
        const sea = this.ctx.createLinearGradient(seaX, this.groundY, this.width, this.height);
        sea.addColorStop(0, '#3d8ea8');
        sea.addColorStop(1, '#1f5f78');
        this.ctx.fillStyle = sea;
        this.ctx.fillRect(seaX, this.groundY + 8, this.width - seaX, this.height - this.groundY - 8);
        this.ctx.fillStyle = 'rgba(255,255,255,0.25)';
        const tw = Date.now() * 0.003;
        for (let i = 0; i < 4; i++) {
            const wx = seaX + 20 + i * 36 + Math.sin(tw + i) * 6;
            this.ctx.fillRect(wx, this.groundY + 18 + (i % 2) * 8, 18, 3);
        }

        this.ctx.fillStyle = '#c4a574';
        for (let i = 0; i < 5; i++) {
            this.ctx.fillRect(18 + i * 14, this.groundY - 10, 12, 10);
        }

        this.ctx.fillStyle = 'rgba(255,255,255,0.7)';
        const time = Date.now() * 0.0005;
        const cx = (time * 50) % (this.width + 200) - 100;
        this.drawRect(cx, 50, 60, 20, '#fff');
        this.drawRect(cx + 20, 40, 40, 10, '#fff');

        if (this.playMode === 'explore' && this.rangePosts) {
            this.ctx.font = "12px 'VT323', monospace";
            this.ctx.textAlign = 'center';
            this.rangePosts.forEach((p) => {
                this.ctx.fillStyle = 'rgba(30,40,50,0.55)';
                this.ctx.fillRect(p.x - 1, this.groundY - 28, 2, 28);
                this.ctx.fillStyle = '#1e293b';
                this.ctx.fillRect(p.x - 10, this.groundY - 32, 20, 10);
                this.ctx.fillStyle = '#f8fafc';
                this.ctx.fillText(p.meters + 'm', p.x, this.groundY - 24);
            });
        }
    }"""
    if old_env in t:
        t = t.replace(old_env, new_env)
    else:
        print("WARN: drawEnvironment not exact match")

    if MARK not in t:
        t = t.replace("<!DOCTYPE html>", "<!DOCTYPE html>\n" + MARK)

    atomic_write(path, t)
    v = path.read_text(encoding="utf-8")
    ok = (
        "this.playMode" in v
        and "目标已刷新" in v
        and "refreshGoalUI" in v
        and "applyPlayMode" in v
        and "BATCH1-CHALLENGE-REFRESH-20260724" in v
    )
    print("cannon verify", ok, "len", len(v))
    if not ok:
        for s in ["this.playMode", "目标已刷新", "refreshGoalUI", "applyPlayMode", "BATCH1"]:
            print("  missing?" if s not in v else "  has", s)
    return ok


def patch_friction(path: Path) -> bool:
    raw = path.read_text(encoding="utf-8")
    t = raw.replace("\r\n", "\n").replace("\r", "\n")
    if "BATCH1-CHALLENGE-REFRESH-20260724" in t and "respawnChallengeOrder" in t:
        print("friction already patched")
        return True

    t = t.replace(
        """    <p>调节滑道与货箱参数，测试货箱能否沿木板滑道卸下。</p>
    <p style="font-size:13px;color:var(--craft-muted)">可用「自由探究 / 竞赛挑战」切换阶段。</p>""",
        """    <p>夜班仓库等着出货。先自由调 μ 与倾角，对比「卡住 / 卸下」摸清临界；再接急单竞赛——摩擦系数锁定，限次只靠调坡度卸下货箱。</p>
    <p style="font-size:13px;color:var(--craft-muted)">探究与竞赛目标不同；竞赛未卸下时急单会换新的锁定 μ。</p>""",
    )

    t = t.replace(
        """    <div id="essence-hud">
      <div class="essence-title">仓库 · 卸货滑道</div>
      <div class="essence-sub">调滑道 · 测货箱 · 看能否卸下</div>
    </div>""",
        """    <div id="essence-hud">
      <div class="essence-title">仓库 · 卸货滑道</div>
      <div class="essence-sub" id="goalMission">目标：对比卡住与卸下，归纳临界条件</div>
    </div>""",
    )

    if 'id="sideGoal"' not in t:
        t = t.replace(
            """      <div class="app">
  
  

  <!-- canvas 物理示意 -->
  <!-- 调节变量 -->
  <div class="control-grid">
    <div class="slider-group">
      <label>摩擦系数 μ <span class="value-badge" id="muDisplay">0.70</span></label>""",
            """      <div class="app">
  <div id="sideGoalBox" style="margin:0 0 12px;padding:10px 12px;border-radius:12px;border:1px solid rgba(56,189,248,.35);background:rgba(15,23,42,.35)">
    <div style="font-size:11px;font-weight:700;color:#7dd3fc;letter-spacing:.04em">当前目标</div>
    <p id="sideGoal" style="margin:4px 0 0;font-size:12px;line-height:1.45;color:rgba(254,243,199,.92)">自由调 μ 与 θ，至少见过「卡住」和「卸下」各一次——竞赛则是另一套急单任务。</p>
  </div>
  <!-- 调节变量 -->
  <div class="control-grid">
    <div class="slider-group" id="group-friction">
      <label>摩擦系数 μ <span class="value-badge" id="muDisplay">0.70</span></label>""",
        )

    old = """      let won = false;
      let layout = { W: 680, H: 280, groundY: 225, BASE_X: 80, BASE_Y: 220, LENGTH: 260 };

      function syncCanvasSize() {"""
    new = """      let won = false;
      let playMode = 'explore';
      let challengeLockedMu = null;
      let layout = { W: 680, H: 280, groundY: 225, BASE_X: 80, BASE_Y: 220, LENGTH: 260 };

      function refreshGoalUI() {
        const mission = document.getElementById('goalMission');
        const side = document.getElementById('sideGoal');
        if (playMode === 'challenge' && challengeLockedMu != null) {
          if (mission) mission.textContent = '当前急单：μ=' + challengeLockedMu.toFixed(2) + ' 已锁定 · 调 θ 卸下 · 未达成将换新 μ';
          if (side) side.textContent = '竞赛急单：μ 锁定为 ' + challengeLockedMu.toFixed(2) + '。只调倾角卸到接货区；卡住则刷新新的锁定 μ——目标会变。';
        } else {
          if (mission) mission.textContent = '目标：自由试卸≥3次，并同时见过「卡住」与「卸下」，归纳临界规律';
          if (side) side.textContent = '探究·仓库试滑：自由调 μ / θ，对比卡住与卸下；不必完成固定货单——先摸清谁真正决定结果。';
        }
      }

      function setFrictionLocked(locked, muVal) {
        if (!frictionSlider) return;
        const grp = document.getElementById('group-friction');
        if (locked) {
          frictionSlider.value = String(muVal);
          frictionSlider.disabled = true;
          frictionSlider.style.opacity = '0.55';
          if (grp) grp.title = '竞赛急单：摩擦系数已锁定';
        } else {
          frictionSlider.disabled = false;
          frictionSlider.style.opacity = '';
          if (grp) grp.title = '';
        }
        updateLabels();
      }

      function respawnChallengeOrder(reasonHint) {
        let nextMu = Math.round((0.35 + Math.random() * 0.40) * 100) / 100;
        let guard = 0;
        while (challengeLockedMu != null && Math.abs(nextMu - challengeLockedMu) < 0.08 && guard < 8) {
          nextMu = Math.round((0.35 + Math.random() * 0.40) * 100) / 100;
          guard++;
        }
        challengeLockedMu = nextMu;
        const safeTheta = Math.max(5, Math.floor(Math.atan(challengeLockedMu) * 180 / Math.PI) - 8);
        setFrictionLocked(true, challengeLockedMu);
        angleSlider.value = String(safeTheta);
        blockT = T_TOP;
        stateDisplay.textContent = '—';
        hintMsg.textContent = (reasonHint || '急单已刷新') + '：μ=' + challengeLockedMu.toFixed(2) + ' 已锁定，重新调坡度再测';
        refreshGoalUI();
        idleDraw();
      }

      window.__frictionApplyMode = function(mode) {
        playMode = mode === 'challenge' ? 'challenge' : 'explore';
        won = false;
        window.__legacyWinEmitted = false;
        testCount = 0; sawSlide = false; sawRest = false;
        lastMu = null; lastTheta = null;
        animating = false; btnTest.disabled = false;
        if (playMode === 'challenge') {
          challengeLockedMu = null;
          respawnChallengeOrder('新急单');
        } else {
          challengeLockedMu = null;
          setFrictionLocked(false);
          frictionSlider.value = '0.70';
          angleSlider.value = '30';
          if (massSlider) massSlider.value = '1.0';
          hintMsg.textContent = '调节参数后点击「测试卸货」';
          stateDisplay.textContent = '—';
          blockT = T_TOP;
          refreshGoalUI();
          idleDraw();
        }
      };

      function syncCanvasSize() {"""
    if old not in t:
        print("ERROR friction state insert point missing")
        return False
    t = t.replace(old, new)

    t = t.replace(
        """      function maybeWin() {
        if (won) return;
        // 至少 3 次测试，且见过下滑与静止，并有参数变化
        if (testCount < 3 || !sawSlide || !sawRest) return;
        won = true;
        const emit = window.__emit || window.__traceEmit || function(){};
        const controls = window.__snapControls ? window.__snapControls() : {};
        emit('snapshot', { controls: controls, winOk: true, hintKey: 'critical_explored' });
        emit('win', { winOk: true });
        if (typeof window.__craftShowWin === 'function') {
          window.__craftShowWin('你通过对比不同参数下的静止与下滑，归纳出了临界关系。');
        }
      }""",
        """      function maybeWin(lastSlid) {
        if (won) return;
        const emit = window.__emit || window.__traceEmit || function(){};
        const controls = window.__snapControls ? window.__snapControls() : {};
        if (playMode === 'challenge') {
          if (!lastSlid) {
            respawnChallengeOrder('未卸下，货单已换');
            return;
          }
          won = true;
          emit('snapshot', { controls: controls, winOk: true, hintKey: 'rush_unload' });
          emit('win', { winOk: true });
          if (typeof window.__craftShowWin === 'function') {
            window.__craftShowWin('急单完成：在摩擦系数锁定时，你靠调节倾角把货箱卸到了接货区。');
          }
          return;
        }
        if (testCount < 3 || !sawSlide || !sawRest) return;
        won = true;
        emit('snapshot', { controls: controls, winOk: true, hintKey: 'critical_explored' });
        emit('win', { winOk: true });
        if (typeof window.__craftShowWin === 'function') {
          window.__craftShowWin('你通过对比不同参数下的静止与下滑，归纳出了临界关系。');
        }
      }""",
    )

    t = t.replace(
        """            stateDisplay.textContent = p.willSlide ? '已卸下' : '卡在滑道上';
            hintMsg.textContent = p.willSlide
              ? '这次货箱滑到接货区了。换组参数再试试？'
              : '这次货箱停住了。换组参数再试试？';
            drawScene(p.thetaRad, p.mass, blockT, p.willSlide);
            const controls = {
              's-friction': frictionSlider.value,
              's-angle': angleSlider.value
            };
            if (massSlider) controls['s-mass'] = massSlider.value;
            emit('snapshot', { controls: controls, winOk: false, hintKey: p.willSlide ? 'slide' : 'rest' });
            maybeWin();""",
        """            stateDisplay.textContent = p.willSlide ? '已卸下' : '卡在滑道上';
            if (playMode === 'challenge') {
              hintMsg.textContent = p.willSlide ? '急单达成：货箱已卸到接货区！' : '急单未达成：卡住了，即将刷新新的锁定 μ…';
            } else {
              hintMsg.textContent = p.willSlide
                ? '这次货箱滑到接货区了。换组参数再试试？'
                : '这次货箱停住了。换组参数再试试？';
            }
            drawScene(p.thetaRad, p.mass, blockT, p.willSlide);
            const controls = {
              's-friction': frictionSlider.value,
              's-angle': angleSlider.value
            };
            if (massSlider) controls['s-mass'] = massSlider.value;
            emit('snapshot', { controls: controls, winOk: false, hintKey: p.willSlide ? 'slide' : 'rest' });
            maybeWin(p.willSlide);""",
    )

    t = t.replace(
        """      function resetSim() {
        animating = false;
        btnTest.disabled = false;
        frictionSlider.value = '0.70';
        angleSlider.value = '30';
        if (massSlider) massSlider.value = '1.0';
        stateDisplay.textContent = '—';
        hintMsg.textContent = '调节参数后点击「测试卸货」';
        testCount = 0;
        sawSlide = false;
        sawRest = false;
        lastMu = null;
        lastTheta = null;
        won = false;
        window.__legacyWinEmitted = false;
        blockT = T_TOP;
        idleDraw();
      }""",
        """      function resetSim() {
        if (typeof window.__frictionApplyMode === 'function') {
          window.__frictionApplyMode(playMode);
          return;
        }
        animating = false;
        btnTest.disabled = false;
        frictionSlider.value = '0.70';
        angleSlider.value = '30';
        if (massSlider) massSlider.value = '1.0';
        stateDisplay.textContent = '—';
        hintMsg.textContent = '调节参数后点击「测试卸货」';
        testCount = 0;
        sawSlide = false;
        sawRest = false;
        lastMu = null;
        lastTheta = null;
        won = false;
        window.__legacyWinEmitted = false;
        blockT = T_TOP;
        idleDraw();
      }""",
    )

    t = t.replace(
        """      syncCanvasSize();
      idleDraw();
    })();""",
        """      syncCanvasSize();
      refreshGoalUI();
      idleDraw();
      if (window.__dualModeGet) {
        try { window.__frictionApplyMode(window.__dualModeGet().mode); } catch (e) {}
      }
    })();""",
    )

    t = t.replace(
        """    setPhase(state.mode);
    gateActions();
  }

  function onPrimaryClick(e){""",
        """    setPhase(state.mode);
    gateActions();
    if (typeof window.__frictionApplyMode === 'function') {
      try { window.__frictionApplyMode(state.mode); } catch (e) {}
    }
  }

  function onPrimaryClick(e){""",
    )

    if MARK not in t:
        t = t.replace("<!DOCTYPE html>", "<!DOCTYPE html>\n" + MARK)

    atomic_write(path, t)
    v = path.read_text(encoding="utf-8")
    ok = (
        "respawnChallengeOrder" in v
        and "__frictionApplyMode" in v
        and "goalMission" in v
        and "BATCH1-CHALLENGE-REFRESH-20260724" in v
    )
    print("friction verify", ok, "len", len(v))
    return ok


def main():
    ok1 = patch_cannon(ROOT / "样本html" / "抛体大炮.html")
    ok2 = patch_friction(ROOT / "样本html" / "斜面摩擦.html")
    pairs = [
        ("抛体大炮.html", "projectile-cannon"),
        ("斜面摩擦.html", "friction-incline"),
        ("斜抛.html", "projectile-basic"),
    ]
    for name, pid in pairs:
        src = ROOT / "样本html" / name
        dst = ROOT / "data" / "runtime" / "packages" / pid / "game.html"
        shutil.copy2(src, dst)
        vt = dst.read_text(encoding="utf-8")
        print(
            "synced",
            pid,
            "ok",
            ("BATCH1-CHALLENGE-REFRESH-20260724" in vt) or ("靶距已刷新" in vt),
        )
    # re-verify samples were not overwritten immediately
    time.sleep(0.2)
    c = (ROOT / "样本html" / "抛体大炮.html").read_text(encoding="utf-8")
    f = (ROOT / "样本html" / "斜面摩擦.html").read_text(encoding="utf-8")
    print("persist cannon", "目标已刷新" in c)
    print("persist friction", "respawnChallengeOrder" in f)
    print("ALL", ok1 and ok2 and ("目标已刷新" in c) and ("respawnChallengeOrder" in f))


if __name__ == "__main__":
    main()

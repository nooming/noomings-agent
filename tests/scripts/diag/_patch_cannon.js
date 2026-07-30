const fs = require('fs');
const path = '样本html/抛体大炮.html';
let s = fs.readFileSync(path, 'utf8');

function mustReplace(label, from, to) {
  if (!s.includes(from)) {
    console.error('FAIL missing block:', label);
    process.exit(1);
  }
  s = s.split(from).join(to);
}

mustReplace('title', '<title>模拟大炮</title>', '<title>海防炮台 · 风暴弹道</title>');

mustReplace('intro',
`<div id="craft-intro">
  <div class="craft-card">
    <h2>模拟大炮</h2>
    <p>调节发射参数命中目标；试着弄清哪些量真正影响弹道。</p>
    <p style="font-size:12px;color:var(--craft-muted)">右侧工作台调节参数；可用「自由探究 / 竞赛挑战」切换阶段。</p>
    <button type="button" id="craftIntroBtn">开始探究</button>
  </div>
</div>`,
`<div id="craft-intro">
  <div class="craft-card">
    <h2>海防炮台 · 风暴弹道</h2>
    <p>夜潮拍打礁石，炮手要在变风里把弹药送到浮标附近。先自由试射摸清弹道，再进入限次靶位挑战——打偏后靶位会换，不能死记同一组参数。</p>
    <p style="font-size:12px;color:var(--craft-muted)">探究与竞赛的达成目标不同；侧栏与顶部会写明当前任务。</p>
    <button type="button" id="craftIntroBtn">开始探究</button>
  </div>
</div>`);

mustReplace('win formula',
`<div class="formula" id="craftWinFormula">弹道受重力、阻力与风影响</div>
    <p id="craftWinText">通过调参与观察，你验证了本实验的核心关系。</p>`,
`<div class="formula" id="craftWinFormula">F_d ∝ −k(v−v_w)|v−v_w|；风只有在阻力存在时才起作用</div>
    <p id="craftWinText">通过调参与观察，你弄清了阻力、风与弹道落点的关系。</p>`);

mustReplace('h1', '<h1>模拟大炮</h1>', '<h1>海防炮台</h1>');
mustReplace('guide btn', '>物理说明<', '>参数手册<');

mustReplace('hud',
`<div id="dual-mode-hud">
  <div id="dual-timer-chip" class="dual-chip"><span id="modeLabel">探究模式</span><span style="opacity:.35">|</span><span id="timerDisplay">10:00</span></div>
  <div id="challengeStats"><span>剩余机会</span><span id="attemptsDisplay">5</span></div>
</div>`,
`<div id="dual-mode-hud">
  <div class="hud-mode-row" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
    <div id="dual-timer-chip" class="dual-chip"><span id="modeLabel">探究模式</span><span style="opacity:.35">|</span><span id="timerDisplay">10:00</span></div>
    <div id="challengeStats"><span>剩余机会</span><span id="attemptsDisplay">6</span></div>
  </div>
  <div id="goalMission" style="margin-top:6px;padding:6px 12px;border-radius:12px;font-size:12px;line-height:1.45;background:rgba(15,23,42,.88);border:1px solid rgba(255,126,179,.4);color:#e2e8f0;max-width:min(420px,100%)">目标：自由试射，观察风/阻力下弹道与落点</div>
</div>`);

mustReplace('side',
`<div class="ctrl-hd"><div class="dual-bench-row"><span>控制面板</span><select id="modeSelect" aria-label="探究阶段"><option value="explore">自由探究</option><option value="challenge">竞赛挑战</option></select></div></div>
        <div class="ctrl-scroll">`,
`<div class="ctrl-hd"><div class="dual-bench-row"><span>炮台操控</span><select id="modeSelect" aria-label="探究阶段"><option value="explore">自由探究</option><option value="challenge">要塞突击</option></select></div></div>
        <div id="sideGoalBox" style="margin:8px 12px 0;padding:8px 10px;border-radius:10px;border:1px solid rgba(255,126,179,.35);background:rgba(255,126,179,.08)">
          <div style="font-size:11px;font-weight:700;color:#ff7eb3;letter-spacing:.04em">当前目标</div>
          <p id="sideGoal" style="margin:4px 0 0;font-size:12px;line-height:1.5;color:var(--craft-text,#e8eef5)">自由试射并对比落点；不必限次命中——先摸清风与阻力如何改弹道。</p>
        </div>
        <div class="ctrl-scroll">`);

mustReplace('hud css',
`#dual-mode-hud{
  position:absolute;top:10px;left:10px;right:10px;z-index:40;
  display:flex;gap:8px;align-items:center;justify-content:flex-start;
  pointer-events:none;flex-wrap:wrap;max-width:none;
}`,
`#dual-mode-hud{
  position:absolute;top:10px;left:10px;right:10px;z-index:40;
  display:flex;flex-direction:column;gap:6px;align-items:flex-start;justify-content:flex-start;
  pointer-events:none;flex-wrap:nowrap;max-width:min(420px,calc(100% - 80px));
}`);

mustReplace('state',
`        this.state = 'READY';
        this.level = 1;
        
        this.totalScore = 0;`,
`        this.state = 'READY';
        this.level = 1;
        this.playMode = 'explore';
        this._prevTargetX = 0;
        this.exploreShots = 0;
        this.exploreDragSeen = new Set();
        this.exploreWindSeen = new Set();
        this.exploreWon = false;
        this.rangePosts = [];
        
        this.totalScore = 0;`);

mustReplace('init boot',
`        this.dom.levelClear.btnEnter.addEventListener('click', () => this.enterFreeMode());

        setTimeout(() => {
            this.resize();
            this.generateLevel(); 
            this.updateLevelTag();
            this.updateScoreDisplay();
            this.updateUI();
            this.loop();
        }, 100);
    }

    openGuide() { this.dom.guide.overlay.classList.add('active'); }`,
`        this.dom.levelClear.btnEnter.addEventListener('click', () => this.enterFreeMode());

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

    describeTarget() {
        if (!this.target) return '待标定靶位';
        const distM = ((this.target.x - 60) / this.pixelsPerMeter).toFixed(0);
        const hM = Math.max(0, (this.groundY - this.target.y) / this.pixelsPerMeter).toFixed(0);
        const air = this.target.y < this.groundY - 8;
        return air ? ('约 ' + distM + ' m、高 ' + hM + ' m 的浮标旗') : ('约 ' + distM + ' m 处的岸标');
    }

    refreshGoalUI() {
        const mission = document.getElementById('goalMission');
        const side = document.getElementById('sideGoal');
        if (this.playMode === 'challenge') {
            const tip = this.describeTarget();
            if (mission) mission.textContent = '竞赛靶位：' + tip + ' · 限次命中（未中将刷新）';
            if (side) side.textContent = '竞赛·要塞突击：命中 ' + tip + '。打偏后靶位/掩体重新抽取——不能死记同一组参数。';
        } else {
            if (mission) mission.textContent = '目标：自由试射≥3发，并换过阻力或风速，对比落点归纳弹道规律';
            if (side) side.textContent = '探究·临海试射场：读落点米数；请至少换一组阻力或风速再打。不必打掩体。';
        }
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

    openGuide() { this.dom.guide.overlay.classList.add('active'); }`);

mustReplace('level tag',
`    updateLevelTag() {
        if (this.level > 4) {
            this.dom.level.innerText = "自由模式";
            this.dom.level.classList.add('free-mode');
        } else {
            this.dom.level.innerText = \`第 \${this.level} 关\`;
            this.dom.level.classList.remove('free-mode');
        }
    }`,
`    updateLevelTag() {
        if (this.playMode === 'explore') {
            this.dom.level.innerText = '试射场';
            this.dom.level.classList.add('free-mode');
            return;
        }
        if (this.level > 4) {
            this.dom.level.innerText = '随机要塞';
            this.dom.level.classList.add('free-mode');
        } else {
            this.dom.level.innerText = '突击 ' + this.level;
            this.dom.level.classList.remove('free-mode');
        }
    }`);

const genRe = /    generateLevel\(\) \{[\s\S]*?\n    \}\n\n    fire\(\)/;
if (!genRe.test(s)) { console.error('FAIL generateLevel'); process.exit(1); }
s = s.replace(genRe, `    generateLevel() {
        if (this.width === 0) return;
        this.obstacles = [];
        this.rangePosts = [];
        this.target = null;

        if (this.playMode === 'explore') {
            this.highlightInputs(['drag', 'wind']);
            [40, 80, 120, 160].forEach((m) => {
                const x = 60 + m * this.pixelsPerMeter;
                if (x < this.width - 30) this.rangePosts.push({ x, meters: m });
            });
            this.refreshGoalUI();
            return;
        }

        const prevX = this._prevTargetX || 0;
        const type = 1 + Math.floor(Math.random() * 4);
        const obstacleColor = '#5d4037';
        if (type === 4) this.highlightInputs(['drag', 'wind']);
        else this.highlightInputs([]);

        if (type === 1) {
            const minX = this.width * 0.35, maxX = this.width * 0.88;
            let x = Math.random() * (maxX - minX) + minX;
            let guard = 0;
            while (prevX > 0 && Math.abs(x - prevX) < this.width * 0.12 && guard < 8) {
                x = Math.random() * (maxX - minX) + minX;
                guard++;
            }
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
            this.dom.inputs.wind.value = String(-15 - Math.floor(Math.random() * 20));
            this.updateUI();
        }
        this._prevTargetX = this.target ? this.target.x : 0;
        this.refreshGoalUI();
    }

    fire()`);

mustReplace('physics land',
`        if(p.y + p.size >= this.groundY) {
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
        }`,
`        if(p.y + p.size >= this.groundY) {
            if (this.playMode === 'explore') this.endSim(false, "落点已记录");
            else {
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
        }`);

const endRe = /    endSim\(win, msg\) \{[\s\S]*?\n    \}\n\n    closeModal\(\)/;
if (!endRe.test(s)) { console.error('FAIL endSim'); process.exit(1); }
s = s.replace(endRe, `    maybeExploreWin() {
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
        this.dom.modal.msg.innerText = '你已对比不同阻力/风速下的落点。可切换「要塞突击」——限次命中掩体后的目标。';
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
            tip.innerText = '落点 ' + dist + 'm';
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
            scorePop.innerText = '+' + earnedScore;
            scorePop.style.left = '50%';
            scorePop.style.top = '30%';
            scorePop.style.transform = 'translateX(-50%)';
            this.dom.stage.appendChild(scorePop);
            setTimeout(() => scorePop.remove(), 1000);
        }

        this.dom.modal.title.innerText = win ? "突击成功!" : "未攻破 · 靶位已换";
        this.dom.modal.title.style.color = win ? "#06d6a0" : "#e74c3c";
        let msgContent = '' + msg;
        if (win) {
            msgContent += '\\n获得积分: +' + earnedScore;
            msgContent += '\\n当前总分: ' + this.totalScore;
        } else {
            this.landingPoints = [];
            this.generateLevel();
            msgContent += '\\n靶位已刷新 → 现在要打：' + this.describeTarget();
            const dm = window.__dualModeGet ? window.__dualModeGet() : null;
            if (dm && typeof dm.attempts === 'number') msgContent += '\\n剩余机会：' + dm.attempts;
        }
        this.dom.modal.msg.innerText = msgContent;
        this.dom.modal.retry.style.display = win ? "none" : "inline-block";
        this.dom.modal.retry.innerText = '迎战新目标';
        this.dom.modal.next.style.display = win ? "inline-block" : "none";
        this.dom.modal.next.innerText = '下一关';
        this.dom.modal.next.onclick = () => this.nextLevel();
        setTimeout(() => { this.dom.modal.overlay.classList.add('active'); }, 500);
    }

    closeModal()`);

const envRe = /    drawEnvironment\(\) \{[\s\S]*?\n    \}\n\n    drawObstacles\(\)/;
if (!envRe.test(s)) { console.error('FAIL drawEnvironment'); process.exit(1); }
s = s.replace(envRe, `    drawEnvironment() {
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
            this.ctx.fillRect(seaX + 20 + i * 36 + Math.sin(tw + i) * 6, this.groundY + 18 + (i % 2) * 8, 18, 3);
        }

        this.ctx.fillStyle = '#c4a574';
        for (let i = 0; i < 5; i++) this.ctx.fillRect(18 + i * 14, this.groundY - 10, 12, 10);

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
    }

    drawObstacles()`);

mustReplace('drawTarget guard',
`    drawTarget() {
        if (!this.target) return;`,
`    drawTarget() {
        if (!this.target || this.playMode !== 'challenge') return;`);

s = s.replace('var MAX=5;', 'var MAX=6;');

fs.writeFileSync(path, s);
console.log('OK size', fs.statSync(path).size);
console.log({
  playMode: s.includes('this.playMode'),
  hai: s.includes('海防炮台'),
  goal: s.includes('goalMission'),
  reroll: s.includes('靶位已刷新'),
  explore: s.includes('maybeExploreWin'),
  sea: s.includes('seaX')
});

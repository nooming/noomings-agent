# ramp-rolling-collision · 阶段 C/D/E 入库报告

日期：2026-08-08  
包 id：`ramp-rolling-collision`  
标题：斜坡滚球 · 碰撞与纯滚动  
craft：`pilot`（未标 gold）

## 路径

| 角色 | 路径 |
| --- | --- |
| 运行时权威 | `data/runtime/packages/ramp-rolling-collision/game.html` |
| chapter / meta / 图谱 | 同包目录 `chapter.json` · `meta.json` · `图谱.html` |
| 离线镜像 | `样本html/斜坡滚球/game.html` + `图谱.html` + `vendor/` |
| 样本索引 | `样本html/index.html`（试玩 + 图谱） |
| 映射 | `tests/lib/yangben-sample-map.js`、`样本html/清单.md` |
| catalog | `data/runtime/platform/catalog.json` → `demo-ramp-rolling-collision` |
| manifest | `data/runtime/packages/manifest.json` |

## 阶段 C — UI 规范化

- [x] 去掉玻璃蓝紫感；CSS 变量 `--craft-accent/bg/panel/text/muted`（木色工坊 + 铁轨灰绿）
- [x] 左舞台 + 右工作台；保留 `#modeSelect` / `#modeLabel` / `#challengeStats` / 目标高度 HUD
- [x] `#craft-intro`：碰撞后靶球纯滚动爬升、探究影响高度的量；**无**公式/混淆剧透
- [x] 过关/复盘写「平动+转动」；底栏改为中性操作提示
- [x] 侧栏：目标说明 → AV → CV（轨温）→ 发射/重置
- [x] CV `s-rail-temp`（5–40°C）：中性标签；只改轨色/雾/灯光；**不进** win/高度
- [x] `s-shape` 保持离散 AV
- [x] AV：`s-mass1` `s-speed` `s-mass2` `s-angle` `s-shape`
- [x] 轨迹契约：`__platformTraceSetPhase`、tuning、`__emit('win')`
- [x] meta `craft:pilot`

## 阶段 D — 场景风格

- [x] 背景 `#87CEEB` → 深色工坊（贴合 `--craft-bg`）
- [x] 雾、灯光、轨/坡材质与色板同源；目标平台用 accent
- [x] CV 轨温驱动冷暖轨色 + 微雾；几何与 win 不变
- [x] 礼花收敛（少粒子、低饱和），不挡读数

## 阶段 E — chapter / 图谱 / 上架

- [x] `chapter.json`：KG（碰撞/纯滚动/高度/冲出）+ AV priorityRank/responseShape + ProbeCV「试探·轨温」+ strategy mermaid/routes
- [x] `npm`/`node tests/scripts/export-priority-graphs.js --id ramp-rolling-collision` → 运行时 + 样本 `图谱.html`
- [x] catalog `demo-ramp-rolling-collision`（published，`craft:pilot`，非 featured）
- [x] manifest 登记；publish-pairs 可解析到该 graphId+playUrl
- [x] **未**改当时仍存在的 `html-samples/chapters`（该目录已于 retire M4 删除；见 `html-samples-retire.md`）

## AV / CV 决策

| controlId | 角色 | rank / 形态 | 说明 |
| --- | --- | --- | --- |
| `s-speed` | AV | 1 · nonlinear-monotone | 最直接改碰撞后动能 |
| `s-mass1` | AV | 2 · nonlinear-monotone | 质量比 → 靶球速度 |
| `s-mass2` | AV | 3 · nonlinear-monotone | 对称通道 |
| `s-angle` | AV | 4 · nonlinear-monotone | 减速与冲出几何 |
| `s-shape` | AV（离散） | 5 · discrete | 球/圆柱改 k=I/(mr²)；**非 CV** |
| `s-rail-temp` | CV | confoundProbe 0.15 | 轨色/雾观感；不进判定 |

## 如何验证

1. 打开 `data/runtime/packages/ramp-rolling-collision/game.html`（或样本镜像）：深色工坊 + craft 侧栏；有 intro；底栏无公式剧透  
2. 拧轨温：轨色冷暖变化；目标高度与命中逻辑不变  
3. 切「定高挑战」：`phase_change`；命中窗口：`win`  
4. 打开 `样本html/index.html` → 试玩 + 图谱  
5. 教师端：启动平台后，探究任务列表 / catalog 见 **「斜坡滚球 · ramp-rolling-collision」**（id `demo-ramp-rolling-collision`）；试玩 URL `/static/packages/ramp-rolling-collision/game.html`

## Catalog 状态

- 已上架：`published: true`，`featured: false`，`sampleTags` 含 `craft:pilot`  
- `listPublishPairs()` 可命中 `graphId=ramp-rolling-collision`  
- 若教师端 UI 有缓存，重启本地服务或刷新资源管理 Tab

## 未竟 / 可选后续

- 未标 `craft:gold`（未做钟表铺级全量精致度抽检）  
- chapter 质量分未跑 Agent A 全量 surgical 修复（手写可玩版）  
- 未写学生端自动化 smoke；未改旧 datasets chapters 兼容层  
- 竞赛目标高度仍固定 10.0 m（与 A/B 一致）

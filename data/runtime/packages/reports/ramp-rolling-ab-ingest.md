# ramp-rolling-collision · 阶段 A/B 入库报告

日期：2026-08-08  
包 id：`ramp-rolling-collision`  
标题：小球碰撞与纯滚动  
craft：`draft`

## 路径

| 角色 | 路径 |
| --- | --- |
| 运行时权威 | `data/runtime/packages/ramp-rolling-collision/game.html` |
| 包内 vendor | `data/runtime/packages/ramp-rolling-collision/vendor/` |
| 极简 meta | `data/runtime/packages/ramp-rolling-collision/meta.json` |
| 离线镜像 | `样本html/斜坡滚球/game.html` + `样本html/斜坡滚球/vendor/` |
| 样本索引 | `样本html/index.html`（新增「斜坡滚球」试玩入口；图谱未做） |
| 根目录指针 | `斜坡滚球.html`（薄跳转/说明，不再含玩法逻辑） |

## Vendor 策略

- Three.js **r128** + `OrbitControls`（旧 `examples/js` 全局挂载写法，与源一致）
- **未**改写为 2D；CDN（Tailwind / jsDelivr Three）已去掉
- 包内自带 `vendor/`，静态服务打开 `game.html` 可离线加载 Three（相对路径 `vendor/three.min.js`、`vendor/OrbitControls.js`）
- 样本镜像夹同样自带 `vendor/`，不依赖 `样本html/vendor/`（该目录为图谱导出用，README 禁止手改）
- `样本html/vendor/` **未**放入 three（避免与图谱 sync 冲突）

## 阶段 A 完成项

- [x] 包目录 + `game.html` 迁移
- [x] 控件 id：`s-mass1` / `s-speed` / `s-mass2` / `s-angle` / `s-shape`
- [x] 自写 CSS 替代 Tailwind CDN；左舞台 + 右栏 + `#modeSelect` + HUD
- [x] 离线镜像与 index 入口
- [x] 根文件改为指针，避免双份逻辑

## 阶段 B 完成项

- [x] `#modeSelect` → `__platformTraceSetPhase(mode)`（含初始化 sync）
- [x] range 唯一 id；TRACE_HOOK 对 range 用 `change`（与平台一致）；UI 刷新仍用 `input`
- [x] `s-shape`（select，离散 AV）自建 `change` → `tuning`；**未**标成混淆
- [x] 按钮经 TRACE_HOOK → `action`（平台注入时跳过双计）
- [x] 竞赛过关 → `__emit('snapshot', …)` + `__emit('win', { winOk: true })`
- [x] 探究/失败路径可选高度 `snapshot`（`achievedHeight`）
- [x] 探究/竞赛模式逻辑（限次、目标高度、断头斜坡）在改 id 后保持

## 未做（C/D/E）

- **C**：craft-gold UI / 色板 / intro·win 精致壳 / 新加 CV
- **D**：场景改色或其它视觉精修
- **E**：`chapter.json`、策略图谱、`样本html/斜坡滚球/图谱.html`、manifest/catalog 上架

## 验收建议

1. 静态服务打开包内 `game.html`（或样本镜像），DevTools Network 无外网 CDN
2. 面板滑条 id 为 `s-*`；切换「定高挑战」代码路径调用 `__platformTraceSetPhase`
3. 竞赛命中目标高度窗口时走 `win` 发射路径

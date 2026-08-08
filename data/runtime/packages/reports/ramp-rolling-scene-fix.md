# 斜坡滚球场景三修（2026-08-08）

权威：`data/runtime/packages/ramp-rolling-collision/game.html`  
同步：`样本html/斜坡滚球/game.html`（已对齐）

## A. 白线贴斜坡

- **根因**：`rampLine` 与轨体并列，`rotation.x=-π/2` 后再 `rotation.z=θ` → 欧拉死锁，线留在地面。
- **修法**：`ramp.add(rampLine)`；线仅 `rotation.x=-π/2`、`position.y=0.26`；不再对 line 设 `rotation.z`。
- 轨盒改为中心原点 `translate(length/2,0,0)`，并用 `ramp.position` 把顶面（局部 y=+0.25）对齐到过原点的斜面，使 `0.26`（半厚+间隙）贴面且球路径不变。
- `updateRampGeometry` 重建时 dispose 子几何，并 pop/dispose `railMats`/`railLineMats` 中斜坡项（保留平直段 index 0）。

## B. mist 穿墙

- 已删除大平面 `mistMesh` 及其创建逻辑。
- `applyRailTempVisual` 不再引用 mist；轨温仍驱动轨色/emissive/线色/雾色/灯光。

## C. HUD「当前 h」

- `phase==='idle'` 时 `liveClimbHeight()` 返回 `null` → HUD `--`，Δ 隐藏。
- `resetScene()` / `generateChallenge()` 使用 `updateClimbHud(null)`，不再用 `lastAchievedH` 填「当前 h」。
- 运动与 `end`（`checkResult`）仍显示实时/峰值；`lastAchievedH` 仅供复盘文案。

## 附：html-samples chapters 残留

- `data/datasets/html-samples/chapters/`：已确认不存在（`Test-Path` → False）。
- `data/datasets/html-samples/judge-fixtures.json`：已确认不存在；权威为 `tests/fixtures/judge-fixtures.json`。
- 业务脚本（`tests/lib/chapter-loader.js`、`packages/shared/data-paths.js`）已指向 packages / tests fixtures，无硬编码读 chapters。

## 目视验收

1. 打开权威或镜像 `game.html`，拖视角看斜坡中线白线。
2. 倾角滑到 15° / 30° / 60°：白线贴在斜坡表面中线，不落地面。
3. 拧轨温：轨/线颜色与灯光变化；场景中无半透明大雾板穿墙。
4. 发射后看「当前 h」上升；点重置或结束后回 idle：当前 h 为 `--`，Δ 隐藏。

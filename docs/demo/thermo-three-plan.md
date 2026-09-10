# 热学三关替换计划

> 课堂热学线由旧试点 `gas-ideal` / `heat-conduction` **整包替换**为三关新 graphId。  
> 设计卡见 [thermo-three-design.md](./thermo-three-design.md)；课堂清单见 [classroom-demo-checklist.md](./classroom-demo-checklist.md)。  
> 旧口播已归档：[`_archive/thermo-pilot-note.md`](./_archive/thermo-pilot-note.md)。

---

## 1. 管线摘要

| 步骤 | 产物 | 说明 |
|------|------|------|
| 设计卡 | `thermo-three-design.md` | 公式 / AV / CV / OV / explore_success / win / 次数 |
| 运行包 | `data/runtime/packages/{id}/` | `game.html` + `chapter.json` + `meta.json` + README |
| 样本镜像 | `样本html/{中文题}/` | 与 `scripts/sync-packages-to-samples.js` 映射同步 |
| 目录 | `catalog.json` | 新 id 上架 `craft:pilot`；旧热学下架（包保留） |
| 白名单脚本 | `set-mechanics-thermo-classroom.js` | 力学三关 + 热学三新关 |

双模壳对齐现有 craft：左舞台 + 右工作台、`#modeSelect` 探究/竞赛、冷青主色、埋点 `explore_success` / `win` / `phase_change`（切换去重）+ tuning/action。成功结算延迟约 0.8–1.2s。CV≥1，UI **不写**「次要/旁路/不进判定」；CV 不进 win 公式。

---

## 2. 三关一览

| graphId | 主题 | 探究 | 竞赛 |
|---------|------|------|------|
| `gas-pressure-micro` | 气体压强微观模型 | 粒子碰壁 + N/T/V → P | 打进压强带 |
| `maxwell-speed-dist` | 麦克斯韦速率分布 | 直方图/曲线随 T | 打特征速度区间 |
| `adiabatic-process` | 绝热过程 | 绝热 vs 等温对照 | 沿约束落到目标态 |

---

## 3. 课堂白名单（替换后）

**上架**：`projectile-basic`, `pendulum-clock`, `ramp-rolling-collision`, `gas-pressure-micro`, `maxwell-speed-dist`, `adiabatic-process`  

**下架（包保留）**：`gas-ideal`, `heat-conduction`，以及其它非白名单。

```bash
node scripts/set-mechanics-thermo-classroom.js
```

---

## 4. 不做

- 不改皮复用旧玻意耳 / 热传导公式  
- 不接相对论、不接 SSO  
- 本轮不 git commit  

# ramp-rolling-collision · 入库审计 follow-up

日期：2026-08-08  
包 id：`ramp-rolling-collision` · craft：`pilot`（未升 gold）

## 验收结果

| 项 | 结果 |
|----|------|
| `batch-graph-quality-eval` | **24/24**；本包 `quality.ok=true`，**score=98**（53/54） |
| `check-sample-runtime-consistency` | **error=0**；含 `ramp-rolling-collision`（`斜坡滚球/game.html`） |
| meta「微雾」 | **已清除**；`cvSummary` → 轨色冷暖 / emissive / 雾色与灯光 |
| overview | `apps/web/ui/data/sample-quality-overview.json` 含本包（24 行） |
| 图谱重导出 | **是** → runtime + `样本html/斜坡滚球/图谱.html` |

## 改了什么

1. **图谱质量门控**  
   - 曾误跑 `repair-yangben-graph-quality`（enrich）把 AV/CV 冲坏；已从 C/D/E transcript 还原 chapter，并叠审计补丁（`btnReset`、I1/CV 教师注）。  
   - 公式改为可通过 `isCleanFormula` 的 `v0`/`Ek`/`Ep` 写法；`btnReset.role` 改为合法 `operation`（不再用非法 `skip`）。  
   - `repair-quality-surgical` + 手工对齐 DT「调节滑条参数」与 KG O1。  
   - 写入 `meta.quality`（ok/score/checklist）；残留仅 `strategyKgPathAligned=false`（与近邻金标 `momentum-collision` 同类）。

2. **meta 文案**  
   - `title` 恢复「斜坡滚球 · 碰撞与纯滚动」。  
   - `cvSummary` / chapter CV 教师注去掉「微雾」；`note` 更新为场景三修后状态。

3. **一致性与旁路清单**  
   - consistency / overview 已重建。  
   - deprecated 镜像 `data/datasets/html-samples/manifest.json` 补本包（业务仍以 packages 为准；README 已说明）。  
   - `清单.md` + `yangben-sample-map` + packages manifest 此前已含本包。

4. **Adapter**  
   - 全库仅 `adapters/capacitor-era.json` 一份；多数 `demo-*` 可缺 → **未新建**本包 adapter（学生壳按现网不依赖）。

## 残留

- `strategyKgPathAligned` 仍 false（金标亦常见；不影响 `quality.ok`）。  
- `craft:pilot` 未升 gold。  
- scene 仍有 `THREE.Fog` 色调随轨温变化（非已删 mist mesh）；文案已按轨色/emissive/灯光表述。

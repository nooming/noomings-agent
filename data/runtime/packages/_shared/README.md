# 探究包共享（`_shared`）

课堂演示包可复用的薄共享层。真相源仍是各包自己的 `game.html`；这里只放**明确可复用**的壳与埋点约定。

| 文件 | 用途 |
|------|------|
| `craft-tokens.css` | 色板 / 圆角等视觉 token；关卡可覆盖 `--craft-accent` |
| `craft-telemetry.js` | 双模 `phase_change` 初始化 + 可选 `explore_success` 门闩 helper |

## 新关约定

1. 链入 `../_shared/craft-tokens.css`（已有关如斜抛 / 热学）。
2. 需要统一 phase 上报时：` <script src="../_shared/craft-telemetry.js"></script>` 后调用 `CraftTelemetry.initDualModePhase()`。
3. **探究达成**只发 `explore_success`；**竞赛通关**只发 `win`。二者时机不得混用。
4. 不要一次把所有旧 `game.html` 改挂共享脚本；先新关复用，旧关按回归窗口渐进替换。

## 改完必同步

编辑 `data/runtime/packages/` 后若对应 `样本html/` 有镜像：

```bash
npm run sync:packages-samples
# 或仅检查漂移：
npm run sync:packages-samples:check
```

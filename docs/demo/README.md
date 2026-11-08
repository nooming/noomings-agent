# docs/demo · 演示与课堂文档

## 现行入口

| 文档 | 用途 |
|------|------|
| **[classroom-demo-checklist.md](./classroom-demo-checklist.md)** | **课堂演示前清单**（码、发布、学生可见 8 关、学情） |
| **[game-qa-checklist.md](./game-qa-checklist.md)** | **关卡回归 QA**（双模 / 埋点 / 结算 / 分关要点） |
| [solo-e2e-checklist.md](./solo-e2e-checklist.md) | 一人端到端实测 / 录屏 |
| [thermo-three.md](./thermo-three.md) | 热学三关设计要点（极短） |

权威分工：课堂流程 → 课堂清单；关卡回归 → 游戏 QA；数据路径 → [`../DATA_LAYOUT.md`](../DATA_LAYOUT.md)；仓库结构 → [`../structure.md`](../structure.md)。

## 改包后必须 sync

运行时真相源是 `data/runtime/packages/`；`样本html/` 只是编辑镜像。改 `game.html` 后：

```bash
npm run sync:packages-samples:check
npm run sync:packages-samples
```

CI 会跑 drift check。共享壳约定见 [`data/runtime/packages/_shared/README.md`](../../data/runtime/packages/_shared/README.md)。

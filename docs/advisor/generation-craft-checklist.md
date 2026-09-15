# 生成物抽检清单（绑 Craft）

生成 / 发布前**人工短查**（约 2 分钟）。门禁细节以代码为准；本页只列必查项与 Craft 档位关系。

> 自动检查：[`packages/platform/publish-gate.js`](../../packages/platform/publish-gate.js)（轨迹 hook、`win` emit、双模缺 `explore_success` 警告；`PLATFORM_PUBLISH_STRICT=1` 可拦发布）。  
> 精致度分级：[`sample-craft-rubric.md`](./sample-craft-rubric.md)。  
> 轨迹与双模式规格：[`sample-spec.md`](./sample-spec.md)。

## 生成后必查（勾选）

| # | 项 | 说明 |
|---|----|------|
| 1 | **物理模型** | 公式 / 调节量(AV) / 混淆量(CV) / 输出量与 `inquiryScript`·`physicsModel` 一致；CV 不进 win 公式 |
| 2 | **AV · CV** | ≥2 AV 稳定 controlId；≥1 可操作 CV（标签中性）；角色与 `traceMap` 对齐 |
| 3 | **双模** | `#modeSelect` explore/challenge；`phase_change` 可采集 |
| 4 | **win · explore_success** | 竞赛通关只 `win`；探究达成只 `explore_success`；勿混用 |
| 5 | **轨迹 id** | 控件 id 与 chapter `traceMap.controls` 一致；可在教师端见事件 |

## 与 Craft 档位

| 档位 | 与本清单 |
|------|----------|
| `craft:gold` | 必达全过（见精致度表）**且**本页 1–5 全勾；可 featured |
| `craft:pilot` | 可玩 + win + 轨迹；本页 3–5 建议过；精致度未满金 |
| `craft:draft` | 玩法/轨迹可用即可上架试玩；发布前仍建议跑 publish-gate 警告列表 |

## 交叉引用

- 上架 API / 警告字段：平台 README「publish」节；`assertPublishReady`
- 教师端过程读数：[`process-assessment-teacher-note.md`](./process-assessment-teacher-note.md)
- 过程子技能对照：[`process-detectors.md`](./process-detectors.md)

Agent / 教师提示：生成预览后优先打开本清单 + Craft 必达表，再决定 `gold` / `pilot` / `draft` 标签。

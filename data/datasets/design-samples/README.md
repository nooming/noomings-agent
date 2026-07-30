# 设计轨口语样本（Agent A）

用于批跑 **设计图谱** 模式：输入口语知识点 → 评估 `inquiryDraft` 三要素（公式 / 调节 / 混淆 / 输出）。

## 文件

| 文件 | 说明 |
|------|------|
| [`prompts.json`](prompts.json) | 10 条样本 fixture |
| [`../output/design-runs/`](../legacy-output/design-runs/) | 本地批跑 JSON 产物（不提交 git） |

## Fixture 字段

| 字段 | 必填 | 说明 |
|------|------|------|
| `id` | 是 | 唯一标识 |
| `topic` | 是 | 物理主题 |
| `knowledgeText` | 是 | 教师口语输入（2–5 句） |
| `hint` | 否 | 补充过关说明 |
| `tags` | 否 | 分类标签，便于筛选 |
| `expected` | 是 | 软匹配期望（见下） |
| `analyzeReference` | 否 | 对应 analyze 轨 HTML，仅文档对照 |

### `expected` 软匹配

| 键 | 含义 |
|----|------|
| `formulasContain` | 任一 formula 字符串含这些 token |
| `adjustmentLabelsContain` | AV label 合并文本含任一 token |
| `outputLabelsContain` | OV label/symbol 含任一 token |
| `confoundingMin` | CV 最少条数 |
| `minAdjustmentVars` | AV 最少条数 |
| `minOutputVars` | OV 最少条数 |
| `minKnowledgePoints` | KP 最少条数 |

不写死 LLM 的 `id` / `controlId`，避免 overfit。

## 用法

需 `.env` 中 `DEEPSEEK_API_KEY`。

```bash
# 仅解析（改 PARSE_SYSTEM 时用，快）
npm run design-demo:parse

# 单条
node tests/demos/design-demo.js --parse-only --id projectile-basic

# 完整设计轨（改 graph prompt 时用）
npm run design-demo:full

# 等价写法
npm run design-demo -- --save --report

# 固定目录便于 diff
node tests/demos/design-demo.js --parse-only --save --seed-run --report
```

## 推荐迭代流程

1. **基线**：`npm run design-demo:parse` → 可选保存到 `legacy-output/design-runs/baseline-parse.txt`
2. **改 prompt**：只改 [`packages/generate/design-pipeline.js`](../../../packages/generate/design-pipeline.js) 的 `PARSE_SYSTEM`
3. **重跑 + diff**：对比 pass 率与 failures
4. **解析稳定后**：`npm run design-demo -- --save --report` 测全 pipeline
5. **改 graph 对齐**：只改 `formatInquiryForGraphPrompt` 或 pipeline design 段
6. **prompt 包抽检**：对 2–3 条 pass 样本复制 `promptBundle.markdown` 给外部 LLM 试写 HTML（人工）

## 与 advisor / samples 的关系

- 预设游戏 HTML 见 [`data/games/preset/`](../games/preset/)（仅 `电容纪元.html`）；历史样本见 [`data/games/legacy/`](../games/legacy/)
- 老师场景见 [`docs/advisor/`](../../docs/advisor/)

## 基线记录（parse-only）

| 日期 | pass | 典型 failures |
|------|------|----------------|
| 2026-05-31 | 8/10 | `button-only-action`：缺发射按钮 AV；`multi-kp`：KP 合并 |
| 2026-07-02 | **10/10** | PARSE_SYSTEM 增加按钮型 AV、多 KP 拆分、OV/按钮区分后全通过 |

完整终端输出见 [`../legacy-output/design-runs/baseline-parse-v2.txt`](../legacy-output/design-runs/baseline-parse-v2.txt)（本地，不提交 git）。

## 基线记录（full pipeline）

| 日期 | pass | 说明 |
|------|------|------|
| 2026-07-02 首轮 | 3/10 | parse 层大多通过，7 条卡在 strategy/DT quality |
| 2026-07-02 调优后 | **10/10** | 自适应 gameHints + graph prompt 加固 + designMode quality 软化 |

完整终端输出见 [`../legacy-output/design-runs/baseline-full-v2.txt`](../legacy-output/design-runs/baseline-full-v2.txt)。

**full 评估标准**：`validation.ok` + inquiry 三要素 + `promptBundle` 含物理模型；设计轨下 strategy/DT 打磨项为 warning，不阻塞 pass。

**说明**：批跑不进 `npm run check`（避免 CI 调 LLM）；离线评估逻辑见 [`tests/lib/design-sample-eval.js`](../../../tests/lib/design-sample-eval.js)。

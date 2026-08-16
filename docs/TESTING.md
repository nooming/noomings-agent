# 测试与 Fixtures

契约回归、fixtures 索引与本地 smoke 说明。运行全部回归：

```bash
npm run check
```

按 suite 运行：

```bash
npm run check:contract
npm run check:generate
npm run check:strategy
npm run check:export
```

可选 filter：`node tests/regression/check.js --suite strategy --filter mermaid`

## 平台冒烟（无 LLM）

```bash
npm start   # 另开终端
npm run smoke:platform
npm run smoke:ingest-concurrent
```

详见 `tests/scripts/platform-smoke.md`。

## Fixtures 布局

| 文件 | 说明 |
|------|------|
| `tests/fixtures/manifest.json` | bundle 索引 + quality hints（`genericQuality`、`coupledMode`） |
| `tests/fixtures/judge.bundle.json` | 评判章：`generic`、`coupled`、`coupledAligned`、`parallelExit` |
| `tests/fixtures/strategy.bundle.json` | 策略回归章：6 个 route/highlight 场景 |
| `tests/fixtures/traces.bundle.json` | 轨迹样例（见下表） |

### judge.bundle.json

| key | 用途 |
|-----|------|
| `generic` | 双约束 + 无关控件 + strategy main/trap + `traceMap`（含 `{ version, chapter }` 包装） |
| `coupled` | 精简耦合章（评判路径对齐回归） |
| `coupledAligned` | 完整耦合章（质量/导出回归） |
| `parallelExit` | DT 并列退出 / enrich 集成 |

### strategy.bundle.json

| key | 用途 |
|-----|------|
| `multiFork` | 途径分叉隔离 + Win 高亮 |
| `sharedHub` | Fire 共享 hub + 编号 gate 隔离 |
| `restrictedPairwise` | Observe+Adjust 共享 + bleed 回归 |
| `macroFanout` | Fire 扇出多 gate |
| `phantomContinue` | 禁止 phantom 直连 Win |
| `multiGateRetry` | 多 CheckGoal + Retry 隔离 |

### traces.bundle.json

| key | 用途 |
|-----|------|
| `genericGood` | 主路径：`tuning` + `snapshot` + `win` |
| `genericTrap` | 误区：`irrelevant_touch`，route≈trap |
| `genericBadRetry` | 失败重试：`hintKey`≠ok |
| `genericLegacy` | 遗留事件 `set_legacy_*`（手写，勿被 write-fixtures 覆盖） |
| `genericPlaythrough` | 混 ch0/ch1，评判 ch0 时过滤 |
| `coupledModeOn` | 开态调 paramB → main |
| `coupledModeOffTrap` | 关态误调 paramB → trap |

代码中加载：

```javascript
const { loadChapter, loadTrace, loadHints } = require('./tests/lib/fixture-loader');
loadChapter('judge', 'generic');       // 含 chapter 包装
loadChapter('strategy', 'multiFork');
loadTrace('genericGood');
loadHints('coupledMode');
```

## Level-detect HTML stub

内联于 `tests/lib/html-stubs.js`（原 `fixtures/*.html`）：

- `configArrayStub` — configArray 三关 + locked + 自由探索
- `selectThreeStub` — `<select>` 三关
- `selectManyStub` — `<select>` 六关
- `branchStub` — branchSwitch / uiTotal
- `challengeLevelsStub` — challengeLevels[] 配置

## 本地 HTML smoke

预设 HTML 在 `data/games/preset/`（仅电容纪元）；历史样本在 `data/games/legacy/`：

```bash
AGENT_SMOKE_HTML=data/games/legacy/foo.html npm run check:generate
# 或
AGENT_SMOKE_HTML=data/games/preset/电容纪元.html npm run check:generate
```

HTTP URL 不变：`/static/samples/`、`/static/legacy-samples/`。

未设置 `AGENT_SMOKE_HTML` 时 `generate-hints-smoke` 会 skip（预期行为）。

## 多关卡 per-level hints

多关卡 HTML 若含 `applyLevelUI` / `currentLevel === N` 分支，`buildLevelGameHints` 会解析本关 `airCheckbox` / `planetSelect` 可见性，写入 `levelContext.activeToggles`，并收窄 `hasCoupledControls` / `modeToggleCount`（避免全局 checkbox 泄漏到无开关关卡）。

回归：`npm run check:generate` 含 `level-active-toggles`；若 `data/games/legacy/` 存在高尔夫 HTML 且 `data/runtime/output/`（或旧 `data/output/`）有对应项目，还会跑 `golf-quality-regression`。

## 重新生成部分轨迹

```bash
npm run write-fixtures
```

从 `judge.bundle.json#generic` 合成并写回 `traces.bundle.json` 的 `genericGood` / `genericTrap` / `genericBadRetry` / `genericPlaythrough`。`genericLegacy` 保持不变。

## 评判演示

```bash
npm run judge-demo -- 0 genericGood generic
npm run judge-demo -- 0 genericTrap generic
npm run judge-demo -- 0 coupledModeOn judge:coupledAligned
```

无 `DEEPSEEK_API_KEY` 时使用规则模式。

## 从旧路径迁移

| 旧文件 | 新 key |
|--------|--------|
| `fixtures/generic-chapter.json` | `loadChapter('judge', 'generic')` |
| `fixtures/coupled-chapter.json` | `judge.coupled` |
| `fixtures/coupled-mode-aligned-chapter.json` | `judge.coupledAligned` |
| `fixtures/generic-good-trace.json` | `genericGood` |
| `fixtures/multi-fork-route-chapter.json` | `strategy.multiFork` |

旧 `npm run *-check` 已合并为 `npm run check`；详见 `tests/regression/check.js` 与 `tests/regression/suites/`。

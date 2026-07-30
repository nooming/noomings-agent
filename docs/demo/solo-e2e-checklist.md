# 一人端到端实测清单（录屏给老师）

目标：本地走通 **教师生成/发布 → 学生试玩 → 学情 → Agent B 评判**，证明后端闭环可用。

## 前置

1. Node ≥ 18
2. 复制 [`.env.example`](../../.env.example) 为 `.env`，填入 `DEEPSEEK_API_KEY`（Agent A 生成需要；评判可无 Key 走规则模式）
3. 样本 chapter/HTML 已就绪（若缺失）：
   ```bash
   npm run archive:manual-html
   npm run batch-html-dataset -- --dry-run
   npm run seed-platform-demo
   ```

## 启动

```bash
npm start
# → http://localhost:3001/
```

浏览器打开：

- 教师工作台：http://localhost:3001/teacher.html
- 学生任务：http://localhost:3001/student.html

## 路径 A：最快闭环（用 catalog 已有任务，约 5 分钟）

适合先验证轨迹 + 评判，不必等待 LLM 生成。

1. **学生端** → 选「【样本集】斜抛 · projectile-basic」或「【样本集】机械能 · multi-kp」
2. 调节滑条 / 点击发射，试玩 **2–3 分钟**，尽量触发过关（页面含 `winOk` 埋点）
   - 须从 **学生端列表** 进入（`student-play.html` 壳层），勿直接打开 `game.html`
   - 右下角 ⋯ 菜单应显示 **「轨迹采集中 · 操作已记录 · N 条」**（N > 2，含 `tuning`/`action`/`win`）
   - 操作提示仅一条（游戏内 `.top-hint` 或壳层 idle 兜底，不应重复叠加）
3. **教师端** → Tab「学情数据中心」→ 选刚试玩的学生会话
4. 点击 **Agent B 评判**，确认返回：
   - `verdict`（pass / in_progress / …）
   - 控制变量相关 metrics（如 `singleVariableRate`）
5. **录屏要点**：学生操作画面 → 学情列表出现新会话 → 评判结果展开

## 路径 B：完整 Agent A 生成（约 10–15 分钟，需 API Key）

1. **教师端** → Tab「Agent 工具」→ **设计图谱**
2. 填写知识点（可粘贴 manifest 中任一条 `knowledgeText`）
3. 点击「一键：图谱 + 游戏 + 发布准备」或分步生成
4. Tab「探究任务发布」→ 确认 graphId + playUrl（`/static/packages/{id}/game.html`）→ 发布；试玩与图谱预览在 Tab「资源管理」
5. 按路径 A 步骤 1–4 在学生端试玩并评判

## 路径 C：样本集 + 图谱质量数字（给老师汇报用）

与路径 A 并行准备材料：

```bash
npm run batch-graph-quality-eval
npm run batch-html-dataset -- --dry-run
```

报告位置：[`data/runtime/packages/reports/`](../../data/runtime/packages/reports/)（`graph-quality-report.md`、`agent-a-report.md`）

## 常见问题

| 现象 | 处理 |
|------|------|
| 【样本集】评判 `chapter_not_found` | 运行 `npm run seed-platform-demo`；graphId 为 `{packageId}`（如 `multi-kp`） |
| Agent A 503 | 检查 `.env` 中 `DEEPSEEK_API_KEY` |
| 评判无 win 事件 | 多试几次发射；选 eval 样本 `multi-kp` 等埋点完整 HTML |
| 评判 `[规则模式]` | 无 Key 时正常；配 Key 后可走 LLM 评语 |

## 录屏建议结构（3–5 分钟）

1. 打开教师端，简述「设计轨生成事理图谱 + HTML」
2. 学生端试玩 1 款游戏（调节变量 + 过关）
3. 教师端学情列表 + Agent B 评判结果
4. （可选）展示 `graph-quality-report.md` 中 quality 通过率数字

# 一人端到端实测清单（录屏给老师）

目标：本地走通 **教师发布 → 学生 join → 试玩 → 学情 → Agent B 评判**。  
**现行课堂关卡与通行码**以 [classroom-demo-checklist.md](./classroom-demo-checklist.md) 为准（默认 **8 关**：力学 5 + 热学 3）。关卡回归见 [game-qa-checklist.md](./game-qa-checklist.md)。

## 前置

1. Node ≥ 18
2. 复制 [`.env.example`](../../.env.example) 为 `.env`（Agent A 生成需要 `DEEPSEEK_API_KEY`；评判可无 Key 走规则模式）
3. 确认课堂白名单已写入（可选重跑）：
   ```bash
   node scripts/set-mechanics-thermo-classroom.js
   ```
4. 样本 chapter/HTML 若缺失：
   ```bash
   npm run archive:manual-html
   npm run batch-html-dataset -- --dry-run
   npm run seed-platform-demo
   ```

## 通行码（演示用）

| 项 | 怎么看 |
|----|--------|
| **课堂码**（学生 join） | `CLASS_ACCESS_CODE` / `PLATFORM_CLASS_CODE` → 否则 `data/runtime/platform/class-config.json` 的 `classCode` → 非生产默认 `wuli2609` |
| **教师通行码** | `TEACHER_ACCESS_CODE` / `PLATFORM_TEACHER_PASS`（本地示例常为 `teach2609`） |

教师码 ≠ 课堂码。勿把生产码提交进 git。

## 启动

```bash
npm start
# → http://localhost:3001/
```

| 角色 | URL |
|------|-----|
| 学生进入课堂 | http://localhost:3001/student-join.html |
| 学生探究区 | http://localhost:3001/student.html（签到后） |
| 教师登录 | http://localhost:3001/teacher-login.html |
| 教师工作台 | http://localhost:3001/teacher.html |

## 路径 A：最快闭环（catalog 已有任务，约 5 分钟）

适合验证轨迹 + 评判，不必等 LLM。

1. **教师**：登录 → 确认/复制课堂码 → 确认发布列表为学生可见 **8** 关（见 checklist）
2. **学生**：`/student-join.html` 填课堂码 + 学号 + 姓名 → 进入 `/student.html`
3. 在列表中选一关必上关（推荐）：
   - `demo-projectile-basic`（斜抛）
   - 或 `demo-pendulum-clock` / `demo-ramp-rolling-collision` / `demo-nezha-boat-jump` / `demo-pulley-rigid`（力学 gold）
   - 热学（pilot，仍上架）：`demo-gas-pressure-micro` / `demo-maxwell-speed-dist` / `demo-adiabatic-process`
4. 调节滑条 / 操作 **2–3 分钟**，尽量触发探究达成或竞赛过关
   - 须从 **学生端列表** 进入（`student-play.html` 壳层），勿直接打开 `game.html`
   - 右下角 ⋯ 菜单应显示 **「轨迹采集中 · 操作已记录 · N 条」**（N > 2）
5. **教师端** → Tab「学情数据中心」→ 选刚试玩的会话 → **Agent B 评判**
6. **录屏要点**：join → 学生操作 → 学情出现会话 → 评判结果

> 勿再默认演示 `multi-kp`（机械能）作课堂主路径；该包可作回归/评判埋点参考，不在现行 8 关白名单内。

## 路径 B：完整 Agent A 生成（约 10–15 分钟，需 API Key）

1. **教师端** → Tab「Agent 工具」→ **设计图谱**
2. 填写知识点 →「一键：图谱 + 游戏 + 发布准备」或分步生成
3. Tab「探究任务发布」→ 确认 graphId + playUrl → 发布
4. 按路径 A 从学生 join 起试玩并评判

## 路径 C：样本集 + 图谱质量数字（汇报用）

```bash
npm run batch-graph-quality-eval
npm run batch-html-dataset -- --dry-run
```

报告：[`data/runtime/analysis/reports/`](../../data/runtime/analysis/reports/)

## 常见问题

| 现象 | 处理 |
|------|------|
| 学生列表不是 8 关 | 重跑 `node scripts/set-mechanics-thermo-classroom.js`；见 checklist |
| 评判 `chapter_not_found` | `npm run seed-platform-demo`；graphId 为 `{packageId}` |
| join 课堂码错误 | 核对 env / `class-config.json` / 教师工作台当前码 |
| Agent A 503 | 检查 `.env` 中 `DEEPSEEK_API_KEY` |
| 评判 `[规则模式]` | 无 Key 时正常 |

## 录屏建议结构（3–5 分钟）

1. 教师登录，展示课堂码与 8 关发布列表
2. 学生 join → 试玩 1 款必上关
3. 教师学情 + Agent B 评判
4. （可选）`graph-quality-report.md` 数字

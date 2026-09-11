# 物理探究教学平台

Agent A 生成事理图谱 · 学生试玩上报轨迹 · 教师端 Agent B 过程评判。

## 启动

```bash
cp .env.example .env   # 填写 DEEPSEEK_API_KEY、TEACHER_ACCESS_CODE、CLASS_ACCESS_CODE
npm start              # http://localhost:3001/
```

Windows 也可双击 `start-agent.bat`。

| 页面 | URL |
|------|-----|
| 平台首页 | `/` |
| 教师工作台 | `/teacher.html` |
| 学生探究区 | `/student.html` |

**课堂演示前清单**：[docs/demo/classroom-demo-checklist.md](docs/demo/classroom-demo-checklist.md)（默认 6 关）。关卡回归：[docs/demo/game-qa-checklist.md](docs/demo/game-qa-checklist.md)。学生进课堂请先走 `/student-join.html`。

## 按角色怎么找

| 角色 / 意图 | 先看 |
|-------------|------|
| **教师课堂** | [classroom-demo-checklist](docs/demo/classroom-demo-checklist.md) · `/teacher-login.html` |
| **学生入口** | `/` 或 `/student-join.html` → `/student.html` |
| **探究包** | `data/runtime/packages/`（真相源）；编辑镜像 `样本html/` |
| **Agent A / B** | `packages/generate/` · `packages/judge/` · 结构见 [docs/structure.md](docs/structure.md) |
| **论文** | [docs/paper/](docs/paper/README.md) |
| **归档** | [`_archive/`](_archive/README.md)（只读）；演示过程稿 [docs/demo/_archive/](docs/demo/_archive/) |

心智模型与勿碰项：[docs/structure.md](docs/structure.md)。

## 关键位置

| 内容 | 路径 |
|------|------|
| 样本 HTML（**单向镜像**，非真相源；份数见目录） | `样本html/`（见 `样本html/清单.md`；改完须同步 packages） |
| 运行时探究包 + 图谱（**真相源**） | `data/runtime/packages/` |
| 平台 catalog（任务列表） | `data/runtime/platform/catalog.json` |
| 平台运维 / 埋点 / 部署清单 | [`data/runtime/platform/README.md`](data/runtime/platform/README.md) |
| 离线分析快照 + 报告 | [`data/runtime/analysis/README.md`](data/runtime/analysis/README.md)（`reports/` 可入库；`traces-全部-*` 勿放仓库根） |
| 站点图标 / 彩蛋图 | `apps/web/icons/`（HTTP `/icons/`） |
| 专家图谱数据集 | `data/datasets/expert-graphs/` |
| 过程评价教师半页（v4） | [`docs/advisor/process-assessment-teacher-note.md`](docs/advisor/process-assessment-teacher-note.md) |
| craft 门禁 gold/pilot/draft | [`docs/advisor/sample-craft-rubric.md`](docs/advisor/sample-craft-rubric.md) |
| 课堂 / 演示 / QA | [`docs/demo/README.md`](docs/demo/README.md) |
| 论文材料 | [`docs/paper/README.md`](docs/paper/README.md) |
| 离线 vendor 权威源 | `apps/web/viewer/vendor/` |
| 目录与 URL 对照 | `docs/DATA_LAYOUT.md` |
| 回归 / fixtures | `docs/TESTING.md` |
| docs 总索引 | [`docs/README.md`](docs/README.md) |
| 一次性脚本归档（只读） | [`_archive/README.md`](_archive/README.md) |

## 检查与冒烟

```bash
npm run check                          # 契约回归（CI 同款）
node tests/scripts/platform-smoke.js   # join→ingest→教师列表（需已启动服务）
node tests/scripts/ingest-concurrent-smoke.js
node scripts/sync-packages-to-samples.js --check   # packages→样本 漂移检查
```

## v4 口径速记

**探究达成**（`explore_success`）≠ **竞赛通关**（`win`）。学生端 draft 任务隐藏；观察包单独分组；PCA 默认排除 observe-only。

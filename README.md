# 物理探究教学平台

Agent A 生成事理图谱 · 学生试玩上报轨迹 · 教师端 Agent B 过程评判。

## 启动

```bash
cp .env.example .env   # 填写 DEEPSEEK_API_KEY、TEACHER_ACCESS_CODE
npm start              # http://localhost:3001/
```

Windows 也可双击 `start-agent.bat`。

| 页面 | URL |
|------|-----|
| 平台首页 | `/` |
| 教师工作台 | `/teacher.html` |
| 学生探究区 | `/student.html` |

## 关键位置

| 内容 | 路径 |
|------|------|
| 23 份样本 HTML（**单向镜像**，非真相源） | `样本html/`（见 `样本html/清单.md`；改完须同步 packages） |
| 运行时探究包 + 图谱（**真相源**） | `data/runtime/packages/` |
| 平台 catalog（任务列表） | `data/runtime/platform/catalog.json` |
| 平台运维 / 埋点 / 部署清单 | [`data/runtime/platform/README.md`](data/runtime/platform/README.md) |
| 离线分析快照 + 报告 | [`data/runtime/analysis/README.md`](data/runtime/analysis/README.md)（`reports/` 可入库；`traces-全部-*` 勿放仓库根） |
| 专家图谱数据集 | `data/datasets/expert-graphs/` |
| 过程评价教师半页（v4） | [`docs/advisor/process-assessment-teacher-note.md`](docs/advisor/process-assessment-teacher-note.md) |
| craft 门禁 gold/pilot/draft | [`docs/advisor/sample-craft-rubric.md`](docs/advisor/sample-craft-rubric.md) |
| 离线 vendor 权威源 | `apps/web/viewer/vendor/` |
| 目录与 URL 对照 | `docs/DATA_LAYOUT.md` |
| 回归 / fixtures | `docs/TESTING.md` |
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

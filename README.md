# 物理探究教学平台

Agent A 生成事理图谱 · 学生试玩上报轨迹 · 教师端 Agent B 过程评判。

## 启动

```bash
cp .env.example .env   # 填写 DEEPSEEK_API_KEY
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
| 23 份样本 HTML（编辑源） | `样本html/`（见 `样本html/清单.md`） |
| 运行时探究包 + 图谱 | `data/runtime/packages/` |
| 平台 catalog（任务列表） | `data/runtime/platform/catalog.json` |
| 专家图谱数据集 | `data/datasets/expert-graphs/` |
| 离线 vendor 权威源 | `apps/web/viewer/vendor/`（导出同步到 `样本html/vendor/` 与 `packages/vendor/`） |
| 方案 / 会议纪要 | `安排/` |
| 目录与 URL 对照 | `docs/DATA_LAYOUT.md` |
| 回归 / fixtures | `docs/TESTING.md` |

契约回归：`npm run check`。一次性诊断脚本见 `tests/scripts/diag/`（可删）。临时缓存见 `临时/`（当前空）。

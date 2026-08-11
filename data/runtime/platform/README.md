# 探究教学平台数据

| 路径 | 说明 |
|------|------|
| `catalog.json` | 教师发布的探究任务（graphId + playUrl + 发布状态） |
| `traces/` | 学生游玩会话（本地 JSON，不提交 git） |

## 页面入口

| 页面 | URL | 说明 |
|------|-----|------|
| 平台首页 | `/` | 教师 / 学生角色切换 |
| 教师工作台 | `/teacher.html` | 学情、发布任务、Agent 工具 |
| 学生探究区 | `/student.html` | 试玩已发布任务 |
| Agent A | `/teacher.html?tab=agents` | 图谱生成与设计（内嵌于教师工作台） |

> 旧链接 `/generate.html` 已重定向至 `?tab=agents`。旧 `/judge.html` 已重定向至教师工作台。Agent B 评判请在 **学情数据中心** 对学生会话操作。

## 平台 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/platform/catalog` | 学生端已发布任务 |
| GET | `/api/platform/catalog/all` | 教师端全部任务 |
| POST | `/api/platform/publish` | 发布 / 更新任务 |
| POST | `/api/platform/set-published` | 上架 / 下架 |
| POST | `/api/trace/ingest` | 学生操作轨迹上报 |
| GET | `/api/platform/traces/stats` | 学情统计 |
| GET | `/api/platform/traces/students` | 按学生聚合会话 |
| GET | `/api/platform/traces/:sessionId` | 会话详情 |
| POST | `/api/platform/traces/delete` | 批量删除学情会话（body: `{ sessionIds: [] }`） |
| GET | `/api/platform/traces/export-zip` | 教师下载全部轨迹 ZIP（需鉴权） |
| POST | `/api/platform/traces/import-zip` | 教师上传轨迹 ZIP / `sess-*.json`（需鉴权；同名覆盖） |
| POST | `/api/platform/judge-session` | 学情一键 Agent B 评判 |

## 典型流程

1. 教师工作台 **Agent 工具** Tab 生成图谱 → **探究任务发布** 关联 graphId 与游戏 HTML
2. 学生从 **学生探究区** 进入游戏，轨迹写入 `traces/`
3. 教师 **学情数据中心** 选学生 → **Agent B 评判**

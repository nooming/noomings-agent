# 探究教学平台数据

| 路径 | 说明 |
|------|------|
| `catalog.json` | 教师发布的探究任务（graphId + playUrl + 发布状态 + sampleTags / researchInclude） |
| `traces/` | 学生游玩会话（本地 JSON，不提交 git） |

## 页面入口

| 页面 | URL | 说明 |
|------|-----|------|
| 平台首页 | `/` | 教师 / 学生角色切换 |
| 教师工作台 | `/teacher.html` | 学情、发布任务、Agent 工具 |
| 学生签到 | `/student-join.html` | 学号+姓名（必填，含格式/黑名单校验） |
| 学生探究区 | `/student.html` | 已发布且 craft:gold/pilot 任务（draft 对学生隐藏）；观察包单独分组；每日知情说明可重开 |
| Agent A | `/teacher.html?tab=agents` | 图谱生成与设计（内嵌于教师工作台） |

> **已弃用页面别名（仍重定向）**：`/generate.html` → `?tab=agents`；`/judge.html` → 教师工作台。Agent B 评判请在 **学情数据中心** 对学生会话操作。
> **已弃用健康检查别名**：`GET /health`（请用 `GET /api/health`）。

## 平台 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查（亦接受弃用别名 `/health`） |
| GET | `/api/platform/catalog` | 学生端：已发布且非 draft |
| GET | `/api/platform/catalog/all` | 教师端全部任务 |
| POST | `/api/platform/publish` | 发布 / 更新（含 playability / explore_success 门禁警告） |
| POST | `/api/platform/set-published` | 上架 / 下架 |
| POST | `/api/trace/ingest` | 学生轨迹上报（学号校验；同 sessionId 串行；同学号/IP 软配额；body 上限） |
| GET | `/api/platform/traces/stats` | 学情统计（需教师鉴权） |
| GET | `/api/platform/traces/students` | 按学号聚合会话（需教师鉴权） |
| GET | `/api/platform/traces/classroom` | 课堂看板（需教师鉴权） |
| GET | `/api/platform/traces/:sessionId` | 会话详情（需教师鉴权） |
| GET | `/api/platform/traces` | 会话列表（需教师鉴权） |
| POST | `/api/platform/traces/delete` | 批量删除学情会话（body: `{ sessionIds: [] }`） |
| GET | `/api/platform/traces/export-zip` | 教师下载全部轨迹 ZIP（需鉴权） |
| POST | `/api/platform/traces/import-zip` | 教师上传轨迹 ZIP / `sess-*.json`（需鉴权；同名覆盖） |
| POST | `/api/platform/judge-session` | 学情一键 Agent B 评判 |
| POST | `/api/platform/teacher-login` | 教师通行码登录（token 含 TTL；失败限次） |

> 当环境变量 `TEACHER_ACCESS_CODE` 已配置时，上述学情只读/写入接口均要求 `Authorization: Bearer <login-token>`（与教师登录一致）。教师页通过 `PlatformNav.installTeacherFetchAuth()` 自动附加。
> **生产**（`NODE_ENV=production` / PaaS 信号 / `PLATFORM_REQUIRE_TEACHER_CODE=1`）未配置通行码时，教师/学情接口 **fail-fast 503**。

## 埋点约定（v4）

- **探究达成（主）**：`explore_success`（不计竞赛通关）
- **竞赛通关**：`win`（仅竞赛段）
- **阶段切换**：`phase_change`（`explore` / `challenge`）
- 聚合主键优先 **学号 `studentId`**；教师列表展示「姓名 · 学号」
- **deprecated**：用探究段 `win` 冒充探究达成——判分仍兼容旧轨迹，新产品禁止再发

## 观察包（observe-only）

`capacitor-era-ch1/ch2/ch4`、`capacitor-confound-ui` 等标为 **observe-only / 单阶段观察**：不要按竞赛作业口径把观察反馈假改成 `win`。catalog `sampleTags` 含 `observe-only`；默认 `researchInclude: false`（PCA 默认排除，可用 `--include-observe-only`）。

## 发布门禁

上架时检查：trace hook / 双模包须有 `explore_success`。默认强警告（`publishWarnings`）；设 `PLATFORM_PUBLISH_STRICT=1` 则阻止 published。

## 运行真相源

- **探究包 HTML**：`data/runtime/packages/*/game.html`（运行真相源）
- **样本 HTML**：`样本html/`（编辑镜像）；单向同步：`node scripts/sync-packages-to-samples.js`（`--check` 漂移检查）
- 一次性 patch 脚本已归档至 `_archive/scripts/`（只读）

## 部署清单

1. 设置 `TEACHER_ACCESS_CODE`（生产必填）
2. 可选：`TEACHER_TOKEN_TTL_MS`、`TEACHER_LOGIN_MAX_FAILS`、`PLATFORM_PUBLISH_STRICT=1`
3. `GET /api/health` 探活
4. 确认 `data/runtime/platform/traces/` 可写且不进 git
5. 冒烟：`node tests/scripts/platform-smoke.js`（服务已启动）
6. 并发 ingest：`node tests/scripts/ingest-concurrent-smoke.js`

## 运维一句

重启服务后教师需重新登录（token TTL）；学情 ZIP 导出/导入与 traces 热数据在 `traces/`，勿把热轨迹提交 git。任务圈定继续靠 catalog 上架/下架 + craft 分层。

## 典型流程

1. 教师工作台 **Agent 工具** Tab 生成图谱 → **探究任务发布** 关联 graphId 与游戏 HTML
2. 学生签到后从 **学生探究区** 进入游戏，轨迹写入 `traces/`
3. 教师 **学情数据中心** 选学生 → **Agent B 评判**

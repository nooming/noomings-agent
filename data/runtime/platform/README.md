# 探究教学平台数据

| 路径 | 说明 |
|------|------|
| `catalog.json` | 教师发布的探究任务（graphId + playUrl + 发布状态 + sampleTags / researchInclude） |
| `traces/` | 学生游玩会话（本地 JSON，不提交 git）；按课堂码分子目录 `traces/{classCode}/sess-*.json`，缺省课堂码为 `_default` |
| `traces/.traces-index.json` | 轻量学情索引（无 events；列表/统计读索引；点文件，导出 ZIP 会跳过） |
| `class-config.json` | 可选：工作台写入的课堂码（不提交 git；生产优先用环境变量） |

## 页面入口

| 页面 | URL | 说明 |
|------|-----|------|
| 平台首页 | `/` | 教师 / 学生角色切换 |
| 教师工作台 | `/teacher.html` | 学情、发布任务、Agent 工具；可查看/修改课堂码 |
| 教师登录 | `/teacher-login.html` | 教师通行码（`TEACHER_ACCESS_CODE`） |
| 学生签到 | `/student-join.html` | 课堂码 + 学号 + 姓名（服务端校验后写入本机会话） |
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
| POST | `/api/platform/student-join` | 学生进入课堂（校验课堂码+学号姓名，返回 `studentSession`） |
| GET/POST | `/api/platform/class-config` | 教师查看/设置课堂码（需教师鉴权；env 锁定时 POST 409） |
| POST | `/api/trace/ingest` | 学生轨迹上报（学号校验；可选 `classCode`/`studentSession`；同 sessionId 串行；同学号/IP 软配额；body 上限） |
| GET | `/api/platform/traces/stats` | 学情统计（需教师鉴权；支持 `classCode` 过滤） |
| GET | `/api/platform/traces/students` | 按学号聚合会话（需教师鉴权；支持 `classCode`） |
| GET | `/api/platform/traces/classroom` | 课堂看板（需教师鉴权；支持 `classCode`） |
| GET | `/api/platform/traces/:sessionId` | 会话详情（需教师鉴权） |
| GET | `/api/platform/traces` | 会话列表（需教师鉴权；支持 `classCode`） |
| POST | `/api/platform/traces/delete` | 批量删除学情会话（body: `{ sessionIds: [] }`） |
| GET | `/api/platform/traces/export-zip` | 教师下载全部轨迹 ZIP（需鉴权；仅打包 `sess-*.json`，扁平文件名；不含索引） |
| POST | `/api/platform/traces/import-zip` | 教师上传轨迹 ZIP / `sess-*.json`（需鉴权；支持扁平或 `classCode/sess-*.json`；写入课堂码目录并重建索引） |
| POST | `/api/platform/judge-session` | 学情一键 Agent B 评判 |
| POST | `/api/platform/teacher-login` | 教师通行码登录（token 含 TTL；失败限次） |

> 当环境变量 `TEACHER_ACCESS_CODE` 已配置时，上述学情只读/写入接口均要求 `Authorization: Bearer <login-token>`（与教师登录一致）。教师页通过 `PlatformNav.installTeacherFetchAuth()` 自动附加。
> **生产**（`NODE_ENV=production` / PaaS 信号 / `PLATFORM_REQUIRE_TEACHER_CODE=1`）未配置通行码时，教师/学情接口 **fail-fast 503**。

## 课堂码（与教师通行码分开）

| 配置来源 | 说明 |
|----------|------|
| `CLASS_ACCESS_CODE` / `PLATFORM_CLASS_CODE` | 环境变量优先；锁定后工作台不可改文件 |
| `class-config.json` | 教师工作台「修改」写入 |
| 开发默认 | 非生产且未配置时使用 `wuli2609` |

学生必须经 `POST /api/platform/student-join` 校验课堂码后才能进探究区；轨迹字段 `classCode` 与任务 `taskCode` 分离。教师学情工具栏可按课堂码过滤。

### 轨迹存储布局

- 会话文件：`traces/{classCode}/sess-*.json`（`classCode` 会清洗为安全目录名；空 → `_default`）
- 索引：`traces/.traces-index.json`（进程内缓存；ingest / 评判写回 / 删除 / 导入时更新）
- 兼容：首次访问若仍有旧版扁平 `traces/sess-*.json`，会一次性迁入对应课堂码目录并重建索引
- 列表 / stats / students / classroom 读索引；会话详情仍按需加载单个 JSON（含 events）
- 导出 ZIP：扁平 `sess-*.json` 全量会话；不含 `.traces-index.json`

账号 MVP：学生「退出课堂」、教师「退出登录」清本机会话；join 返回短期 `studentSession`，ingest 若携带则校验学号+课堂码一致性。换设备需重填。

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

1. 设置 `TEACHER_ACCESS_CODE`（生产必填；本地开发示例 `teach2609`）
2. 设置 `CLASS_ACCESS_CODE`（生产建议必填；开发默认可为 `wuli2609`）
3. 可选：`TEACHER_TOKEN_TTL_MS`、`STUDENT_SESSION_TTL_MS`、`TEACHER_LOGIN_MAX_FAILS`、`PLATFORM_PUBLISH_STRICT=1`
4. `GET /api/health` 探活（含 `classCodeConfigured`）
5. 确认 `data/runtime/platform/traces/` 可写且不进 git；`class-config.json` 不进 git
6. 冒烟：`node tests/scripts/platform-smoke.js`（服务已启动）
7. 并发 ingest：`node tests/scripts/ingest-concurrent-smoke.js`
8. 演示前完整清单见：`docs/demo/classroom-demo-checklist.md`

## 给老师演示前（摘要）

1. 配置教师通行码 + 课堂码，并告知学生课堂码
2. 跑 `node scripts/set-mechanics-thermo-classroom.js`，确认学生可见 **6 关**（力学 `projectile-basic` / `pendulum-clock` / `ramp-rolling-collision` + 热学 `gas-pressure-micro` / `maxwell-speed-dist` / `adiabatic-process`）；详见 `docs/demo/classroom-demo-checklist.md`
3. 学生入口 `/student-join.html`，教师入口 `/teacher-login.html`
4. 跑一遍 `npm run smoke:platform`
5. 注意知情说明弹窗与发布门禁警告

## 运维一句

重启服务后教师需重新登录（token TTL）；学生签到会话亦有 TTL；学情 ZIP 导出/导入与 traces 热数据在 `traces/`，勿把热轨迹提交 git。任务圈定继续靠 catalog 上架/下架 + craft 分层。

## 典型流程

1. 教师工作台 **Agent 工具** Tab 生成图谱 → **探究任务发布** 关联 graphId 与游戏 HTML
2. 学生用课堂码签到后从 **学生探究区** 进入游戏，轨迹写入 `traces/`（含 `classCode`）
3. 教师 **学情数据中心** 可按课堂码过滤 → 选学生 → **Agent B 评判**

# 课堂演示前清单

给老师 / 助教在演示或真实课堂前快速核对。更完整的平台说明见 `data/runtime/platform/README.md`。

## 0. 当前演示课堂：力学 + 热学（默认 6 关）

本仓库默认演示课堂已圈定为 **仅力学与热学**（电容 / 光电 / 磁 / 折射 / 电路 / 电场等已下架，包文件仍保留）。

学生可见收窄为 **6 关**：力学 3 + 热学 3。以下 **不进默认演示串**（catalog `unpublished`，包保留）：`projectile-cannon`、`pendulum-target`、`momentum-collision`、`circular-motion`、`friction-incline`，以及旧热学 **`gas-ideal` / `heat-conduction`**（已替换）。

热学设计要点：[`thermo-three.md`](./thermo-three.md)。关卡回归：[`game-qa-checklist.md`](./game-qa-checklist.md)。旧口播 / 过程稿见 [`_archive/`](./_archive/)。演示文档索引见 [`README.md`](./README.md)。

### 对学生可见的 catalog id（published + craft:gold|pilot）

| 优先级 | 领域 | catalog id | graphId | craft |
|--------|------|------------|---------|-------|
| **必上** | 力学 | `demo-projectile-basic` | projectile-basic | gold |
| **必上** | 力学 | `demo-pendulum-clock` | pendulum-clock | gold |
| **必上** | 力学 | `demo-ramp-rolling-collision` | ramp-rolling-collision | pilot |
| **必上** | 热学 | `demo-gas-pressure-micro` | gas-pressure-micro | pilot |
| **必上** | 热学 | `demo-maxwell-speed-dist` | maxwell-speed-dist | pilot |
| **必上** | 热学 | `demo-adiabatic-process` | adiabatic-process | pilot |

一键重跑（上架白名单、下架其它、写入课堂备注）：

```bash
node scripts/set-mechanics-thermo-classroom.js
# 预览不写盘：
node scripts/set-mechanics-thermo-classroom.js --dry-run
```

校验学生可见列表（应为上表 6 个）：

```bash
node -e "const {listCatalog}=require('./packages/platform/catalog'); console.log(listCatalog({studentVisible:true}).map(i=>i.id).join('\n'))"
```

## 1. 通行码与课堂码

| 项 | 环境变量 / 位置 | 用途 |
|----|-----------------|------|
| 教师通行码 | `TEACHER_ACCESS_CODE`（或 `PLATFORM_TEACHER_PASS`）；本地示例 `teach2609` | 登录 `/teacher-login.html` |
| 课堂码 | `CLASS_ACCESS_CODE`（或 `PLATFORM_CLASS_CODE`） | 学生 `/student-join.html` 必填 |
| 课堂码备用 | 教师工作台学情区「当前课堂码」→ 修改（写入 `class-config.json`） | env 未设时可用 |
| 开发默认 | 未配置时默认 `wuli2609` | 仅非生产 |

**本演示课堂码怎么看**：

1. 优先：环境变量 `CLASS_ACCESS_CODE` / `PLATFORM_CLASS_CODE`
2. 否则：`data/runtime/platform/class-config.json` 的 `classCode`（脚本会写入；文件不进 git）
3. 再否则（非生产）：`wuli2609`

脚本写入的 `class-config.json` 含 `label` / `name`：**力学与热学课堂**。教师工作台亦可查看/复制当前课堂码。

**注意**：教师通行码 ≠ 课堂码。不要把生产码提交进 git。

## 2. 教师如何只演示这些关

1. 跑一遍 `node scripts/set-mechanics-thermo-classroom.js`（或确认 catalog 已按上表上架、其余 `published: false`）。
2. 教师登录 → 打开 **探究任务发布**：学生端只会看到 gold/pilot 且已发布的任务；draft 即使 published 也对隐藏。
3. 把课堂码发给学生；学生经 `/student-join.html` 签到后进 `/student.html`，列表应只有上表 **6** 个。
4. 勿在演示前把电容 / 光电 / 折射等重新上架；需要恢复时再改 catalog 或调整脚本白名单后重跑。
5. **旧热学与 friction 等后置关**仅自学，不进默认演示串。

观察包（`demo-capacitor-era-*` 等）当前已下架；若临时上架仅作观察演示，勿按竞赛通关口径解读。

## 3. URL

| 角色 | 路径 |
|------|------|
| 首页 | `/` |
| 学生进入课堂 | `/student-join.html` |
| 学生探究区 | `/student.html`（签到后） |
| 教师登录 | `/teacher-login.html` |
| 教师工作台 | `/teacher.html` |

本地默认端口见 `AGENT_PORT`（通常 `http://localhost:3001`）。

## 4. 冒烟

服务已启动后：

```bash
node tests/scripts/platform-smoke.js
# 或
npm run smoke:platform
```

可选并发 ingest：`node tests/scripts/ingest-concurrent-smoke.js`

## 5. 知情说明与发布门禁

- 学生首次进入探究区会看到知情说明；可用「再看探究说明」重开。
- 上架时注意 `publishWarnings`（缺 `explore_success` 等）；生产可设 `PLATFORM_PUBLISH_STRICT=1` 强拦截。
- 演示口径：探究达成（`explore_success`）≠ 竞赛通关（`win`）。

## 6. 课堂流程速记

1. 教师登录 → 确认/复制课堂码 → 发给学生  
2. 学生填课堂码 + 学号 + 姓名 → 进入探究区  
3. 学生游玩；教师学情区可按课堂码过滤  
4. 结束：学生点「退出课堂」；教师点「退出登录」  
5. 本机签到：清浏览器 / 换设备需重新进入  

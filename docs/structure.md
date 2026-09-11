# 仓库目录结构（方案 C）

> 路径权威：[DATA_LAYOUT.md](./DATA_LAYOUT.md) · 课堂演示：[demo/classroom-demo-checklist.md](./demo/classroom-demo-checklist.md) · 关卡 QA：[demo/game-qa-checklist.md](./demo/game-qa-checklist.md)

HTTP 路径（`/static/*`、`/output/*`、`/icons/*`）保持不变；磁盘布局按 **apps + packages + tests** 分层，由 [`packages/shared/data-paths.js`](../packages/shared/data-paths.js) 集中管理并兼容旧目录。

## 按角色怎么找

| 角色 / 意图 | 先看 |
|-------------|------|
| **教师课堂** | [`demo/classroom-demo-checklist.md`](./demo/classroom-demo-checklist.md) → `/teacher-login.html` → `/teacher.html`；catalog：`data/runtime/platform/catalog.json` |
| **学生入口** | `/` 或 `/student-join.html` → `/student.html` → `/student-play.html` |
| **探究包（真相源）** | `data/runtime/packages/{id}/`；编辑镜像 `样本html/`（改完须同步 packages） |
| **Agent A / B** | `packages/generate/`（生成）· `packages/judge/`（评判）· `packages/contract/`（契约） |
| **论文** | [`paper/`](./paper/README.md)（勿当运行时真相源）；过程评价口径见 [`advisor/`](./advisor/README.md) |
| **归档** | 根 [`_archive/`](../_archive/README.md)（脚本/快照，只读）；演示过程稿 [`demo/_archive/`](./demo/_archive/) |

## 根目录心智模型

| 类别 | 路径 | 说明 |
|------|------|------|
| **入口** | `server.js`、`start-agent.bat`、`package.json`、`.env*` | 启动与配置 |
| **课堂产品（Web）** | `apps/web/`（`ui/pages/`、`icons/`、viewer） | 平台 / 教师 / 学生页；favicon 等经 `/icons/` 挂载 |
| **服务端** | `apps/server/` | HTTP、静态映射、API |
| **Agent 管线** | `packages/{shared,contract,generate,judge,platform}/` | 生成 · 契约 · 评判 · 平台逻辑 |
| **数据** | `data/` | 见 [DATA_LAYOUT.md](./DATA_LAYOUT.md)；**勿碰约定**见下 |
| **论文** | `docs/paper/` | 写作材料；非运行时 |
| **文档** | `docs/` | 本文件 + DATA_LAYOUT + demo + advisor + TESTING |
| **测试 / 运维脚本** | `tests/`、`scripts/` | 回归与课堂运维（短名单） |
| **编辑源（脆）** | `样本html/` | 中文夹名镜像；**勿重命名/大搬家** |
| **归档（只读）** | `_archive/` | 一次性脚本与课堂前快照 |

```
agent/
  server.js              # 入口，require('./apps/server')
  start-agent.bat
  package.json
  apps/
    server/              # HTTP、静态资源映射（static.js、api.js）
    web/                 # 浏览器资源
      ui/pages/          # 平台、教师、学生
      icons/             # favicon / PWA / 首页彩蛋图（HTTP /icons/）
      viewer/js/         # 图谱预览 shell
  packages/
    shared/              # paths、data-paths、env、llm、浏览器共用模块
    contract/            # enrich、校验、修复
      enrich/
      repair/
      validate/
      strategy/
      graph/
      classify/
      index.js, constants.js, schema-prompt.js
    generate/            # Agent A 管线、导出、持久化
      hints/
      level-detect/
      level-detect.js    # 薄 re-export → level-detect/index.js
    judge/               # Agent B 评判引擎
    platform/            # 任务 catalog、学情 traces
  tests/
    regression/          # check.js + suites/
    fixtures/
    lib/
    demos/
    scripts/             # npm 脚本工具（stop-server、seed-*、smoke 等）
  scripts/               # 仅课堂运维 + PCA：sync-packages、set-mechanics-thermo、radar/session-pca
  _archive/              # 一次性 patch/verify 只读归档（见 _archive/README.md）
  样本html/              # 编辑源（中文夹；游戏 + 图谱.html；份数见该目录）
  data/
    games/
      preset/
      legacy/
      generated/
    datasets/
      design-samples/
      expert-graphs/
      html-samples/        # 批跑兼容残留：deprecated manifest 镜像（chapters 已删）
      training/            # SFT：v1 历史 / v2-packages 现行
    runtime/
      packages/            # 探究包真相源（manifest + {id}/）；reports 不在此
      analysis/            # 离线分析：traces 快照 + reports/
      platform/
  docs/
    structure.md
    DATA_LAYOUT.md
    TESTING.md
    paper/                 # 论文材料（勿当运行时真相源）
    advisor/
    demo/                  # 现行：classroom-demo-checklist · game-qa-checklist · README
```

## 根目录约定

根目录**只保留**：入口与配置、`README`、方案 C 代码树（`apps/`、`packages/`、`tests/`、`data/`、`docs/`、`scripts/`）、编辑源 `样本html/`、只读 `_archive/`。

**乱源（勿再堆回根）**：一次性脚本 → `_archive/`；favicon/品牌图 → `apps/web/icons/`；论文草稿 → `docs/paper/`；演示过程稿 → `docs/demo/_archive/`；分析 traces 解压 → `data/runtime/analysis/`（禁止 `traces-全部-*` 长期留根）。

**勿碰（脆 / 契约）**：`data/runtime/packages/`、课堂 `catalog.json`、平台页 URL（`/`、`/teacher.html`、`/student*.html`）、`样本html/` 中文夹名与镜像约定。

## HTTP URL 与磁盘路径

| HTTP URL | 磁盘路径（优先 → 回退） |
|----------|-------------------------|
| `/icons/*` | `apps/web/icons/` |
| `/static/shared/*` | `packages/shared/` |
| `/static/samples/*` | `data/games/preset/` → `data/samples/` |
| `/static/samples/generated/*` | `data/games/generated/` → `data/samples/generated/` |
| `/static/legacy-samples/*` | `data/games/legacy/` → `legacy-samples/` |
| `/static/packages/*` | `data/runtime/packages/` |
| `/packages/*` | `data/runtime/packages/{id}/index.html` |
| `/static/html-samples/*` | alias → `data/runtime/packages/` |
| `/static/samples/*` | alias → packages / `data/games/preset/` |
| `/output/*` | alias → `data/runtime/packages/` |
| `/static/viewer/js/*` | `apps/web/viewer/js/`（部分模块回退到 `packages/shared/`） |
| `/static/ui/*` | `apps/web/ui/` |

实现：[`apps/server/static.js`](../apps/server/static.js)、[`packages/shared/data-paths.js`](../packages/shared/data-paths.js)。

## 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `AGENT_OUTPUT_ROOT` | `data/runtime/packages`（经 data-paths 回退 output） | 探究包落盘 |
| `AGENT_VIEWER_ROOT` | `apps/web/viewer` | 预览 viewer |

## contract 子包

| 子目录 | 职责 |
|--------|------|
| `enrich/` | `enrichChapterContract` 流水线编排 |
| `repair/` | scope、mapsTo、route highlight、dt 分支、coupled 等后处理 |
| `validate/` | `validate-structure` / `validate-scope` / `validate-quality` |
| `strategy/` | mermaid 规则、sanitize、compact |
| `graph/` | KG play 图、traceMap、DT–KG 耦合校验 |
| `classify/` | outcome / constraint gate 分类 |

## generate 拆分

| 模块 | 文件 |
|------|------|
| **hints** | `source-scan.js`、`controls.js`、`level-context.js`、`prompt.js`、`index.js` |
| **level-detect** | `parse-utils.js`、`strategy-*.js`、`merge.js`、`index.js` |

对外 `require('./hints')`、`require('./level-detect')`（`level-detect.js` re-export 目录实现）。

## 跨层依赖

`packages/contract/*` 与 `tests/regression/suites/*` 引用 [`packages/shared/strategy-mermaid-parse.js`](../packages/shared/strategy-mermaid-parse.js)，浏览器经 `/static/shared/` 加载；避免 packages → apps/web 反向依赖。

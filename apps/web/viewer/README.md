# 图谱预览 Viewer

Agent 服务（:3001）默认 `AGENT_VIEWER_ROOT=apps/web/viewer`（旧 `frontend/viewer/` 目录仍可读）：

- `graph.html` — 预览 shell
- `js/viewer.js` — 主逻辑
- `js/graph-shell.css` — 布局

## 共用模块

策略边解析与 sanitize 已抽到 [`packages/shared/strategy-mermaid-parse.js`](../../packages/shared/strategy-mermaid-parse.js)，浏览器经 `/static/shared/strategy-mermaid-parse.js` 加载；tab 标签见 [`packages/shared/tab-label.js`](../../packages/shared/tab-label.js)。

## 开发

1. 编辑 `js/*` 或 `packages/shared/*`。
2. 刷新 `http://localhost:3001/graph.html?...` 预览。

HTTP URL 不变：`/static/viewer/js/*`、`/static/shared/*`。

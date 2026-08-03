# 样本html · 离线双击包

## 这是什么

整夹拷贝后即可离线使用，接近线上的 **游戏试玩 + Agent A 图谱预览**。

**包含**：各样本游戏 HTML、对应 `图谱.html`、共享 `vendor/`（Mermaid / D3 / MathJax）。

**不包含**：登录、学生壳、学情埋点后端、Agent B 评判、平台 traces。

## 如何打开

1. **整夹复制** `样本html/`（必须含 `vendor/`，不要只拷单个子夹）。
2. 双击打开 **`index.html`**，从目录进入「试玩」或「图谱」。
3. 也可直接打开 `样本名/样本名.html` 或 `样本名/图谱.html`。

图谱脚本走相对路径 `../vendor/...`，在 `file://` 下可用。

## 本地 HTTP 备选（次要）

若某浏览器对 `file://` 下 Mermaid 限制过严，可双击 **`启动本地预览.bat`**（需本机有 Node / npx），浏览器打开提示的地址（默认 `http://localhost:5500`）。

仍以双击 `index.html` 为主路径。

## vendor

| 文件 | 用途 |
|------|------|
| `vendor/mermaid.min.js` | 策略图 |
| `vendor/d3.v7.min.js` | 决策树 / 事理图谱（懒加载） |
| `vendor/tex-mml-svg.js` | 侧栏公式（懒加载） |

权威源：`apps/web/viewer/vendor/`。更新后可用导出流程的 `syncOfflineVendor` 再同步到本目录。

## 已知残留（不影响核心试玩）

- **斜抛**：仍引用 Tailwind CDN；离线时已有布局兜底 CSS，有网时样式更完整。
- **电容系列**：可选本地 `bgm.mp3` 氛围音；包内未附带时静音即可玩。
- **埋点上报**：`file://` 下不上报；有本地后端时才会 POST（失败已静默忽略）。

# Offline graph preview vendor（权威源）

Bundled for Strategy-first `图谱.html` offline render（Strategy Mermaid 不依赖 CDN）。

| File | Source | License | Notes |
|------|--------|---------|-------|
| `d3.v7.min.js` | [d3@7.9.0](https://github.com/d3/d3) | ISC | Force layout / zoom |
| `mermaid.min.js` | [mermaid@10.9.3](https://github.com/mermaid-js/mermaid) | MIT | Strategy flowchart |
| `tex-mml-svg.js` | [mathjax@3.2.2](https://github.com/mathjax/MathJax) `es5/tex-mml-svg.js` | Apache-2.0 | Optional formulas (async / fail-soft) |

**权威目录：`apps/web/viewer/vendor/`**  
导出（`writePriorityGraphFiles` / `syncOfflineVendor`）会同步副本到：

- `样本html/vendor/`（供 `样本html/*/图谱.html` 的 `../vendor/`）
- `data/runtime/packages/vendor/`（供 `packages/*/图谱.html` 的 `../vendor/`）

**勿在两处副本里手改 JS**；只改本目录，再跑导出/同步。Windows 上不用 junction/symlink（不稳），以「单一权威源 + export 拷贝」为准。

MathJax 使用本地 SVG 组件（与 `svg:{fontCache:'global'}` 配置一致）；侧栏公式排版可选，策略图首屏不依赖其加载完成。

Refresh（仅在本目录执行）：
```bash
# PowerShell
Invoke-WebRequest https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js -OutFile d3.v7.min.js
Invoke-WebRequest https://cdn.jsdelivr.net/npm/mermaid@10.9.3/dist/mermaid.min.js -OutFile mermaid.min.js
Invoke-WebRequest https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-mml-svg.js -OutFile tex-mml-svg.js
```

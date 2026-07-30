# Offline graph preview vendor（权威源）

Bundled for Strategy-first `图谱.html` offline render（Strategy Mermaid 不依赖 CDN）。

| File | Source | License | Notes |
|------|--------|---------|-------|
| `d3.v7.min.js` | [d3@7.9.0](https://github.com/d3/d3) | ISC | Force layout / zoom |
| `mermaid.min.js` | [mermaid@10.9.3](https://github.com/mermaid-js/mermaid) | MIT | Strategy flowchart |

**权威目录：`apps/web/viewer/vendor/`**  
导出（`writePriorityGraphFiles` / `syncOfflineVendor`）会同步副本到：

- `样本html/vendor/`（供 `样本html/*/图谱.html` 的 `../vendor/`）
- `data/runtime/packages/vendor/`（供 `packages/*/图谱.html` 的 `../vendor/`）

**勿在两处副本里手改 JS**；只改本目录，再跑导出/同步。Windows 上不用 junction/symlink（不稳），以「单一权威源 + export 拷贝」为准。

MathJax 仍可选 CDN（仅公式排版；策略图不依赖）。

Refresh（仅在本目录执行）：
```bash
# PowerShell
Invoke-WebRequest https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js -OutFile d3.v7.min.js
Invoke-WebRequest https://cdn.jsdelivr.net/npm/mermaid@10.9.3/dist/mermaid.min.js -OutFile mermaid.min.js
```

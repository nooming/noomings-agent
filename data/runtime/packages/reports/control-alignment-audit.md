# 控件 ↔ chapter AV/CV 对齐审计

生成时间：2026-08-03T09:07:21.694Z

覆盖 1/1；存在合成 AV 缺失 HTML：**0**

| id | HTML 控件数 | AV | CV | AV∉HTML | 错误数 |
| --- | ---: | ---: | ---: | --- | ---: |
| refraction-snell | 7 | 2 | 1 | — | 0 |

## 说明

- `av_missing_in_html`：chapter 声明了 HTML 中不存在的 controlId（典型：电容纪元合成 AV）。
- `--fix` 会删除缺失 AV 并重排同包 routes/priorityRank；mermaid 全文可能仍含旧标签，需后续 surgical 清理。

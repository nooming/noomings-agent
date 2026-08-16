# analysis/reports/

离线分析与批跑报告输出目录（可入库）。

原路径 `data/runtime/packages/reports/` 已迁至此。业务脚本请使用：

```js
const { getReportsRoot } = require('../../../packages/shared/data-paths');
```

典型产物：`radar-pca-analysis.md`、`session-pca-kmo-approx49.md`、审计 / playtest JSON+MD 等。

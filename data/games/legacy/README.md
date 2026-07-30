# 历史游戏 HTML

运行态参照用 HTML，供 design-samples 等引用。

HTTP URL：`/static/legacy-samples/<文件名>.html`（磁盘：`data/games/legacy/`）

**人工原件归档**（只读备份）见 [`../manual-backups/`](../manual-backups/)（`npm run archive:manual-html`）。探究包内 `game.html` 已统一为 Agent 生成，legacy 目录不再复制进 packages。

```bash
AGENT_SMOKE_HTML=data/games/legacy/斜抛运动物理挑战.html npm run check:generate
```

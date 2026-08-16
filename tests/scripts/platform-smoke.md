# Platform smoke（无 LLM）

Join → ingest → 教师读列表。不调用 DeepSeek。

```bash
# 需已启动 npm start（默认 :3001）
node tests/scripts/platform-smoke.js
```

环境变量：

| 变量 | 默认 | 说明 |
|------|------|------|
| `AGENT_BASE` | `http://localhost:3001` | 服务地址 |
| `TEACHER_ACCESS_CODE` | （可选） | 若服务端已配置，冒烟会登录拿 token |

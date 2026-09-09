# Platform smoke（无 LLM）

health → student-join（含错误课堂码拒绝）→ ingest（带 classCode / studentSession）→ 教师读列表。不调用 DeepSeek。

```bash
# 需已启动 npm start（默认 :3001）
node tests/scripts/platform-smoke.js
# 或
npm run smoke:platform
```

环境变量：

| 变量 | 默认 | 说明 |
|------|------|------|
| `AGENT_BASE` | `http://localhost:3001` | 服务地址 |
| `TEACHER_ACCESS_CODE` | `teach2609` | 若服务端已配置，冒烟会登录拿 token，并测 class-config |
| `CLASS_ACCESS_CODE` | `wuli2609` | 与服务端课堂码一致；用于 join/ingest |

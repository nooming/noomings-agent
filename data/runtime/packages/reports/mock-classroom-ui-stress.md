# 模拟课堂 UI 压测（约 30 人）

日期：2026-08-11 · **未 commit**  
范围：教师端学情 Tab（`/teacher.html?tab=sessions`）  
原则：先观察；仅做明显安全的小修（概览芯片限高）。

## 如何生成

```bash
node tests/scripts/seed-mock-classroom-students.js
```

- 脚本：`tests/scripts/seed-mock-classroom-students.js`
- 写入根：`data/runtime/platform/traces/`（`getTracesRoot()`）
- 本趟结果：**30** 名学生（`模拟01`…`模拟30`），**107** 个会话文件  
  - 终局混合：`pass` 35 / `exhausted_fail` 37 / `incomplete` 35  
  - 约 101 局带 `judgeResult` + `abilityScore` v3 简模  
  - catalog/graph 复用现有 demo（电容 confound/ch1、multi-kp、斜抛、单摆、热传导等）
- 文件名：`sess-mock-ui-{studentIndex}-{round}.json`（如 `sess-mock-ui-01-3.json`）
- **不覆盖** 李四 / 王五 等既有文件

验证：

```bash
node -e "const {listTraceStudents}=require('./packages/platform/trace-store'); const a=listTraceStudents({limit:100}); console.log('total',a.length,'mock',a.filter(s=>/^模拟/.test(s.studentLabel||'')).length)"
```

期望：`mock` ≈ 30；`limit=100` 时列表总长被截断到 100（磁盘上学生组更多，因含大量 playtest/匿名键）。

## 如何清理

```bash
node tests/scripts/seed-mock-classroom-students.js --clean
# 或手动：
# del data\runtime\platform\traces\sess-mock-ui-*.json   (Windows)
# rm data/runtime/platform/traces/sess-mock-ui-*.json    (Unix)
```

勿删非 `sess-mock-ui-*` 的真实轨迹。

## 观察环境

- 本地服务已在 `:3001`（`AGENT_PORT`）
- 教师登录通行码：`.env` 中 `TEACHER_ACCESS_CODE`
- 视口：约 881×786（默认自动化）、1280×800、390×844（窄屏）
- 「隐藏试玩」默认开启 → 列表约 **32** 人（30 模拟 + 李四 + 王五）

## 观察到的 UI 问题（按严重度）

### 高

| # | 问题 | 说明 | 状态 |
|---|------|------|------|
| H1 | **已评判概览芯片墙占屏** | 32 枚芯片无高度上限时约 217–270px+；其中 **20** 枚为「达标×0」，噪声大。展开后挤压下方 `sessions-split`。 | **已修**（限高 + 默认隐藏 ×0，见 M4 / followups） |
| H2 | **默认自动锁到单一任务** | 进页后 `filterGraph` 常被 `pickRecentGraphWithData` 设为如 `capacitor-confound-ui`，只见约 21 人、每人「1次」，误以为数据丢了。需手切「全部探究任务」。 | **已修**（默认全部；仍记上次） |
| H3 | **课堂看板摘要路径类型爆炸** | 展开后 summary「路径类型」枚举极长（含全库试玩路径）；表体虽有 `max-height:280px` 可滚，但摘要本身仍拉高首屏（看板约 590px）。 | **已修**（Top-6 + 其余 n 类） |

### 中

| # | 问题 | 说明 | 状态 |
|---|------|------|------|
| M1 | **`sessions-split` 高度公式不认概览真实高度** | `height: min(560px, calc(100vh - 260px))` 写死 260 余量；概览/看板变高后整页纵向滚动显著（body ≈ 2500–3300px），主列表区相对「沉」到折线以下。 | **已修**（flex + `100vh-380px`） |
| M2 | **左侧列表徽章换行挤占** | 260px 栏宽下「综合分 + 结果档 + 未×N」常换行，行高 ≈45px；短名「模拟01」被挤到很窄。李四「41次 + 未×23」更挤。 | **已修**（名+次数 / 徽章两行） |
| M3 | **仅未完成生综合分显示 `0`** | 如「模拟01 5次 **0** 未完成 未×5」——无终局有限分时更宜「—」，`0` 易读成「零分」。 | **已修**（`Number(null)` 陷阱） |
| M4 | **概览仍列出达标×0** | 芯片按已评判学生全量渲染；人多时「×0」占多数，弱化真正达标生。 | **已修**（默认隐藏 + 切换） |
| M5 | **API `listTraceStudents` limit=100** | 磁盘学生组 ≈197（含试玩/匿名）；关「隐藏试玩」或未来真实班额+噪声时，靠后学生会被截断。 | **未做 / 后续** |
| M6 | **窄屏列表区过矮** | `max-width:768px` 时 `.student-list-panel { max-height:220px }`，32 人只能看到约 4–5 行，需在矮列表内再滚。 | **小修**（220→280） |

### 低

| # | 问题 | 说明 | 状态 |
|---|------|------|------|
| L1 | **点选详情自动 path-summary / rescore** | 选「模拟30」约 2 次 `strategy-path-summary`，未明显卡死；会话多的学生（如李四 41 局）可能叠加请求，需实班再测。 | 观察中 |
| L2 | **看板默认折叠是对的** | 未展开时不影响主流程；问题在展开后的摘要密度（见 H3）。 | 可保留 |
| L3 | **短中文名截断不明显** | 「模拟XX」在桌面栏宽下一般完整；长姓名/组号仍依赖 ellipsis。 | 可接受 |

## 详情区抽查（模拟30）

- 时间轴：4 局可见，折叠/未终局分组正常  
- 能力卡：有有限总分（如 88）与过程依据  
- 学情画像雷达：结果/探究/竞赛/效率/一致性/完成度均有值  
- 自动 rescore：有 path-summary 调用，未见 UI 长时间无响应  

## 已做小修

**文件**：`apps/web/ui/platform-shell.css`

```css
.judged-student-chips {
  /* … */
  max-height: 7.5rem;      /* ≈120px */
  overflow-y: auto;
  overscroll-behavior: contain;
}
```

验收（缓存刷新后）：32 芯片时容器高度 **120px**，`scrollHeight` > 可视高度，概览总高约 **174px**（修前约 271px+）。

## 建议修（供用户决定）

1. ~~概览芯片：默认隐藏「达标×0」~~ → **已做**（见 followups）  
2. ~~进学情 Tab：默认「全部探究任务」~~ → **已做**  
3. ~~课堂看板摘要：路径类型 Top-N~~ → **已做**  
4. ~~`sessions-split` 高度 / flex~~ → **已做**  
5. ~~列表徽章「—」+ 两行布局~~ → **已做**  
6. students API：提高 limit 或分页/虚拟列表 → **未做 / 后续**

跟进报告：`data/runtime/packages/reports/mock-classroom-ui-followups.md`

## 回传摘要

| 项 | 值 |
|----|-----|
| 生成学生 | 30（`模拟01`–`模拟30`） |
| 会话文件 | 107 |
| traces 路径 | `data/runtime/platform/traces/` |
| 小修 | 是（限高 + 本趟跟进项） |
| 报告 | `mock-classroom-ui-stress.md` · `mock-classroom-ui-followups.md` |
| 清理 | `node tests/scripts/seed-mock-classroom-students.js --clean` |
| commit | **未 commit** |

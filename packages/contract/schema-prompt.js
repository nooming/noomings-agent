const {
  FIELD_DOCS,
  GENERIC_SHAPE_HINT,
  GENERIC_DT_TREE_EXAMPLE,
  UNIFIED_QUALITY_CHECKLIST,
} = (() => {
  const FIELD_DOCS = `
输出 JSON 结构（单章）：
{
  "mapping": "DT→KG 映射说明字符串",
  "kg": { "title", "sub", "nodes": [{ id, label, group, layer, level, r, desc }], "links": [{ s, t, tp }] },
  "dt": { "title", "sub", "tree": { n, t, d, children?, _e? } },
  "winSync": { "title", "sub" },
  "traceMap": {
    "controls": { "<源码控件id>": { "kgId": "O1|I*", "role": "operation|irrelevant" } },
    "legacyTypes": { "<旧事件type>": { "canonical": "tuning|irrelevant_touch", "control": "<控件id>" } }
  },
  "strategy": {
    "title", "sub",
    "mermaid": "graph TD\\n  Start([开始]):::stratStart\\n  Start --> Tune[调参]\\n  Tune --> Fire[发射/操作]\\n  Fire --> Observe{观察结果?}:::stratCond\\n  Observe -->|未达标| Adjust[调整]\\n  Adjust --> Fire\\n  Observe -->|达标| Win[过关]:::stratResult",
    "routes": [{ "id", "label", "mapsTo": ["KG id"], "highlightNodes": ["Mermaid节点id"], "highlightEdges": [["A","B"]], "warn": "irrelevant?" }]
  },
  "inquiryScript": {
    "summary": "探究目标一句话",
    "knowledgePoints": [{ "id": "KP1", "label", "formulas": [], "mapsToKg": ["S1"] }],
    "adjustmentVariables": [{ "id": "AV1", "controlId", "label", "symbol", "mapsToKg": "O1", "role": "primary|secondary", "priorityRank": 1, "monotonicity": "monotone|non-monotone|discrete|unknown", "affects": ["C"], "notes": "为何与其它AV不等价" }],
    "confoundingVariables": [{ "id": "CV1", "controlId", "label", "reason", "mapsToKg": null }],
    "outputVariables": [{ "id": "OV1", "symbol", "label", "unit", "role": "primary", "mapsToKg": "R1", "source": "formula|constraint|observe" }],
    "inquiryFlow": ["KP1", "AV1", "OV1"],
    "narrative": { "intro", "steps": [{ "order", "title", "body", "mapsToKg": [] }] }
  }
}

设计轨：须先确定 knowledgePoints[].formulas、confoundingVariables、outputVariables（因变量）；调节变量为自变量；混淆变量勿写入 traceMap.operation。
分析轨：若省略 inquiryScript，系统 enrich 时从 teach/traceMap 回填；分析前三步 Parse 可注入 physicsModel.core 与 priorityRank，enrich 优先保留。
physicsModel.core（分析轨）：{ formulas[], constants[], updateLoopSummary, winConditionSummary } 从源码剥离；physicsModel 由 enrich 合成，LLM 可选输出 inquiryScript。
多 AV 样本：strategy.routes 须含「单变量·{label}」每 AV 一路 + trap 多参盲调；routes[].score/weight 按 priorityRank 分档（高优更高，trap 最低），禁止全相同。
formulas 只写干净 LaTeX/明文（如 C=ε₀εᵣA/d）；禁止 HTML/脚本碎片。outputVariables 必须来自本样本（电容→电容读数/击穿；斜抛→射程/高度），禁止串台。
O1.label 与 narrative 禁止空洞「调参操作」；narrative 用现象语言，完整公式放 teach S* / KP.formulas。
play constraint 可标 constraintKind: physics|gameLimit（击穿/达标=physics；塔体限位=gameLimit）。
【斜抛 few-shot】AV 优先级：初速度(monotone)>发射高度(monotone)>发射角度(non-monotone)；routes score≈1.0/0.85/0.7 + trap0.2。
【电容 few-shot】介质(discrete, C+Ebd)≥间距d(monotone, C+E双作用)>面积A(monotone,仅C)；厚度/音量=CV。
gameSpec / telemetrySpec 由 enrich 自动生成，LLM 无需输出。
KG nodes 须含 r（画布半径，建议 18–24；缺省由系统补 22，irrelevant 用 18）
KG group: premise|operation|method|core|result|constraint|junction|irrelevant
KG layer: play|teach（O* 必须 operation+play）；layer=teach 的 S* 节点 group 必须为 core（推荐）或 method，禁止 group=teach
KG link tp: premise|method|core|verify
DT node t: root|step|core|decision|result|retry|junction
decision 的子节点必须有 _e（是/否）；retry 不进 KG
不要穷举滑条组合，只建模约束判定链 + 典型 retry
`;

  const GENERIC_SHAPE_HINT = `
通用课件结构：
- play: P1 → O1 → C1…Cn → R1（约束数量按源码，≥1）；调参+观察或计分过关源码：play constraint 须含结果判定（出界/飞出边界/命中/碰撞/进洞等），param-range gate（在范围?）不得作为唯一或数量上超过 outcome gate
- teach: ≥1 teach 节点（S*，group=core 或 method，勿用 group=teach），≥1 verify 连回 O1
- DT: 每个主要约束对应 decision + retry；至少 1 个 t:"result"（禁止把过关写成 t:"step"）
- DT 并列退出：源码存在多种独立退出（失败/出界/超时 vs 过关）时，用同级 decision 序列，禁止把失败的 decision 嵌套在过关类 decision 的 _e:"是" 下；失败类 decision 名含 失败|出界|边界|超时|未命中 → 是→retry、否→继续或下一判定；过关 decision → 是→result、否→retry
- 数值、公式、控件名称须来自上传源码
- 若源码有无关控件：I* 节点 group=irrelevant，无出边
- traceMap：将源码控件 id 映射到 KG（operation→O*，irrelevant→I*）；遗留事件 type 写入 legacyTypes
- strategy：Mermaid 多途径概览（主路径 + retry/误区 + 可选宏策略）；复杂度随源码控件/开关数量，文案均来自源码
- 若源码有模式开关：strategy 用源码标签建顶层决策分叉；若多参数：多 route；无效调参可 stratInvalid 环
- 条件参数剖面（模式开关 + 某参数关态无效 + UI）：KG 须有环境约束 C* 与条件参数约束（label/desc 含参数/变量/次要参数等）；条件参数 desc 与 teach 写明关态下无效；DT 关态支 decision desc 亦须对齐
- 环境 decision 的 _e:"否" 分支 = 关态（模式关），_e:"是" = 开态；关态支上条件无效参数（如参数 B/次要参数）：
  · DT 节点名须含「仅 UI 范围」或 desc 含不影响命中/得分/判定/关态无效
  · 不得与开态支使用同名「X 在范围?」并作为命中前的最后一环主约束
  · 若源码关态完全不读该控件，可省略该 decision，勿虚构 gate
  · 条件无效参数不是 group:irrelevant 或 I*（I* 仅用于始终无效的 decoy 控件）
- strategy 分水岭 :::stratCore 标签写机制含义（如「关态下次要参数不影响判定」），勿在分水岭文案里嵌入「过关」；唯一 Win 节点用 :::stratResult
- 观察反馈环：CheckGoal -->|否| Observe → Adjust --> 再测；Adjust 节点可用「调整/微调」；观察词写在边标签（|偏近|/|偏远|）或 Observe 节点名（如「观察偏近/偏远」）；Adjust→Fire→Observe 等多跳闭环亦有效
- 决策边优先 A -->|是| B；兼容 A -- 否 --> B
- strategy 边序：每条宏策略先写 Start→分叉→Adjust↔Fire↔Observe 环→Win，再写 Retry/Invalid 支路
- 每条宏策略独立子链：StrategySelect |途径| → 该策略入口 → Adjust↔Fire↔Observe；禁止同一 Fire/Observe 节点服务多条 |途径| 分支
- strategy 上色：Start([…]):::stratStart；每个 {…} :::stratCond；仅分水岭方框 :::stratCore（少量）；调参/测试/策略路径方框不写 :::（默认灰）；过关 :::stratResult；偏离 :::stratRetry；迷思 :::stratInvalid
- strategy.mermaid 语法：:::class 紧挨 ]/}/)；下一行写边；禁止 A[标签] :::stratStart --> B；标签含 ()、:、| 时用 Node["文案"] 或 Node{"文案"}
- strategy.routes：每条途径 highlightNodes 须含 Start、策略选择菱形、反馈环节点，过关途径含 Win；highlightEdges 可只列关键边，但入口节点不可只写反馈环；highlightEdges 不得含 Mermaid 中不存在的直连边（无路径则校验 error）；捷径边若可解析，路径上中间节点须写入 highlightNodes（否则 restricted pairwise 后预览不亮）；loop 桥接节点（如 TestD、PrepA）在路径上时不可省略；当 highlightNodes 含 ObserveN 且 Mermaid 存在 ObserveN -->|否| RetryN 时，同途径须写入 RetryN（终点 Retry 可无出边），或 highlightEdges 含 [ObserveN, RetryN]
- strategy.routes（仅 hasConditionalParamProfile 源码）：highlightNodes 另须含 Env、模式分水岭（ModeOff/ModeOn）
`;

  const GENERIC_DT_TREE_EXAMPLE = `
最小合法 dt.tree 范例（占位语义，勿照抄文案）：
{
  "n": "进入关卡", "t": "root", "d": "—",
  "children": [{
    "n": "约束1?", "t": "decision", "d": "—",
    "children": [
      { "_e": "否", "n": "提示重试", "t": "retry", "d": "—" },
      { "_e": "是", "n": "约束2?", "t": "decision", "d": "—",
        "children": [
          { "_e": "否", "n": "再试", "t": "retry", "d": "—" },
          { "_e": "是", "n": "过关", "t": "result", "d": "—" }
        ]
      }
    ]
  }]
}

【并列退出】范例（多种独立退出须同级 decision，勿嵌套在过关「是」下）：
{
  "n": "进入关卡", "t": "root", "d": "—",
  "children": [
    {
      "n": "约束1?", "t": "decision", "d": "—",
      "children": [
        { "_e": "否", "n": "提示重试", "t": "retry", "d": "—" },
        { "_e": "是", "n": "约束2?", "t": "decision", "d": "—",
          "children": [
            { "_e": "否", "n": "再试", "t": "retry", "d": "—" },
            { "_e": "是", "n": "过关", "t": "result", "d": "—" }
          ]
        }
      ]
    },
    {
      "n": "飞出边界?", "t": "decision", "d": "独立失败判定",
      "children": [
        { "_e": "否", "n": "继续", "t": "step", "d": "—" },
        { "_e": "是", "n": "出界重试", "t": "retry", "d": "—" }
      ]
    }
  ]
}

【可选】条件参数剖面范例（仅 hasConditionalParamProfile 源码；勿照抄文案）：
{
  "n": "进入关卡", "t": "root", "d": "—",
  "children": [{
    "n": "模式开启?", "t": "decision", "d": "环境/模式判定",
    "children": [
      { "_e": "否", "n": "参数 A 在范围?", "t": "decision", "d": "关态支：主参数约束",
        "children": [
          { "_e": "否", "n": "提示参数 A", "t": "retry", "d": "—" },
          { "_e": "是", "n": "参数 B 仅 UI 范围?", "t": "decision", "d": "关态下参数 B 不影响过关（仅校验滑条）",
            "children": [
              { "_e": "否", "n": "提示参数 B 范围", "t": "retry", "d": "—" },
              { "_e": "是", "n": "达成目标?", "t": "decision", "d": "—",
                "children": [
                  { "_e": "否", "n": "未达标重试", "t": "retry", "d": "—" },
                  { "_e": "是", "n": "过关", "t": "result", "d": "—" }
                ]
              }
            ]
          }
        ]
      },
      { "_e": "是", "n": "参数 A 在范围?", "t": "decision", "d": "开态支：主参数约束",
        "children": [
          { "_e": "否", "n": "提示参数 A", "t": "retry", "d": "—" },
          { "_e": "是", "n": "参数 B 在范围?", "t": "decision", "d": "开态下参数 B 参与过关判定",
            "children": [
              { "_e": "否", "n": "提示参数 B", "t": "retry", "d": "—" },
              { "_e": "是", "n": "达成目标?", "t": "decision", "d": "—",
                "children": [
                  { "_e": "否", "n": "未达标重试", "t": "retry", "d": "—" },
                  { "_e": "是", "n": "过关", "t": "result", "d": "—" }
                ]
              }
            ]
          }
        ]
      }
    ]
  }]
}
`;

  const UNIFIED_QUALITY_CHECKLIST = `
质量要点（所有上传源统一）：
1. play: P1 → O1 → C* → R1；约束数量与源码一致（≥1）
2. teach: ≥1 teach 节点；≥1 verify 连回 O1
3. DT: ≥1 decision、≥1 retry、≥1 result；decision 子节点有 _e（是/否）
4. mapping: markdown 表格 | DT 节点 | KG id | … |，retry 标注 skip retry
5. winSync.title 与 DT result 与源码胜利/过关语义一致
6. 勿套用源码中未出现的数值、控件或过关文案
7. 公式/LaTeX 仅当源码含对应物理表达时使用
8. strategy.mermaid 非空；routes 数量 ≥ minStrategyRoutes；mapsTo 引用有效 KG id（闯关关仅 O1/O2/C*/R1）；菱形用 stratCond；stratCore 仅分水岭（≤少量，标签勿含「过关」除非 stratResult）；过关 stratResult；流程方框多数无 :::；反馈环边或 Observe 节点含偏近/偏远/出界/进洞/碰撞等观察语；每条宏策略 routes.warn 非空（非 irrelevant）；coupled :::stratInvalid 在关态/否分支
9. strategy 节点/边文案须能在源码中找到依据，勿套用未上传学科的固定模板
10. traceMap.controls 非空；controls.kgId 必须引用 kg.nodes 中已有 id；勿为 HUD/画布虚构 I*；每个 irrelevant 节点至少一个 control 映射；legacyTypes 仅当源码有旧事件
11. 多关源码：kg.title / dt.sub 须体现本关 slotName（「第 3 关」与「第3关」等价）；strategy 勿串写其它关卡名
`;
  return { FIELD_DOCS, GENERIC_SHAPE_HINT, GENERIC_DT_TREE_EXAMPLE, UNIFIED_QUALITY_CHECKLIST };
})();

module.exports = {
  FIELD_DOCS,
  GENERIC_SHAPE_HINT,
  GENERIC_DT_TREE_EXAMPLE,
  UNIFIED_QUALITY_CHECKLIST,
};

# 论文准备 · 总览

老师建议步骤 **1 → 2 → 3**（中文交付）。**2026-10-30** 已按 Agent **方法**更新；轨迹/PCA 数字暂缓。不改 Agent 业务代码、不 commit。

桌面工作副本 ↔ Agent 正式夹：[`myweb-re/agent/docs/paper/`](file:///C:/Users/20844/Desktop/myweb-re/agent/docs/paper/README.md)

---

## 文件一览（精简后）

| 文件 | 步骤 | 用途 |
|------|------|------|
| [01-文献检索与阅读准备.md](./01-文献检索与阅读准备.md) | 1 | 检索式、入选标准、笔记模板、闭环清单 |
| [04-文献对照分析-已下载8篇.md](./04-文献对照分析-已下载8篇.md) | 1 | **题录 + 光谱 + 怎么用**（核心 8 + 补强 B1–B6） |
| [05-精读笔记-Saleh-Gobert-Chen.md](./05-精读笔记-Saleh-Gobert-Chen.md) | 1 | 已填精读；新篇复制 [`附-阅读笔记空白页.md`](./附-阅读笔记空白页.md) |
| [02-论文能写什么一页.md](./02-论文能写什么一页.md) | 2 | 给老师对齐：**可写/慎写 + PCA 数字**（一页） |
| [07-方法口径-与Agent同步.md](./07-方法口径-与Agent同步.md) | 2–3 | **Method 主参考**（评判层、三出口、v4、埋点） |
| [06-论文框架-IMRaD草稿.md](./06-论文框架-IMRaD草稿.md) | 3 | IMRaD 正文草稿（含结构提纲；`python _gen_06_docx.py` 出 Word） |

已删除冗余：`00-工作流*`（并入本 README）、`03-IMRaD空目录*`（与 `06` 结构重复）。

---

## 建议使用顺序

1. **`07`** + Agent `docs/advisor/*` → 核对方法句  
2. **`02`** 与老师对齐口径  
3. **`04` / `05` / `01`** 文献与笔记  
4. 在 **`06`** 落笔（Method §3.2–3.4、Related §2.7）；结果数字仍用 Agent `session-pca-kmo-20260816.md`  
5. `python _gen_06_docx.py`  

**暂缓**：新轨迹快照、重跑 PCA、改结果节 n/KMO。

---

## 交稿自检（方法）

- [ ] explore_success ≠ win；v4 分维；游戏内双模 + `phase_change`  
- [ ] 三要素 + AV/traceMap 一句；规则为主 + 形成性三出口  
- [ ] PCA = 4D 探索性；非 CFA；Related 含形成性/量规至少 1 引（见 `04` B1/B3）  

---

## Agent 只读源（报告 + 口径）

| 类型 | 路径 |
|------|------|
| 会话 PCA 主数字 | `data/runtime/analysis/reports/session-pca-kmo-20260816.md` |
| 学生级对照 | `radar-pca-analysis.md` · 历史 `archive-session-pca-n49.md` |
| 过程评价 | `docs/advisor/process-assessment-teacher-note.md` · `formative-assessment-layer.md` · `sample-spec.md` |
| 终局/v4 | `docs/demo/judge-contract.md` |

---

## 同步到 Agent（可选）

```powershell
$src = "C:\Users\20844\Desktop\论文准备"
$dst = "C:\Users\20844\Desktop\myweb-re\agent\docs\paper"
Copy-Item "$src\01*.md","$src\02*.md","$src\04*.md","$src\05*.md","$src\06*.md","$src\07*.md","$src\附*.md","$src\README.md" -Destination $dst -Force
```

---

## 一句话口径（给老师）

探索性会话/学生级过程指标降维；KMO 边缘或不适合；载荷命名贴边；口头「动机/解决问题/操作」仅教学解读；百人级复测与协议冻结后再谈稳定结构。

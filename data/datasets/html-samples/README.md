# HTML 样本集（批跑 / SFT 兼容层）

**现行金标 / 上架源不在这里**：平台 23 条见 `样本html/清单.md` 与 `data/runtime/packages/`（catalog 亦为 23）。

本目录保留批跑、评判 fixtures、SFT 导出脚本所需的 manifest 与 **chapters 遗留镜像**。

## 目录

| 路径 | 说明 |
|------|------|
| `manifest.json` | 精华清单（批跑 / seed 用） |
| `manifest-regression.json` | 回归专用（不上架 catalog） |
| `catalog-demo.json` | 演示 catalog 子集 |
| `judge-fixtures.json` | Agent B 离线评判 fixtures |
| `chapters/` | **遗留**：17 条 chapter/meta（见下） |
| 批跑报告 | `data/runtime/packages/reports/`（仅 README + overview） |

## chapters/ 与清单 23 的对齐

| 集合 | 数量 | 说明 |
|------|------|------|
| `样本html/` + `packages/` + catalog | **23** | 现行编辑源与运行时 |
| `chapters/` | **17** | 旧批跑章镜像；脚本仍读此处 |

**chapters 有（17）**：与 agent 批跑章对应——`projectile-basic`、`friction-incline`、`efield-charge`、`cyclotron-radius`、`capacitor-confound-ui`、`series-parallel`、`rc-circuit`、`magnetic-force`、`transformer-turns`、`multi-kp`、`circular-motion`、`momentum-collision`、`heat-conduction`、`gas-ideal`、`thin-lens-implicit`、`refraction-snell`、`photoelectric`。

**清单有、chapters 无（6，组员金标 / 电容纪元拆章）**：`projectile-cannon`、`pendulum-clock`、`pendulum-target`、`capacitor-era-ch1`、`capacitor-era-ch2`、`capacitor-era-ch4`。  
这些只以 `data/runtime/packages/{id}/chapter.json` 与 `样本html/` 为准。

**勿删 chapters/**：`export-llm-training-jsonl`、`batch-judge-eval`、`batch-graph-quality-eval`、`html-sft-eval`、`seed-platform-demo` 等仍硬依赖此路径。契约回归 `html-samples-chapter-load` 已改读 packages，不依赖本夹。

## 常用命令

```bash
npm run seed-sample-catalog
npm run batch-html-dataset -- --id multi-kp --force
npm run export-training-jsonl
npm run html-sft-eval
```

详见 [`../../runtime/packages/reports/README.md`](../../runtime/packages/reports/README.md)。

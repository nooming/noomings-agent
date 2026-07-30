一次性诊断 / 批补丁脚本（根目录迁入的 _diag_ / _patch_ / _fix_）。

- 用途：当时修样本的临时诊断与补丁，非正式管线。
- 运行示例（在项目根）：python tests/scripts/diag/_diag_batch1.py
- 正式脚本在 tests/scripts/（不含本夹）：audit-control-alignment / audit-trace-events / batch-expert-graph-eval 等。
- 主线 npm scripts 不依赖本夹；可整夹删除，删前确认没有本地仍依赖的临时补丁流程。
- 勿把本夹产出当成现行金标；金标与报告见 data/runtime/packages/ 与 reports/。

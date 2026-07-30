const { assert } = require('../../../lib/assert');
const { compactTabLabel } = require('../../../../packages/shared/tab-label');

function run() {
  const long = compactTabLabel('关卡 1：用理想斜抛模型预测射程，并把高尔夫球击入洞杯。');
  assert(long.short === '第 1 关', `long subtitle → 第 N 关, got "${long.short}"`);
  assert(long.full.includes('理想斜抛'), 'full preserves long text');

  const short = compactTabLabel('第 2 关：空气阻力与偏差');
  assert(short.short === '第 2 关：空气阻力与偏差', `short select label kept, got "${short.short}"`);

  const plain = compactTabLabel('这是一个没有序号前缀的很长很长的关卡描述文本');
  assert(plain.short.endsWith('…'), 'plain long text truncated');
  assert(plain.full === '这是一个没有序号前缀的很长很长的关卡描述文本', 'full plain preserved');

  const empty = compactTabLabel('', { fallbackIndex: 2 });
  assert(empty.short === '第 3 关', `fallback index, got "${empty.short}"`);

  console.log('tab-label-compact-check: OK');
}

module.exports = { run };

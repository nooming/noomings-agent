/** CLI: node tests/scripts/seed-shiguang-ref-catalog.js
 *
 * resources/shiguangtongxue 仅作离线参照，不再写入平台 catalog。
 * 本地预览：npm run shiguang-play -- atwood
 * 模式提炼：npm run extract-shiguang-patterns
 */
console.log('seed-shiguang-ref-catalog: disabled (resources are offline reference only).');
console.log('  Local preview: npm run shiguang-play -- <slug>');
console.log('  Pattern export: npm run extract-shiguang-patterns');
process.exit(0);

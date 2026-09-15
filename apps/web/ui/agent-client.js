/**
 * Agent A 页面 UI 文案
 */
(function (global) {
  const fmt = {
    fail: msg => '失败：' + msg,
  };

  const AgentCopy = {
    brand: {
      pageTitleA: 'Agent 工具 · 生成探究资源',
      h1A: 'Agent 工具',
      navA: 'Agent 工具',
    },
    lead: {
      bulletsA: [
        '分析源码：上传 HTML，生成图谱；需要发布时再生成游戏。',
        '设计探究包：描述知识点，一键完成图谱 + 游戏 + 发布准备。',
        '多关卡将自动拼合为项目图谱；亦可在「更多」中追加到多关图谱。',
      ],
    },
    fmt,
    previewHintA: '生成后可「打开独立预览」；离线包请用「更多 → 导出」。下一步可点「生成游戏 HTML」以便发布。',
    downloadReadyHintOk: ' · 已可打开在线预览或导出',
    downloadReadyHintQcFail: ' · 可打开预览草稿（未过质检）或导出 HTML',
  };

  global.AgentCopy = AgentCopy;
})(typeof window !== 'undefined' ? window : global);

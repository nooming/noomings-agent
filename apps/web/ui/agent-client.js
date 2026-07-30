/**
 * Agent A 页面 UI 文案
 */
(function (global) {
  const fmt = {
    fail: msg => '失败：' + msg,
  };

  const AgentCopy = {
    brand: {
      pageTitleA: 'Agent A · 网页游戏 → 事理图谱',
      h1A: 'Agent A · 网页游戏 → 事理图谱',
      navA: 'Agent A · 生成',
    },
    lead: {
      bulletsA: [
        '上传本关 html / css / js，点击「生成图谱」得到事理图谱（含决策树与知识图谱）。',
        '上传后可从源码推断项目名与质检提示（通用管线），见下方「源码预览」。',
        '多关卡将自动拼合为项目图谱（多标签预览）；亦可手动逐关保存到项目。发布任务后可在教师端学情中心 Agent B 评判。',
      ],
    },
    fmt,
    previewHintA: '生成后可「打开独立预览」；离线包请用「导出」。发布任务后可在教师端学情中心评判。',
    downloadReadyHintOk: ' · 已可打开在线预览或导出',
    downloadReadyHintQcFail: ' · 可打开预览草稿（未过质检）或导出 HTML',
  };

  global.AgentCopy = AgentCopy;
})(typeof window !== 'undefined' ? window : global);

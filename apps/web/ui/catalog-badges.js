/** 探究任务 catalog badge 映射 */
(function (global) {
  const TAG_BADGES = {
    'existing-html': { label: 'legacy', cls: 'badge-legacy' },
    'has-confounding': { label: '多控件', cls: 'badge-confound' },
    'button-action': { label: '按钮', cls: 'badge-action' },
    'implicit-formula': { label: '隐式公式', cls: 'badge-implicit' },
    'multi-kp': { label: '多 KP', cls: 'badge-multikp' },
    'minimal': { label: 'minimal', cls: 'badge-minimal' },
    'single-av': { label: '单变量', cls: 'badge-single' },
    'static-verify': { label: '静态验证', cls: 'badge-static' },
  };

  function badgesForItem(item) {
    const out = [];
    if (item.topicKey) {
      out.push({ label: item.topicKey, cls: 'badge-topic' });
    }
    if (item.htmlOrigin === 'manual') {
      out.push({ label: '人工', cls: 'badge-manual' });
    } else if (item.source === 'html-sample') {
      out.push({ label: '样本集', cls: 'badge-sample' });
    } else if (item.source === 'shiguang-ref') {
      out.push({ label: '拾光参照', cls: 'badge-shiguang' });
    } else if (item.source === 'teacher' || !item.source) {
      out.push({ label: '自生成', cls: 'badge-teacher' });
    }
    if (item.split === 'eval' || (item.sampleTags || []).includes('eval')) {
      out.push({ label: 'eval', cls: 'badge-eval' });
    }
    for (const tag of item.sampleTags || []) {
      const b = TAG_BADGES[tag];
      if (b && !out.some(x => x.label === b.label)) out.push(b);
    }
    return out;
  }

  function renderBadges(item) {
    return badgesForItem(item)
      .map(b => `<span class="catalog-badge ${b.cls}">${b.label}</span>`)
      .join(' ');
  }

  function sourceLabel(source) {
    if (source === 'html-sample') return '样本集';
    if (source === 'shiguang-ref') return '拾光参照';
    return '自生成';
  }

  global.CatalogBadges = { badgesForItem, renderBadges, sourceLabel };
})(typeof window !== 'undefined' ? window : global);

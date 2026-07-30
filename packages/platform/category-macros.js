const MACRO_TOPICS = {
  'macro-mechanics': {
    name: '力学',
    topics: ['平抛', '斜抛', '斜面摩擦', '机械能', '动量', '圆周运动', '简谐', '简谐振动'],
  },
  'macro-em': {
    name: '电磁学',
    topics: ['电场', '电容', '电路', '欧姆定律', 'RC电路', '回旋加速器', '安培力', '变压器'],
  },
  'macro-optics': {
    name: '光学',
    topics: ['透镜', '折射'],
  },
  'macro-thermal': {
    name: '热学',
    topics: ['热传导', '理想气体'],
  },
  'macro-other': {
    name: '近代与其它',
    topics: ['流体力学', '放射性', '光电效应'],
  },
};

const TOPIC_TO_MACRO = {};
for (const [macroId, { topics }] of Object.entries(MACRO_TOPICS)) {
  for (const topic of topics) {
    TOPIC_TO_MACRO[topic] = macroId;
  }
}

function topicToMacroId(topic) {
  const t = String(topic || '').trim();
  if (!t) return 'macro-other';
  return TOPIC_TO_MACRO[t] || 'macro-other';
}

function inferTopicFromCatalogItem(item) {
  if (item.topicKey) return String(item.topicKey).trim();
  if (item.categoryId && item.categoryId.startsWith('topic-')) {
    return item.categoryId.slice('topic-'.length);
  }
  const title = String(item.title || '').replace(/^【样本集】/, '').trim();
  const topicDot = /^([^·]+)\s*·/.exec(title);
  if (topicDot) return topicDot[1].trim();
  if (item.id === 'capacitor-era') return '电容';
  return '';
}

function isMacroCategoryId(id) {
  return String(id || '').startsWith('macro-');
}

function listMacroDefinitions() {
  return Object.entries(MACRO_TOPICS).map(([id, { name }]) => ({ id, name }));
}

module.exports = {
  MACRO_TOPICS,
  topicToMacroId,
  inferTopicFromCatalogItem,
  isMacroCategoryId,
  listMacroDefinitions,
};

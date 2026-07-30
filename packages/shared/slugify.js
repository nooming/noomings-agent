function pad2(n) {
  return String(n).padStart(2, '0');
}

function slugifyBase(title, fallback) {
  return String(title || fallback || 'generated')
    .trim()
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || fallback || 'generated';
}

function makeTimestampSlug(title, fallback) {
  const base = slugifyBase(title, fallback);
  const now = new Date();
  const ts = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}-${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;
  return `${base}-${ts}`;
}

function slugifyFilename(title, fallback) {
  return slugifyBase(title, fallback || 'generated-graph') + '.html';
}

module.exports = {
  pad2,
  slugifyBase,
  makeTimestampSlug,
  slugifyFilename,
};

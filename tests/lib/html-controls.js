/**
 * Extract control ids/labels from game HTML (lightweight, no DOM).
 */

function extractHtmlControls(html) {
  const text = String(html || '');
  const controls = [];
  const seen = new Set();

  const push = (id, label, tag) => {
    if (!id || seen.has(id)) return;
    // skip obvious chrome
    if (/^(trans|header|footer|svg|canvas|main|app|root|wrap)/i.test(id)) return;
    seen.add(id);
    controls.push({ id, label: label || id, tag: tag || 'input' });
  };

  // <input ... id="..."> / <select id> / <button id>
  const re = /<(input|select|button|textarea)\b([^>]*)>/gi;
  let m;
  while ((m = re.exec(text))) {
    const tag = m[1].toLowerCase();
    const attrs = m[2];
    const idM = attrs.match(/\bid\s*=\s*["']([^"']+)["']/i);
    if (!idM) continue;
    const id = idM[1];
    const aria = attrs.match(/\baria-label\s*=\s*["']([^"']+)["']/i);
    const title = attrs.match(/\btitle\s*=\s*["']([^"']+)["']/i);
    const name = attrs.match(/\bname\s*=\s*["']([^"']+)["']/i);
    const typeM = attrs.match(/\btype\s*=\s*["']([^"']+)["']/i);
    const type = (typeM?.[1] || (tag === 'button' ? 'button' : tag)).toLowerCase();
    if (type === 'hidden') continue;
    push(id, (aria || title || name)?.[1] || id, `${tag}:${type}`);
  }

  // label[for=id]
  const forRe = /<label\b[^>]*\bfor\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/label>/gi;
  while ((m = forRe.exec(text))) {
    const id = m[1];
    const lab = String(m[2]).replace(/<[^>]+>/g, '').trim();
    const hit = controls.find(c => c.id === id);
    if (hit && lab && hit.label === hit.id) hit.label = lab.slice(0, 40);
  }

  return controls;
}

module.exports = { extractHtmlControls };

/**
 * Fill Agent A page chrome from AgentCopy.
 */
(function (global) {
  function initAgentPage() {
    const C = global.AgentCopy;
    if (!C) return;

    const docTitle = document.getElementById('docTitle');
    const pageH1 = document.getElementById('pageH1');
    const pageLead = document.getElementById('pageLead');
    if (docTitle) docTitle.textContent = C.brand.pageTitleA;
    if (pageH1) {
      const badge = pageH1.closest('.agent-tool-page-title')
        ? ' <span class="agent-tool-badge">Agent</span>'
        : '';
      pageH1.innerHTML = C.brand.h1A + badge;
    }
    if (pageLead) {
      pageLead.innerHTML = C.lead.bulletsA.map(t => '<li>' + t + '</li>').join('');
    }

    const navA = document.getElementById('navAgentA');
    if (navA) navA.textContent = C.brand.navA;
  }

  global.AgentUiInit = { initAgentPage };
})(typeof window !== 'undefined' ? window : global);

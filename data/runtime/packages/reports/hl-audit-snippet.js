(() => {
  const more=[...document.querySelectorAll('button')].find(b=>/展开全部/.test(b.textContent));
  if (more) more.click();
  function audit() {
    const svg = document.querySelector('#strategy-mermaid svg');
    if (!svg) return { error: 'no svg' };
    const nodes = [...svg.querySelectorAll('g.node')];
    const edgePaths = [...svg.querySelectorAll('g.edgePaths path, .edgePath path')];
    const hlNodes = nodes.filter(n => n.classList.contains('strategy-hl')).map(n => n.getAttribute('data-id') || (n.id||'').replace(/^flowchart-/,'').replace(/-\d+$/,''));
    const phys = hlNodes.filter(id => !['Start','StrategySelect','Win','ModeExplore','ModeCompete','Env'].includes(id) && !/^(Mode|Win|Challenge)/i.test(id));
    const hlEdges = edgePaths.filter(p => p.classList.contains('strategy-hl')).length;
    const active = document.querySelector('.route-btn.active');
    const prio = {h:svg.querySelectorAll('path.prio-edge-high').length,m:svg.querySelectorAll('path.prio-edge-mid').length,l:svg.querySelectorAll('path.prio-edge-low').length,t:svg.querySelectorAll('path.prio-edge-trap').length,c:svg.querySelectorAll('path.prio-edge-confound').length};
    return {l:active?.textContent?.trim()||null,id:active?.dataset?.routeId,nodes:[...hlNodes].sort().join('|'),phys:phys.join(','),e:hlEdges,prio,sparse:phys.length<2||(hlEdges===0&&hlNodes.length<6)};
  }
  const out=[]; for (const btn of document.querySelectorAll('.route-btn')) { btn.click(); out.push(audit()); }
  const groups={}; out.forEach(o=>{ if(!/单变量/.test(o.l||'')) return; groups[o.nodes]=(groups[o.nodes]||[]).concat((o.l||'')+'#'+(o.id||'')); });
  return {title:document.title, sparse:out.filter(o=>o.sparse).map(o=>o.l), identicalSV:Object.values(groups).filter(g=>g.length>1), prio:out[0]?.prio, routes:out.map(o=>({l:o.l,id:o.id,sparse:o.sparse,e:o.e,phys:o.phys}))};
})()

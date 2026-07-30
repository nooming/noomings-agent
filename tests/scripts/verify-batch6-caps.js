const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '../../样本html');
const files = ['电容_介质与击穿.html', '电容_串并联.html', '电容_储能与充电.html'];
for (const f of files) {
  const s = fs.readFileSync(path.join(root, f), 'utf8');
  console.log('==', f);
  console.log('body', (s.match(/<body[^>]*>/) || [])[0]);
  console.log('winFormula', (s.match(/id="craftWinFormula">[^<]+/) || [])[0]);
  console.log('autoDeriveRemoved', !/seen\[c\]=true;setTimeout\(function\(\)\{show\(c\);\},380\)/.test(s));
  console.log('winHook', /__dvWinHooked/.test(s));
  console.log('timerDark', /body\.cap-dark #timerDisplay/.test(s));
  console.log('hasObsLabel', s.includes('观测读数'));
  console.log('spoilCapEq', /id="cap-formula"[\s\S]{0,160}C = ε₀/.test(s));
  console.log('spoilCh2Eq', s.includes('并联：Cp ='));
  console.log('spoilCh4Label', s.includes('E = ½CV²  &ensp;目标'));
  console.log('hasTargetEnergy', s.includes('目标储能：950'));
  console.log('spoilBd', s.includes('E = V/d 超过'));
  console.log('spoilDlgEr', s.includes('C = ε₀εᵣA/d 决定容量'));
  console.log('spoilDlgE', s.includes('储能公式：E = ½CV²'));
}

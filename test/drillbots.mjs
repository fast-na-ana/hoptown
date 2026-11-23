import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',protocolTimeout:600000,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p = await b.newPage(); await p.setViewport({width:480,height:270});
const errs=[]; p.on('pageerror', e => errs.push(e.message + ' ' + (e.stack||'').split('\n')[1]));
await p.goto('http://localhost:8123/index.html?test&nopreview', {waitUntil:'load'});
const r = await p.evaluate(async () => {
  document.getElementById('bots').value = 3; window.__speed = 6;
  document.querySelector('#map-sel [data-map="drill"]').click();
  document.querySelector('#mode-seg [data-m="tdm"]').click();
  await window.__start('offline');
  const g = window.__hoptown.game; g.forceInput = true; g.requestAfk(g.local.id, true);
  const t0 = g.time, maxY = {}, moved = {};
  const start = new Map(g.bots.map(b => [b.p.name, [...b.p.ms.pos]]));
  while (g.time - t0 < 90) { for (const b of g.bots) { maxY[b.p.name] = Math.max(maxY[b.p.name] || 0, b.p.ms.pos[1]); } await new Promise(r=>setTimeout(r,100)); }
  return { phase: g.match.phase, score: g.teamScore, maxY, kills: g.bots.map(b => `${b.p.name}:${b.p.kills}/${b.p.deaths}`).join(' ') };
});
console.log(JSON.stringify(r));
console.log('ERR', errs.slice(0, 5));
await b.close();

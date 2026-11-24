import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',protocolTimeout:600000,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p = await b.newPage(); await p.setViewport({width:1280,height:720});
const errs=[]; p.on('pageerror', e => errs.push(e.message + ' ' + (e.stack||'').split('\n')[1]));
await p.goto('http://localhost:8123/index.html?test&nopreview', {waitUntil:'load'});
const mode = process.argv[2] || 'plant';
const r = await p.evaluate(async (mode) => {
  document.getElementById('bots').value = 3; window.__speed = 4;
  document.querySelector(`#mode-seg [data-m="${mode}"]`).click();
  await window.__start('offline');
  const g = window.__hoptown.game; g.forceInput = true; g.helpShown = false; g.helpUntil = Infinity;
  if (g.plant) while (g.plant.ph !== 'live') await new Promise(r=>setTimeout(r,50));
  else await new Promise(r=>setTimeout(r,1500));
  window.__speed = 1;
  const L = g.local;
  const foes = [...g.players.values()].filter(q => q !== L && q.alive && (!g.teams || q.team !== L.team));
  g.kill(foes[0], L.id, 'rifle', true);
  await new Promise(r=>setTimeout(r,120));
  return { n: foes.length, money: L.money, streak: L.streak };
}, mode);
await p.screenshot({ path: `test/shots/killpop_${mode}.png` });
if (mode === 'plant') {
  await p.evaluate(async () => { const g = window.__hoptown.game, L = g.local; for (const q of [...g.players.values()].filter(q => q !== L && q.alive && q.team !== L.team).slice(0,2)) { g.kill(q, L.id, 'rifle', false); await new Promise(r=>setTimeout(r,150)); } });
  await new Promise(r=>setTimeout(r,200));
  await p.screenshot({ path: `test/shots/killpop_${mode}3.png` });
}
console.log(JSON.stringify(r), errs.slice(0,5));
await b.close();

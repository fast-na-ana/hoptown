import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',protocolTimeout:900000,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p = await b.newPage(); await p.setViewport({width:1280,height:720});
const errs=[]; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8123/index.html?test&nopreview', {waitUntil:'load'});
const r = await p.evaluate(async () => {
  document.getElementById('bots').value = 7;
  document.querySelector('#map-sel [data-map="maple"]').click();
  document.querySelector('#mode-seg [data-m="ctf"]').click();
  await window.__start('offline');
  const g = window.__hoptown.game; g.forceInput = true; g.helpShown = false; g.helpUntil = Infinity;
  g.local.afk = true; g.spawn(g.local);   // park the player so only bots play
  const log = [];
  const t0 = g.time; let last = '';
  while (g.time - t0 < 120) {
    const st = `${g.flags.A.state}/${g.flags.B.state} ${g.teamScore.A}-${g.teamScore.B}`;
    if (st !== last) { log.push(`${(g.time - t0).toFixed(0)}s ${st}`); last = st; }
    if (g.match.phase === 'end') break;
    await new Promise(r => setTimeout(r, 100));
  }
  return { log: log.slice(0, 40), score: g.teamScore, phase: g.match.phase };
});
console.log(JSON.stringify(r, null, 1));
console.log('ERR', errs.slice(0, 5));
await b.close();

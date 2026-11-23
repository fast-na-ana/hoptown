import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errs = [];
const p = await b.newPage(); await p.setViewport({width:1280,height:720});
p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
await p.goto('http://localhost:8123/index.html?test', {waitUntil:'load'});
await p.evaluate(() => { document.getElementById('bots').value = 6; document.getElementById('difficulty').value = 'hard'; window.__start('offline'); });
const r = await p.evaluate(async () => {
  const g = window.__hoptown.game;
  const wait = async (sec) => { const t0 = g.time; while (g.time - t0 < sec) await new Promise(r=>setTimeout(r,16)); };
  g.match.killLimit = 4; g.local.protectUntil = 1e9; // player invulnerable spectator-ish: keep him safe
  g.local.ms.pos = [-12, 6.5, -15.5];
  const log = [];
  let lastPhase = '';
  const t0 = g.time;
  while (g.time - t0 < 90) {
    if (g.match.phase !== lastPhase) { lastPhase = g.match.phase; log.push(`${g.time.toFixed(1)} ${lastPhase} r${g.match.round} ${g.ranking().map(p=>p.name+':'+p.kills).join(' ')}`); }
    if (g.match.round >= 2 && g.match.phase === 'play') break;
    g.local.protectUntil = g.time + 10;
    await wait(0.25);
  }
  return { log, wins: [...g.players.values()].map(p=>p.name+':'+p.wins).join(' '), feed: document.getElementById('killfeed').innerText.split('\n').slice(0,4) };
});
console.log(JSON.stringify(r, null, 1));
await p.screenshot({path:'test/shots/round.png'});
console.log('ERR', errs.filter(e=>!e.includes('404')));
await b.close();

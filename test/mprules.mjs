import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',protocolTimeout:600000,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errs = [];
async function open(name, map, mode) {
  const p = await b.newPage(); await p.setViewport({width:900,height:560});
  p.on('pageerror', e => errs.push(name + ': ' + (errs.length ? e.message : e.stack)));
  await p.goto('http://localhost:8123/index.html?test&local=1&nopreview', {waitUntil:'load'});
  await p.evaluate((n, map, mode) => { document.getElementById('name').value = n; document.getElementById('room').value = 'RULES'; document.getElementById('bots').value = 2;
    document.querySelector(`#map-sel [data-map="${map}"]`).click(); document.querySelector(`#mode-seg [data-m="${mode}"]`).click(); }, name, map, mode);
  await p.evaluate(() => window.__start('online'));
  return p;
}
const A = await open('Alice', 'sunstone', 'tdm');
await new Promise(r => setTimeout(r, 1500));
const B = await open('Bob', 'maple', 'ffa');
await new Promise(r => setTimeout(r, 7000));
const info = (p) => p.evaluate(() => { const g = window.__hoptown.game; return { me: g.local.name, host: g.isHost, map: g.mapId, mode: g.mode, team: g.local.team, rules: g.rules, kl: g.match.killLimit, rt: g.match.roundTime, roster: [...g.players.values()].map(p => `${p.name}:${p.team || '-'}`).join(' ') }; });
console.log('A', JSON.stringify(await info(A)));
console.log('B', JSON.stringify(await info(B)));
// whoever is host switches to maple CTF
const hostPage = (await info(A)).host ? A : B;
await hostPage.evaluate(() => window.__hoptown.game.applyMatchSettings('maple', 'ctf', true, { time: 180, limit: 7, respawn: 2 }));
await new Promise(r => setTimeout(r, 4000));
console.log('after switch A', JSON.stringify(await info(A)));
console.log('after switch B', JSON.stringify(await info(B)));
console.log('ERR', errs);
await b.close();

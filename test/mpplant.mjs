import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',protocolTimeout:600000,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errs = [];
async function open(name) {
  const p = await b.newPage(); await p.setViewport({width:640,height:360});
  p.on('pageerror', e => errs.push(name + ': ' + e.message + ' ' + (e.stack || '').split('\n')[1]));
  await p.goto('http://localhost:8123/index.html?test&local=1&nopreview', {waitUntil:'load'});
  await p.evaluate((n) => { document.getElementById('name').value = n; document.getElementById('room').value = 'PLNT'; document.getElementById('bots').value = 2;
    document.querySelector('#mode-seg [data-m="plant"]').click(); }, name);
  await p.evaluate(() => window.__start('online'));
  await p.evaluate(() => { const g = window.__hoptown.game; g.forceInput = true; g.helpShown = false; g.helpUntil = Infinity; });
  return p;
}
const A = await open('Alice');
await new Promise(r => setTimeout(r, 1500));
const B = await open('Bob');
const st = (p) => p.evaluate(() => { const g = window.__hoptown.game, P = g.plant; return { me: g.local.name, host: g.isHost, ph: P && P.ph, r: P && P.round, sc: P && P.score, atk: P && P.atk, ch: P && P.ch.s, carrier: P && P.ch.c && g.players.get(P.ch.c) ? g.players.get(P.ch.c).name : null, team: g.local.team, money: g.local.money, inv: g.local.inv, weapon: g.local.weapon, alive: g.local.alive }; });
// wait until a buy phase is running on the client
for (let i = 0; i < 60; i++) { const s = await st(B); if (s.ph === 'buy' && s.alive) break; await new Promise(r => setTimeout(r, 500)); }
console.log('A', JSON.stringify(await st(A)));
console.log('B', JSON.stringify(await st(B)));
const sA = await st(A);
const C = sA.host ? B : A, H = sA.host ? A : B;
const cname = (await st(C)).me;
console.log('client is', cname);
await C.evaluate(async () => { const g = window.__hoptown.game; g.panelOpen = 'buy'; g.input.pressed.add('Digit5'); });
await new Promise(r => setTimeout(r, 1500));
console.log('client after buy', JSON.stringify(await st(C)));
const hostView = await H.evaluate((n) => { const g = window.__hoptown.game; const c = [...g.players.values()].find(p => p.name === n); return c ? { money: c.money, inv: c.inv } : null; }, cname);
console.log('host sees client', JSON.stringify(hostView));
// make the client an attacker carrying the charge (host side), then plant at site A from the client
const ready = await H.evaluate((n) => { const g = window.__hoptown.game, P = g.plant; const c = [...g.players.values()].find(p => p.name === n); if (c.team !== P.atk) { g.setTeam(c, P.atk); g._sendRoster(); } P.ch = { s: 'carried', c: c.id, p: null, site: null }; P._send(); return c.team; }, cname);
console.log('ready', ready);
for (let i = 0; i < 40; i++) { const s = await st(C); if (s.ph === 'live' && s.alive) break; await new Promise(r => setTimeout(r, 500)); }
const r = await C.evaluate(async () => {
  const g = window.__hoptown.game, L = g.local, P = g.plant;
  const site = g.map.plant.sites[0];
  const wait = async (s) => { const t0 = g.time; while (g.time - t0 < s) await new Promise(r=>setTimeout(r,16)); };
  L.ms.pos = [site.mark[0] + 1, 0.2, site.mark[2] + 1]; L.ms.vel = [0, 0, 0]; L.protectUntil = 1e9;
  await wait(0.4);
  const avail = P.actionAvailable(L);
  g.input.keys.add('KeyF');
  await wait(3.8);
  g.input.keys.delete('KeyF');
  await wait(1.0);
  return { avail, ph: P.ph, ch: P.ch, team: L.team, atk: P.atk };
});
console.log('plant from client', JSON.stringify(r));
console.log('host after plant', JSON.stringify(await st(H)));
console.log('ERR', [...new Set(errs)].slice(0, 8));
await b.close();

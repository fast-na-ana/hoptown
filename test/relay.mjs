// relay fallback: WebRTC disabled (?nop2p) — two players on a local MQTT broker must still share one
// room: one host, state + events flowing, lowercase code typed by the joiner
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',protocolTimeout:600000,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errs = [];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function open(name, code, map) {
  const p = await b.newPage(); await p.setViewport({width:1280,height:720});
  p.on('pageerror', e => errs.push(name + ': ' + e.message + ' ' + (e.stack || '').split('\n')[1]));
  await p.goto('http://localhost:8123/index.html?test&nopreview&nop2p&relay=' + encodeURIComponent('ws://localhost:9001'), {waitUntil:'load'});
  await p.evaluate((n, code, map) => { document.getElementById('name').value = n; const r = document.getElementById('room'); r.value = code; r.dispatchEvent(new Event('input')); document.getElementById('bots').value = 1;
    document.querySelector('#mode-seg [data-m="tdm"]').click(); document.querySelector(`#map-sel [data-map="${map}"]`).click(); }, name, code, map);
  await p.evaluate(() => window.__start('online'));
  await p.evaluate(() => { const g = window.__hoptown.game; g.forceInput = true; g.helpShown = false; g.helpUntil = Infinity; });
  return p;
}
const st = (p) => p.evaluate(() => { const g = window.__hoptown.game; const h = g.players.get(g.hostId);
  return { me: g.local.name, room: g.roomCode, host: g.isHost, hostName: h ? h.name : '?', map: g.mapId, players: [...g.players.values()].map(q => q.name + (q.isBot ? '(b)' : '')).join(','), info: g.net.info() }; });
const A = await open('Alice', 'RELAY7', 'saltworks');
await sleep(2500);
const B = await open('Bob', 'relay7', 'maple');      // lowercase on purpose
await sleep(6000);
const sa = await st(A), sb = await st(B);
console.log('A', JSON.stringify(sa)); console.log('B', JSON.stringify(sb));
// movement + a kill event across the relay
const moved = await A.evaluate(async () => { const g = window.__hoptown.game; g.local.ms.pos = [10, 0, 40]; await new Promise(r => setTimeout(r, 1500)); return g.local.ms.pos.map(v => +v.toFixed(1)); });
const seen = await B.evaluate(() => { const g = window.__hoptown.game; const a = [...g.players.values()].find(p => p.name === 'Alice'); const s = a && a.snaps[a.snaps.length - 1]; return s ? s.p : null; });
console.log('A at', JSON.stringify(moved), 'B sees A at', JSON.stringify(seen));
await B.evaluate(() => { const g = window.__hoptown.game; g.forceInput = false; document.dispatchEvent(new Event('pointerlockchange')); });
await sleep(1200);
await B.screenshot({ path: 'test/shots/relay_pause.png' });
console.log('B status:', await B.evaluate(() => document.getElementById('net-status').textContent + ' | ' + document.getElementById('plist').innerText.replace(/\s+/g, ' ')));
console.log('ERR', [...new Set(errs)].slice(0, 8));
await b.close();

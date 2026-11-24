// Saltworks: viewpoints + blast doors, glass and panels
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',protocolTimeout:600000,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p = await b.newPage(); await p.setViewport({width:1280,height:720});
const errs=[]; p.on('pageerror', e => errs.push(e.message + ' ' + (e.stack||'').split('\n')[1]));
await p.goto('http://localhost:8123/index.html?test&nopreview', {waitUntil:'load'});
await p.evaluate(async () => {
  document.getElementById('bots').value = 1;
  document.querySelector('#map-sel [data-map="saltworks"]').click();
  document.querySelector('#mode-seg [data-m="ffa"]').click();
  await window.__start('offline');
  const g = window.__hoptown.game, L = g.local; g.forceInput = true; g.helpShown = false; g.helpUntil = Infinity; L.protectUntil = 1e9;
  g.bots[0].think = () => {}; g.bots[0].step = () => {}; g.bots[0].p.ms.pos = [0, 0, 44];
  window.__wait = async (s) => { const t0 = g.time; while (g.time - t0 < s) await new Promise(r=>setTimeout(r,16)); };
  window.__look = async (pos, at, s = 0.5) => { L.ms.pos = [...pos]; L.ms.vel = [0, 0, 0]; const dx = at[0] - pos[0], dz = at[2] - pos[2], dy = at[1] - pos[1] - 1.6; g.view.yaw = Math.atan2(-dx, -dz); g.view.pitch = Math.atan2(dy, Math.hypot(dx, dz)); await window.__wait(s); };
  while (g.match.phase !== 'play') await new Promise(r=>setTimeout(r,50));
});
const views = [
  ['mid', [0, 0, 19], [0, 0, -12]], ['midN', [-1, 0, -17.5], [0, 0, 10]], ['siteA', [32, 0, 5], [36, 1, -12]], ['gantry', [29, 3.4, -17.5], [38, 0, 0]],
  ['siteB', [-44.8, 0, 7], [-36, -1, -8]], ['bback', [-40.5, 0, -13], [-35, -1, 2]], ['garden', [14.5, -0.6, -4.2], [25, 0, -10]], ['office', [11, 0, -18.5], [11, 0, 0]],
];
for (const [n, pos, at] of views) { await p.evaluate((pos, at) => window.__look(pos, at), pos, at); await p.screenshot({ path: `test/shots/salt_${n}.png` }); }
const r = await p.evaluate(async () => {
  const g = window.__hoptown.game, L = g.local, out = {};
  // blast door B: stand at the link-side switch and use it
  await window.__look([-21.6, -0.75, -6.5], [-23, 0.5, -4.2]);
  out.prompt = document.getElementById('prompt') ? document.getElementById('prompt').textContent : '';
  const dB = g.brk.byId.get('doorB');
  out.used = g.brk.useSwitch(L); await window.__wait(1.0);
  out.doorState = dB.state; out.doorSolid = !dB.boxes[0].off;
  const n = g.map.nav, i = n.index['lk_d'], j = n.index['b_ld'];
  out.edgeBlocked = g.brk.edgeBlocked(i, j);
  // shoot the closed door 500 HP
  g.setLoadout(L, { primary: 'rifle', secondary: 'pistol' }); g.spawn(L);
  await window.__look([-19, -0.75, -4.2], [-23, 0.8, -4.2], 0.6);
  for (let k = 0; k < 40 && dB.state !== 'broken'; k++) { L.ammo = 30; g.input.mouseL = true; await window.__wait(0.15); }
  g.input.mouseL = false; out.doorAfterShots = dB.state;
  // glass: from mid, one shot
  const gl = g.brk.byId.get('window');
  await window.__look([11, -0.75, -8], [11, 1.6, -14.7], 0.4);
  L.ammo = 30; g.input.mouseL = true; await window.__wait(0.15); g.input.mouseL = false; await window.__wait(0.2);
  out.glass = gl.state;
  // panel A: grenades
  const pa = g.brk.byId.get('panelA');
  g.brk.blast([24.5, 1, -2.2], 6.8, 260); out.panelHp1 = pa.hp; g.brk.blast([24.5, 1, -2.2], 6.8, 260); out.panelA = pa.state;
  // reset
  g.brk.resetAll(); out.reset = g.brk.list.map(b => b.state).join(',');
  return out;
});
await p.evaluate(() => window.__look([-21.6, -0.75, -6.5], [-23, 0.5, -4.2]));
await p.screenshot({ path: 'test/shots/salt_switch.png' });
console.log(JSON.stringify(r));
console.log('ERR', errs.slice(0, 5));
await b.close();

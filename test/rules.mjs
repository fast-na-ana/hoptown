import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',protocolTimeout:600000,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p = await b.newPage(); await p.setViewport({width:1280,height:720});
const errs=[]; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
await p.goto('http://localhost:8123/index.html?test&nopreview', {waitUntil:'load'});
await p.evaluate(() => localStorage.clear());
await p.reload({waitUntil:'load'});
// menu: CTF, step rules
const menu = await p.evaluate(() => {
  document.querySelector('#map-sel [data-map="maple"]').click();
  document.querySelector('#mode-seg [data-m="ctf"]').click();
  const click = (k, d, n) => { for (let i = 0; i < n; i++) document.querySelector(`#rules button[data-k="${k}"][data-d="${d}"]`).click(); };
  click('time', '-1', 4);   // 420 -> 120
  click('limit', '1', 1);   // 3 -> 5
  click('respawn', '-1', 2); // 3 -> 1
  return [...document.querySelectorAll('#rules .step b')].map(b => b.textContent);
});
console.log('menu rules', menu);
await p.screenshot({ path: 'test/shots/rules-menu.png' });
const r = await p.evaluate(async () => {
  document.getElementById('bots').value = 3;
  await window.__start('offline');
  const g = window.__hoptown.game; g.forceInput = true; g.helpShown = false; g.helpUntil = Infinity;
  while (g.match.phase !== 'play') await new Promise(r=>setTimeout(r,50));
  const out = { rules: g.rules, kl: g.match.killLimit, rt: g.match.roundTime, t: Math.round(g.match.t) };
  // respawn time check
  g.local.protectUntil = 0; g.damage(g.local, 999, null, 'rifle');
  out.respawnIn = +(g.local.respawnAt - g.time).toFixed(2);
  const t0 = g.time; while (!g.local.alive && g.time - t0 < 5) await new Promise(r=>setTimeout(r,30));
  out.respawnedAfter = +(g.time - t0).toFixed(2);
  return out;
});
console.log('game', JSON.stringify(r));
// fps + flagbar positions
const pos = await p.evaluate(() => { const a = document.getElementById('fps').getBoundingClientRect(), f = document.getElementById('flagbar').getBoundingClientRect(); return { fps: [a.top, a.bottom], flag: [f.top, f.bottom], overlap: !(a.bottom < f.top || a.top > f.bottom) }; });
console.log('hud', JSON.stringify(pos));
// grenade throw animation mid-way
const th = await p.evaluate(async () => {
  const g = window.__hoptown.game; g.local.protectUntil = 1e9;
  g.local.ms.pos = [0, 0, -8]; g.local.prevPos = [0, 0, -8]; g.view.yaw = Math.PI; g.view.pitch = 0.1;
  await new Promise(r=>setTimeout(r,200));
  const n0 = g.projectiles.length;
  g.input.pressed.add('KeyG');
  const t0 = g.time; while (g.time - t0 < 0.06) await new Promise(r=>requestAnimationFrame(r));
  const pr = g.projectiles[g.projectiles.length - 1];
  return { spawnedImmediately: g.projectiles.length > n0, hidden: pr && !pr.mesh.visible, rig: g.vm.rig.g.visible, nade: g.vm.rig.nade.visible };
});
console.log('throw', JSON.stringify(th));
await p.screenshot({ path: 'test/shots/throw1.png' });
await p.evaluate(async () => { const g = window.__hoptown.game; const t0 = g.time; while (g.time - t0 < 0.07) await new Promise(r=>requestAnimationFrame(r)); });
await p.screenshot({ path: 'test/shots/throw2.png' });
const after = await p.evaluate(async () => { const g = window.__hoptown.game; const t0 = g.time; while (g.time - t0 < 0.4) await new Promise(r=>requestAnimationFrame(r)); const pr = g.projectiles[g.projectiles.length - 1]; return { rig: g.vm.rig.g.visible, projVisible: pr ? pr.mesh.visible : null }; });
console.log('after', JSON.stringify(after));
// pause menu rules for host
const pause = await p.evaluate(async () => { const g = window.__hoptown.game; g.forceInput = false; document.dispatchEvent(new Event('pointerlockchange')); await new Promise(r=>setTimeout(r,300)); return [...document.querySelectorAll('#pause-rules .step b')].map(b => b.textContent); });
await p.screenshot({ path: 'test/shots/rules-pause.png' });
console.log('pause rules', pause);
console.log('ERR', errs.slice(0, 6));
await b.close();

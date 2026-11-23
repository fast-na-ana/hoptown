import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p = await b.newPage(); await p.setViewport({width:1280,height:720});
const errs=[]; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8123/index.html?test', {waitUntil:'load'});
await p.evaluate(() => { document.getElementById('bots').value = 2; window.__start('offline'); });
await p.evaluate(() => { window.__hoptown.game.forceInput = true; });
const shot = async (name) => p.screenshot({path:`test/shots/${name}.png`});
await p.evaluate(async () => { const g = window.__hoptown.game; while (g.match.phase !== 'play') await new Promise(r=>setTimeout(r,50)); });
const r = await p.evaluate(async () => {
  const g = window.__hoptown.game, L = g.local;
  const wait = async (sec) => { const t0 = g.time; while (g.time - t0 < sec) await new Promise(r=>setTimeout(r,16)); };
  for (const bt of g.bots) { bt.think = () => {}; bt.step = () => {}; }
  const B = g.bots[0].p; B.ms.pos = [0,0,6]; B.protectUntil = 0;
  g.bots[1].p.ms.pos = [25,0,-20];
  const aimAt = (yo) => { const e = g.eyeOf(L), t = B.ms.pos; const dx=t[0]-e[0], dy=t[1]+yo-e[1], dz=t[2]-e[2]; g.view.yaw=Math.atan2(-dx,-dz); g.view.pitch=Math.atan2(dy,Math.hypot(dx,dz)); };
  const out = {};
  // out of range quick knife: no kill
  L.ms.pos = [0,0,9.5]; aimAt(1); g.input.pressed.add('KeyV'); await wait(0.6);
  out.farKnife = { alive: B.alive, hp: B.hp };
  // in range quick knife: one-hit kill
  L.ms.pos = [0,0,7.6]; aimAt(1); g.input.pressed.add('KeyV'); await wait(0.15);
  out.nearKnife = { alive: B.alive, kills: L.kills };
  // equipped knife slash
  await wait(3.3); B.ms.pos = [0,0,6]; B.protectUntil = 0;
  g.input.pressed.add('Digit3'); await wait(0.3);
  out.weapon = L.weapon;
  L.ms.pos = [0.4,0,7.7]; aimAt(1.2); g.input.mouseL = true; await wait(0.2); g.input.mouseL = false;
  out.slash = { alive: B.alive, kills: L.kills };
  out.feed = document.getElementById('killfeed').innerText.slice(0, 80);
  return out;
});
console.log(JSON.stringify(r));
// screenshots: knife mid-slash
await p.evaluate(async () => { const g = window.__hoptown.game; g.view.yaw = 0.6; g.view.pitch = 0; g.input.mouseL = true; const t0=g.time; while (g.time-t0<0.12) await new Promise(r=>setTimeout(r,16)); g.input.mouseL=false; });
await shot('knife');
// rifle hip
await p.evaluate(async () => { const g = window.__hoptown.game; g.local.ms.pos=[-14,0.15,-14]; g.view.yaw = Math.PI*0.75; g.view.pitch=-0.05; g.input.pressed.add('Digit1'); const t0=g.time; while (g.time-t0<0.6) await new Promise(r=>setTimeout(r,16)); });
await shot('rifle-hip');
await p.evaluate(async () => { const g = window.__hoptown.game; g.input.mouseR = true; const t0=g.time; while (g.time-t0<0.5) await new Promise(r=>setTimeout(r,16)); });
await shot('rifle-ads');
await p.evaluate(async () => { const g = window.__hoptown.game; g.input.mouseR = false; g.local.mag.rifle = 10; g.input.pressed.add('KeyR'); const t0=g.time; while (g.time-t0<0.85) await new Promise(r=>setTimeout(r,16)); });
await shot('rifle-reload');
await p.evaluate(async () => { const g = window.__hoptown.game; const t0=g.time; while (g.time-t0<1.5) await new Promise(r=>setTimeout(r,16)); g.input.pressed.add('Digit2'); const t1=g.time; while (g.time-t1<0.6) await new Promise(r=>setTimeout(r,16)); });
await shot('pistol-hip');
await p.evaluate(async () => { const g = window.__hoptown.game; g.input.mouseR = true; const t0=g.time; while (g.time-t0<0.5) await new Promise(r=>setTimeout(r,16)); });
await shot('pistol-ads');
await p.evaluate(async () => { const g = window.__hoptown.game; g.input.mouseR = false; g.input.pressed.add('KeyQ'); const t0=g.time; while (g.time-t0<0.3) await new Promise(r=>setTimeout(r,16)); });
await shot('blink-active');
console.log('ERR', errs);
await b.close();

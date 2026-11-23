import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p = await b.newPage(); await p.setViewport({width:1280,height:720});
const errs=[]; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8123/index.html?test', {waitUntil:'load'});
await p.evaluate(() => { document.getElementById('bots').value = 4; window.__start('offline'); });
await p.evaluate(async () => {
  const g = window.__hoptown.game; g.forceInput = true; g.helpShown = false; g.helpUntil = Infinity;
  while (g.match.phase !== 'play') await new Promise(r=>setTimeout(r,50));
  const { stepMovement, emptyInput } = window.__mods;
  const modes = ['run', 'strafe', 'crouch', 'jump'];
  g.bots.forEach((bt, i) => {
    bt.think = () => {};
    bt.p.ms.pos = [-6 + i * 4, 0, -1.5 + (i % 2) * 0.5]; bt.p.protectUntil = 1e9;
    let t = 0;
    bt.step = (dt) => { t += dt; const inp = emptyInput(); const m = modes[i];
      inp.yaw = m === 'strafe' ? 0 : Math.PI / 2 + 0.3; bt.p.yaw = m === 'strafe' ? -0.4 : Math.PI / 2 + 0.3;
      if (m === 'run') { inp.fwd = Math.sin(t) > -0.6 ? 1 : -1; }
      if (m === 'strafe') { inp.right = Math.sin(t * 1.5) > 0 ? 1 : -1; }
      if (m === 'crouch') { inp.fwd = 1; inp.crouch = true; }
      if (m === 'jump') { inp.fwd = 0.5; inp.jump = true; }
      stepMovement(bt.p.ms, inp, dt, g.world);
      // keep them in a box
      for (const k of [0, 2]) if (Math.abs(bt.p.ms.pos[k] - (k === 0 ? -6 + i * 4 : -1.5)) > 2.5) { bt.p.ms.pos[k] = k === 0 ? -6 + i * 4 : -1.5; }
    };
  });
  g.local.ms.pos = [0, 0, 8]; g.local.protectUntil = 1e9; g.view.yaw = 0; g.view.pitch = -0.12;
  g.switchWeapon(g.local, 'knife');
});
for (let i = 0; i < 3; i++) {
  await new Promise(r=>setTimeout(r,700));
  await p.screenshot({path:`test/shots/anim${i}.png`});
}
console.log('ERR', errs);
await b.close();

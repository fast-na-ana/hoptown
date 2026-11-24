// walk straight onto each fixed staircase from the floor in front of it
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',protocolTimeout:600000,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const cases = [['maple', [-5.0, 0.15, -19.0], [1, 0, 0], 3.3], ['sunstone', [-9.1, 0, 6.3], [0, 0, 1], 3.5]];
for (const [map, start, dir, want] of cases) {
  const p = await b.newPage(); await p.setViewport({width:800,height:450});
  await p.goto('http://localhost:8123/index.html?test&nopreview', {waitUntil:'load'});
  const r = await p.evaluate(async (map, start, dir) => {
    document.getElementById('bots').value = 0;
    document.querySelector('#mode-seg [data-m="ffa"]').click();
    document.querySelector(`#map-sel [data-map="${map}"]`).click();
    await window.__start('offline');
    const g = window.__hoptown.game; g.forceInput = true;
    await new Promise(r => setTimeout(r, 800));
    const L = g.local; L.ms.pos = [...start]; L.ms.vel = [0, 0, 0];
    let best = 0, by = 0; for (let k = 0; k < 64; k++) { const y = k / 64 * Math.PI * 2, f = g.forward(y, 0), d = f[0] * dir[0] + f[2] * dir[2]; if (d > best) { best = d; by = y; } }
    g.view.yaw = by; g.view.pitch = 0;
    g.input.keys.add('KeyW');
    let maxY = 0; for (let i = 0; i < 30; i++) { await new Promise(r => setTimeout(r, 100)); maxY = Math.max(maxY, L.ms.pos[1]); }
    return { maxY: +maxY.toFixed(2), end: L.ms.pos.map(v => +v.toFixed(1)) };
  }, map, start, dir);
  console.log(map, JSON.stringify(r), r.maxY >= want ? 'OK' : 'FAIL');
  await p.close({ runBeforeUnload: false });
}
await b.close();

import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',protocolTimeout:300000,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p = await b.newPage(); await p.setViewport({width:1280,height:720});
p.on('pageerror', e => console.log('pageerror', e.message));
await p.goto('http://localhost:8123/index.html?test&nopreview', {waitUntil:'load'});
await p.evaluate(() => { document.getElementById('bots').value = 9; window.__start('offline'); });
const r = await p.evaluate(async () => {
  const g = window.__hoptown.game; g.forceInput = true; g.local.protectUntil = 1e9;
  while (g.match.phase !== 'play') await new Promise(r=>setTimeout(r,50));
  // instrument
  const upd = [], rnd = [], calls = [], tris = [];
  const ou = g.update.bind(g), or = g.render.bind(g);
  g.update = (dt) => { const t = performance.now(); ou(dt); upd.push(performance.now() - t); };
  g.render = () => { const t = performance.now(); g.renderer.info.reset(); or(); rnd.push(performance.now() - t); calls.push(g.renderer.info.render.calls); tris.push(g.renderer.info.render.triangles); };
  g.renderer.info.autoReset = false;
  g.local.ms.pos = [0, 6.5, 0];
  g.input.mouseL = true; // spray to create effects
  const t0 = g.time; while (g.time - t0 < 6) { g.local.protectUntil = g.time + 5; await new Promise(r=>setTimeout(r,16)); if (g.local.mag.rifle < 3) g.local.mag.rifle = 30; }
  g.input.mouseL = false;
  const stat = a => { const s = [...a].sort((x,y)=>x-y); return { avg: +(a.reduce((x,y)=>x+y,0)/a.length).toFixed(2), p95: +s[Math.floor(s.length*0.95)].toFixed(2), max: +s[s.length-1].toFixed(2) }; };
  let meshes = 0; g.scene.traverse(o => { if (o.isMesh || o.isLine || o.isPoints || o.isSprite) meshes++; });
  let vmMeshes = 0; g.vm.scene.traverse(o => { if (o.isMesh) vmMeshes++; });
  return { frames: upd.length, updateMs: stat(upd), renderMs: stat(rnd), drawCalls: stat(calls), triangles: stat(tris), sceneObjects: meshes, vmMeshes, programs: g.renderer.info.programs.length };
});
console.log(JSON.stringify(r, null, 1));
await b.close();

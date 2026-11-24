// real (WebRTC) transport loads its signalling networks and the game starts without errors
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',protocolTimeout:600000,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p = await b.newPage(); await p.setViewport({width:1280,height:720});
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8123/index.html?test&nopreview', {waitUntil:'load'});
const r = await p.evaluate(async () => {
  document.getElementById('room').value = 'SMOKE';
  await window.__start('online');
  const g = window.__hoptown.game;
  await new Promise(r => setTimeout(r, 3000));
  return { started: !!g, net: g && g.net && g.net.info(), host: g && g.isHost, status: g && g.netStatus() };
});
console.log(JSON.stringify(r)); console.log('ERR', errs.slice(0, 5));
await b.close();

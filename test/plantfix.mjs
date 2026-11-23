import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',protocolTimeout:600000,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p = await b.newPage(); await p.setViewport({width:1280,height:720});
const errs=[]; p.on('pageerror', e => errs.push(e.message + ' ' + (e.stack||'').split('\n')[1]));
await p.goto('http://localhost:8123/index.html?test&nopreview', {waitUntil:'load'});
// controls tab: rebind crouch to Ctrl -> warning shows; reset
const binds = await p.evaluate(async () => {
  document.querySelector('.tab[data-tab="controls"]').click();
  const btn = document.querySelector('.kb[data-id="crouch"][data-slot="1"]'); btn.click();
  document.dispatchEvent(new KeyboardEvent('keydown', { code: 'ControlLeft', bubbles: true }));
  const warn = document.getElementById('binds-warn').textContent;
  const label = document.querySelector('.kb[data-id="crouch"][data-slot="1"]').textContent;
  document.getElementById('binds-reset').click();
  return { label, warn: warn.slice(0, 40), rows: document.querySelectorAll('.bind').length, after: document.querySelector('.kb[data-id="crouch"][data-slot="0"]').textContent };
});
console.log('binds', JSON.stringify(binds));
await p.screenshot({ path: 'test/shots/binds.png' });
const r = await p.evaluate(async () => {
  document.getElementById('bots').value = 3; window.__speed = 4;
  document.querySelector('#mode-seg [data-m="plant"]').click();
  await window.__start('offline');
  const g = window.__hoptown.game; g.forceInput = true; g.helpShown = false; g.helpUntil = Infinity;
  while (g.plant.ph !== 'buy') await new Promise(r=>setTimeout(r,50));
  window.__speed = 1;
  const L = g.local; L.money = 4000;
  await new Promise(r=>setTimeout(r,300));
  g.setPanel('buy'); await new Promise(r=>setTimeout(r,200));
  // click armour (index 5) and rifle (index 0) with the mouse
  document.querySelector('.gp-item[data-i="5"]').click(); await new Promise(r=>setTimeout(r,150));
  document.querySelector('.gp-item[data-i="0"]').click(); await new Promise(r=>setTimeout(r,150));
  const bought = { money: L.money, inv: { ...L.inv }, weapon: L.weapon, armourRow: getComputedStyle(document.getElementById('armour-row')).display, ar: document.getElementById('ar-num').textContent };
  document.querySelector('.gp-close').click(); await new Promise(r=>setTimeout(r,150));
  bought.panelClosed = g.panelOpen === null;
  // make me the carrier
  g.plant.ch = { s: 'carried', c: L.id, p: null, site: null };
  await new Promise(r=>setTimeout(r,300));
  bought.chargeSlot = !!document.querySelector('.slot.charge');
  while (g.plant.ph !== 'live') await new Promise(r=>setTimeout(r,50));
  g.input.pressed.add('KeyX'); await new Promise(r=>setTimeout(r,300));
  bought.afterDrop = g.plant.ch.s; bought.chargeSlotAfter = !!document.querySelector('.slot.charge');
  // armour depletes under fire
  L.protectUntil = 0; g.damage(L, 40, null, 'rifle'); await new Promise(r=>setTimeout(r,200));
  bought.afterHit = { hp: L.hp, armour: L.armour, ar: document.getElementById('ar-num').textContent };
  return bought;
});
console.log('plant', JSON.stringify(r));
await p.screenshot({ path: 'test/shots/plantfix.png' });
console.log('ERR', errs.slice(0, 5));
await b.close();

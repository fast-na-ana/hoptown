// Live, slowly orbiting view of the map for the main menu.
import * as THREE from 'three';
import { World } from './physics.js';
import { buildMap } from './maps/index.js';
import { Avatar } from './avatar.js';
import { COLORS } from './config.js';

export class MenuPreview {
  constructor(canvas) {
    this.canvas = canvas;
    this.running = false;
    this.mapId = 'maple';
  }

  start() {
    if (this.running) return;
    this.running = true;
    if (this.used) { const c = this.canvas.cloneNode(false); this.canvas.replaceWith(c); this.canvas = c; }
    this.used = true;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'low-power' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.shadowMap.enabled = true;
    const scene = this.scene = new THREE.Scene();
    this.map = buildMap(this.mapId, new World(), scene);
    const e = this.map.env;
    scene.background = new THREE.Color(e.mid);
    scene.fog = new THREE.Fog(e.fog, 60, 170);
    scene.add(new THREE.HemisphereLight(e.hemiSky, e.hemiGround, 1.25));
    const sun = new THREE.DirectionalLight(e.sun, e.sunI);
    sun.position.set(28, 44, 22); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -55, right: 55, top: 55, bottom: -55, near: 1, far: 160 });
    sun.shadow.bias = -0.0006;
    scene.add(sun);
    // a few idle hop-bots for life
    this.bots = [];
    const spots = this.map.spawns.filter((_, i) => i % 3 === 0).slice(0, 5).map(s => [s[0], s[1], s[2], Math.random() * 6]);
    spots.forEach(([x, y, z, yaw], i) => {
      const a = new Avatar(COLORS[(i + 1) % COLORS.length], ['Sprocket', 'Rivet', 'Nova', 'Bolt', 'Pixel'][i]);
      a.tag.visible = false;
      scene.add(a.root);
      this.bots.push({ a, pos: [x, y, z], yaw, ph: Math.random() * 6 });
    });
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.5, 300);
    this.t = Math.random() * 10;
    this.last = performance.now();
    this._resize();
    this._onResize = () => this._resize();
    window.addEventListener('resize', this._onResize);
    const loop = (now) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
      this._resize();
      this.t += dt * 0.07;
      const R = this.map.preview.radius, cam = this.camera;
      cam.position.set(Math.cos(this.t) * R, this.map.preview.height + Math.sin(this.t * 1.7) * 3, Math.sin(this.t) * R);
      cam.lookAt(0, 1.5, 0);
      for (const b of this.bots) {
        b.ph += dt;
        b.a.update(dt, { pos: b.pos, yaw: b.yaw + Math.sin(b.ph * 0.6) * 0.5, pitch: Math.sin(b.ph * 0.4) * 0.15, vel: [0, 0, 0], crouched: false, airborne: false, sliding: false, alive: true, weapon: 'rifle' });
      }
      this.renderer.render(this.scene, cam);
    };
    this.raf = requestAnimationFrame(loop);
  }

  _resize() {
    const w = this.canvas.clientWidth | 0, h = this.canvas.clientHeight | 0;
    if (!w || !h) return;
    if (this._w === w && this._h === h) return;
    this._w = w; this._h = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  setMap(id) {
    if (id === this.mapId && this.running) return;
    this.mapId = id;
    if (this.running) { this.stop(); this.start(); }
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this._onResize);
    this.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { const m = o.material; (Array.isArray(m) ? m : [m]).forEach(x => { if (x.map) x.map.dispose(); x.dispose(); }); } });
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
    this.renderer = null; this.scene = null; this._w = this._h = 0;
  }
}

// Axis-aligned box world: collision, raycasts and a small uniform grid for speed.

export class World {
  constructor() {
    this.boxes = [];      // {min:[x,y,z], max:[x,y,z], tag}
    this.pads = [];       // jump pads {min,max, vel:[x,y,z]}
    this.cell = 4;
    this.grid = new Map();
  }

  add(min, max, tag = 'solid') {
    const b = { min: [...min], max: [...max], tag, id: this.boxes.length };
    this.boxes.push(b);
    return b;
  }

  build() {
    this.grid.clear();
    for (const b of this.boxes) {
      const [x0, z0, x1, z1] = this._cellRange(b.min[0], b.min[2], b.max[0], b.max[2]);
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
        const k = x * 4096 + z;
        let arr = this.grid.get(k);
        if (!arr) this.grid.set(k, (arr = []));
        arr.push(b);
      }
    }
    this._stamp = 0;
    this._marks = new Uint32Array(this.boxes.length);
  }

  _cellRange(ax, az, bx, bz) {
    const c = this.cell;
    return [Math.floor(ax / c), Math.floor(az / c), Math.floor(bx / c), Math.floor(bz / c)];
  }

  // Collect boxes overlapping an XZ rectangle (deduped).
  query(ax, az, bx, bz, out = []) {
    out.length = 0;
    const stamp = ++this._stamp;
    const [x0, z0, x1, z1] = this._cellRange(ax, az, bx, bz);
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      const arr = this.grid.get(x * 4096 + z);
      if (!arr) continue;
      for (const b of arr) {
        if (this._marks[b.id] === stamp) continue;
        this._marks[b.id] = stamp;
        out.push(b);
      }
    }
    return out;
  }

  // Does an AABB overlap any solid box?
  overlaps(min, max, eps = 1e-4) {
    const list = this.query(min[0], min[2], max[0], max[2], this._tmp || (this._tmp = []));
    for (const b of list) {
      if (min[0] < b.max[0] - eps && max[0] > b.min[0] + eps &&
          min[1] < b.max[1] - eps && max[1] > b.min[1] + eps &&
          min[2] < b.max[2] - eps && max[2] > b.min[2] + eps) return b;
    }
    return null;
  }

  // Move an AABB along one axis, clamping against boxes. Returns {moved, hit}.
  sweepAxis(min, max, axis, delta) {
    if (delta === 0) return { moved: 0, hit: null };
    const pad = Math.abs(delta) + 0.01;
    const qa = [min[0], min[2], max[0], max[2]];
    if (axis === 0) { qa[0] -= pad; qa[2] += pad; }
    if (axis === 2) { qa[1] -= pad; qa[3] += pad; }
    const list = this.query(qa[0], qa[1], qa[2], qa[3], this._tmp2 || (this._tmp2 = []));
    let d = delta, hit = null;
    const o1 = (axis + 1) % 3, o2 = (axis + 2) % 3;
    const eps = 1e-5;
    for (const b of list) {
      if (min[o1] >= b.max[o1] - eps || max[o1] <= b.min[o1] + eps) continue;
      if (min[o2] >= b.max[o2] - eps || max[o2] <= b.min[o2] + eps) continue;
      if (d > 0) {
        const gap = b.min[axis] - max[axis];
        if (gap >= -eps && gap < d) { d = Math.max(0, gap - 0.0005); hit = b; }
      } else {
        const gap = b.max[axis] - min[axis];
        if (gap <= eps && gap > d) { d = Math.min(0, gap + 0.0005); hit = b; }
      }
    }
    min[axis] += d; max[axis] += d;
    return { moved: d, hit };
  }

  // Ray vs boxes. Returns {t, box, normal} or null. dir must be normalised.
  raycast(ox, oy, oz, dx, dy, dz, maxDist = 200) {
    // Walk the grid cells along the ray (2D DDA in XZ), testing boxes in each.
    let best = null, bestT = maxDist;
    const c = this.cell;
    let cx = Math.floor(ox / c), cz = Math.floor(oz / c);
    const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const tDeltaX = Math.abs(dx) > 1e-9 ? Math.abs(c / dx) : Infinity;
    const tDeltaZ = Math.abs(dz) > 1e-9 ? Math.abs(c / dz) : Infinity;
    let tMaxX = Math.abs(dx) > 1e-9 ? ((dx > 0 ? (cx + 1) * c - ox : ox - cx * c) / Math.abs(dx)) : Infinity;
    let tMaxZ = Math.abs(dz) > 1e-9 ? ((dz > 0 ? (cz + 1) * c - oz : oz - cz * c) / Math.abs(dz)) : Infinity;
    const stamp = ++this._stamp;
    let tCell = 0;
    for (let i = 0; i < 400; i++) {
      const arr = this.grid.get(cx * 4096 + cz);
      if (arr) {
        for (const b of arr) {
          if (this._marks[b.id] === stamp) continue;
          this._marks[b.id] = stamp;
          const r = rayBox(ox, oy, oz, dx, dy, dz, b.min, b.max);
          if (r && r.t < bestT) { bestT = r.t; best = { t: r.t, box: b, normal: r.normal }; }
        }
      }
      if (best && bestT <= tCell) break;
      if (tMaxX < tMaxZ) { tCell = tMaxX; tMaxX += tDeltaX; cx += stepX; }
      else { tCell = tMaxZ; tMaxZ += tDeltaZ; cz += stepZ; }
      if (tCell > bestT || tCell > maxDist) break;
    }
    return best;
  }

  lineOfSight(a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) return true;
    const h = this.raycast(a[0], a[1], a[2], dx / len, dy / len, dz / len, len);
    return !h;
  }
}

export function rayBox(ox, oy, oz, dx, dy, dz, min, max) {
  let tmin = -Infinity, tmax = Infinity, axis = -1, sign = 0;
  const o = [ox, oy, oz], d = [dx, dy, dz];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-12) {
      if (o[i] < min[i] || o[i] > max[i]) return null;
    } else {
      let t1 = (min[i] - o[i]) / d[i], t2 = (max[i] - o[i]) / d[i];
      let s = -1;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; s = 1; }
      if (t1 > tmin) { tmin = t1; axis = i; sign = s; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
  }
  if (tmax < 0) return null;
  if (tmin < 0) return { t: 0, normal: [0, 0, 0] }; // started inside
  const normal = [0, 0, 0];
  if (axis >= 0) normal[axis] = sign;
  return { t: tmin, normal };
}

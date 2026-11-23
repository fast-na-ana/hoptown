// Shared movement simulation for the local player and bots.
// Quake-style ground/air acceleration (bunny hops + air strafing), double jump, slide.
import { MOVE, PLAYER } from './config.js';

export function makeMoveState(pos = [0, 0, 0]) {
  return {
    pos: [...pos], vel: [0, 0, 0],
    onGround: false, height: PLAYER.height, crouching: false,
    sliding: false, slideTime: 0, slideCd: 0, slideArmed: false,
    jumpsLeft: 1, jumpPrev: false, crouchPrev: false,
    landedAt: 0, events: [],
  };
}

export function emptyInput() {
  return { fwd: 0, right: 0, jump: false, crouch: false, yaw: 0, ads: false };
}

const tmpMin = [0, 0, 0], tmpMax = [0, 0, 0];
function boxOf(s, min = tmpMin, max = tmpMax, h = s.height) {
  const r = PLAYER.radius;
  min[0] = s.pos[0] - r; min[1] = s.pos[1]; min[2] = s.pos[2] - r;
  max[0] = s.pos[0] + r; max[1] = s.pos[1] + h; max[2] = s.pos[2] + r;
  return [min, max];
}

function accelerate(vel, wx, wz, wishSpeed, accel, dt) {
  const cur = vel[0] * wx + vel[2] * wz;
  const add = wishSpeed - cur;
  if (add <= 0) return;
  let a = accel * wishSpeed * dt;
  if (a > add) a = add;
  vel[0] += a * wx; vel[2] += a * wz;
}

export function stepMovement(s, inp, dt, world) {
  s.events.length = 0;
  const sy = Math.sin(inp.yaw), cy = Math.cos(inp.yaw);
  // camera looks down -Z at yaw 0
  const fx = -sy, fz = -cy, rx = cy, rz = -sy;
  let wx = fx * inp.fwd + rx * inp.right, wz = fz * inp.fwd + rz * inp.right;
  const wl = Math.hypot(wx, wz);
  if (wl > 1e-6) { wx /= wl; wz /= wl; } else { wx = 0; wz = 0; }

  const jumpPressed = inp.jump && !s.jumpPrev;
  const crouchPressed = inp.crouch && !s.crouchPrev;
  s.jumpPrev = inp.jump; s.crouchPrev = inp.crouch;
  if (crouchPressed) s.slideArmed = true;
  if (!inp.crouch) s.slideArmed = false;
  s.slideCd = Math.max(0, s.slideCd - dt);

  const hspeed = Math.hypot(s.vel[0], s.vel[2]);

  // --- slide start
  if (s.onGround && !s.sliding && s.slideArmed && s.slideCd <= 0 && hspeed > MOVE.slideMinSpeed) {
    s.sliding = true; s.slideTime = 0; s.slideArmed = false; s.slideCd = MOVE.slideCooldown;
    const nx = s.vel[0] / hspeed, nz = s.vel[2] / hspeed;
    const target = Math.min(hspeed + MOVE.slideBoost, MOVE.groundSpeed + MOVE.slideBoost + 1.5);
    s.vel[0] = nx * target; s.vel[2] = nz * target;
    s.events.push('slide');
  }
  if (s.sliding) {
    s.slideTime += dt;
    if (!inp.crouch || hspeed < MOVE.slideEndSpeed || s.slideTime > MOVE.slideMaxTime && hspeed < MOVE.groundSpeed) s.sliding = false;
  }

  // --- crouch height (needs headroom to stand)
  const wantLow = inp.crouch || s.sliding;
  if (wantLow && !s.crouching) { s.crouching = true; s.height = PLAYER.crouchHeight; }
  else if (!wantLow && s.crouching) {
    const [mn, mx] = boxOf(s, tmpMin, tmpMax, PLAYER.height);
    if (!world.overlaps(mn, mx)) { s.crouching = false; s.height = PLAYER.height; }
  }

  // --- jumping
  let jumped = false;
  if (inp.jump && s.onGround) {
    s.vel[1] = MOVE.jumpVel; s.onGround = false; s.jumpsLeft = 1; jumped = true;
    if (s.sliding) { s.sliding = false; }
    s.events.push('jump');
  } else if (jumpPressed && !s.onGround && s.jumpsLeft > 0) {
    s.jumpsLeft = 0;
    s.vel[1] = Math.max(s.vel[1], MOVE.doubleJumpVel);
    if (wl > 0) { s.vel[0] += wx * MOVE.doubleJumpBoost; s.vel[2] += wz * MOVE.doubleJumpBoost; }
    s.events.push('djump');
  }

  // --- friction
  if (s.onGround && !jumped) {
    const sp = Math.hypot(s.vel[0], s.vel[2]);
    if (sp > 0) {
      const fr = s.sliding ? MOVE.slideFriction : MOVE.friction;
      const control = s.sliding ? sp : Math.max(sp, MOVE.stopSpeed);
      const drop = control * fr * dt;
      const ns = Math.max(0, sp - drop) / sp;
      s.vel[0] *= ns; s.vel[2] *= ns;
    }
  }

  // --- acceleration
  if (s.onGround && !jumped) {
    if (!s.sliding) {
      let ws = s.crouching ? MOVE.crouchSpeed : MOVE.groundSpeed;
      if (inp.ads) ws *= MOVE.adsSpeedMul;
      if (inp.speedMul) ws *= inp.speedMul;
      if (wl > 0) accelerate(s.vel, wx, wz, ws, MOVE.groundAccel, dt);
    } else if (wl > 0) {
      // slight steering while sliding
      accelerate(s.vel, wx, wz, 1.0, 4, dt);
    }
  } else if (wl > 0) {
    accelerate(s.vel, wx, wz, MOVE.airWishCap, MOVE.airAccel, dt);
    // gentle air control when holding forward without strafing
    if (inp.fwd > 0 && Math.abs(inp.right) < 0.01) {
      const sp = Math.hypot(s.vel[0], s.vel[2]);
      if (sp > 0.5) {
        const dot = (s.vel[0] * wx + s.vel[2] * wz) / sp;
        if (dot > 0) {
          const k = MOVE.airControlFwd * dot * dot * dt;
          let nx = s.vel[0] / sp + wx * k, nz = s.vel[2] / sp + wz * k;
          const nl = Math.hypot(nx, nz);
          s.vel[0] = nx / nl * sp; s.vel[2] = nz / nl * sp;
        }
      }
    }
  }

  // --- gravity
  if (!s.onGround || jumped) s.vel[1] -= MOVE.gravity * dt;

  // --- clamp horizontal speed
  const hs = Math.hypot(s.vel[0], s.vel[2]);
  if (hs > MOVE.maxHorizSpeed) { const k = MOVE.maxHorizSpeed / hs; s.vel[0] *= k; s.vel[2] *= k; }

  // --- collide & move
  const wasGround = s.onGround;
  const [mn, mx] = boxOf(s, [0, 0, 0], [0, 0, 0]);
  const dx = s.vel[0] * dt, dz = s.vel[2] * dt;

  // try normal horizontal move
  const a0 = [...mn], a1 = [...mx];
  const rx1 = world.sweepAxis(a0, a1, 0, dx);
  const rz1 = world.sweepAxis(a0, a1, 2, dz);
  let useMin = a0, useMax = a1, hitX = rx1.hit, hitZ = rz1.hit;

  // ledge mantle: in the air (not rising fast) we may climb a bit more than a stair step
  const airborneMantle = !wasGround && s.vel[1] < 4 && (wx !== 0 || wz !== 0);
  if ((rx1.hit || rz1.hit) && (wasGround || s.vel[1] <= 0.5 || airborneMantle)) {
    // stepped move: up, across, down
    const b0 = [...mn], b1 = [...mx];
    const up = world.sweepAxis(b0, b1, 1, wasGround ? PLAYER.stepHeight : PLAYER.mantleHeight);
    const rx2 = world.sweepAxis(b0, b1, 0, dx);
    const rz2 = world.sweepAxis(b0, b1, 2, dz);
    const down = world.sweepAxis(b0, b1, 1, -up.moved);
    const d1 = Math.hypot(a0[0] - mn[0], a0[2] - mn[2]);
    const d2 = Math.hypot(b0[0] - mn[0], b0[2] - mn[2]);
    // only accept if we land on something (down hit) or were airborne going down
    if (d2 > d1 + 1e-4 && (down.hit || !wasGround)) {
      useMin = b0; useMax = b1; hitX = rx2.hit; hitZ = rz2.hit;
      if (b0[1] > mn[1] + 0.05) { s.events.push(wasGround ? 'step' : 'mantle'); if (!wasGround) { s.vel[1] = Math.max(0, s.vel[1]); } }
    }
  }
  if (hitX) s.vel[0] = 0;
  if (hitZ) s.vel[2] = 0;

  // vertical
  const ry = world.sweepAxis(useMin, useMax, 1, s.vel[1] * dt);
  s.onGround = false;
  if (ry.hit) {
    if (s.vel[1] < 0) {
      s.onGround = true;
      if (!wasGround) { s.events.push('land'); s.landSpeed = -s.vel[1]; }
    }
    s.vel[1] = 0;
  } else if (wasGround && !jumped && s.vel[1] <= 0) {
    // snap down stairs / small drops
    const t0 = [...useMin], t1 = [...useMax];
    const snap = world.sweepAxis(t0, t1, 1, -PLAYER.stepHeight);
    if (snap.hit) { useMin[1] = t0[1]; useMax[1] = t1[1]; s.onGround = true; s.vel[1] = 0; }
  }
  if (s.onGround) s.jumpsLeft = 1;

  s.pos[0] = useMin[0] + PLAYER.radius;
  s.pos[1] = useMin[1];
  s.pos[2] = useMin[2] + PLAYER.radius;

  // --- jump pads
  for (const p of world.pads) {
    if (s.pos[0] > p.min[0] && s.pos[0] < p.max[0] && s.pos[2] > p.min[2] && s.pos[2] < p.max[2] &&
        s.pos[1] >= p.min[1] - 0.05 && s.pos[1] < p.max[1] + 0.3) {
      s.vel[0] = p.vel[0]; s.vel[1] = p.vel[1]; s.vel[2] = p.vel[2];
      s.onGround = false; s.jumpsLeft = 1; s.sliding = false;
      s.events.push('pad');
    }
  }
}

// Place a box at pos; if it overlaps, try nudging upward. Returns adjusted pos or null.
export function findFreeSpot(world, pos, height = PLAYER.height) {
  const r = PLAYER.radius;
  for (let lift = 0; lift <= 1.6; lift += 0.2) {
    for (const [ox, oz] of [[0, 0], [0.4, 0], [-0.4, 0], [0, 0.4], [0, -0.4]]) {
      const p = [pos[0] + ox, pos[1] + lift, pos[2] + oz];
      if (!world.overlaps([p[0] - r, p[1], p[2] - r], [p[0] + r, p[1] + height, p[2] + r])) return p;
    }
  }
  return null;
}

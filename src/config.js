// Central tuning values. Units: metres, seconds, radians.

export const SIM_HZ = 120;
export const SIM_DT = 1 / SIM_HZ;

export const PLAYER = {
  radius: 0.38,          // half-width of player box
  height: 1.8,
  crouchHeight: 1.15,
  eye: 1.62,
  crouchEye: 1.0,
  stepHeight: 0.5,
  maxHealth: 100,
  regenDelay: 4.0,       // seconds after last damage before regen
  regenRate: 25,         // hp per second
  spawnProtect: 1.5,
  respawnTime: 3.0,
};

export const MOVE = {
  gravity: 19,
  groundSpeed: 7.6,
  crouchSpeed: 3.6,
  adsSpeedMul: 0.72,
  groundAccel: 12,
  friction: 5.6,
  stopSpeed: 2.5,
  airWishCap: 1.15,      // quake-style air control cap -> enables air strafing
  airAccel: 70,
  airControlFwd: 6,      // gentle forward air control so W-only still steers
  maxHorizSpeed: 17,
  jumpVel: 6.6,
  doubleJumpVel: 6.2,
  doubleJumpBoost: 2.2,  // horizontal push in wish dir on double jump
  slideBoost: 4.2,
  slideMinSpeed: 5.0,
  slideFriction: 0.9,
  slideEndSpeed: 3.2,
  slideCooldown: 0.9,
  slideMaxTime: 1.1,
  jumpPadVel: 15.5,
};

export const WEAPONS = {
  rifle: {
    id: 'rifle', name: 'VX-9 Rifle', slot: 1, auto: true,
    interval: 0.092, damage: 22, headMul: 1.65, falloffStart: 28, falloffEnd: 55, minDamage: 15,
    mag: 30, reload: 1.85, spreadHip: 0.018, spreadAds: 0.0035, bloomPerShot: 0.0028, bloomMax: 0.022,
    recoilPitch: 0.0042, recoilYaw: 0.0016, adsFov: 0.72, moveSpread: 0.025, airSpread: 0.05,
  },
  pistol: {
    id: 'pistol', name: 'K-12 Sidearm', slot: 2, auto: false,
    interval: 0.15, damage: 31, headMul: 1.8, falloffStart: 18, falloffEnd: 40, minDamage: 20,
    mag: 12, reload: 1.15, spreadHip: 0.011, spreadAds: 0.003, bloomPerShot: 0.006, bloomMax: 0.025,
    recoilPitch: 0.009, recoilYaw: 0.0022, adsFov: 0.85, moveSpread: 0.012, airSpread: 0.03,
  },
  knife: {
    id: 'knife', name: 'Arc Knife', slot: 3, melee: true, auto: false, interval: 0.5, mag: 0, reload: 0,
    spreadHip: 0, spreadAds: 0, bloomPerShot: 0, bloomMax: 0, recoilPitch: 0, recoilYaw: 0, adsFov: 1, moveSpread: 0, airSpread: 0,
  },
};

export const KNIFE = {
  id: 'knife', name: 'Arc Knife', slot: 3,
  range: 2.3, damage: 200, cooldown: 0.5, hitDelay: 0.07, cone: 0.55, speedMul: 1.08,
};

export const GRENADE = {
  max: 2, rechargeTime: 14, fuse: 1.8, throwSpeed: 17, upBoost: 4, radius: 6.5,
  maxDamage: 115, selfDamageMul: 0.5, restitution: 0.42, gravity: 19,
};

export const BLINK = {
  throwSpeed: 26, gravity: 7, life: 2.6, cooldown: 6,
};

export const MATCH = {
  killLimit: 20,
  roundTime: 240,   // seconds
  intermission: 12,
  warmup: 3,
  scoreKill: 100,
  scoreHeadshotBonus: 25,
  scoreStreakBonus: 10, // per kill while on streak >= 3
};

export const STREAKS = {
  3: 'KILLING SPREE',
  5: 'RAMPAGE',
  7: 'UNSTOPPABLE',
  10: 'GODLIKE',
  15: 'LEGENDARY',
};

export const COLORS = ['#ff5a5f', '#3ec1ff', '#ffd23f', '#7bdb6a', '#c77dff', '#ff9f43', '#4ef0d0', '#ff6fb5', '#a0a8ff', '#e8e8e8'];

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
  mantleHeight: 0.9,
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
    id: 'rifle', name: 'VX-9 Rifle', kind: 'primary', auto: true,
    interval: 0.092, damage: 22, headMul: 1.65, falloffStart: 28, falloffEnd: 55, minDamage: 15,
    mag: 30, reload: 1.85, spreadHip: 0.016, spreadAds: 0.003, bloomPerShot: 0.0016, bloomMax: 0.014,
    recoilPitch: 0.0042, recoilYaw: 0.0016, adsFov: 0.72, moveSpread: 0.025, airSpread: 0.05,
    pattern: true, sprayReset: 0.32,
  },
  sniper: {
    id: 'sniper', name: 'LR-7 Longbolt', kind: 'primary', auto: false, bolt: true, scope: true,
    interval: 0.55, damage: 80, headMul: 2.5, falloffStart: 999, falloffEnd: 1000, minDamage: 80,
    mag: 5, reload: 2.2, spreadHip: 0.085, spreadAds: 0.0004, bloomPerShot: 0, bloomMax: 0,
    recoilPitch: 0.03, recoilYaw: 0.004, adsFov: 0.27, moveSpread: 0.022, airSpread: 0.09, speedMul: 0.93,
  },
  pistol: {
    id: 'pistol', name: 'K-12 Sidearm', kind: 'secondary', auto: false,
    interval: 0.15, damage: 31, headMul: 1.8, falloffStart: 18, falloffEnd: 40, minDamage: 20,
    mag: 12, reload: 1.15, spreadHip: 0.011, spreadAds: 0.003, bloomPerShot: 0.006, bloomMax: 0.025,
    recoilPitch: 0.009, recoilYaw: 0.0022, adsFov: 0.85, moveSpread: 0.012, airSpread: 0.03,
  },
  smg: {
    id: 'smg', name: 'Hornet SMG', kind: 'primary', auto: true,
    interval: 0.066, damage: 18, headMul: 1.5, falloffStart: 14, falloffEnd: 34, minDamage: 11,
    mag: 32, reload: 1.6, spreadHip: 0.02, spreadAds: 0.0065, bloomPerShot: 0.0011, bloomMax: 0.015,
    recoilPitch: 0.003, recoilYaw: 0.0016, adsFov: 0.8, moveSpread: 0.007, airSpread: 0.028, speedMul: 1.05,
    pattern: true, patternScale: 0.62, sprayReset: 0.26,
  },
  shotgun: {
    id: 'shotgun', name: 'Breacher-8', kind: 'primary', auto: false, pump: true, shells: true,
    interval: 0.8, damage: 13, pellets: 9, pelletCone: 0.062, headMul: 1.35, falloffStart: 7, falloffEnd: 22, minDamage: 3,
    mag: 6, reload: 0.42, reloadStart: 0.28, reloadEnd: 0.42, spreadHip: 0.012, spreadAds: 0.004, bloomPerShot: 0, bloomMax: 0,
    recoilPitch: 0.042, recoilYaw: 0.006, adsFov: 0.88, moveSpread: 0.004, airSpread: 0.012, speedMul: 0.98,
  },
  hcannon: {
    id: 'hcannon', name: 'Hammer .50', kind: 'secondary', auto: false, heavy: true,
    interval: 0.36, damage: 54, headMul: 2.3, falloffStart: 20, falloffEnd: 45, minDamage: 36,
    mag: 7, reload: 1.55, spreadHip: 0.014, spreadAds: 0.0015, bloomPerShot: 0.024, bloomMax: 0.05,
    recoilPitch: 0.032, recoilYaw: 0.006, adsFov: 0.82, moveSpread: 0.03, airSpread: 0.06, speedMul: 0.97,
  },
  knife: {
    id: 'knife', name: 'Arc Knife', kind: 'melee', melee: true, auto: false, interval: 0.5, mag: 0, reload: 0,
    spreadHip: 0, spreadAds: 0, bloomPerShot: 0, bloomMax: 0, recoilPitch: 0, recoilYaw: 0, adsFov: 1, moveSpread: 0, airSpread: 0,
  },
};

export const PRIMARIES = ['rifle', 'smg', 'shotgun', 'sniper'];
export const SECONDARIES = ['pistol', 'hcannon'];
export const GUNS = ['rifle', 'smg', 'shotgun', 'sniper', 'pistol', 'hcannon'];
export const DEFAULT_LOADOUT = { primary: 'rifle', secondary: 'pistol' };

export const KNIFE = {
  id: 'knife', name: 'Arc Knife', slot: 4,
  range: 2.3, damage: 200, cooldown: 0.5, hitDelay: 0.07, cone: 0.55, speedMul: 1.08,
};

export const GRENADE = {
  max: 2, rechargeTime: 11, fuse: 1.5, throwSpeed: 19, upBoost: 4, radius: 6.8,
  maxDamage: 175, minFrac: 0.45, selfDamageMul: 0.5, restitution: 0.38, gravity: 19,
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

// Plant & defuse mode: timings, blast and economy.
export const PLANT = {
  warmup: 3, buyTime: 12, post: 5, plantTime: 3.2, defuseTime: 7, kitDefuseTime: 3.5, fuse: 40,
  blastRadius: 17, blastKill: 7, pickup: 1.5, defuseRange: 2.0,
  startMoney: 800, maxMoney: 9000, win: 3000, lossBase: 1900, lossStep: 500, lossMax: 2900,
  kill: 250, knifeKill: 600, plantBonus: 300, defuseBonus: 300, plantTeamBonus: 600,
  armourAbsorb: 0.5,
  prices: { rifle: 2700, smg: 1300, shotgun: 1500, sniper: 4200, hcannon: 700, armour: 650, nade: 300, kit: 400 },
  maxNades: 2,
};

export const STREAKS = {
  3: 'KILLING SPREE',
  5: 'RAMPAGE',
  7: 'UNSTOPPABLE',
  10: 'GODLIKE',
  15: 'LEGENDARY',
};

export const COLORS = ['#ff5a5f', '#3ec1ff', '#ffd23f', '#7bdb6a', '#c77dff', '#ff9f43', '#4ef0d0', '#ff6fb5', '#a0a8ff', '#e8e8e8'];

// Online play. TURN relays let players behind strict NATs connect; add your own here, e.g.
// { urls: 'turn:global.relay.metered.ca:80', username: '…', credential: '…' } (free tiers exist).
export const NET = { turn: [] };

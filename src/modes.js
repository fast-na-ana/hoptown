// Game modes and teams.
export const MODES = {
  ffa: { id: 'ffa', name: 'FREE FOR ALL', short: 'FFA', teams: false, limit: 20, limitLabel: 'kills', time: 240, blurb: 'Everyone for themselves. Most kills wins.' },
  tdm: { id: 'tdm', name: 'TEAM DEATHMATCH', short: 'TDM', teams: true, limit: 40, limitLabel: 'team kills', time: 300, blurb: 'Two teams. Team kills win the round.' },
  ctf: { id: 'ctf', name: 'CAPTURE THE FLAG', short: 'CTF', teams: true, limit: 3, limitLabel: 'captures', time: 420, blurb: 'Grab their flag, bring it home.' },
  plant: { id: 'plant', name: 'PLANT & DEFUSE', short: 'PLANT', teams: true, plant: true, limit: 4, limitLabel: 'rounds', time: 100, blurb: 'Attackers plant the charge at a site, defenders stop them. One life a round; earn money and buy between rounds.' },
};
export const MODE_LIST = ['ffa', 'tdm', 'ctf', 'plant'];

// Match rules the host can tune. 0 means "no limit".
export const RULE_OPTIONS = {
  time: [120, 180, 240, 300, 420, 600, 900, 1200, 0],
  limit: { ffa: [5, 10, 15, 20, 25, 30, 40, 50, 0], tdm: [10, 20, 30, 40, 50, 75, 100, 0], ctf: [1, 2, 3, 5, 7, 10, 0], plant: [2, 3, 4, 5, 7, 9, 13] },
  timePlant: [60, 80, 100, 120, 150, 180],
  respawn: [1, 2, 3, 4, 5, 8],
};
export const RESPAWN_DEFAULT = 3;
export function defaultRules(mode) { const M = MODES[mode] || MODES.ffa; return { time: M.time, limit: M.limit, respawn: RESPAWN_DEFAULT }; }
export function resolveRules(mode, r) {
  const d = defaultRules(mode);
  if (!r) return d;
  const pick = (v, list, def) => (Number.isFinite(+v) && list.includes(+v) ? +v : def);
  return {
    time: pick(r.time, timeOptions(mode), d.time),
    limit: pick(r.limit, RULE_OPTIONS.limit[mode] || RULE_OPTIONS.limit.ffa, d.limit),
    respawn: pick(r.respawn, RULE_OPTIONS.respawn, d.respawn),
  };
}
export function timeOptions(mode) { return mode === 'plant' ? RULE_OPTIONS.timePlant : RULE_OPTIONS.time; }
export function fmtTime(s) { return s ? (s % 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s / 60} MIN`) : 'NO LIMIT'; }
export function fmtLimit(mode, v) { return v ? `${v} ${mode === 'ctf' ? (v === 1 ? 'CAP' : 'CAPS') : mode === 'plant' ? 'ROUNDS' : 'KILLS'}` : 'NO LIMIT'; }

export const TEAMS = {
  A: { id: 'A', name: 'EMBER', color: '#ff7a3d' },
  B: { id: 'B', name: 'TIDE', color: '#3ec1ff' },
};
export const other = (t) => (t === 'A' ? 'B' : 'A');

export const FLAG = { touch: 1.5, capture: 2.2, returnTime: 15, scoreCapture: 300, scoreReturn: 50, scorePickup: 25 };

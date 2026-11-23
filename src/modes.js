// Game modes and teams.
export const MODES = {
  ffa: { id: 'ffa', name: 'FREE FOR ALL', short: 'FFA', teams: false, limit: 20, limitLabel: 'kills', time: 240, blurb: 'Everyone for themselves. First to 20 kills.' },
  tdm: { id: 'tdm', name: 'TEAM DEATHMATCH', short: 'TDM', teams: true, limit: 40, limitLabel: 'team kills', time: 300, blurb: 'Two teams. First team to 40 kills.' },
  ctf: { id: 'ctf', name: 'CAPTURE THE FLAG', short: 'CTF', teams: true, limit: 3, limitLabel: 'captures', time: 420, blurb: 'Grab their flag, bring it home. 3 captures.' },
};
export const MODE_LIST = ['ffa', 'tdm', 'ctf'];

export const TEAMS = {
  A: { id: 'A', name: 'EMBER', color: '#ff7a3d' },
  B: { id: 'B', name: 'TIDE', color: '#3ec1ff' },
};
export const other = (t) => (t === 'A' ? 'B' : 'A');

export const FLAG = { touch: 1.5, capture: 2.2, returnTime: 15, scoreCapture: 300, scoreReturn: 50, scorePickup: 25 };

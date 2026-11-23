// Rebindable keys. The game reads fixed "logical" codes (the defaults below); the input layer
// translates whatever physical key the player bound into that logical code.
export const ACTIONS = [
  { id: 'forward', label: 'Move forward', code: 'KeyW', def: ['KeyW'] },
  { id: 'back', label: 'Move back', code: 'KeyS', def: ['KeyS'] },
  { id: 'left', label: 'Strafe left', code: 'KeyA', def: ['KeyA'] },
  { id: 'right', label: 'Strafe right', code: 'KeyD', def: ['KeyD'] },
  { id: 'jump', label: 'Jump / double jump', code: 'Space', def: ['Space'] },
  { id: 'crouch', label: 'Crouch / slide', code: 'ShiftLeft', def: ['ShiftLeft', 'KeyC'] },
  { id: 'primary', label: 'Primary weapon', code: 'Digit1', def: ['Digit1'] },
  { id: 'sidearm', label: 'Sidearm', code: 'Digit2', def: ['Digit2'] },
  { id: 'knife', label: 'Knife', code: 'Digit3', def: ['Digit3'] },
  { id: 'reload', label: 'Reload', code: 'KeyR', def: ['KeyR'] },
  { id: 'grenade', label: 'Frag grenade', code: 'KeyG', def: ['KeyG'] },
  { id: 'blink', label: 'Blink disc / warp', code: 'KeyQ', def: ['KeyQ', 'KeyE'] },
  { id: 'quickknife', label: 'Quick knife', code: 'KeyV', def: ['KeyV'] },
  { id: 'use', label: 'Inspect · plant · defuse', code: 'KeyF', def: ['KeyF'] },
  { id: 'buy', label: 'Buy menu / loadout', code: 'KeyB', def: ['KeyB'] },
  { id: 'drop', label: 'Drop the charge', code: 'KeyX', def: ['KeyX'] },
  { id: 'scores', label: 'Scoreboard', code: 'Tab', def: ['Tab'] },
  { id: 'map', label: 'Big map', code: 'KeyM', def: ['KeyM'] },
  { id: 'help', label: 'Help overlay', code: 'KeyH', def: ['KeyH'] },
  { id: 'back2', label: 'Leave AFK', code: 'Enter', def: ['Enter'] },
];

// keys the browser keeps for itself in a normal window (Ctrl/Meta combos close tabs etc.)
export const RISKY = new Set(['ControlLeft', 'ControlRight', 'MetaLeft', 'MetaRight', 'AltLeft', 'AltRight']);

export function loadBinds(stored) {
  const b = {};
  for (const a of ACTIONS) {
    const s = stored && Array.isArray(stored[a.id]) ? stored[a.id].filter(x => typeof x === 'string').slice(0, 2) : null;
    b[a.id] = s && s.length ? s : [...a.def];
  }
  return b;
}

// physical code -> logical code
export function buildMap(binds) {
  const m = new Map();
  for (const a of ACTIONS) for (const c of binds[a.id] || []) if (c && !m.has(c)) m.set(c, a.code);
  return m;
}

export function keyName(code) {
  if (!code) return '—';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'NUM ' + code.slice(6);
  const n = { Space: 'SPACE', ShiftLeft: 'L-SHIFT', ShiftRight: 'R-SHIFT', ControlLeft: 'L-CTRL', ControlRight: 'R-CTRL', AltLeft: 'L-ALT', AltRight: 'R-ALT', Tab: 'TAB', Enter: 'ENTER', CapsLock: 'CAPS', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', MetaLeft: 'META', MetaRight: 'META' }[code];
  return n || code.toUpperCase();
}

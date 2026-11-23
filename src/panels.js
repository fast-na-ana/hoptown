// HTML for the in-game panels: loadout picker (FFA/TDM/CTF) and buy menu (plant mode).
import { WEAPONS, PRIMARIES, SECONDARIES } from './config.js';
import { ICONS } from './hud.js';

const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ARMOUR = '<svg viewBox="0 0 32 32"><path d="M16 2l12 5v8c0 8-5 13-12 15C9 28 4 23 4 15V7z"/></svg>';
const KIT = '<svg viewBox="0 0 32 32"><path d="M4 9h24v17H4zM11 5h10v4h-3V7h-4v2h-3zM14 12h4v4h4v4h-4v4h-4v-4h-4v-4h4z"/></svg>';
export const ITEM_ICONS = { armour: ARMOUR, kit: KIT, nade: ICONS.grenade };

export const LOADOUT_KEYS = [...PRIMARIES, ...SECONDARIES];   // 1-4 primaries, 5-6 sidearms

export function loadoutHtml(lo, pending, immediate) {
  const cur = pending || lo;
  const item = (w, i) => {
    const slot = PRIMARIES.includes(w) ? 'primary' : 'secondary';
    return `<div class="gp-item${cur[slot] === w ? ' gp-on' : ''}"><kbd>${i + 1}</kbd>${ICONS[w]}<b>${esc(WEAPONS[w].name)}</b><span>${slot === 'primary' ? 'PRIMARY' : 'SIDEARM'}</span></div>`;
  };
  return `<div class="gp-head"><h3>LOADOUT</h3><span class="mono">${pending && !immediate ? 'APPLIES ON NEXT SPAWN' : 'CHOOSE WITH NUMBER KEYS'}</span></div>
    <div class="gp-sec">PRIMARY</div><div class="gp-grid">${PRIMARIES.map((w, i) => item(w, i)).join('')}</div>
    <div class="gp-sec">SIDEARM</div><div class="gp-grid">${SECONDARIES.map((w, i) => item(w, i + PRIMARIES.length)).join('')}</div>
    <div class="gp-foot"><span><kbd>1</kbd>–<kbd>6</kbd> pick</span><span><kbd>B</kbd> close</span></div>`;
}

// items: [{ id, name, icon, price, owned, off, sub }]
export function buyHtml({ money, items, timeLeft, role }) {
  const card = (it, i) => `<div class="gp-item${it.owned ? ' gp-owned' : ''}${it.off ? ' gp-off' : ''}"><kbd>${i + 1}</kbd>${it.icon}<b>${esc(it.name)}</b><span>${it.price ? '$' + it.price : 'FREE'}${it.sub ? ' · ' + esc(it.sub) : ''}</span></div>`;
  return `<div class="gp-head"><h3>BUY · ${esc(role)}</h3><span class="mono">BUY TIME ${Math.max(0, Math.ceil(timeLeft))}s</span><span class="money">$${money}</span></div>
    <div class="gp-grid">${items.map(card).join('')}</div>
    <div class="gp-foot"><span><kbd>1</kbd>–<kbd>${items.length}</kbd> buy · one primary at a time</span><span><kbd>B</kbd> close</span></div>`;
}

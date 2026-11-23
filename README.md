# Hoptown

A fast-movement browser arena shooter built with Three.js. Play it at **https://fast-na-ana.github.io/hoptown/**

- **Movement:** bunny hopping, air strafing, double jump, slides, jump pads
- **Weapons:** VX-9 rifle (auto) and K-12 sidearm, with aim-down-sights, recoil and headshots
- **Utility:** frag grenades (with knockback) and a blink disc you throw and then teleport to
- **Map:** Maple Court, a small suburban street with two houses, garages, rooftops and a truck in the middle
- **Match:** free-for-all rounds (first to 20 kills or 4 minutes), respawn timer, score, kill streaks, kill feed, scoreboard
- **Bots:** 0–9 bots with three difficulty levels. They pathfind, strafe, jump and throw grenades
- **Multiplayer:** peer-to-peer over WebRTC ([Trystero](https://github.com/dmotz/trystero)). There's no server: create a room and share the link

## Controls
| Key | Action |
|---|---|
| WASD | Move |
| Space | Jump. Press again in the air to double jump. Hold it to bunny hop |
| Shift / C | Crouch. Slides if you're running |
| LMB / RMB | Fire / aim down sights |
| 1, 2, wheel | Switch weapon |
| R | Reload |
| G | Grenade |
| Q (or E) | Throw the blink disc. Press again to teleport to it |
| Tab | Scoreboard |

## Development
```
npm install
npm run build   # bundles src/ -> dist/game.js
npm run serve   # http://localhost:8123
```
Add `?local=1` to the URL to test multiplayer between tabs of the same browser without WebRTC.

# Hoptown

A fast-movement browser arena shooter built with Three.js. Play it at **https://fast-na-ana.github.io/hoptown/**

- **Movement:** bunny hopping, air strafing, double jump, slides, jump pads
- **Weapons:** VX-9 rifle (auto, red-dot sight, spray pattern), LR-7 Longbolt sniper (bolt-action, scoped; a scoped headshot kills), K-12 sidearm and the Arc Knife (one hit kills). Includes bullet holes, headshots, and animated reloads, bolt cycling and slashes
- **Utility:** frag grenades (with knockback) and a blink disc you throw and then teleport to
- **Maps** (original layouts, built from classic arena-design principles):
  - **Maple Court:** two houses facing each other across a cul-de-sac, with staggered trucks, side yards and backyards for flanking, and trampolines up to the roofs.
  - **Sunstone:** a desert market town with three lanes (a long road, a mid street with an arch choke, and a covered bazaar) crossing at a central plaza, plus rooftops and walled team bases.
- **Modes:**
  - **Free For All:** first to 20 kills.
  - **Team Deathmatch:** first team to 40 kills.
  - **Capture the Flag:** 3 captures wins. Dropped flags return after 15 seconds, and you can't blink while carrying the flag.
- **HUD:** round timer, respawns, score, kill streaks, kill feed and scoreboard, plus a **minimap**:
  - Teammates are always shown.
  - Enemies appear only while you can see them.
  - Teammates' death spots are marked.
  - Press **M** for the full-screen map.
- **Bots:** 0–9 bots at Easy, Medium, Hard or Legendary. They pathfind, strafe, jump, throw grenades and knife you up close
- **Multiplayer:** peer-to-peer over WebRTC ([Trystero](https://github.com/dmotz/trystero)). There's no server: create a room and share the link

## Controls
| Key | Action |
|---|---|
| WASD | Move |
| Space | Jump. Press again in the air to double jump. Hold it to bunny hop |
| Shift / C | Crouch. Slides if you're running |
| LMB / RMB | Fire / aim down sights |
| 1, 2, 3, 4, wheel | Rifle / sniper / pistol / knife |
| V | Quick knife |
| H | Show or hide the in-game help |
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

Fonts: Archivo and Space Mono (SIL Open Font License), self-hosted in `fonts/`.

## Rooms
- **Host tools:** pause with Esc and the player list appears. The host can send a player to the **AFK box**, a sealed glass room above the map where nobody can shoot or be shot, or **kick** them.
- **AFK:** in an online room, a player who sends no input for 60 seconds is moved to the AFK box automatically. Press **Enter** to rejoin.

## Performance
- **Settings → Graphics quality:** Low turns shadows off and lowers resolution. Medium is the default. High sharpens shadows and resolution.
- **Settings → Show FPS:** shows frame rate and the worst frame time.

# Maze Shooter — Progress Log

First-person 3D shooter in a procedurally generated maze. HTML/JS, all deps via CDN (Three.js r128).
Goal: basic but playable. WASD move, mouse look, LMB shoot, 3 monster classes.

## Files
- `index.html` — page, HUD/crosshair/start-overlay, loads CDN + game scripts.
- `maze.js` — procedural maze generation (recursive backtracker + loops + rooms), helpers.
- `game.js` — full game: rendering, player, shooting, monsters/AI, bullets, HUD, win/lose.

Run: open `index.html` in a browser (needs internet for CDN). Or `python3 -m http.server` in the dir.

## Status: COMPLETE (advanced) — weapons, force powers, rooms, pickups, pause, difficulty all implemented

### Phase 2 (advanced features) — DONE
- [x] **2 weapons**: `1` Pistol (8/48, slow, 34 dmg), `2` MG (40/160, 4-shot bursts w/ 0.7s pause). Per-weapon ammo + reload. `switchWeapon`, burst logic in `shoot`.
- [x] **Force powers**: `Q` Force Push (radius 9, pushes monsters, 12s CD), `E` Force Lightning (range 26, 95 dmg in aim cone, bolt FX, 12s CD). `useForcePush`/`useForceLightning` + `forceFx` particles.
- [x] **Monster-on-monster combat**: monsters in range (<1.6) deal 60% melee dmg to each other (DoOM/Heretic style). Killer arg in `killMonster`.
- [x] **Rooms w/ lighting**: `assignRooms` finds connected components; walls tinted per room (`ROOM_COLORS`); per-room point lights `LIGHT_TYPES` dark/bright/blink (`updateRoomLights`).
- [x] **Sliding doors**: `tryOpenDoor` (SPACE, nearest facing wall <5u); `updateDoors` animates open slide.
- [x] **Pickups**: `spawnPickups` places ammo (yellow) + heal (green) crates at random floor cells; `updatePickups` spin/bob + collect (+12 ammo / +30 HP).
- [x] **Pause**: ESC toggles `paused`; freezes updates (lights keep animating). Reuse start overlay.
- [x] **3 difficulty**: LOKH (easy, 12 monsters, slow), PUPSIK (normal, 16), NIGHTMARE (16 + constant spawn every 6s up to `monsterMax` 20, faster/tankier/harder). Selected via buttons on start screen → `window.__difficulty`.
- [x] **New SFX**: `playPickup`, `playForce` (push/light), `playDoor`.
- [x] **HUD**: shows current weapon + per-weapon ammo + P/E force cooldowns + kills + monsters left.

### Phase 1 Done (original)
- [x] **Project setup**: index.html with Three.js r128 via cdnjs (verified HTTP 200).
- [x] **Procedural maze**: `generateMaze(cols,rows)` iterative DFS recursive backtracker.
      12x12 cells → 25x25 grid. `carveLoops` adds 18 loops, `carveRooms` opens 6 rooms.
      Verified: all 327 floor cells reachable from spawn (BFS). Start cell (1,1) is floor.
- [x] **Player movement**: WASD (relative to yaw), smoothed accel. Mouse look via Pointer Lock.
      Camera order YXZ. Collision: circle vs maze AABB grid (`circleFree`), axis slide on block.
- [x] **Shooting (LMB)**: hold to fire, cooldown 0.18s. Bullet spheres, player vs monster.
      `raycastMaze` for LOS. Auto-reload on empty, `R` manual reload (1.2s). Muzzle flash light.
      Weapon view-model (barrel + body + grip + sight) attached to camera with recoil + bob.
- [x] **3 monster classes** (cycle spawn, 16 total):
      - **Stalker** (green): fast (4.4), melee, chases on LOS.
      - **Gunner** (orange): medium (3.4), ranged bullets (12 dmg, inaccuracy), chases/wanders.
      - **Brute** (red): slow (2.6), tanky (200 hp), heavy melee (35 dmg).
- [x] **AI**: line-of-sight check → chase if visible & far, wander if not; face player; attack on range+LOS.
      Body color fades toward black as HP drops (no HP bar). Bobbing animation.
- [x] **Graphics**: merged wall boxes (single draw call), floor plane, fog, ambient + player point light +
      directional light. Procedural textures (brick walls, tiled floor, door panels). Doors (5) placed in
      interior wall cells. Explosion spheres scale with monster HP. Hurt vignette (red clear color).
- [x] **HUD**: HP / Ammo (mag/reserve) / Kills / Monsters left. Crosshair. Start overlay.
- [x] **Minimap**: TAB toggles minimap canvas (top-right). Draws maze walls, doors, monsters (colored dots),
      player (white dot + direction line). Scale 8px/cell.
- [x] **Sound (Web Audio)**: `initAudio()` on first click. Procedural sounds:
      - Gunshot (player): bandpass noise + sine thump, volume 0.9.
      - Gunshot (monster): lower bandpass + lower thump, distance-attenuated.
      - Hit: short square-wave blip.
      - Explosion: filtered noise burst, volume scales with monster size.
- [x] **Open-area spawn facing**: `facingOpenYaw` checks 8 compass directions, sets initial yaw toward first
      open direction so player never spawns facing a wall.
- [x] **Save/respawn**: on death or victory → overlay with click-to-restart. Resets player, respawns
      16 monsters. Kills persist display; reset on new run. Ammo drops (+5 reserve) on some kills.

### Verified
- `node --check maze.js` → OK
- `node --check game.js` → OK
- Maze generation + connectivity test → 327/327 reachable (CONNECTED OK)
- CDN URL → HTTP 200
- Headless Chrome: page loads, no JS errors, HUD shows `Left: 16` (16 monsters), game canvas renders.

## How to play
1. Open `index.html` (internet needed for Three.js CDN).
2. Choose a difficulty (LOKH / PUPSIK / NIGHTMARE) on the start screen, then click → pointer lock.
3. **WASD** move, **mouse** look, **LMB** shoot (hold), **R** reload, **TAB** toggle minimap.
4. **1**/`2` switch weapon (pistol / MG), **Q** force push, **E** force lightning, **SPACE** open door, **ESC** pause.
5. Collect ammo/heal crates. Kill all monsters to win (NIGHTMARE keeps spawning new ones).

## Tuning knobs (in `game.js` `CFG` + `MONSTERS`)
- `mazeCols`/`mazeRows` (12/12), `cellSize` (4), `wallHeight` (4).
- `playerSpeed` (6), `playerMaxHp` (100), `ammoMag` (30), `ammoReserve` (90).
- `fireCooldown` (0.18), `bulletDamage` (25), `bulletSpeed` (40).
- Monster stats in `MONSTERS` object. Monster count: `CFG.monsterCount` (16). Door count: `CFG.doorCount` (5).

## Possible future polish (not required)
- [ ] Score / high-score persistence (localStorage).
- [ ] Better monster models (still basic primitives now).
- [ ] Door collision blocking (currently visual slide only).
- [ ] Fog-of-war on minimap.

## Notes / gotchas
- `raycastMaze` samples in 0.25 steps — fine for wall height 4 & cell size 4; may need finer if walls get thin.
- Bullets are world-space spheres; hit test is 2D (x,z) radius check, ignores y (player height fixed, monsters on floor) — works for this game.
- `mergeGeometries` is a hand-rolled concat (no BufferGeometryUtils needed, keeps single CDN dep).

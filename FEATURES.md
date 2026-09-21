# Maze Shooter — Features

Current feature list. Keep this file in sync with the code:
**every time a feature is added, changed, or removed, update this file** (see `AGENTS.md`).

## Controls
- **WASD** — move (relative to facing), smoothed acceleration. **RUN is always on** (the player always moves at the 1.6× run speed; the old SHIFT toggle was removed).
- **Mouse** — look (Pointer Lock).
- **LMB** — shoot (hold to fire; MG fires in bursts).
- **R** — reload current weapon (1.2s).
- **1 / 2** — switch weapon (Pistol / Machine Gun).
- **Q** — Force Push.
- **E** — Force Lightning.
- **ESC** — pause / resume.
- The **minimap is always visible** (top-right); the old TAB toggle was removed.

## Weapons
- The player **starts with only the Pistol**. The **Machine Gun must be found on the map** (see Pickups) before it can be selected — pressing **2** before finding it shows "FIND THE MACHINE GUN ON THE MAP".
- **Pistol** (key 1): damage 34, semi-auto, mag 8 / reserve 48, faster bullet.
- **Machine Gun** (key 2): damage 15, auto, mag 40 / reserve 160, fires 6-round bursts with a 0.7s pause between bursts.
- Per-weapon ammo (magazine + reserve), auto-reload on empty, manual reload (R).
- **Distinct view-models**: pistol (compact, single barrel + top rail) and MG (long barrel, muzzle brake, gas block, magazine) look different; the active model is shown, the other is hidden.
- Weapon view-model attached to camera with recoil + bob + muzzle flash light.

## Force powers
### Player (each on a 12s cooldown)
- **Force Push (Q)** — radial impulse (radius 14, force 90) that pushes nearby monsters far away from the player (slides them outward in steps, stopping at the first wall). Each pushed monster is also **stunned for 1–3s** (can't move/attack, body flickers white). Particle FX.
- **Force Lightning (E)** — beam in the aim cone (range 26) that zaps monsters in the line of fire. **Each zapped monster takes a flat 68 damage (exactly 2× the pistol's 34)** — it is **NOT** a % of HP, so it **CAN one-shot** a low-HP monster. **No stun** on player lightning. **Animated bolt FX** — a long (~0.9s), sustained, highly-jagged bolt: a bright white-blue core + a soft blue glow bolt (many forking branches), a wide additive light cone along the beam, spark particles scattering at the impact tip, and a flickering point light that holds for most of the lifetime then fades. The bolt ignites at the player and races to the target in the first ~0.38s, then keeps flickering.
### Monster force powers (independent of the basic attack timer, each on the monster's own cooldown)
- Monsters use the same shared helpers (`pushOut`, `doForcePush`, `doForceLightning`) as the player.
- **Gunner → Force Push**: when the player is within `monsterPushRadius` (9u) and the gunner's cooldown is up, it **blasts the player away** (slides the player outward to the nearest free spot, with push FX + sound). Cooldown ~7s.
- **Brute → Force Push AND Force Lightning**: the brute has both. When the player is within `monsterLightRange` (14u) it zaps the player with a lightning bolt (flat **33.15 dmg** = 68 × 0.4875, since red brutes are 0.4875 of original power, bolt FX + sound); if the player is closer than that but within `monsterPushRadius` (9u) it force-pushes instead. Cooldown ~8s.
- **Stalker** has no force power (it shoots).
- **Stun (shared)**: a stunned monster stops moving/attacking and its body tints toward white for the stun duration. (Only the player's Force Push still stuns.)

## Monsters (3 classes)
- **Stalker** (green): fast (4.4), **ranged — shoots 10-dmg bullets** (speed ~17.3, slight inaccuracy), chases on line-of-sight.
- **Gunner** (orange): medium speed (3.4), ranged bullets (12 dmg, slight inaccuracy) **and Force Push** (blasts the player away at close range).
- **Brute** (red): slow (2.6), tanky (200 HP), heavy melee **plus Force Push and Force Lightning**. **0.4875 of original power** (0.75 base × 0.65): its melee damage is reduced to 35 × 0.4875 = **17.06** and its Force Lightning deals **68 × 0.4875 = 33.15** damage (instead of the player's 68), so red brutes are significantly weaker than their original tuning.
- **Spawn pool is staged**: before the player finds the machine gun, only **green stalkers and orange gunners** spawn. Once the MG is found, **red brutes join the pool** (and the horde doubles — see Pickups).
- AI: line-of-sight check → chase if visible & far, wander otherwise; face player; attack on range + LOS; monster force powers fire on their own cooldown when in range.
- **Direct contact is harmful but not deadly**: melee monsters deal at most **45 damage per contact hit** (a cap, `contactDamageMax`) and can only hit every **0.5s** (`contactCooldown`), so even a Brute's 17.06-dmg hit can't one-shot a 100-HP player in a single touch.
- Body color fades toward black as HP drops (no HP bar); bobbing animation.
- **Monster-on-monster combat**: once a monster has first seen the player (`encountered`), it deals 60% melee damage to any other monster within 1.6u. So monsters do **not** fight each other at spawn — only after they have encountered the player.

## Spawning
- **Player** spawns at the **center of the map** (falls back to the nearest open cell if the exact middle is a wall).
- **Monsters** spawn at **random open floor cells spread across the whole map** (not clustered), at least **40u (10 cells)** from the player, never stacked on the same cell, never inside a wall. This guarantees the player starts in a **monster-free area** and isn't immediately swarmed at spawn.
- **Initial count**: 16 monsters (the fixed PUPSIK value). **When the MG is found, the total count DOUBLES relative to the initial wave** — the horde is topped up to `2 × initial count` (16 → 32 total, capped by `monsterMax` 40), **cycling through all 3 types (stalker, gunner, brute)** so every type is represented. Red brutes join the spawn pool from then on.

## Map / World
- Procedural maze (recursive backtracker, 12×12 cells → 25×25 grid).
- 18 carved loops (removes dead-end-only paths) + 6 open rooms (3×3).
- **Rooms**: walls tinted per room with a **clearly distinct color** per room. The brick texture is a neutral light-gray (dark mortar, light faces) and the room hue comes entirely from the material `color` (which multiplies the texture), so each room's walls take on a distinct hue. `ROOM_COLORS` holds 12 saturated colors. Per-room point lights with dark / bright / blink / normal types.
- **Doors removed**: the 5 sliding doors were dropped (they were useless); the maze is now all open corridors. (The `doors` array is kept as an empty list for safety.)
- Merged wall geometry (single draw call), floor plane, fog, ambient + directional + player point light.
- Procedural textures (brick walls, tiled floor).

## Pickups
- **Ammo crate** (yellow): +12 reserve (capped at 300). If the current weapon's mag is full **and** reserve is at the cap, it is left in place for later.
- **Medkit** (green): +30 HP. If HP is already at max (100), it is left in place for later.
- **Machine Gun pickup** (blue, one per map): a glowing MG model with a blue base ring. Spawned at the **floor cell farthest from the player**, so it must be searched for. On proximity it **unlocks the MG** (full mag + reserve) and **doubles the monster horde** (tops the horde up to 2× the initial count of 16, now including red brutes), shows a "MACHINE GUN FOUND! The horde doubles - brutes join!" message, and is removed. It is **NOT** marked on the minimap until **3/4 of the total initial monster count** has been killed, after which a blue square appears on the map.
- Crates spin/bob; collected on proximity.

## HUD / UI
- **Centered, larger HUD** (bottom-center of the screen), rendered as structured HTML/DOM (not a single text line):
  - **Health**: a big HP number + a full-width **health bar** that drains as HP drops.
  - **Weapon**: large weapon name, big ammo readout (`mag / reserve`), and **1/2 weapon slot buttons** that highlight the active weapon (the MG slot is dimmed until found).
  - **Force powers**: two **cooldown bars** (Q push, E lightning) that fill back up over the 12s cooldown, each with a `RDY` / countdown-seconds label.
  - **Stats row**: KILLS and monsters LEFT, plus a **RUN** indicator (always shown now, since RUN is always on).
- Crosshair (center).
- Start overlay: control legend (notes which monster uses which force power) + a note that finding the hidden MG doubles the horde and adds red brutes.
- Damage vignette (red) when hurt.
- Center messages for pickups / victory / defeat.
- **Minimap** (top-right, **always visible**): draws maze walls, monsters (colored dots), player (white dot + facing line). The MG is **hidden** from the map until 3/4 of total monsters are killed, then shown as a blue square.

## Difficulty
- **Single fixed difficulty** — the start screen no longer offers a choice. The old **PUPSIK** (normal) values are the only settings: 16 initial monsters, balanced speed/HP/damage (all ×1.0), no constant respawning.

## Win / Lose
- **Win**: all monsters killed → "VICTORY!" overlay, click to play again (re-randomizes monsters/pickups).
- **Lose**: HP reaches 0 → defeat overlay, click to restart.

## Sound (procedural, Web Audio)
- Player gunshot, monster gunshot (distance-attenuated), hit blip, explosion (sized), pickup, force push, force lightning. (Monsters' force push/lightning reuse the player's force sounds.)

## Rendering / Graphics
- Three.js (r128) first-person camera.
- **Animated explosion** (size scales with monster HP): multi-stage ~1.3s sequence —
   1. **Flash + fireball**: blue-white flash (additive) that expands and cools (blue → orange → deep red → dark), slightly squashing as it settles.
   2. **Ground shockwave**: a textured radial ring (procedural shockwave canvas) on the floor that expands fast and fades.
   3. **Shockwave ring (torus)**: a bright additive ring that expands and fades.
   4. **Smoke**: 7 puffs that rise, expand, spin, and fade.
   5. **Debris**: 18 tetrahedron chunks that fly out with gravity, spin, and fade.
   6. **Spark flashes**: 10 additive pings that shoot out and shrink/fade fast.
   7. **Light**: sharp point-light spike then decay.
- Muzzle flash light on firing.

## These are real prompts used in the project

You should make 3D shooter using HTML/JavaScript, all dependencies load via CDN. Use very basic ideas: WASD for movements, LMB for shooting, etc. Labirynth should be procedure generated, only 3 classes of monsters, basic graphics, but should be playable. After each step save progress in PROGRESS.MD in order to proceed further after interruption. Save the game itself in working dir.

This is very basic 3D shooter, and we need to improve it. You should add:
- by pressing TAB the map should appear showing the whole labirynth with the player and monsters on it
- monsters should be more agressive and fast, and they count should be 16 instead of 8. Remove health indicator above, make them gradually change color while losing HP instead (closer to black closer to death)
- when monster dies it should exploit instead of just dissapearing, and the tougher it was the larger the explosion should be
- the player view should have a weapon prototype perfectly seen
- the player should start looking to open areas instead of the closest wall
- all shootings should produce sounds
- let's make walls and floor made of some simple textures
- doors should be added (but not many)
  Before finishing you should always test that the game is actually playable, no errors is throwing, and everything works.

This is very basic 3D shooter, and we need to improve it. You should add:
- monsters should spawn everywhere, not in one location
- monsters can move randomly initially, but should chase the player after they see him
- the xplosion animation should be much more impressive, not just orange sphere
- doors should be actually doors - i.e. between rooms and open with SPACE
- monsters could attack each other if one of them hits the other (like in DooM / Heretic)
- the player should have 2 weapons: 1 (bind to `1` button) is pistol like the current weapon, but with delay between every shoot, 2 (bind to `2`) is machine gun which could fire 4 shoots in a row than pause a bit
- in addition to pistol and machine gun the player should have two Force powers: Force Push (binded to `Q`) and Force Lightning (`E`), like in Star Wars. Penalty after use of each one shold be like 10-15 seconds
- there shood be rooms on map with different wall colors and different lights in them (somewhere dark, somewhere light, somewhere blinking)
- there should be ammo packs and heals randomly placed on map, but not too often
- the game could be paused by `ESC`, and the second `ESC` hit returns to the game
- there should be 3 levels of difficulty: LOKH (easy play, slow monsters), PUPSIK (current level of difficulty) and NIGHTMARE (monsters are spawning constantly and very aggressive)


This is very basic 3D shooter, and we need to improve it.
- the map should hold, i.e. first press of `TAB` - map shows, second press of `TAB` - it hide. No need to keep `TAB` pressed all the time
- the player should spawn on the center of the map
- monsters should spawn among the whole map in random places, not in one concrete place
- make a list of current features in FEATURES.md file
- add to AGENTS.md instruction to always check that all features are working and not missed, and to add each new feature to FEATURES.md file


This is very basic 3D shooter, and we need to improve it.
- SHIFT should toggle run
- walls should have different colors
- Force Lightning should make an animation with ignition of lightning towards the enemy
- pistol and MG should look differently
- when MG activated is should be able to shoot series of 4 shoots each, currently it makes only 1 shoot then wait then makes 4
- the explosion animation should be like real explosion, carefully animated


This is very basic 3D shooter, and we need to improve it.
- direct contact with monster should be harmful but not deadly
- Force Lightning should be an animation with ignition of lightning towards the enemy even more than now - much more lightinng traces for the longest period of time. After suffer the lightning the monster should stun the target for 1-3 seconds, and should always lose 0.5 of his current health.
- Force Push should push farther in distance and stun the target for 1-3 seconds
- improve explosion animation even more, feel free to use WebGL or whatever 3D functions to boost animations
- walls should have different colors, we already trying this task for some time but with no result at all. please do it carefully and retest

This is very basic 3D shooter, and we need to improve it.
- The game starts with pistol, MG is not available. The player should get it somewhere on map

This is very basic 3D shooter, and we need to improve it.
- Enemy's bullets are way too fast, slow them by 1.5

This is very basic 3D shooter, and we need to improve it.
- red monsters are too dangerous, make them 0.75 powerful
- RUN should be always ON, remove SHIFT binding
- map should be always visible, remove TAB binding
- the player should start in place empty of monsters to prevent constant killing

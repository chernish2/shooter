// ============ Maze Shooter ============
// Three.js first-person shooter in a procedurally generated maze.
// WASD move, mouse look (pointer lock), LMB shoot, R reload.
// 3 monster classes with simple AI. Kill all monsters to win.

(function () {
'use strict';

// ---------------- Configuration ----------------
const CFG = {
    mazeCols: 12,      // maze cells (grid becomes 25x25)
    mazeRows: 12,
    cellSize: 4,       // world units per maze cell
    wallHeight: 4,
    playerRadius: 0.6,
    playerSpeed: 6,
    playerHeight: 1.7,
    playerMaxHp: 100,
    bulletLife: 2.5,
    reloadTime: 1.2,
    playerAttackRadius: 3.0,
    monsterCount: 16,
    monsterMax: 40,   // headroom so the MG "double the horde" (16 -> 32) can fully land
    roomCount: 6,
    pickupAmmo: 8,
    pickupHeal: 9,
    forceCooldown: 12,
    pushRadius: 14,          // Force Push reach (pushes farther than before)
    pushForce: 90,          // Force Push impulse (stronger push)
    pushStunMin: 1, pushStunMax: 3,   // seconds a pushed monster is stunned
    lightningRange: 26,
    lightningDamage: 68,    // = 2x pistol damage (34); flat, so it CAN kill (no stun)
    bruteLightningDamage: 68 * 0.4875,  // red brutes: 0.75 base × 0.65 (0.4875 of original)
    monsterLightRange: 14,
    monsterPushRadius: 9,   // monster force-push reach (smaller than the player's 14)
    contactDamageMax: 45,   // direct melee contact is harmful but never one-shots (cap)
    contactCooldown: 0.5,   // min seconds between contact hits per monster
    spawnEvery: 0,          // set by difficulty
};

// Weapons: 1 = pistol, 2 = machine gun (burst)
const WEAPONS = {
    pistol: { name: 'PISTOL', damage: 34, cooldown: 0.34, mag: 8, reserve: 48, speed: 46, auto: false, burst: 1, burstPause: 0 },
    mg: { name: 'MG', damage: 15, cooldown: 0.075, mag: 40, reserve: 160, speed: 44, auto: true, burst: 6, burstPause: 0.7 }
};

// ---------------- Difficulty ----------------
// Only one difficulty now (the old PUPSIK / "Normal" values). The selection
// screen was removed — these are the fixed settings for every run.
const DIFF = {
    PUPSIK: { label: 'PUPSIK', desc: 'Normal - balanced', speed: 1.0, hp: 1.0, dmg: 1.0, count: 16, spawnEvery: 999, aggro: 1.0 }
};
let difficulty = DIFF.PUPSIK;
let spawnTimer = 0;

// Room wall tints + light types (dark / bright / blink)
// These are the material `color` values that multiply the neutral brick texture,
// so each room's walls take on a clearly distinct hue.
const ROOM_COLORS = [
    0x4466ee, 0xee8833, 0x33cc88, 0xdd44aa, 0x9955ee, 0xeedd44,
    0x33bbee, 0xee5544, 0x66dd33, 0xbb66dd, 0x4488ff, 0xff88aa
];
const LIGHT_TYPES = ['dark', 'bright', 'blink', 'normal', 'blink', 'normal'];
let roomOfCell = [];      // per-cell room id (-1 = none)
let roomLights = [];       // { mesh, light, type, color }

// Monster class definitions
const MONSTERS = {
    // Class 1: The Stalker - fast, chases, and SHOTS the player (ranged)
    stalker: {
        color: 0x44cc66,
        speed: 4.4,
        hp: 50,
        radius: 0.6,
        height: 1.6,
        damage: 15,
        attackCooldown: 0.9,
        attackRange: 14,
        rangeAttack: true,
        bulletSpeed: 26 / 1.5,
        bulletDamage: 10,
        forcePower: null,
        score: 10
    },
    // Class 2: The Gunner - ranged + uses FORCE PUSH (blasts the player away)
    gunner: {
        color: 0xcc6633,
        speed: 3.4,
        hp: 80,
        radius: 0.7,
        height: 1.8,
        damage: 12,
        attackCooldown: 1.2,
        attackRange: 14,
        rangeAttack: true,
        bulletSpeed: 22 / 1.5,
        bulletDamage: 12,
        forcePower: 'push',
        forceCd: 7,
        score: 15
    },
    // Class 3: The Brute - slow, tanky, heavy melee + FORCE PUSH and FORCE LIGHTNING
    // 0.4875 of original power (0.75 base × 0.65): melee 35 -> 17.06 and its
    // Force Lightning uses the reduced `bruteLightningDamage` instead of the player's.
    brute: {
        color: 0xcc3333,
        speed: 2.6,
        hp: 200,
        radius: 0.9,
        height: 2.2,
        damage: 35 * 0.4875,
        attackCooldown: 1.5,
        attackRange: 2.0,
        rangeAttack: false,
        bulletSpeed: 0,
        bulletDamage: 0,
        forcePower: 'both',
        forceCd: 8,
        score: 30
    }
};

// ---------------- World constants ----------------
const MAZE = generateMaze(CFG.mazeCols, CFG.mazeRows);
carveLoops(MAZE, 18);
carveRooms(MAZE, 6, 3);
const MW = MAZE.W;   // grid width
const MH = MAZE.H;   // grid height
const CS = CFG.cellSize;
const WORLD_W = MW * CS;
const WORLD_H = MH * CS;
const isWall = (gx, gy) => {
    if (gx < 0 || gy < 0 || gx >= MW || gy >= MH) return true;
    return MAZE.grid[gy * MW + gx] === 1;
};
// Convert world xz -> grid
const toGrid = (x, z) => [Math.floor((x + WORLD_W / 2) / CS), Math.floor((z + WORLD_H / 2) / CS)];

// ---------------- Sound (Web Audio) ----------------
let actx = null;
function initAudio() {
    if (actx) return;
    try { actx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch (e) { actx = null; }
}
function noiseBuffer(dur) {
    const len = Math.max(1, Math.floor(actx.sampleRate * dur));
    const buf = actx.createBuffer(1, len, actx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
}
function playShot(isPlayer, dist) {
    if (!actx) return;
    const t = actx.currentTime;
    const vol = Math.min(1, 0.9 / (1 + dist * 0.06));
    const out = actx.createGain();
    out.gain.value = vol;
    out.connect(actx.destination);
    const src = actx.createBufferSource();
    src.buffer = noiseBuffer(isPlayer ? 0.16 : 0.22);
    const bp = actx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = isPlayer ? 900 : 500;
    bp.Q.value = 0.9;
    src.connect(bp); bp.connect(out);
    src.start(t); src.stop(t + 0.2);
    const osc = actx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(isPlayer ? 160 : 110, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.14);
    const og = actx.createGain();
    og.gain.setValueAtTime(isPlayer ? 0.7 : 0.5, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(og); og.connect(out);
    osc.start(t); osc.stop(t + 0.16);
}
function playHit() {
    if (!actx) return;
    const t = actx.currentTime;
    const osc = actx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.08);
    const g = actx.createGain();
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    osc.connect(g); g.connect(actx.destination);
    osc.start(t); osc.stop(t + 0.1);
}
function playExplosion(size) {
    if (!actx) return;
    const t = actx.currentTime;
    const src = actx.createBufferSource();
    src.buffer = noiseBuffer(0.6);
    const lp = actx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1200, t);
    lp.frequency.exponentialRampToValueAtTime(120, t + 0.55);
    const g = actx.createGain();
    g.gain.setValueAtTime(Math.min(1, 0.4 + size * 0.04), t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    src.connect(lp); lp.connect(g); g.connect(actx.destination);
    src.start(t); src.stop(t + 0.6);
}
function playPickup(kind) {
    if (!actx) return;
    const t = actx.currentTime;
    const osc = actx.createOscillator();
    osc.type = 'triangle';
    const f0 = kind === 'heal' ? 520 : 340;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(f0 * 1.6, t + 0.12);
    const g = actx.createGain();
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    osc.connect(g); g.connect(actx.destination);
    osc.start(t); osc.stop(t + 0.16);
}
function playForce(kind) {
    if (!actx) return;
    const t = actx.currentTime;
    if (kind === 'push') {
        const src = actx.createBufferSource();
        src.buffer = noiseBuffer(0.4);
        const lp = actx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(500, t);
        lp.frequency.exponentialRampToValueAtTime(2000, t + 0.3);
        const g = actx.createGain();
        g.gain.setValueAtTime(0.5, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        src.connect(lp); lp.connect(g); g.connect(actx.destination);
        src.start(t); src.stop(t + 0.4);
    } else {
        const osc = actx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(1400, t);
        osc.frequency.exponentialRampToValueAtTime(120, t + 0.3);
        const g = actx.createGain();
        g.gain.setValueAtTime(0.4, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
        osc.connect(g); g.connect(actx.destination);
        osc.start(t); osc.stop(t + 0.32);
        const src = actx.createBufferSource();
        src.buffer = noiseBuffer(0.3);
        const hp = actx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 2000;
        const ng = actx.createGain();
        ng.gain.setValueAtTime(0.3, t);
        ng.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
        src.connect(hp); hp.connect(ng); ng.connect(actx.destination);
        src.start(t); src.stop(t + 0.3);
    }
}
// ---------------- Procedural textures ----------------
function makeTexture(size, draw, repeatX, repeatY) {
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d');
    draw(ctx, size);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.LinearFilter;
    return tex;
}
// NEUTRAL (light-gray) brick texture. The per-room COLOR comes entirely from the
// material's `color` (which multiplies the texture), so the bricks stay ~white here.
// Dark mortar lines + light-face bricks give visible structure without a baked hue
// that would wash out the room tint.
const wallTex = makeTexture(128, (ctx, s) => {
    ctx.fillStyle = '#15171c'; // dark mortar bed
    ctx.fillRect(0, 0, s, s);
    const bh = 16, bw = 32;
    for (let y = 0, row = 0; y < s; y += bh, row++) {
        const off = (row % 2) * (bw / 2);
        for (let x = -bw; x < s + bw; x += bw) {
            const shade = 0.86 + Math.random() * 0.26; // light face, slight variation
            const v = Math.floor(228 * shade);
            ctx.fillStyle = 'rgb(' + v + ',' + v + ',' + Math.min(255, v + 3) + ')';
            ctx.fillRect(x + off + 1, y + 1, bw - 2, bh - 2);
        }
    }
    ctx.strokeStyle = 'rgba(12,14,18,0.95)';
    ctx.lineWidth = 1;
    for (let y = 0; y <= s; y += bh) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(s, y); ctx.stroke(); }
}, MW, 1);
const floorTex = makeTexture(128, (ctx, s) => {
    ctx.fillStyle = '#23252e';
    ctx.fillRect(0, 0, s, s);
    const tile = 32;
    for (let y = 0; y < s; y += tile) {
        for (let x = 0; x < s; x += tile) {
            const shade = 0.8 + Math.random() * 0.4;
            const v = Math.floor(40 * shade);
            ctx.fillStyle = 'rgb(' + v + ',' + (v + 3) + ',' + (v + 10) + ')';
            ctx.fillRect(x + 1, y + 1, tile - 2, tile - 2);
        }
    }
    ctx.strokeStyle = 'rgba(10,12,16,0.9)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= s; i += tile) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, s); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(s, i); ctx.stroke();
    }
    for (let i = 0; i < 400; i++) {
        ctx.fillStyle = 'rgba(255,255,255,' + (Math.random() * 0.05) + ')';
        ctx.fillRect(Math.random() * s, Math.random() * s, 1, 1);
    }
}, MW / 2, MH / 2);

// ---------------- Three.js setup ----------------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x0a0a12);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0a0a12, 12, 70);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 300);
camera.position.set(0, CFG.playerHeight, 0);

// Weapon view-models (pistol & MG look different)
function makeWeaponModel(kind) {
    const g = new THREE.Group();
    const dark = new THREE.MeshLambertMaterial({ color: 0x2b3038 });
    const mid = new THREE.MeshLambertMaterial({ color: 0x3a4150 });
    const add = (geo, mat, x, y, z, rx, rz) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, y, z);
        if (rx) m.rotation.x = rx;
        if (rz) m.rotation.z = rz;
        g.add(m);
        return m;
    };
    if (kind === 'pistol') {
        add(new THREE.BoxGeometry(0.07, 0.09, 0.26), mid, 0, -0.03, -0.05);          // slide / body
        add(new THREE.BoxGeometry(0.06, 0.05, 0.18), dark, 0, 0.035, -0.05);          // top rail
        add(new THREE.BoxGeometry(0.06, 0.16, 0.09), dark, 0, -0.14, 0.07, 0.32);     // grip
        add(new THREE.BoxGeometry(0.05, 0.05, 0.06), dark, 0, -0.09, -0.02, 0.1);     // trigger guard
        add(new THREE.BoxGeometry(0.02, 0.02, 0.02), new THREE.MeshBasicMaterial({ color: 0x66ff66 }), 0, 0.07, -0.18); // rear sight
        add(new THREE.BoxGeometry(0.02, 0.02, 0.02), new THREE.MeshBasicMaterial({ color: 0x66ff66 }), 0, 0.07, -0.13); // front sight
    } else {
        add(new THREE.BoxGeometry(0.09, 0.12, 0.5), mid, 0, -0.02, -0.1);              // receiver
        add(new THREE.BoxGeometry(0.05, 0.05, 0.42), dark, 0, 0.04, -0.42);            // long barrel
        add(new THREE.BoxGeometry(0.06, 0.06, 0.1), dark, 0, 0.05, -0.6);              // muzzle brake
        add(new THREE.BoxGeometry(0.05, 0.05, 0.14), dark, 0, 0.02, -0.12);            // gas block
        add(new THREE.BoxGeometry(0.07, 0.17, 0.1), dark, 0, -0.15, 0.04, 0.22);       // grip
        add(new THREE.BoxGeometry(0.1, 0.09, 0.34), dark, 0, -0.06, -0.08);            // magazine (curved-ish block)
        add(new THREE.BoxGeometry(0.08, 0.05, 0.08), mid, 0, 0.05, -0.18);             // front sight base
        add(new THREE.BoxGeometry(0.02, 0.04, 0.02), new THREE.MeshBasicMaterial({ color: 0x66ff66 }), 0, 0.08, -0.2);  // front sight post
        add(new THREE.BoxGeometry(0.06, 0.04, 0.04), mid, 0, 0.05, 0.02);              // rear sight
    }
    return g;
}
const weaponPistol = makeWeaponModel('pistol');
const weaponMG = makeWeaponModel('mg');
weaponPistol.position.set(0.22, -0.18, -0.5);
weaponMG.position.set(0.22, -0.18, -0.5);
const weapon = weaponPistol;
camera.add(weaponPistol);
camera.add(weaponMG);
weaponMG.visible = false;
scene.add(camera);
let weaponRecoil = 0;
let weaponBobPhase = 0;

// Lighting
scene.add(new THREE.AmbientLight(0x404050, 1.2));
const playerLight = new THREE.PointLight(0xffeecc, 1.2, 40);
scene.add(playerLight);
const dir = new THREE.DirectionalLight(0x8899ff, 0.4);
dir.position.set(10, 30, 10);
scene.add(dir);

// ---------------- Build maze geometry ----------------
const wallMat = new THREE.MeshLambertMaterial({ color: 0xffffff, map: wallTex });
const floorMat = new THREE.MeshLambertMaterial({ color: 0xffffff, map: floorTex });

// Assign each floor cell to a room (connected components of floor space).
roomOfCell = new Array(MW * MH).fill(-1);
(function assignRooms() {
    const idx = (gx, gy) => gy * MW + gx;
    let room = 0;
    for (let i = 0; i < roomOfCell.length; i++) {
        if (MAZE.grid[i] !== 0 || roomOfCell[i] !== -1) continue;
        const gx0 = i % MW, gy0 = Math.floor(i / MW);
        const q = [[gx0, gy0]];
        roomOfCell[i] = room;
        while (q.length) {
            const [gx, gy] = q.pop();
            const nbrs = [[gx + 1, gy], [gx - 1, gy], [gx, gy + 1], [gx, gy - 1]];
            for (const [nx, ny] of nbrs) {
                if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) continue;
                const ni = ny * MW + nx;
                if (MAZE.grid[ni] === 0 && roomOfCell[ni] === -1) {
                    roomOfCell[ni] = room;
                    q.push([nx, ny]);
                }
            }
        }
        room++;
    }
    // Cap room count: merge any extras into the last used id (colors cycle anyway)
})();

 // ---------------- Doors (removed: they were useless) ----------------
 // `doors` is kept as an empty array so any leftover reference stays safe.
 const doors = [];

// Tint each wall by the room it borders (nearest adjacent floor room).
function roomForWall(gx, gy) {
    const nbrs = [[gx + 1, gy], [gx - 1, gy], [gx, gy + 1], [gx, gy - 1]];
    for (const [nx, ny] of nbrs) {
        if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) continue;
        const ri = roomOfCell[ny * MW + nx];
        if (ri >= 0) return ri;
    }
    return -1;
}

// Build walls grouped by room tint (one merged mesh per tint).
const tintGroups = {}; // colorHex -> geos
for (let gy = 0; gy < MH; gy++) {
    for (let gx = 0; gx < MW; gx++) {
        if (!isWall(gx, gy)) continue;
        const cx = -WORLD_W / 2 + (gx + 0.5) * CS;
        const cz = -WORLD_H / 2 + (gy + 0.5) * CS;
        const g = new THREE.BoxGeometry(CS, CFG.wallHeight, CS);
        g.translate(cx, CFG.wallHeight / 2, cz);
        const ri = roomForWall(gx, gy);
        const key = ri >= 0 ? (ROOM_COLORS[ri % ROOM_COLORS.length]) : 0x666666;
        (tintGroups[key] = tintGroups[key] || []).push(g);
    }
}
for (const key in tintGroups) {
    const merged = mergeGeometries(tintGroups[key]);
    if (merged) scene.add(new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ color: key, map: wallTex })));
}

// Per-room lights (dark / bright / blink)
(function buildRoomLights() {
    const seen = {};
    for (let gy = 0; gy < MH; gy++) {
        for (let gx = 0; gx < MW; gx++) {
            const ri = roomOfCell[gy * MW + gx];
            if (ri < 0 || seen[ri]) continue;
            seen[ri] = true;
            const type = LIGHT_TYPES[ri % LIGHT_TYPES.length];
            const cx = -WORLD_W / 2 + (gx + 0.5) * CS;
            const cz = -WORLD_H / 2 + (gy + 0.5) * CS;
            const intensity = type === 'dark' ? 0.35 : type === 'bright' ? 1.5 : type === 'blink' ? 1.2 : 0.9;
            const light = new THREE.PointLight(0xffe6b0, intensity, 16);
            light.position.set(cx, CFG.wallHeight - 0.6, cz);
            scene.add(light);
            const bulb = new THREE.Mesh(
                new THREE.SphereGeometry(0.16, 8, 8),
                new THREE.MeshBasicMaterial({ color: type === 'dark' ? 0x554422 : 0xfff2cc })
            );
            bulb.position.copy(light.position);
            scene.add(bulb);
            roomLights.push({ light, bulb, type, phase: Math.random() * Math.PI * 2 });
        }
    }
})();

function updateRoomLights(time) {
    for (const rl of roomLights) {
        if (rl.type === 'blink') {
            const v = 0.5 + 0.5 * Math.sin(time * 0.006 + rl.phase);
            rl.light.intensity = 0.3 + v * 1.2;
            rl.bulb.material.color.setHex(v > 0.5 ? 0xfff2cc : 0x554422);
        }
    }
}

// ---------------- Pickups ----------------
const pickups = [];
const pickupGeoAmmo = new THREE.BoxGeometry(0.5, 0.35, 0.5);
const pickupGeoHeal = new THREE.BoxGeometry(0.5, 0.5, 0.35);
const pickupMatAmmo = new THREE.MeshLambertMaterial({ color: 0xffcc33, emissive: 0x553300 });
const pickupMatHeal = new THREE.MeshLambertMaterial({ color: 0x33cc55, emissive: 0x004411 });
let mgPickup = null; // the one machine gun you can find on the map
let totalMonsters = 0; // initial monster count for the MG reveal threshold

// A small glowing MG model, used as the "found the MG" pickup marker.
function makeMgPickupMesh() {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x5577ff, emissive: 0x2233aa, emissiveIntensity: 0.9 });
    const darkMat = new THREE.MeshLambertMaterial({ color: 0x222833, emissive: 0x111522, emissiveIntensity: 0.6 });
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.9), darkMat);
    barrel.position.set(0, 0.12, -0.1);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.34, 0.5), bodyMat);
    body.position.set(0, 0.1, 0.15);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.42, 0.22), darkMat);
    mag.position.set(0, -0.22, 0.22);
    mag.rotation.x = 0.25;
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.22, 0.42), darkMat);
    stock.position.set(0, 0.05, 0.52);
    g.add(barrel); g.add(body); g.add(mag); g.add(stock);
    // glowing base ring so it's easy to spot from a distance
    const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.7, 0.06, 8, 24),
        new THREE.MeshBasicMaterial({ color: 0x55aaff })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.55;
    g.add(ring);
    return g;
}
function randomFloorCell() {
    const cells = floorCells(MAZE);
    return cells[Math.floor(Math.random() * cells.length)];
}
function spawnPickups() {
    for (const p of pickups) scene.remove(p.mesh);
    pickups.length = 0;
    const kinds = [];
    for (let i = 0; i < CFG.pickupAmmo; i++) kinds.push('ammo');
    for (let i = 0; i < CFG.pickupHeal; i++) kinds.push('heal');
    for (const kind of kinds) {
        const c = randomFloorCell();
        const x = -WORLD_W / 2 + (c[0] + 0.5) * CS;
        const z = -WORLD_H / 2 + (c[1] + 0.5) * CS;
        const mesh = new THREE.Mesh(
            kind === 'ammo' ? pickupGeoAmmo : pickupGeoHeal,
            kind === 'ammo' ? pickupMatAmmo : pickupMatHeal
        );
        mesh.position.set(x, 0.5, z);
        scene.add(mesh);
        pickups.push({ kind, mesh, taken: false });
    }
    // Machine gun pickup: drop it well away from the player so it has to be found.
    if (mgPickup) { scene.remove(mgPickup); mgPickup = null; }
    const [sx, sz] = spawnPoint();
    const cells = floorCells(MAZE);
    let best = null, bestD = -1;
    for (const c of cells) {
        const x = -WORLD_W / 2 + (c[0] + 0.5) * CS;
        const z = -WORLD_H / 2 + (c[1] + 0.5) * CS;
        const d = (x - sx) * (x - sx) + (z - sz) * (z - sz);
        if (d > bestD) { bestD = d; best = c; }
    }
    const bx = -WORLD_W / 2 + (best[0] + 0.5) * CS;
    const bz = -WORLD_H / 2 + (best[1] + 0.5) * CS;
    const mgMesh = makeMgPickupMesh();
    mgMesh.position.set(bx, 0.8, bz);
    scene.add(mgMesh);
    mgPickup = mgMesh;
}
function updatePickups(dt) {
    for (const p of pickups) {
        if (p.taken) continue;
        p.mesh.rotation.y += dt * 2;
        p.mesh.position.y = 0.5 + Math.sin(performance.now() * 0.004 + p.mesh.id) * 0.12;
        const dx = p.mesh.position.x - player.pos.x;
        const dz = p.mesh.position.z - player.pos.z;
        if (dx * dx + dz * dz < 1.2 * 1.2 && !player.dead) {
            if (p.kind === 'ammo') {
                const w = player.weapons[player.weapon];
                const def = WEAPONS[player.weapon];
                if (w.ammo >= def.mag && w.reserve >= 300) continue; // nothing to gain, leave it
                const before = w.reserve;
                w.reserve = Math.min(300, w.reserve + 12);
                showMessage('+' + (w.reserve - before) + ' AMMO', false);
            } else {
                if (player.hp >= CFG.playerMaxHp) continue; // at max, leave it for later
                player.hp = Math.min(CFG.playerMaxHp, player.hp + 30);
                showMessage('+30 HP', false);
            }
            playPickup(p.kind);
            scene.remove(p.mesh);
            p.taken = true;
        }
    }
    // Machine gun pickup
    if (mgPickup) {
        mgPickup.rotation.y += dt * 1.2;
        mgPickup.position.y = 0.8 + Math.sin(performance.now() * 0.003) * 0.12;
        const dx = mgPickup.position.x - player.pos.x;
        const dz = mgPickup.position.z - player.pos.z;
        if (dx * dx + dz * dz < 1.3 * 1.3 && !player.dead && !player.ownsMg) {
            player.ownsMg = true;
            const mg = player.weapons.mg;
            mg.ammo = WEAPONS.mg.mag;
            mg.reserve = WEAPONS.mg.reserve;
            weaponMG.visible = (player.weapon === 'mg'); // only show if it's the active gun
            // Finding the MG doubles the monster horde relative to the INITIAL
            // wave: target = 2 × totalMonsters (e.g. 16 -> 32 total), regardless
            // of how many survived. Cycles through all 3 types so every type is
            // represented. `spawnOneMonster` may skip a cell too close to the
            // player, so retry until we reach the target (or the monsterMax cap).
            const target = Math.min(totalMonsters * 2, CFG.monsterMax);
            const waveTypes = ['stalker', 'gunner', 'brute'];
            let gi = 0, guard = 0;
            while (monsters.length < target && guard < 400) {
                spawnOneMonster(waveTypes[gi % waveTypes.length]);
                gi++;
                guard++;
            }
            showMessageLong('MACHINE GUN FOUND!<br><span style="font-size:18px">The horde doubles - brutes join!</span>', 4000);
            playPickup('mg');
            scene.remove(mgPickup);
            mgPickup = null;
        }
    }
}

// Floor plane
const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_W, WORLD_H),
    floorMat
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

// Simple geometry merge utility (concatenate position/normal/uv, index)
function mergeGeometries(geos) {
    if (geos.length === 0) return null;
    let totalVerts = 0, totalIdx = 0;
    for (const g of geos) {
        totalVerts += g.attributes.position.count;
        totalIdx += g.index ? g.index.count : g.attributes.position.count;
    }
    const pos = new Float32Array(totalVerts * 3);
    const norm = new Float32Array(totalVerts * 3);
    const uv = new Float32Array(totalVerts * 2);
    const index = new Uint32Array(totalIdx);
    let vo = 0, io = 0, base = 0;
    for (const g of geos) {
        const p = g.attributes.position.array;
        const n = g.attributes.normal.array;
        const u = g.attributes.uv ? g.attributes.uv.array : null;
        pos.set(p, vo * 3);
        norm.set(n, vo * 3);
        if (u) uv.set(u, vo * 2);
        if (g.index) {
            const gi = g.index.array;
            for (let i = 0; i < gi.length; i++) index[io + i] = gi[i] + base;
            io += gi.length;
        } else {
            const cnt = g.attributes.position.count;
            for (let i = 0; i < cnt; i++) index[io + i] = i + base;
            io += cnt;
        }
        base += g.attributes.position.count;
        vo += g.attributes.position.count;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    out.setIndex(new THREE.BufferAttribute(index, 1));
    return out;
}

// ---------------- Collision helpers ----------------
// Circle vs maze grid (world space). Returns whether a point (x,z) with radius r is free.
function circleFree(x, z, r) {
    const [gx0, gy0] = toGrid(x, z);
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            const gx = gx0 + dx, gy = gy0 + dy;
            if (!isWall(gx, gy)) continue;
            // AABB of this wall cell
            const minX = -WORLD_W / 2 + gx * CS;
            const maxX = minX + CS;
            const minZ = -WORLD_H / 2 + gy * CS;
            const maxZ = minZ + CS;
            const cx = Math.max(minX, Math.min(x, maxX));
            const cz = Math.max(minZ, Math.min(z, maxZ));
            const ddx = x - cx, ddz = z - cz;
            if (ddx * ddx + ddz * ddz < r * r) return false;
        }
    }
    return true;
}

// Ray vs maze grid: returns distance to first wall along direction (from origin o, dir d normalized), or maxDist.
function raycastMaze(ox, oz, dx, dz, maxDist) {
    // Step through grid cells using DDA-lite: sample along ray.
    let t = 0;
    const step = 0.25;
    while (t < maxDist) {
        t += step;
        const x = ox + dx * t;
        const z = oz + dz * t;
        const [gx, gy] = toGrid(x, z);
        if (isWall(gx, gy)) {
            // found wall at t (approx). Back off a bit.
            return Math.max(0, t - step);
        }
    }
    return maxDist;
}

// ---------------- Player state ----------------
const player = {
    pos: new THREE.Vector3(0, CFG.playerHeight, 0),
    vel: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    hp: CFG.playerMaxHp,
    kills: 0,
    dead: false,
    weapon: 'pistol',
    weapons: {},
    reloadTimer: 0,
    fireTimer: 0,
    burstLeft: 0,
    burstTimer: 0,
    forcePushCd: 0,
    forceLightCd: 0,
    hurtFlash: 0,
    run: true,          // RUN is always on (the SHIFT toggle was removed)
    ownsMg: false       // the MG must be found on the map before it can be used
};
player.weapons.pistol = { ammo: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve };
player.weapons.mg = { ammo: WEAPONS.mg.mag, reserve: WEAPONS.mg.reserve };
let paused = false;

function spawnPoint() {
    // Player spawns at the center of the map. The exact middle cell (12,12)
    // is sometimes a wall (even-sized maze), so if so fall back to the
    // nearest open floor cell.
    const ccx = Math.floor((MW - 1) / 2); // 12
    const ccy = Math.floor((MH - 1) / 2); // 12
    let gx = ccx, gy = ccy;
    if (!isWall(gx, gy)) {
        // center is open -> use it
    } else {
        // spiral outward to the nearest open floor cell
        outer: for (let r = 1; r < MW; r++) {
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
                    const nx = ccx + dx, ny = ccy + dy;
                    if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) continue;
                    if (!isWall(nx, ny)) { gx = nx; gy = ny; break outer; }
                }
            }
        }
    }
    return [-WORLD_W / 2 + (gx + 0.5) * CS, -WORLD_H / 2 + (gy + 0.5) * CS];
}

function facingOpenYaw(sx, sz) {
    const [gx, gy] = toGrid(sx, sz);
    const dirs = [
        [1, 0, 0], [1, 1, Math.PI / 4], [0, 1, Math.PI / 2],
        [-1, 1, -3 * Math.PI / 4], [-1, 0, Math.PI],
        [-1, -1, -Math.PI / 4], [0, -1, -Math.PI / 2], [1, -1, 3 * Math.PI / 4]
    ];
    for (const [dx, dy, yaw] of dirs) {
        if (!isWall(gx + dx, gy + dy)) return yaw;
    }
    return 0;
}

function resetPlayer() {
    const [sx, sz] = spawnPoint();
    player.pos.set(sx, CFG.playerHeight, sz);
    player.vel.set(0, 0, 0);
    player.hp = CFG.playerMaxHp;
    player.kills = 0;
    player.dead = false;
    player.weapon = 'pistol';
    player.ownsMg = false; // MG is found again on each (re)start
    player.weapons.pistol = { ammo: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve };
    player.weapons.mg = { ammo: WEAPONS.mg.mag, reserve: WEAPONS.mg.reserve };
    weaponMG.visible = false; // hide MG view-model until found
    player.yaw = facingOpenYaw(sx, sz);
    player.pitch = 0;
    player.reloadTimer = 0;
    player.fireTimer = 0;
    player.burstLeft = 0;
    player.burstTimer = 0;
    player.forcePushCd = 0;
    player.forceLightCd = 0;
    player.hurtFlash = 0;
    player.run = true;
    spawnTimer = 0;
    paused = false;
}

// ---------------- Minimap ----------------
const minimapCanvas = document.getElementById('minimap');
const minimapLabel = document.getElementById('minimap-label');
const minimapCtx = minimapCanvas ? minimapCanvas.getContext('2d') : null;
const MAP_SCALE = 8;
if (minimapCanvas) {
    minimapCanvas.width = MW * MAP_SCALE;
    minimapCanvas.height = MH * MAP_SCALE;
}
let minimapVisible = true; // map is always visible now (the TAB toggle was removed)
if (minimapCanvas) minimapCanvas.style.display = 'block';
if (minimapLabel) minimapLabel.style.display = 'none';

// ---------------- Input ----------------
const keys = {};
function setMinimap(on) {
    if (minimapVisible === on) return;
    minimapVisible = on;
    if (minimapCanvas) minimapCanvas.style.display = on ? 'block' : 'none';
    if (minimapLabel) minimapLabel.style.display = on ? 'none' : 'block';
}
window.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.code === 'KeyR') startReload();
    if (e.code === 'Digit1') switchWeapon('pistol');
    if (e.code === 'Digit2') switchWeapon('mg');
    if (e.code === 'KeyQ') useForcePush();
    if (e.code === 'KeyE') useForceLightning();
    if (e.code === 'Escape') togglePause();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

let mouseDown = false;
window.addEventListener('mousedown', e => {
    if (e.button === 0) mouseDown = true;
});
window.addEventListener('mouseup', e => {
    if (e.button === 0) mouseDown = false;
});

// Pointer lock + mouse look
const startEl = document.getElementById('start');
let locked = false;
startEl.addEventListener('click', () => {
    initAudio();
    canvas.requestPointerLock();
});
document.addEventListener('pointerlockchange', () => {
    locked = (document.pointerLockElement === canvas);
    startEl.style.display = locked ? 'none' : 'flex';
});
window.addEventListener('mousemove', e => {
    if (!locked || player.dead) return;
    const sens = 0.0022;
    player.yaw -= e.movementX * sens;
    player.pitch -= e.movementY * sens;
    player.pitch = Math.max(-1.4, Math.min(1.4, player.pitch));
});

// ---------------- Bullets ----------------
const bullets = []; // { mesh, vel, owner:'player'|'monster', damage, life, from }
const bulletGeo = new THREE.SphereGeometry(0.12, 8, 8);
const bulletMatPlayer = new THREE.MeshBasicMaterial({ color: 0xffff66 });
const bulletMatMonster = new THREE.MeshBasicMaterial({ color: 0xff4444 });

function fireBullet(owner, from, dir, speed, damage) {
    const mat = owner === 'player' ? bulletMatPlayer : bulletMatMonster;
    const mesh = new THREE.Mesh(bulletGeo, mat);
    mesh.position.copy(from);
    scene.add(mesh);
    bullets.push({
        mesh,
        vel: dir.clone().multiplyScalar(speed),
        owner,
        damage,
        life: CFG.bulletLife,
        from: from.clone()
    });
}

function curWeapon() { return WEAPONS[player.weapon]; }
function curAmmo() { return player.weapons[player.weapon]; }

function switchWeapon(name) {
    if (player.dead || player.weapon === name) return;
    if (name === 'mg' && !player.ownsMg) {
        showMessage('FIND THE MACHINE GUN ON THE MAP', false);
        return;
    }
    player.weapon = name;
    player.reloadTimer = 0;
    player.burstLeft = 0;
    player.burstTimer = 0;
    player.fireTimer = 0.12; // small switch delay
    weaponPistol.visible = (name === 'pistol');
    weaponMG.visible = (name === 'mg');
    weapon = name === 'pistol' ? weaponPistol : weaponMG;
    showMessage('WEAPON: ' + WEAPONS[name].name, false);
}

function startReload() {
    if (player.dead || player.reloadTimer > 0) return;
    const w = curAmmo(), def = curWeapon();
    if (w.ammo >= def.mag || w.reserve <= 0) return;
    player.reloadTimer = CFG.reloadTime;
}

// ---------------- Monsters ----------------
const monsters = [];

function makeMonsterMesh(def, type) {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: def.color });
    const body = new THREE.Mesh(
        new THREE.CylinderGeometry(def.radius, def.radius, def.height * 0.7, 10),
        bodyMat
    );
    body.position.y = def.height * 0.35;
    g.add(body);
    const head = new THREE.Mesh(
        new THREE.SphereGeometry(def.radius * 0.8, 10, 8),
        bodyMat
    );
    head.position.y = def.height * 0.85;
    g.add(head);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    const eyeGeo = new THREE.SphereGeometry(0.08, 6, 6);
    const e1 = new THREE.Mesh(eyeGeo, eyeMat);
    e1.position.set(0.18, def.height * 0.9, def.radius * 0.6);
    const e2 = new THREE.Mesh(eyeGeo, eyeMat);
    e2.position.set(-0.18, def.height * 0.9, def.radius * 0.6);
    g.add(e1); g.add(e2);
    g.userData = { bodyMat, baseColor: new THREE.Color(def.color), def, type };
    return g;
}

// Which monster classes are available to spawn RIGHT NOW. Before the player
// finds the machine gun only the green stalker and orange gunner exist; after
// the MG is found the red brute joins the pool.
function monsterSpawnTypes() {
    return player.ownsMg ? ['stalker', 'gunner', 'brute'] : ['stalker', 'gunner'];
}
function spawnMonsters(count) {
    totalMonsters = count;
    // clear existing
    for (const m of monsters) scene.remove(m.mesh);
    monsters.length = 0;
    const cells = floorCells(MAZE);
    const [sx, sz] = spawnPoint();
    const types = monsterSpawnTypes();
    // Keep the initial spawns well away from the player so they start in a
    // monster-free area (no immediate combat at spawn). 10 cells = 40 world units.
    const minDist = 10 * CS;
    const used = new Set();
    for (let i = 0; i < count; i++) {
        // pick a random open floor cell across the whole map (not clustered),
        // avoiding stacking on the same cell and staying a bit off the player.
        let c = null, x = 0, z = 0, ok = false;
        for (let tries = 0; tries < 80 && !ok; tries++) {
            c = cells[Math.floor(Math.random() * cells.length)];
            if (used.has(c[0] + ',' + c[1])) continue;
            x = -WORLD_W / 2 + (c[0] + 0.5) * CS;
            z = -WORLD_H / 2 + (c[1] + 0.5) * CS;
            if (Math.hypot(x - sx, z - sz) < minDist) continue;
            ok = true;
        }
        if (!ok) { // fallback: any unused cell
            const free = cells.filter(cc => !used.has(cc[0] + ',' + cc[1]));
            if (!free.length) continue;
            c = free[Math.floor(Math.random() * free.length)];
            x = -WORLD_W / 2 + (c[0] + 0.5) * CS;
            z = -WORLD_H / 2 + (c[1] + 0.5) * CS;
        }
        used.add(c[0] + ',' + c[1]);
        const type = types[i % types.length];
        const def = MONSTERS[type];
        const hp = Math.round(def.hp * difficulty.hp);
        const mesh = makeMonsterMesh(def, type);
        mesh.position.set(x, 0, z);
        scene.add(mesh);
        monsters.push({
            type,
            def,
            mesh,
            hp,
            maxHp: hp,
            attackTimer: Math.random() * def.attackCooldown,
            contactCd: 0,
            forceCd: def.forcePower ? def.forceCd * (0.4 + Math.random() * 0.6) : 999,
            stunTimer: 0,
            speed: def.speed * difficulty.speed * (0.9 + Math.random() * 0.2),
            dmgMul: difficulty.dmg,
            aggro: difficulty.aggro,
            encountered: false
        });
    }
}

// Spawn a single extra monster (used by the constant-spawn path and the MG double-horde).
// `type` is optional; when omitted a random type from the current pool is chosen.
function spawnOneMonster(type) {
    if (monsters.length >= CFG.monsterMax) return;
    if (!type) {
        const types = monsterSpawnTypes();
        type = types[Math.floor(Math.random() * types.length)];
    }
    const def = MONSTERS[type];
    const c = randomFloorCell();
    const x = -WORLD_W / 2 + (c[0] + 0.5) * CS;
    const z = -WORLD_H / 2 + (c[1] + 0.5) * CS;
    const [sx, sz] = spawnPoint();
    if (Math.hypot(x - sx, z - sz) < 10) return;
    const hp = Math.round(def.hp * difficulty.hp);
    const mesh = makeMonsterMesh(def, type);
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    monsters.push({
        type, def, mesh, hp, maxHp: hp,
        attackTimer: Math.random() * def.attackCooldown,
        contactCd: 0,
        forceCd: def.forcePower ? def.forceCd * (0.4 + Math.random() * 0.6) : 999,
        stunTimer: 0,
        speed: def.speed * difficulty.speed * (0.9 + Math.random() * 0.2),
        dmgMul: difficulty.dmg,
        aggro: difficulty.aggro,
        encountered: false
    });
}

function updateMonsterTint(m) {
    const ratio = Math.max(0, m.hp / m.maxHp);
    const mat = m.mesh.userData.bodyMat;
    const base = m.mesh.userData.baseColor;
    const c = new THREE.Color().copy(base).lerp(new THREE.Color(0x000000), 1 - ratio);
    mat.color.copy(c);
}

// ---------------- AI ----------------
function lineOfSight(ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.001) return true;
    const ndx = dx / dist, ndz = dz / dist;
    const t = raycastMaze(ax, az, ndx, ndz, dist);
    return t >= dist - 0.3;
}

function randStun(min, max) { return min + Math.random() * (max - min); }

function updateMonster(m, dt) {
    if (player.dead) return;
    const px = player.pos.x, pz = player.pos.z;
    const mx = m.mesh.position.x, mz = m.mesh.position.z;
    const dx = px - mx, dz = pz - mz;
    const dist = Math.hypot(dx, dz);
    const toX = dx / (dist || 1), toZ = dz / (dist || 1);
    const los = lineOfSight(mx, mz, px, pz);

    // first sight of the player = encounter (unlocks monster-on-monster combat)
    if (los && !m.encountered) m.encountered = true;

    // STUN: a stunned monster can't move, face, or attack (flickers toward white).
    if (m.stunTimer > 0) {
        m.stunTimer -= dt;
        updateMonsterTint(m);                       // current HP fade first...
        const u = m.mesh.userData;
        u.bodyMat.color.lerp(new THREE.Color(0xffffff), 0.6); // ...then a white stun flash
        return;
    }

    // face player
    m.mesh.rotation.y = Math.atan2(toX, toZ);

    // attack player
    m.attackTimer -= dt;
    if (m.contactCd > 0) m.contactCd -= dt;
    if (m.forceCd > 0) m.forceCd -= dt;
    if (m.attackTimer <= 0 && dist < m.def.attackRange && los) {
        m.attackTimer = m.def.attackCooldown;
        const dmg = m.def.damage * (m.dmgMul || 1);
        if (m.def.rangeAttack) {
            const from = new THREE.Vector3(mx, m.def.height * 0.6, mz);
            const dirv = new THREE.Vector3(toX, 0, toZ);
            dirv.x += (Math.random() - 0.5) * 0.08;
            dirv.z += (Math.random() - 0.5) * 0.08;
            dirv.normalize();
            fireBullet('monster', from, dirv, m.def.bulletSpeed, dmg);
            playShot(false, dist);
        } else {
            // Direct contact: harmful but capped so a single hit can't one-shot the player.
            if (m.contactCd <= 0) {
                const cdmg = Math.min(dmg, CFG.contactDamageMax);
                player.hp -= cdmg;
                player.hurtFlash = 0.4;
                m.contactCd = CFG.contactCooldown;
                playHit();
                if (player.hp <= 0) killPlayer();
            }
        }
    }

    // Monster force powers (independent of the basic attack timer):
    //  - gunner: Force Push (blasts the player away)
    //  - brute:  Force Push AND Force Lightning (alternates)
    if (m.def.forcePower && m.forceCd <= 0 && los && !player.dead) {
        const isGunner = m.def.forcePower === 'push';
        if (isGunner) {
            if (dist < CFG.monsterPushRadius) {
                monsterForcePush(m);
                m.forceCd = m.def.forceCd;
            }
        } else {
            // brute: alternate between lightning (longer reach) and push
            if (dist < CFG.monsterLightRange) {
                monsterForceLightning(m);
            } else if (dist < CFG.monsterPushRadius) {
                monsterForcePush(m);
            } else {
                m.forceCd = 0.5; // still out of range: re-check shortly
                return;
            }
            m.forceCd = m.def.forceCd;
        }
    }

    // monster-on-monster combat: only once this monster has encountered the player
    if (m.encountered) {
        for (const o of monsters) {
            if (o === m) continue;
            const odx = o.mesh.position.x - mx, odz = o.mesh.position.z - mz;
            const od = Math.hypot(odx, odz);
            if (od < 1.6) {
                if (m.attackTimer <= 0) {
                    m.attackTimer = m.def.attackCooldown;
                    o.hp -= m.def.damage * 0.6;
                    playHit();
                    if (o.hp <= 0) killMonster(o, m);
                }
                break;
            }
        }
    }

    // movement: chase player if LOS (within aggro) and far, else wander
    if (los && dist > m.def.attackRange * 0.8 && dist < 40 * (m.aggro || 1)) {
        moveMonster(m, toX, toZ, dt);
    } else if (!los) {
        wander(m, dt);
    }

    // bobbing
    m.mesh.position.y = Math.abs(Math.sin(performance.now() * 0.005 + m.mesh.id)) * 0.08;
    updateMonsterTint(m);
}

function moveMonster(m, dx, dz, dt) {
    const step = m.speed * dt;
    const nx = m.mesh.position.x + dx * step;
    const nz = m.mesh.position.z + dz * step;
    if (circleFree(nx, nz, m.def.radius)) {
        m.mesh.position.x = nx;
        m.mesh.position.z = nz;
    } else {
        // try axis-aligned slide
        if (circleFree(nx, m.mesh.position.z, m.def.radius)) m.mesh.position.x = nx;
        else if (circleFree(m.mesh.position.x, nz, m.def.radius)) m.mesh.position.z = nz;
    }
}

function wander(m, dt) {
    if (Math.random() < 0.02) {
        m.wanderDir = Math.random() * Math.PI * 2;
    }
    const wd = m.wanderDir !== undefined ? m.wanderDir : 0;
    moveMonster(m, Math.cos(wd), Math.sin(wd), dt);
}

// ---------------- Shooting (player) ----------------
function shoot() {
    const def = curWeapon();
    const w = curAmmo();
    if (player.dead) return;
    // burst handling: MG fires `burst` rounds, then pauses, then repeats.
    // burstTimer is ONLY the inter-burst pause; burstLeft counts rounds remaining
    // in the current series. It is never set until a series finishes, so the
    // first shot of a series is never swallowed.
    if (def.burst > 1) {
        if (player.burstTimer > 0) return;          // still in the inter-burst pause
        if (player.burstLeft <= 0) player.burstLeft = def.burst; // start a fresh series
    }
    if (player.fireTimer > 0) return;
    if (w.ammo <= 0) { startReload(); player.burstLeft = 0; return; }
    w.ammo--;
    player.fireTimer = def.cooldown;
    const dir = getLookDir();
    const from = player.pos.clone();
    fireBullet('player', from, dir, def.speed, def.damage);
    muzzleLight.intensity = 2.5;
    weaponRecoil = 0.08;
    playShot(true, 0);
    if (def.burst > 1) {
        player.burstLeft--;
        if (player.burstLeft <= 0) {
            player.burstTimer = def.burstPause;     // series done -> pause before next
            player.burstLeft = 0;
        }
    }
    if (w.ammo === 0) { startReload(); player.burstLeft = 0; }
}

function getLookDir() {
    const cp = Math.cos(player.pitch), sp = Math.sin(player.pitch);
    const cy = Math.cos(player.yaw), sy = Math.sin(player.yaw);
    // forward direction
    return new THREE.Vector3(-sy * cp, sp, -cy * cp).normalize();
}

const muzzleLight = new THREE.PointLight(0xffff99, 0, 8);
scene.add(muzzleLight);

// ---------------- Force powers ----------------
const forceFx = []; // { mesh, life, maxLife, type }
function addForceFx(x, y, z, type) {
    let mesh;
    if (type === 'push') {
        const mat = new THREE.MeshBasicMaterial({ color: 0x88ccff, transparent: true, opacity: 0.6 });
        mesh = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 10), mat);
    } else {
        const mat = new THREE.MeshBasicMaterial({ color: 0x88aaff, transparent: true, opacity: 0.9 });
        mesh = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 8), mat);
    }
    mesh.position.set(x, y, z);
    scene.add(mesh);
    forceFx.push({ mesh, life: 0.4, maxLife: 0.4, type });
}
function updateForceFx(dt) {
    for (let i = forceFx.length - 1; i >= 0; i--) {
        const f = forceFx[i];
        f.life -= dt;
        if (f.life <= 0) {
            scene.remove(f.mesh);
            f.mesh.material.dispose();
            f.mesh.geometry.dispose();
            forceFx.splice(i, 1);
            continue;
        }
        const t = 1 - f.life / f.maxLife;
        if (f.type === 'push') {
            const s = 1 + t * (CFG.pushRadius / 0.4);
            f.mesh.scale.set(s, s, s);
            f.mesh.material.opacity = 0.6 * (1 - t);
        } else {
            f.mesh.scale.set(1 + t * 2, 1 + t * 2, 1 + t * 2);
            f.mesh.material.opacity = 0.9 * (1 - t);
        }
    }
}
// ---------------- Force Lightning FX (animated ignition) ----------------
// Unit-length bolt geometry built in +Y (from (0,0,0) up to (0,1,0)).
// `branches` = number of forked sub-bolts, `jitter` = lateral roughness,
// `segs` = resolution of the main channel (more = finer zig-zag).
function makeBoltGeometry(branches, jitter, segs) {
    const pos = [];
    const addSeg = (a, b) => { pos.push(a.x, a.y, a.z, b.x, b.y, b.z); };
    segs = segs || 20;
    const pts = [new THREE.Vector3(0, 0, 0)];
    let x = 0, z = 0;
    for (let i = 1; i < segs; i++) {
        const t = i / segs;
        x += (Math.random() * 2 - 1) * jitter;
        z += (Math.random() * 2 - 1) * jitter;
        // keep the mid-section centered so the tip can snap to (0,1,0)
        x *= 0.82;
        z *= 0.82;
        pts.push(new THREE.Vector3(x, t, z));
    }
    pts.push(new THREE.Vector3(0, 1, 0)); // exact tip
    for (let i = 0; i < pts.length - 1; i++) addSeg(pts[i], pts[i + 1]);
    // branches: jagged forks that shoot OUTWARD (away from the bolt axis),
    // like real lightning forking off the main channel.
    for (let b = 0; b < branches; b++) {
        const anchor = pts[2 + Math.floor(Math.random() * (segs - 4))];
        let bx = anchor.x, by = anchor.y, bz = anchor.z;
        const len = 3 + Math.floor(Math.random() * 3);
        // pick a direction roughly perpendicular to the bolt (lateral)
        const ang = Math.random() * Math.PI * 2;
        let ddx = Math.cos(ang), ddz = Math.sin(ang);
        // nudge a little upward so it forks along the bolt, not straight down
        const up = 0.12 + Math.random() * 0.12;
        for (let s = 0; s < len; s++) {
            const r = 0.10 + Math.random() * 0.14;
            const px2 = bx + ddx * r + (Math.random() * 2 - 1) * 0.05;
            const py2 = by + up + Math.random() * 0.06;
            const pz2 = bz + ddz * r + (Math.random() * 2 - 1) * 0.05;
            addSeg(new THREE.Vector3(bx, by, bz), new THREE.Vector3(px2, py2, pz2));
            bx = px2; by = py2; bz = pz2;
        }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return geo;
}

// A single lightning bolt object (one LineSegments + its material).
function makeBoltObj(branches, jitter, color, opacity, additive) {
    const mat = new THREE.LineBasicMaterial({
        color, transparent: true, opacity, depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
    });
    const line = new THREE.LineSegments(makeBoltGeometry(branches, jitter), mat);
    return { line, mat };
}

const lightningFx = [];
function spawnLightningFx(px, pz, dir) {
    const len = 18;
    const origin = new THREE.Vector3(px, CFG.playerHeight - 0.2, pz);
    const g = new THREE.Group();

    // The main channel: a bright white-blue core + a wider soft blue glow.
    const core = makeBoltObj(6, 0.5, 0xf2f9ff, 1, true);
    const glow = makeBoltObj(4, 0.7, 0x5588ff, 0.55, true);
    g.add(core.line);
    g.add(glow.line);

    // A "flash cone" volume of light along the beam (wide additive cylinder).
    const coneMat = new THREE.MeshBasicMaterial({ color: 0x88bbff, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, len, 12, 1, true), coneMat);
    g.add(cone);

    // Spark particles that scatter at the impact point.
    const sparkGeo = new THREE.SphereGeometry(0.05, 4, 4);
    const sparkMat = new THREE.MeshBasicMaterial({ color: 0xcfe4ff, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending });
    const sparks = [];
    for (let i = 0; i < 16; i++) {
        const s = new THREE.Mesh(sparkGeo, sparkMat);
        const a = Math.random() * Math.PI * 2;
        const r = 0.2 + Math.random() * 0.6;
        s.userData.vel = new THREE.Vector3(Math.cos(a) * r, 0.4 + Math.random() * 1.2, Math.sin(a) * r);
        g.add(s);
        sparks.push(s);
    }

    const light = new THREE.PointLight(0xaad4ff, 0, 24);
    g.add(light);
    scene.add(g);

    const dirv = new THREE.Vector3(dir.x, 0, dir.z).normalize();
    const toY = new THREE.Vector3(0, 1, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(toY, dirv);
    // orient the bolt group: its +Y axis now points along the aim
    g.quaternion.copy(q);
    g.position.copy(origin);

    lightningFx.push({
        group: g,
        core, glow, cone, coneMat, sparks, sparkMat, light,
        origin: origin.clone(), dir: dirv.clone(), len,
        life: 0.9, maxLife: 0.9, born: 0
    });
}

function updateLightningFx(dt) {
    for (let i = lightningFx.length - 1; i >= 0; i--) {
        const f = lightningFx[i];
        f.life -= dt;
        f.born += dt;
        if (f.life <= 0) {
            scene.remove(f.group);
            f.core.line.geometry.dispose();
            f.core.mat.dispose();
            f.glow.line.geometry.dispose();
            f.glow.mat.dispose();
            f.cone.geometry.dispose();
            f.coneMat.dispose();
            f.sparkMat.dispose();
            lightningFx.splice(i, 1);
            continue;
        }
        const t = f.born / f.maxLife;                 // 0 -> 1
        // ignition: bolt length grows fast from the player toward the target
        const reach = Math.min(1, t * 2.6);          // fully extended by ~38% of lifetime
        const coreLen = f.len * reach;
        // place bolt so it extends forward from the player by coreLen
        const mid = f.origin.clone().addScaledVector(f.dir, coreLen / 2);
        f.group.position.copy(mid);
        f.core.line.scale.set(1, coreLen, 1);
        f.glow.line.scale.set(1, coreLen, 1);
        f.cone.scale.set(1, coreLen, 1);

        // sustained flicker for the WHOLE lifetime (long, sputtering arc)
        const flicker = 0.5 + 0.5 * Math.random();
        const flick2 = 0.6 + 0.4 * Math.random();
        // hold brightness for most of the life, fade only in the last 30%
        const fade = t < 0.7 ? 1 : Math.max(0, 1 - (t - 0.7) / 0.3);
        f.core.mat.opacity = 1 * fade * flicker;
        f.glow.mat.opacity = 0.5 * fade * flick2;
        f.coneMat.opacity = 0.28 * fade * flicker;

        // impact sparks: fly outward from the tip, then fade
        const tipDist = f.len; // sparks originate at the bolt tip
        for (const s of f.sparks) {
            const u = s.userData;
            const lt = t; // 0..1 over life
            const sd = Math.min(1, lt * 2.2); // sparks spread over first ~45%
            // position along a short outward arc from the tip
            const ox = u.vel.x * sd * 1.5;
            const oy = u.vel.y * sd * 1.2;
            const oz = u.vel.z * sd * 1.5;
            // place relative to the group origin (group is at the mid-point);
            // offset to the tip then apply the spark offset in bolt space (+Y)
            s.position.set(ox, tipDist + oy, oz);
            s.material.opacity = 1 * fade * (1 - sd);
        }

        // light: strong at the impact tip, flickering, fades near the end
        f.light.position.copy(f.origin).addScaledVector(f.dir, tipDist);
        f.light.intensity = 30 * fade * flicker;
    }
}

// ---------------- Force powers (shared by player + monsters) ----------------
// Slide a circle outward from (px,pz) until it hits a wall (used by push).
function pushOut(px, pz, tx, tz, radius, push) {
    const d0 = Math.hypot(tx - px, tz - pz);
    if (d0 < 0.001) return [tx, tz];
    const ux = (tx - px) / d0, uz = (tz - pz) / d0;
    let cx = tx, cz = tz;
    const step = 0.4;
    for (let s = 0; s < Math.ceil(push / step); s++) {
        const nx = cx + ux * step, nz = cz + uz * step;
        if (!circleFree(nx, nz, radius)) break;
        cx = nx; cz = nz;
    }
    return [cx, cz];
}
// A radial force push: flings every `target` within `radius` away from (px,pz).
// `stun` optionally stuns each target; `fx` draws a shockwave.
function doForcePush(px, pz, targets, radius, force, stun, fx) {
    let any = false;
    for (const m of targets) {
        const dx = m.mesh.position.x - px, dz = m.mesh.position.z - pz;
        const d = Math.hypot(dx, dz);
        if (d < radius && d > 0.001) {
            const fall = 1 - d / radius;
            const push = force * fall * 0.12;
            const [cx, cz] = pushOut(px, pz, m.mesh.position.x, m.mesh.position.z, m.def.radius, push);
            m.mesh.position.x = cx;
            m.mesh.position.z = cz;
            if (stun) m.stunTimer = randStun(CFG.pushStunMin, CFG.pushStunMax);
            if (fx) addForceFx(cx, m.mesh.position.y + m.def.height * 0.5, cz, 'push');
            any = true;
        }
    }
    return any;
}
// A linear force lightning: zaps every `target` in the aim cone.
// `damage` is flat HP (so it CAN kill). `fx` draws the bolt; `stun` is kept for
// future use (player lightning no longer stuns).
function doForceLightning(px, pz, dir, targets, range, damage, fx, stun) {
    let hitAny = false;
    for (const m of targets) {
        const dx = m.mesh.position.x - px, dz = m.mesh.position.z - pz;
        const d = Math.hypot(dx, dz);
        if (d > range || d < 0.001) continue;
        const dot = (dx / d) * dir.x + (dz / d) * dir.z;
        if (dot < 0.55) continue; // not in front
        const los = lineOfSight(px, pz, m.mesh.position.x, m.mesh.position.z);
        if (!los) continue;
        m.hp -= damage;
        if (stun) m.stunTimer = randStun(CFG.pushStunMin, CFG.pushStunMax);
        hitAny = true;
        if (fx) addForceFx(m.mesh.position.x, m.mesh.position.y + m.def.height * 0.5, m.mesh.position.z, 'light');
        if (m.hp <= 0) killMonster(m, 'player');
    }
    return hitAny;
}
// Player: Force Push (Q).
function useForcePush() {
    if (player.dead || paused || player.forcePushCd > 0) return;
    player.forcePushCd = CFG.forceCooldown;
    const px = player.pos.x, pz = player.pos.z;
    doForcePush(px, pz, monsters, CFG.pushRadius, CFG.pushForce, true, true);
    addForceFx(px + (-Math.sin(player.yaw)) * 2, CFG.playerHeight, pz + (-Math.cos(player.yaw)) * 2, 'push');
    playForce('push');
    showMessage('FORCE PUSH', false);
}
// Player: Force Lightning (E). Flat 2x-pistol damage, no stun (so it can kill).
function useForceLightning() {
    if (player.dead || paused || player.forceLightCd > 0) return;
    player.forceLightCd = CFG.forceCooldown;
    const dir = getLookDir();
    const px = player.pos.x, pz = player.pos.z;
    const hitAny = doForceLightning(px, pz, dir, monsters, CFG.lightningRange, CFG.lightningDamage, true, false);
    if (hitAny) spawnLightningFx(px, pz, dir);
    playForce('light');
    showMessage('FORCE LIGHTNING', false);
}
// Monster: Force Push — flings the PLAYER away (slides to a free spot).
function monsterForcePush(m) {
    const mx = m.mesh.position.x, mz = m.mesh.position.z;
    const px = player.pos.x, pz = player.pos.z;
    const [cx, cz] = pushOut(mx, mz, px, pz, CFG.playerRadius, CFG.pushForce * 0.12);
    player.pos.x = cx;
    player.pos.z = cz;
    addForceFx(player.pos.x, CFG.playerHeight * 0.6, player.pos.z, 'push');
    playForce('push');
}
// Monster: Force Lightning — a bolt from the monster that zaps the player.
function monsterForceLightning(m) {
    const mx = m.mesh.position.x, mz = m.mesh.position.z;
    const px = player.pos.x, pz = player.pos.z;
    const d = Math.hypot(px - mx, pz - mz) || 1;
    const dir = new THREE.Vector3((px - mx) / d, 0, (pz - mz) / d);
    // Red brutes are weakened: their lightning deals reduced damage.
    const dmg = m.def === MONSTERS.brute ? CFG.bruteLightningDamage : CFG.lightningDamage;
    player.hp -= dmg;
    player.hurtFlash = 0.4;
    spawnLightningFx(mx, mz, dir);
    addForceFx(px, CFG.playerHeight * 0.6, pz, 'light');
    playForce('light');
    if (player.hp <= 0) killPlayer();
}

// ---------------- Pause ----------------
function togglePause() {
    if (player.dead || won) return;
    paused = !paused;
    if (paused) {
        document.exitPointerLock();
        startEl.style.display = 'flex';
        startEl.querySelector('h1').textContent = 'PAUSED';
        startEl.querySelector('p').textContent = 'Press ESC to resume';
    } else {
        canvas.requestPointerLock();
        startEl.style.display = 'none';
    }
}

// ---------------- Update bullets ----------------
function updateBullets(dt) {
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.life -= dt;
        if (b.life <= 0) { removeBullet(i); continue; }
        const step = b.vel.x * dt;
        const stepZ = b.vel.z * dt;
        let nx = b.mesh.position.x + step;
        let nz = b.mesh.position.z + stepZ;

        // wall collision
        const [gx, gy] = toGrid(nx, nz);
        if (isWall(gx, gy)) { removeBullet(i); continue; }

        // hit test against monsters or player
        let hit = false;
        if (b.owner === 'player') {
            for (const m of monsters) {
                const dx = nx - m.mesh.position.x;
                const dz = nz - m.mesh.position.z;
                const rr = m.def.radius + 0.15;
                if (dx * dx + dz * dz < rr * rr) {
                    m.hp -= b.damage;
                    hit = true;
                    playHit();
                    if (m.hp <= 0) killMonster(m);
                    break;
                }
            }
        } else {
            const dx = nx - player.pos.x;
            const dz = nz - player.pos.z;
            const rr = CFG.playerRadius + 0.15;
            if (dx * dx + dz * dz < rr * rr && player.pos.y > 0.3) {
                player.hp -= b.damage;
                player.hurtFlash = 0.4;
                hit = true;
                playHit();
                if (player.hp <= 0) killPlayer();
            }
        }
        if (hit) { removeBullet(i); continue; }

        b.mesh.position.x = nx;
        b.mesh.position.z = nz;
    }
}

function removeBullet(i) {
    scene.remove(bullets[i].mesh);
    bullets.splice(i, 1);
}

// ---------------- Kill / win / lose ----------------
const explosions = [];
// Shared explosion geometries (unit scale, scaled per-effect).
const expCoreGeo = new THREE.SphereGeometry(0.3, 24, 24);
const expSmokeGeo = new THREE.SphereGeometry(0.4, 12, 12);
const expRingGeo = new THREE.TorusGeometry(0.5, 0.06, 8, 40);
const expDebrisGeo = new THREE.TetrahedronGeometry(0.09);
const expFlashGeo = new THREE.SphereGeometry(0.16, 8, 8);
// A radial "shockwave" texture: a bright ring that fades toward the edge, so the
// expanding shell reads as a real pressure wave (drawn once, shared by all).
const shockTex = (function () {
    const c = document.createElement('canvas'); c.width = 128; c.height = 128;
    const ctx = c.getContext('2d');
    const grd = ctx.createRadialGradient(64, 64, 18, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(0.55, 'rgba(255,255,255,0)');
    grd.addColorStop(0.72, 'rgba(255,240,210,0.95)');
    grd.addColorStop(0.86, 'rgba(255,150,60,0.55)');
    grd.addColorStop(1, 'rgba(120,40,20,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    return t;
})();
// Hot->cool fireball palette, driven by lifetime.
function fireballColor(t) {
    // t: 0 (birth) -> 1 (death)
    let c;
    if (t < 0.15) {
        c = new THREE.Color().setHSL(0.55, 0.9, 0.9);          // electric blue-white flash
    } else if (t < 0.45) {
        const k = (t - 0.15) / 0.30;                            // blue-white -> orange
        c = new THREE.Color(0x66ccff).lerp(new THREE.Color(0xff7722), k);
    } else {
        const k = (t - 0.45) / 0.55;                            // orange -> deep red -> dark
        c = new THREE.Color(0xff7722).lerp(new THREE.Color(0x2a1005), k);
    }
    return c;
}
function spawnExplosion(x, y, z, size) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    scene.add(g);
    // --- core fireball ---
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending });
    const core = new THREE.Mesh(expCoreGeo, coreMat);
    g.add(core);
    // --- ground shockwave: an expanding textured disk ---
    const shockMat = new THREE.MeshBasicMaterial({ color: 0xffddaa, map: shockTex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const shock = new THREE.Mesh(new THREE.CircleGeometry(1, 32), shockMat);
    shock.rotation.x = -Math.PI / 2;
    shock.position.y = -y + 0.02; // sit on the floor
    g.add(shock);
    // --- bright ring (torus) ---
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffcc88, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const ring = new THREE.Mesh(expRingGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
    // --- smoke puffs ---
    const smokeMat = new THREE.MeshBasicMaterial({ color: 0x44403a, transparent: true, opacity: 0, depthWrite: false });
    const smoke = new THREE.Group();
    for (let i = 0; i < 7; i++) {
        const puff = new THREE.Mesh(expSmokeGeo, smokeMat);
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * 0.35;
        puff.position.set(Math.cos(a) * r, Math.random() * 0.5, Math.sin(a) * r);
        puff.userData.vel = new THREE.Vector3((Math.random() - 0.5) * 0.9, 1.3 + Math.random() * 0.8, (Math.random() - 0.5) * 0.9);
        puff.userData.scale = 0.6 + Math.random() * 0.6;
        puff.userData.grow = 1.6 + Math.random() * 0.8;
        puff.userData.spin = (Math.random() - 0.5) * 4;
        smoke.add(puff);
    }
    g.add(smoke);
    // --- debris chunks (fly out, spin, fall, fade) ---
    const debrisMat = new THREE.MeshBasicMaterial({ color: 0xff9944, transparent: true, opacity: 1, depthWrite: false });
    const debris = [];
    for (let i = 0; i < 18; i++) {
        const d = new THREE.Mesh(expDebrisGeo, debrisMat);
        const a = Math.random() * Math.PI * 2;
        const el = Math.random() * Math.PI * 0.6;
        const sp = 1.6 + Math.random() * 2.4;
        d.position.set(Math.cos(a) * Math.cos(el) * 0.3, 0.2 + Math.sin(el) * 0.3, Math.sin(a) * Math.cos(el) * 0.3);
        d.userData.vel = new THREE.Vector3(Math.cos(a) * Math.cos(el) * sp, Math.sin(el) * sp + 1.0, Math.sin(a) * Math.cos(el) * sp);
        d.userData.rot = new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8);
        g.add(d);
        debris.push(d);
    }
    // --- spark flashes (small bright pings) ---
    const sparkMat = new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending });
    const sparks = [];
    for (let i = 0; i < 10; i++) {
        const s = new THREE.Mesh(expFlashGeo, sparkMat);
        const a = Math.random() * Math.PI * 2;
        const el = Math.random() * Math.PI;
        const sp = 2.4 + Math.random() * 3.0;
        s.position.set(0, 0, 0);
        s.userData.vel = new THREE.Vector3(Math.cos(a) * Math.cos(el) * sp, Math.abs(Math.sin(el)) * sp, Math.sin(a) * Math.cos(el) * sp);
        s.userData.life = 0.35 + Math.random() * 0.3;
        s.userData.age = 0;
        g.add(s);
        sparks.push(s);
    }
    const light = new THREE.PointLight(0xff9955, 0, 14 + size * 6);
    g.add(light);
    explosions.push({ group: g, core, coreMat, shock, shockMat, ring, ringMat, smoke, smokeMat, debris, debrisMat, sparks, sparkMat, light, life: 1.3, maxLife: 1.3, size, born: 0 });
}
function updateExplosions(dt) {
    for (let i = explosions.length - 1; i >= 0; i--) {
        const e = explosions[i];
        e.life -= dt;
        e.born += dt;
        if (e.life <= 0) {
            scene.remove(e.group);
            e.coreMat.dispose(); e.ringMat.dispose(); e.smokeMat.dispose();
            e.shockMat.dispose(); e.debrisMat.dispose(); e.sparkMat.dispose();
            e.shock.geometry.dispose();
            explosions.splice(i, 1);
            continue;
        }
        const t = 1 - e.life / e.maxLife;   // 0 (birth) -> 1 (death)
        const s = e.size;
        // --- flash + fireball (core): fast flash then expand & cool ---
        const flashT = Math.min(1, e.born / 0.12);
        const coreScale = s * (0.4 + 0.6 * flashT) * (1 + Math.max(0, e.born - 0.12) * 2.4);
        e.core.scale.set(coreScale, coreScale * (1 - 0.25 * t), coreScale); // squash slightly as it settles
        e.coreMat.color.copy(fireballColor(t));
        e.coreMat.opacity = t < 0.12 ? 1 : Math.max(0, 1 - (t - 0.12) / 0.75);
        // --- ground shockwave disk: expands fast, fades ---
        const shockT = Math.min(1, e.born / 0.4);
        const shockScale = s * (0.3 + shockT * 4.2);
        e.shock.scale.set(shockScale, shockScale, 1);
        e.shockMat.opacity = Math.max(0, 0.85 * (1 - shockT));
        // --- bright ring: quick expand + fade ---
        const ringT = Math.min(1, e.born / 0.35);
        const ringScale = s * (0.4 + ringT * 3.4);
        e.ring.scale.set(ringScale, ringScale, 1);
        e.ringMat.opacity = Math.max(0, 0.9 * (1 - ringT));
        // --- smoke: rise, expand, spin, fade ---
        const smokeT = Math.min(1, e.born / 1.0);
        for (const puff of e.smoke.children) {
            const u = puff.userData;
            puff.position.x += u.vel.x * dt;
            puff.position.y += u.vel.y * dt;
            puff.position.z += u.vel.z * dt;
            u.vel.y *= (1 - dt * 0.6);
            puff.rotation.y += u.spin * dt;
            const ps = u.scale * (0.6 + smokeT * u.grow) * s;
            puff.scale.set(ps, ps, ps);
        }
        e.smokeMat.opacity = Math.max(0, Math.min(0.55, e.born * 1.4) * (1 - smokeT));
        // --- debris: ballistic with gravity, spin, fade ---
        for (const d of e.debris) {
            const u = d.userData;
            u.vel.y -= 6 * dt; // gravity
            d.position.addScaledVector(u.vel, dt);
            d.rotation.x += u.rot.x * dt;
            d.rotation.y += u.rot.y * dt;
            d.rotation.z += u.rot.z * dt;
        }
        e.debrisMat.opacity = Math.max(0, 1 - smokeT * 1.1);
        // --- spark flashes: fly out, shrink, fade fast ---
        for (const sp of e.sparks) {
            const u = sp.userData;
            u.age += dt;
            const k = Math.min(1, u.age / u.life);
            sp.position.addScaledVector(u.vel, dt);
            sp.scale.setScalar(1 - k * 0.9);
        }
        e.sparkMat.opacity = Math.max(0, 1 - (e.born / 0.5));
        // --- light: sharp spike then decay ---
        const lightT = Math.min(1, e.born / 0.1);
        e.light.intensity = (30 + s * 22) * lightT * Math.max(0, 1 - (t / 0.85));
    }
}
function killMonster(m, killer) {
    const ex = m.mesh.position.x, ey = m.mesh.position.y + m.def.height * 0.5, ez = m.mesh.position.z;
    const expSize = 0.5 + (m.maxHp / 100) * 0.8;
    spawnExplosion(ex, ey, ez, expSize);
    playExplosion(expSize);
    scene.remove(m.mesh);
    const idx = monsters.indexOf(m);
    if (idx >= 0) monsters.splice(idx, 1);
    if (!killer || killer === 'player') {
        player.kills++;
        if (Math.random() < 0.5) {
            const w = curAmmo();
            w.reserve = Math.min(300, w.reserve + 5);
        }
    }
    if (monsters.length === 0) winGame();
}

function killPlayer() {
    if (player.dead) return;
    player.dead = true;
    showMessage('YOU DIED<br><span style="font-size:16px">Click to respawn</span>', true);
    document.exitPointerLock();
    startEl.style.display = 'flex';
    startEl.querySelector('h1').textContent = 'YOU DIED';
    startEl.onclick = () => {
        resetPlayer();
        spawnMonsters(difficulty.count);
        spawnPickups();
        startEl.querySelector('h1').textContent = 'MAZE SHOOTER';
        canvas.requestPointerLock();
        startEl.style.display = 'none';
        startEl.onclick = null;
        hideMessage();
    };
}

let won = false;
function winGame() {
    won = true;
    showMessage('VICTORY!<br><span style="font-size:16px">All monsters killed. Click to play again</span>', true);
    document.exitPointerLock();
    startEl.style.display = 'flex';
    startEl.querySelector('h1').textContent = 'VICTORY!';
    startEl.onclick = () => {
        won = false;
        resetPlayer();
        spawnMonsters(difficulty.count);
        spawnPickups();
        startEl.querySelector('h1').textContent = 'MAZE SHOOTER';
        canvas.requestPointerLock();
        startEl.style.display = 'none';
        startEl.onclick = null;
        hideMessage();
    };
}

// ---------------- HUD / messages ----------------
const hud = {};
['hpbar','hpnum','wname','ammo','slot1','slot2','push','pushbar','light','lightbar','run','kills','left']
    .forEach(id => { const el = document.getElementById('hud-' + id); if (el) hud[id] = el; });
const msgEl = document.getElementById('msg');
function showMessage(html, persist) {
    msgEl.innerHTML = html;
    if (!persist) { msgEl.dataset.t = setTimeout(hideMessage, 2000); }
    else { clearTimeout(msgEl.dataset.t); }
}
function showMessageLong(html, ms) {
    msgEl.innerHTML = html;
    clearTimeout(msgEl.dataset.t);
    msgEl.dataset.t = setTimeout(hideMessage, ms);
}
function hideMessage() {
    clearTimeout(msgEl.dataset.t);
    msgEl.innerHTML = '';
}
function updateHud() {
    const w = curAmmo(), def = curWeapon();
    const hp = Math.max(0, Math.round(player.hp));
    if (hud.hpbar) hud.hpbar.style.width = (hp / CFG.playerMaxHp * 100) + '%';
    if (hud.hpnum) hud.hpnum.textContent = hp;
    if (hud.wname) hud.wname.textContent = def.name;
    if (hud.ammo) hud.ammo.textContent = w.ammo + ' / ' + w.reserve;
    if (hud.slot1) hud.slot1.classList.toggle('active', player.weapon === 'pistol');
    if (hud.slot2) hud.slot2.classList.toggle('active', player.weapon === 'mg');
    if (hud.slot2) hud.slot2.style.opacity = player.ownsMg ? '1' : '0.35';
    // force cooldown bars (fill = ready fraction)
    const pc = 1 - Math.max(0, player.forcePushCd) / CFG.forceCooldown;
    if (hud.pushbar) hud.pushbar.style.width = (pc * 100) + '%';
    if (hud.push) hud.push.textContent = player.forcePushCd > 0 ? Math.ceil(player.forcePushCd) + 's' : 'RDY';
    const lc = 1 - Math.max(0, player.forceLightCd) / CFG.forceCooldown;
    if (hud.lightbar) hud.lightbar.style.width = (lc * 100) + '%';
    if (hud.light) hud.light.textContent = player.forceLightCd > 0 ? Math.ceil(player.forceLightCd) + 's' : 'RDY';
    if (hud.run) hud.run.style.display = player.run ? 'block' : 'none';
    if (hud.kills) hud.kills.textContent = player.kills;
    if (hud.left) hud.left.textContent = monsters.length;
}

// ---------------- Player movement update ----------------
function updatePlayer(dt) {
    if (player.dead) return;
    // timers
    if (player.fireTimer > 0) player.fireTimer -= dt;
    if (player.burstTimer > 0) player.burstTimer -= dt;
    if (player.forcePushCd > 0) player.forcePushCd -= dt;
    if (player.forceLightCd > 0) player.forceLightCd -= dt;
    if (player.reloadTimer > 0) {
        player.reloadTimer -= dt;
        if (player.reloadTimer <= 0) {
            const w = curAmmo(), def = curWeapon();
            const need = def.mag - w.ammo;
            const take = Math.min(need, w.reserve);
            w.ammo += take;
            w.reserve -= take;
        }
    }
    if (player.hurtFlash > 0) player.hurtFlash -= dt;

    const forward = (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0);
    const strafe = (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0);
    const cy = Math.cos(player.yaw), sy = Math.sin(player.yaw);
    // forward vector (yaw only)
    let fx = -sy, fz = -cy;
    // right vector
    let rx = cy, rz = -sy;
    let mx = fx * forward + rx * strafe;
    let mz = fz * forward + rz * strafe;
    const len = Math.hypot(mx, mz);
    if (len > 0.001) {
        const spd = CFG.playerSpeed * (player.run ? 1.6 : 1);
        mx = mx / len * spd;
        mz = mz / len * spd;
    }
    // smooth accel
    player.vel.x += (mx - player.vel.x) * Math.min(1, dt * 12);
    player.vel.z += (mz - player.vel.z) * Math.min(1, dt * 12);

    const nx = player.pos.x + player.vel.x * dt;
    const nz = player.pos.z + player.vel.z * dt;
    if (circleFree(nx, player.pos.z, CFG.playerRadius)) player.pos.x = nx;
    if (circleFree(player.pos.x, nz, CFG.playerRadius)) player.pos.z = nz;

    // camera
    camera.position.copy(player.pos);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch;

    // weapon bob + recoil
    const speed2 = Math.hypot(player.vel.x, player.vel.z);
    if (speed2 > 0.5) weaponBobPhase += dt * speed2 * 1.8;
    weaponRecoil = Math.max(0, weaponRecoil - dt * 8);
    const bobX = Math.sin(weaponBobPhase) * 0.012 * Math.min(1, speed2 / CFG.playerSpeed);
    const bobY = Math.abs(Math.cos(weaponBobPhase)) * 0.008 * Math.min(1, speed2 / CFG.playerSpeed);
    weapon.position.set(0.22 + bobX, -0.18 + bobY, -0.5 + weaponRecoil);
    weapon.rotation.x = weaponRecoil * 0.6;

    // light follows player
    playerLight.position.set(player.pos.x, CFG.wallHeight - 0.5, player.pos.z);

    // muzzle light position
    const ld = getLookDir();
    muzzleLight.position.set(player.pos.x + ld.x * 0.5, player.pos.y + ld.y * 0.5, player.pos.z + ld.z * 0.5);
    muzzleLight.intensity = Math.max(0, muzzleLight.intensity - dt * 12);

    // shoot
    if (mouseDown) shoot();
}

function drawMinimap() {
    if (!minimapVisible || !minimapCtx) return;
    const ctx = minimapCtx;
    const W = minimapCanvas.width, H = minimapCanvas.height;
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(0, 0, W, H);
    for (let gy = 0; gy < MH; gy++) {
        for (let gx = 0; gx < MW; gx++) {
            if (MAZE.grid[gy * MW + gx]) {
                ctx.fillStyle = '#4a5568';
                ctx.fillRect(gx * MAP_SCALE, gy * MAP_SCALE, MAP_SCALE, MAP_SCALE);
            }
        }
    }
    // MG is hidden from the map until 3/4 of the total monsters are killed
    if (mgPickup && totalMonsters > 0 && player.kills >= Math.ceil(totalMonsters * 0.75) && !player.ownsMg) {
        const mgx = ((mgPickup.position.x + WORLD_W / 2) / CS) * MAP_SCALE;
        const mgz = ((mgPickup.position.z + WORLD_H / 2) / CS) * MAP_SCALE;
        ctx.fillStyle = '#4488ff';
        ctx.fillRect(mgx - 3, mgz - 3, 6, 6);
    }
    for (const m of monsters) {
        const mx = ((m.mesh.position.x + WORLD_W / 2) / CS) * MAP_SCALE;
        const mz = ((m.mesh.position.z + WORLD_H / 2) / CS) * MAP_SCALE;
        ctx.fillStyle = '#' + m.def.color.toString(16).padStart(6, '0');
        ctx.beginPath();
        ctx.arc(mx, mz, 3, 0, Math.PI * 2);
        ctx.fill();
    }
    const px = ((player.pos.x + WORLD_W / 2) / CS) * MAP_SCALE;
    const pz = ((player.pos.z + WORLD_H / 2) / CS) * MAP_SCALE;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(px, pz, 3, 0, Math.PI * 2);
    ctx.fill();
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px, pz);
    ctx.lineTo(px + fx * 10, pz + fz * 10);
    ctx.stroke();
}

// ---------------- Main loop ----------------
let last = performance.now();
function loop(now) {
    requestAnimationFrame(loop);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05; // clamp

    if (!paused) {
        // constant aggressive spawn (only active when difficulty.spawnEvery < 900;
        // the current fixed PUPSIK difficulty sets it to 999, so this is dormant)
        if (difficulty.spawnEvery < 900 && !player.dead) {
            spawnTimer += dt;
            if (spawnTimer >= difficulty.spawnEvery) {
                spawnTimer = 0;
                spawnOneMonster();
            }
        }
        updatePlayer(dt);
        for (let i = monsters.length - 1; i >= 0; i--) updateMonster(monsters[i], dt);
        updateBullets(dt);
        updateExplosions(dt);
        updatePickups(dt);
        updateForceFx(dt);
        updateLightningFx(dt);
    }
    updateRoomLights(now);
    drawMinimap();

    // hurt vignette via clear color tint
    if (player.hurtFlash > 0) {
        renderer.setClearColor(new THREE.Color(0x4a0a0a));
    } else {
        renderer.setClearColor(0x0a0a12);
    }
    updateHud();
    renderer.render(scene, camera);
}

// ---------------- Resize ----------------
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------- Start ----------------
// Difficulty may be pre-selected in index.html via window.__difficulty
if (window.__difficulty && DIFF[window.__difficulty]) {
    difficulty = DIFF[window.__difficulty];
}
resetPlayer();
spawnMonsters(difficulty.count);
spawnPickups();
requestAnimationFrame(loop);

})();

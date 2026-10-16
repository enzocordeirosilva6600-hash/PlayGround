import * as THREE from 'three';

// ============ CONFIG / META 40 FPS ============
const TARGET_FPS = 40;
const MAP_SIZE = 500, HALF = MAP_SIZE / 2;
const BOT_COUNT = 19;
const GRAVITY = -28;
let QUALITY = 'auto'; // auto | low | high
let pixelScale = 1.0;

document.querySelectorAll('.q-btn').forEach(b => b.onclick = () => {
  document.querySelectorAll('.q-btn').forEach(x => x.classList.remove('active'));
  b.classList.add('active'); QUALITY = b.dataset.q; applyQuality();
});
function applyQuality() {
  if (QUALITY === 'low') pixelScale = 0.65;
  else if (QUALITY === 'high') pixelScale = Math.min(devicePixelRatio, 1.5);
  else pixelScale = 1.0;
  if (renderer) renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25) * pixelScale);
}
document.getElementById('loading').style.display = 'none';

// ============ AUDIO PROCEDURAL ============
const AudioSys = {
  ctx: null,
  init() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } },
  beep(freq, dur, type = 'square', vol = 0.12, slide = 0) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), this.ctx.currentTime + dur);
    g.gain.value = vol; g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    o.connect(g); g.connect(this.ctx.destination); o.start(); o.stop(this.ctx.currentTime + dur);
  },
  shoot(w) { this.beep(w === 'shotgun' ? 140 : 520, w === 'shotgun' ? .25 : .12, 'sawtooth', .1, -200); },
  hit() { this.beep(880, .08, 'square', .12); },
  kill() { this.beep(440, .3, 'square', .14, 440); },
  chest() { this.beep(660, .2, 'sine', .14, 330); },
  build() { this.beep(300, .1, 'triangle', .12, 150); },
  storm() { this.beep(200, .5, 'sawtooth', .07, -80); },
};

// ============ RENDERER / SCENE ============
const container = document.getElementById('game-container');
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
renderer.domElement.classList.add('game');
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 90, 420);
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 900);

scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x3d7a3d, 0.95));
const sun = new THREE.DirectionalLight(0xfff2cc, 1.6);
sun.position.set(120, 180, 60);
scene.add(sun);
// céu: sol sprite + nuvens baratas
{
  const skyGeo = new THREE.SphereGeometry(700, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55);
  const skyMat = new THREE.MeshBasicMaterial({ color: 0x6fb7ff, side: THREE.BackSide, fog: false });
  scene.add(new THREE.Mesh(skyGeo, skyMat));
}
const clouds = [];
{
  const cg = new THREE.SphereGeometry(1, 7, 6);
  const cm = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(cg, cm);
    m.position.set((Math.random() - .5) * 700, 120 + Math.random() * 60, (Math.random() - .5) * 700);
    m.scale.set(18 + Math.random() * 22, 5 + Math.random() * 3, 10 + Math.random() * 10);
    scene.add(m); clouds.push(m);
  }
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ============ MAPA ============
function groundHeight(x, z) {
  // colinas suaves fora da cidade
  const dCity = Math.hypot(x, z);
  let h = Math.sin(x * 0.03) * Math.cos(z * 0.025) * 2.2 + Math.sin(x * 0.008 + 2) * 4;
  if (dCity < 70) h *= (dCity / 70) * 0.3; // cidade plana
  // lago
  const dLake = Math.hypot(x - 130, z + 110);
  if (dLake < 45) h = -3;
  return h;
}
{
  const g = new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE, 72, 72);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position, colors = [];
  const cGrass = new THREE.Color(0x5da64a), cDark = new THREE.Color(0x3f7d33),
    cSand = new THREE.Color(0xd9c27a), cCity = new THREE.Color(0x8a8f96), cWater = new THREE.Color(0x2f9be8);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const y = groundHeight(x, z);
    pos.setY(i, y);
    const dLake = Math.hypot(x - 130, z + 110), dCity = Math.hypot(x, z);
    let c;
    if (dLake < 45) c = cWater;
    else if (dCity < 70) c = cCity;
    else if (dLake < 55) c = cSand;
    else c = cGrass.clone().lerp(cDark, Math.random() * 0.6);
    colors.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  scene.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true })));
  // água animada simples
  const water = new THREE.Mesh(new THREE.CircleGeometry(45, 24),
    new THREE.MeshLambertMaterial({ color: 0x2f9be8, transparent: true, opacity: 0.8 }));
  water.rotation.x = -Math.PI / 2; water.position.set(130, -1.2, -110); scene.add(water);
}

// colisores AABB: {minX,maxX,minZ,maxZ, h}
const colliders = [];
function addCollider(x, z, w, d, h) {
  colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, h });
}
function collides(x, z, r = 0.7) {
  for (const c of colliders) {
    if (x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ) return c;
  }
  return null;
}

// cidade "Torre Torta"
const lootSpots = [];
const buildingMats = [];
function windowTexture(base) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#ffe082';
  for (let y = 8; y < 128; y += 22) for (let x = 8; x < 128; x += 22) {
    g.fillStyle = Math.random() < .25 ? '#263238' : '#ffe082';
    g.fillRect(x, y, 12, 14);
  }
  const t = new THREE.CanvasTexture(cv); return t;
}
{
  const bases = ['#78909c', '#a1887f', '#90a4ae', '#b0bec5', '#8d6e63'];
  let bi = 0;
  for (let gx = -2; gx <= 2; gx++) for (let gz = -2; gz <= 2; gz++) {
    if (Math.abs(gx) < 1 && Math.abs(gz) < 1) continue; // praça central
    if (Math.random() < 0.18) continue;
    const w = 12 + Math.random() * 8, d = 12 + Math.random() * 8, h = 14 + Math.random() * 22;
    const x = gx * 24, z = gz * 24;
    const tex = windowTexture(bases[bi++ % bases.length]);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ map: tex }));
    m.position.set(x, h / 2, z); scene.add(m);
    addCollider(x, z, w, d, h);
    // telhado loot
    if (Math.random() < 0.7) lootSpots.push({ x: x + (Math.random() - .5) * 4, y: h + 1, z: z + (Math.random() - .5) * 4, taken: false });
  }
  // praça: baús centrais
  lootSpots.push({ x: 0, y: 1, z: 0, taken: false });
  lootSpots.push({ x: 8, y: 1, z: -6, taken: false });
}
// casas espalhadas
{
  const wallM = new THREE.MeshLambertMaterial({ color: 0xd7a86e });
  const roofM = new THREE.MeshLambertMaterial({ color: 0x8d3b3b });
  const spots = [[-140, 60], [150, 80], [-90, -150], [90, 150], [-170, -40], [40, -170], [170, -30], [-60, 170]];
  for (const [x, z] of spots) {
    const y = groundHeight(x, z);
    const house = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 8), wallM);
    house.position.set(x, y + 2.5, z); scene.add(house);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(7.5, 3.5, 4), roofM);
    roof.position.set(x, y + 6.7, z); roof.rotation.y = Math.PI / 4; scene.add(roof);
    addCollider(x, z, 10, 8, 6);
    lootSpots.push({ x: x + 7, y: y + 1, z, taken: false });
  }
}
// árvores e pedras (instanciado = 40fps)
{
  const N = 260;
  const trunkG = new THREE.CylinderGeometry(0.5, 0.8, 4, 5);
  const leafG = new THREE.ConeGeometry(3, 7, 6);
  const trunkM = new THREE.MeshLambertMaterial({ color: 0x6d4c41 });
  const leafM = new THREE.MeshLambertMaterial({ color: 0x2e7d32 });
  const trunks = new THREE.InstancedMesh(trunkG, trunkM, N);
  const leaves = new THREE.InstancedMesh(leafG, leafM, N);
  const dummy = new THREE.Object3D();
  let placed = 0, guard = 0;
  while (placed < N && guard++ < 3000) {
    const x = (Math.random() - .5) * (MAP_SIZE - 30), z = (Math.random() - .5) * (MAP_SIZE - 30);
    if (Math.hypot(x, z) < 80) continue;
    if (Math.hypot(x - 130, z + 110) < 55) continue;
    const y = groundHeight(x, z);
    const s = 0.8 + Math.random() * 0.9;
    dummy.position.set(x, y + 2 * s, z); dummy.scale.setScalar(s); dummy.rotation.y = Math.random() * 6; dummy.updateMatrix();
    trunks.setMatrixAt(placed, dummy.matrix);
    dummy.position.set(x, y + (4 + 3.2) * s, z); dummy.updateMatrix();
    leaves.setMatrixAt(placed, dummy.matrix);
    placed++;
  }
  scene.add(trunks); scene.add(leaves);
  // pedras
  const rockG = new THREE.DodecahedronGeometry(1.6, 0);
  const rockM = new THREE.MeshLambertMaterial({ color: 0x9e9e9e });
  const rocks = new THREE.InstancedMesh(rockG, rockM, 80);
  for (let i = 0; i < 80; i++) {
    const x = (Math.random() - .5) * 460, z = (Math.random() - .5) * 460;
    dummy.position.set(x, groundHeight(x, z) + 0.5, z);
    dummy.scale.set(0.6 + Math.random(), 0.5 + Math.random() * 0.7, 0.6 + Math.random());
    dummy.rotation.set(Math.random(), Math.random() * 6, 0); dummy.updateMatrix();
    rocks.setMatrixAt(i, dummy.matrix);
  }
  scene.add(rocks);
}

// ============ LOOT extra espalhado ============
function seedLoot() {
  for (let i = 0; i < 40; i++) {
    const x = (Math.random() - .5) * 420, z = (Math.random() - .5) * 420;
    if (Math.hypot(x, z) < 75) continue;
    lootSpots.push({ x, y: groundHeight(x, z) + 1, z, taken: false });
  }
}
seedLoot();
const lootMeshes = [];
{
  const gunG = new THREE.BoxGeometry(1.1, 0.35, 0.3);
  const glowG = new THREE.CylinderGeometry(1.1, 1.1, 0.15, 16);
  const rar = [0x9e9e9e, 0x4caf50, 0x2196f3, 0x9c27b0, 0xff9800];
  for (const s of lootSpots) {
    const tier = Math.floor(Math.random() * rar.length);
    const grp = new THREE.Group();
    const glow = new THREE.Mesh(glowG, new THREE.MeshBasicMaterial({ color: rar[tier], transparent: true, opacity: 0.75 }));
    const gun = new THREE.Mesh(gunG, new THREE.MeshLambertMaterial({ color: 0x212121 }));
    gun.position.y = 0.5;
    grp.add(glow); grp.add(gun);
    grp.position.set(s.x, s.y, s.z);
    grp.userData.spot = s; grp.userData.tier = tier;
    scene.add(grp); lootMeshes.push(grp);
  }
}

// ============ PERSONAGENS ============
const bodyGeos = {
  torso: new THREE.BoxGeometry(0.85, 1.0, 0.5),
  head: new THREE.BoxGeometry(0.55, 0.55, 0.55),
  limb: new THREE.BoxGeometry(0.28, 0.9, 0.28),
  gun: new THREE.BoxGeometry(0.18, 0.22, 1.3),
};
const skinTones = [0xffcc99, 0xc68642, 0x8d5524, 0xffdbac];
const shirtCols = [0xe53935, 0x1e88e5, 0x43a047, 0xfb8c00, 0x8e24aa, 0x00acc1, 0xfdd835, 0xec407a];
const botNames = ['DarkWolf', 'NinjaBR', 'xX_Sniper_Xx', 'LendasGG', 'PixelPro', 'Trovão', 'ShadowFox', 'CapitãoLoot', 'ReiDoHigh', 'Botzão007', 'StormChaser', 'GG_Ez', 'FrostByte', 'TurboLama', 'SombraNinja', 'MegaConstrutor', 'ZéDrop', 'LuaCheia', 'TubarãoGG'];

function makeHumanoid(shirt, skin) {
  const g = new THREE.Group();
  const mShirt = new THREE.MeshLambertMaterial({ color: shirt });
  const mSkin = new THREE.MeshLambertMaterial({ color: skin });
  const mPants = new THREE.MeshLambertMaterial({ color: 0x263238 });
  const torso = new THREE.Mesh(bodyGeos.torso, mShirt); torso.position.y = 1.45; g.add(torso);
  const head = new THREE.Mesh(bodyGeos.head, mSkin); head.position.y = 2.3; g.add(head);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.1), new THREE.MeshBasicMaterial({ color: 0x111111 }));
  visor.position.set(0, 2.32, 0.28); g.add(visor);
  const armL = new THREE.Mesh(bodyGeos.limb, mShirt); armL.position.set(-0.6, 1.45, 0); g.add(armL);
  const armR = new THREE.Mesh(bodyGeos.limb, mShirt); armR.position.set(0.6, 1.45, 0); g.add(armR);
  const legL = new THREE.Mesh(bodyGeos.limb, mPants); legL.position.set(-0.22, 0.5, 0); g.add(legL);
  const legR = new THREE.Mesh(bodyGeos.limb, mPants); legR.position.set(0.22, 0.5, 0); g.add(legR);
  const gun = new THREE.Mesh(bodyGeos.gun, new THREE.MeshLambertMaterial({ color: 0x212121 }));
  gun.position.set(0.35, 1.5, 0.7); g.add(gun);
  g.userData = { armL, armR, legL, legR, torso, head, gun };
  // barra de vida (sprite)
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 8;
  const tex = new THREE.CanvasTexture(cv);
  const bar = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  bar.scale.set(1.8, 0.25, 1); bar.position.y = 3.0; g.add(bar);
  g.userData.hpBar = { cv, tex, bar };
  return g;
}
function updateHpBar(ent) {
  const { cv, tex } = ent.mesh.userData.hpBar;
  const g = cv.getContext('2d');
  const total = ent.hp + ent.shield, max = 150;
  g.clearRect(0, 0, 64, 8);
  g.fillStyle = '#c62828'; g.fillRect(0, 0, 64, 8);
  g.fillStyle = '#40c4ff'; g.fillRect(0, 0, 64 * Math.min(1, ent.shield / max), 8);
  g.fillStyle = '#69f0ae'; g.fillRect(0, 0, 64 * Math.min(1, ent.hp / max), 8);
  tex.needsUpdate = true;
}
function animateWalk(ent, t) {
  const u = ent.mesh.userData;
  const s = Math.min(1, ent.speed / 6);
  const w = Math.sin(t * 10) * 0.6 * s;
  u.legL.rotation.x = w; u.legR.rotation.x = -w;
  u.armL.rotation.x = -w * 0.7; u.armR.rotation.x = -0.5 - s * 0.3;
}

// ============ ARMAS ============
const WEAPONS = {
  rifle: { name: 'Rifle', dmg: 26, headMul: 1.5, rpm: 420, mag: 30, reserve: 180, spread: 0.022, range: 160, auto: true, color: 0xffeb3b },
  shotgun: { name: 'Shotgun', dmg: 11, pellets: 7, headMul: 1.4, rpm: 70, mag: 6, reserve: 36, spread: 0.075, range: 38, auto: false, color: 0xff5722 },
  pickaxe: { name: 'Picareta', dmg: 25, headMul: 1, rpm: 90, mag: Infinity, reserve: Infinity, spread: 0, range: 3.6, auto: true, color: 0x9e9e9e },
};

// ============ ENTIDADES ============
function spawnEntity(isPlayer, name) {
  const mesh = makeHumanoid(
    isPlayer ? 0xe53935 : shirtCols[Math.floor(Math.random() * shirtCols.length)],
    skinTones[Math.floor(Math.random() * skinTones.length)]);
  scene.add(mesh);
  if (isPlayer) mesh.userData.hpBar.bar.visible = false;
  const e = {
    isPlayer: !!isPlayer, name: name || 'Você',
    mesh, pos: mesh.position, vel: new THREE.Vector3(),
    yaw: isPlayer ? Math.PI : Math.random() * Math.PI * 2, pitch: 0,
    hp: 100, shield: 50, alive: true, onGround: false,
    speed: 0, kills: 0, tier: 0, dropped: false,
    weapons: {
      rifle: { ...WEAPONS.rifle, ammo: WEAPONS.rifle.mag, res: WEAPONS.rifle.reserve },
      shotgun: { ...WEAPONS.shotgun, ammo: WEAPONS.shotgun.mag, res: WEAPONS.shotgun.reserve },
      pickaxe: { ...WEAPONS.pickaxe, ammo: Infinity, res: Infinity },
    },
    cur: 'rifle', lastShot: 0, reloading: 0,
    falling: true, gliding: false, mats: { wood: 200, brick: 100, metal: 50 },
    // IA
    ai: { state: 'loot', target: new THREE.Vector3(), think: Math.random(), enemy: null, strafe: 1, nextShot: 0, skill: 0.25 + Math.random() * 0.45, dropT: 2 + Math.random() * 14 },
  };
  updateHpBar(e);
  return e;
}
let player = spawnEntity(true);
let bots = [];
for (let i = 0; i < BOT_COUNT; i++) bots.push(spawnEntity(false, botNames[i % botNames.length] + (i >= botNames.length ? i : '')));
let entities = [player, ...bots];

// construções
const builds = [];
const buildGeoW = new THREE.BoxGeometry(3.2, 3.2, 0.3);
const buildGeoR = new THREE.BoxGeometry(3.2, 0.3, 4.4);
const buildMats = { wood: new THREE.MeshLambertMaterial({ color: 0xc89b6a }), brick: new THREE.MeshLambertMaterial({ color: 0xb0a49c }), metal: new THREE.MeshLambertMaterial({ color: 0x90a4ae }) };
function placeBuild(owner, type) {
  const mat = owner.mats.wood >= 10 ? 'wood' : owner.mats.brick >= 10 ? 'brick' : owner.mats.metal >= 10 ? 'metal' : null;
  if (!mat) return false;
  owner.mats[mat] -= 10;
  const geo = type === 'wall' ? buildGeoW : buildGeoR;
  const m = new THREE.Mesh(geo, buildMats[mat]);
  const a = owner.yaw;
  const dx = -Math.sin(a), dz = -Math.cos(a);
  m.position.set(owner.pos.x + dx * 2.6, owner.pos.y + (type === 'wall' ? 1.6 : 1.2), owner.pos.z + dz * 2.6);
  m.rotation.y = a;
  if (type === 'ramp') m.rotation.x = -0.5;
  m.userData.hp = 220; m.userData.owner = owner; m.userData.type = type;
  scene.add(m); builds.push(m);
  colliders.push({ minX: m.position.x - 1.6, maxX: m.position.x + 1.6, minZ: m.position.z - 1.6, maxZ: m.position.z + 1.6, h: m.position.y + 2, build: m });
  AudioSys.build();
  return true;
}

// tracers / dano (pool p/ 40fps)
const tracerPool = [];
{
  const tg = new THREE.BoxGeometry(0.08, 0.08, 1);
  for (let i = 0; i < 40; i++) {
    const m = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ color: 0xffeb3b, transparent: true, opacity: 0.9 }));
    m.visible = false; scene.add(m); tracerPool.push({ m, life: 0 });
  }
}
let tracerIdx = 0;
function fireTracer(from, to, color) {
  const t = tracerPool[tracerIdx++ % tracerPool.length];
  t.m.visible = true; t.m.material.color.setHex(color || 0xffeb3b);
  t.m.position.copy(from).lerp(to, 0.5);
  t.m.lookAt(to); t.m.scale.z = from.distanceTo(to);
  t.life = 0.09;
}
const floaters = [];
function damageNumber(pos, dmg, head) {
  const div = document.createElement('div');
  div.className = 'dmg-float'; div.textContent = Math.round(dmg);
  div.style.cssText = `position:fixed;left:${50 + (Math.random() - .5) * 8}%;top:${44 + (Math.random() - .5) * 6}%;color:${head ? '#ffd700' : '#fff'};font-weight:900;font-size:${head ? 26 : 20}px;text-shadow:0 2px 4px #000;z-index:11;pointer-events:none;transition:all .6s`;
  document.body.appendChild(div);
  requestAnimationFrame(() => { div.style.transform = 'translateY(-50px)'; div.style.opacity = '0'; });
  setTimeout(() => div.remove(), 650);
}
const style = document.createElement('style');
style.textContent = '.dmg-float{transition:all .6s}';
document.head.appendChild(style);

// ============ INPUT ============
const keys = {};
let pointerLocked = false, shooting = false;
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Space' && gameStarted && !player.dropped) {
    player.dropped = true; player.mesh.visible = true; player.pos.y = 90;
    document.getElementById('bus-hint').classList.add('hidden');
  }
  if (!gameStarted || !player.alive) return;
  if (e.code === 'Digit1') switchW('rifle');
  if (e.code === 'Digit2') switchW('shotgun');
  if (e.code === 'Digit3') switchW('pickaxe');
  if (e.code === 'KeyR') reload(player);
  if (e.code === 'KeyQ') placeBuild(player, 'wall');
  if (e.code === 'KeyE' && !player.falling) placeBuild(player, 'ramp');
  if (e.code === 'Space' && player.falling) player.gliding = true;
  if (['Space', 'ArrowUp'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', e => keys[e.code] = false);
renderer.domElement.addEventListener('click', () => {
  if (gameStarted && !pointerLocked) renderer.domElement.requestPointerLock();
});
document.addEventListener('pointerlockchange', () => pointerLocked = document.pointerLockElement === renderer.domElement);
document.addEventListener('mousemove', e => {
  if (!pointerLocked || !player.alive) return;
  player.yaw -= e.movementX * 0.0024;
  player.pitch = THREE.MathUtils.clamp(player.pitch - e.movementY * 0.0022, -1.2, 1.2);
});
document.addEventListener('mousedown', e => { if (e.button === 0 && pointerLocked) shooting = true; });
document.addEventListener('mouseup', e => { if (e.button === 0) shooting = false; });
function switchW(w) {
  player.cur = w; player.reloading = 0;
  document.querySelectorAll('.slot').forEach(s => s.classList.remove('active'));
  const map = { rifle: 'slot-1', shotgun: 'slot-2', pickaxe: 'slot-3' };
  document.getElementById(map[w]).classList.add('active');
  AudioSys.beep(700, .06, 'square', .06);
}
function reload(e) {
  const w = e.weapons[e.cur];
  if (w.ammo === Infinity || w.res <= 0 || w.ammo === w.mag || e.reloading > 0) return;
  e.reloading = e.cur === 'shotgun' ? 1.6 : 1.3;
}

// ============ COMBATE ============
const _dir = new THREE.Vector3(), _from = new THREE.Vector3(), _to = new THREE.Vector3();
function tryShoot(e, now) {
  const w = e.weapons[e.cur];
  const interval = 60 / w.rpm;
  if (now - e.lastShot < interval || e.reloading > 0 || !e.alive) return;
  if (w.ammo <= 0) { reload(e); if (e.isPlayer) AudioSys.beep(200, .15, 'square', .1); return; }
  e.lastShot = now;
  if (w.ammo !== Infinity) w.ammo--;
  AudioSys.shoot(e.cur);
  // origem: altura dos olhos
  _from.set(e.pos.x, e.pos.y + 2.1, e.pos.z);
  const pellets = w.pellets || 1;
  for (let p = 0; p < pellets; p++) {
    const spread = w.spread * (e.isPlayer ? 1 : 1.6 - e.ai.skill * 0.7);
    _dir.set(-Math.sin(e.yaw) + (Math.random() - .5) * spread * 2, Math.tan(e.pitch || 0) + (Math.random() - .5) * spread * 2, -Math.cos(e.yaw) + (Math.random() - .5) * spread * 2).normalize();
    // testa builds primeiro (range curto)
    let bestT = w.range, hitEnt = null, hitHead = false, hitBuild = null;
    for (const o of entities) {
      if (o === e || !o.alive) continue;
      // esfera vertical aproximada: corpo y+0..2.6
      const ox = o.pos.x - _from.x, oy = (o.pos.y + 1.4) - _from.y, oz = o.pos.z - _from.z;
      const t = ox * _dir.x + oy * _dir.y + oz * _dir.z;
      if (t < 0 || t > bestT) continue;
      const px = _from.x + _dir.x * t - o.pos.x, py = _from.y + _dir.y * t - (o.pos.y + 1.4), pz = _from.z + _dir.z * t - o.pos.z;
      const d2 = px * px + py * py + pz * pz;
      if (d2 < 1.7) { bestT = t; hitEnt = o; hitHead = py > 0.75; hitBuild = null; }
    }
    _to.copy(_from).addScaledVector(_dir, bestT);
    if (hitEnt) {
      let dmg = w.dmg;
      if (!e.isPlayer) dmg *= 0.55; // bots dão menos dano p/ partida durar
      if (hitHead) dmg *= w.headMul;
      if (e.isPlayer && e.tier > 0) dmg *= 1 + e.tier * 0.04;
      damageEntity(hitEnt, dmg, e, hitHead);
      if (e.isPlayer) { showHitmarker(!hitEnt.alive); AudioSys.hit(); damageNumber(hitEnt.pos, dmg, hitHead); }
    }
    if (p === 0) fireTracer(_from, _to, w.color);
  }
  // coice visual
  e.recoil = 1;
  if (e.isPlayer) updateAmmoHUD();
}
function damageEntity(victim, dmg, attacker, head) {
  if (!victim.alive) return;
  let rem = dmg;
  if (victim.shield > 0) { const s = Math.min(victim.shield, rem); victim.shield -= s; rem -= s; }
  victim.hp -= rem;
  updateHpBar(victim);
  if (victim.isPlayer) {
    const v = document.getElementById('damage-vignette');
    v.classList.add('hit'); setTimeout(() => v.classList.remove('hit'), 180);
    AudioSys.beep(160, .2, 'sawtooth', .12);
  }
  if (victim.hp <= 0) killEntity(victim, attacker, head);
}
function killEntity(victim, attacker, head) {
  victim.alive = false; victim.hp = 0;
  victim.mesh.visible = false;
  // dropa loot + mats
  victim.pos.y = Math.max(victim.pos.y, groundHeight(victim.pos.x, victim.pos.z));
  const grp = new THREE.Group();
  const gun = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.35, 0.3), new THREE.MeshLambertMaterial({ color: 0x212121 }));
  gun.position.y = 0.5; grp.add(gun);
  grp.position.copy(victim.pos); scene.add(grp); lootMeshes.push(grp);
  if (attacker && attacker !== victim) {
    attacker.kills++;
    attacker.mats.wood += 60; attacker.mats.brick += 30;
    if (attacker.isPlayer) { AudioSys.kill(); showHitmarker(true); }
  }
  const kn = attacker ? attacker.name : 'Storm';
  feed(`<b>${kn}</b> eliminou <b>${victim.name}</b>${head ? ' 🎯' : ''}`, attacker === player || victim === player);
  updateAliveHUD();
  checkEnd();
}

// ============ STORM / ZONA ============
const storm = {
  center: new THREE.Vector2(0, 0), radius: 260,
  targetC: new THREE.Vector2(0, 0), targetR: 200,
  phase: 0, waitT: 18, shrinkT: 0,
  phases: [180, 140, 95, 55, 25, 6],
  mesh: null, tick: 0,
};
{
  const g = new THREE.CylinderGeometry(1, 1, 120, 48, 1, true);
  storm.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x9c27b0, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }));
  storm.mesh.position.y = 40; scene.add(storm.mesh);
}
function updateStorm(dt) {
  storm.mesh.position.set(storm.center.x, 40, storm.center.y);
  storm.mesh.scale.set(storm.radius, 1, storm.radius);
  drawMinimap();
  if (!gameStarted || busActive) return;
  if (storm.waitT > 0) {
    storm.waitT -= dt;
    document.getElementById('zone-text').textContent = `Storm em ${Math.ceil(storm.waitT)}s`;
    if (storm.waitT <= 0) {
      storm.phase = Math.min(storm.phase + 1, storm.phases.length - 1);
      storm.targetR = storm.phases[storm.phase];
      const a = Math.random() * Math.PI * 2, d = (storm.radius - storm.targetR) * 0.4 * Math.random();
      storm.targetC.set(storm.center.x + Math.cos(a) * d, storm.center.y + Math.sin(a) * d);
      storm.shrinkT = 25; AudioSys.storm();
      feed(`⌀ Storm fase ${storm.phase} se fechando!`);
    }
  } else if (storm.shrinkT > 0) {
    storm.shrinkT -= dt;
    const k = 1 - Math.max(0, storm.shrinkT) / 25;
    const cur = storm.phases[Math.max(0, storm.phase - 1)] || 260;
    storm.radius = THREE.MathUtils.lerp(cur, storm.targetR, 1 - storm.shrinkT / 25);
    storm.center.lerp(storm.targetC, dt * 0.1);
    document.getElementById('zone-text').textContent = `Storm FECHANDO!`;
    if (storm.shrinkT <= 0) { storm.waitT = 20; storm.center.copy(storm.targetC); storm.radius = storm.targetR; }
  }
  storm.mesh.position.set(storm.center.x, 40, storm.center.y);
  storm.mesh.scale.set(storm.radius, 1, storm.radius);
  // dano
  storm.tick += dt;
  if (storm.tick > 1) {
    storm.tick = 0;
    for (const e of entities) {
      if (!e.alive || e.falling) continue;
      const d = Math.hypot(e.pos.x - storm.center.x, e.pos.z - storm.center.y);
      if (d > storm.radius) {
        damageEntity(e, 2 + storm.phase * 2, null, false);
        if (e.isPlayer) document.getElementById('storm-warning').classList.remove('hidden');
      } else if (e.isPlayer) document.getElementById('storm-warning').classList.add('hidden');
    }
  }
  drawMinimap();
}

// ============ ÔNIBUS + QUEDA ============
let gameStarted = false, busActive = false;
const bus = new THREE.Group();
{
  const body = new THREE.Mesh(new THREE.BoxGeometry(14, 4, 5), new THREE.MeshLambertMaterial({ color: 0x2196f3 }));
  const balloon = new THREE.Mesh(new THREE.SphereGeometry(6, 10, 8), new THREE.MeshLambertMaterial({ color: 0xfdd835 }));
  balloon.position.y = 7; balloon.scale.y = 0.8;
  bus.add(body); bus.add(balloon); bus.visible = false; scene.add(bus);
}
const busPath = { t: 0, from: new THREE.Vector3(-260, 95, 40), to: new THREE.Vector3(260, 95, -40) };
function startGame() {
  AudioSys.init();
  document.getElementById('menu').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  gameStarted = true; busActive = true; busPath.t = 0;
  bus.visible = true;
  storm.waitT = 30; storm.phase = 0; storm.radius = 260;
  storm.center.set(0, 0); storm.targetC.set(0, 0); storm.targetR = 180;
  document.getElementById('bus-hint').classList.remove('hidden');
  // todos começam no bus
  for (const e of entities) {
    e.falling = true; e.gliding = false; e.alive = true; e.dropped = false; e.mesh.visible = false;
    e.hp = 100; e.shield = e.isPlayer ? 50 : (Math.random() < .5 ? 50 : 0);
    e.pos.set(0, 95, 0); e.vel.set(0, 0, 0);
    updateHpBar(e);
  }
  updateAliveHUD();
  renderer.domElement.requestPointerLock?.();
}
document.getElementById('play-btn').onclick = startGame;
document.getElementById('again-btn').onclick = () => location.reload();
function updateBus(dt) {
  if (!busActive) return;
  busPath.t += dt / 32;
  bus.position.lerpVectors(busPath.from, busPath.to, Math.min(1, busPath.t));
  // prende todos não-dropados no bus
  for (const e of entities) if (!e.dropped) e.pos.copy(bus.position);
  // bots pulam aleatoriamente
  for (const b of bots) {
    if (!b.dropped) {
      b.ai.dropT -= dt;
      if (b.ai.dropT <= 0 || busPath.t >= 0.95) dropFromBus(b);
    }
  }
  // player pula com espaço ou no fim
  if (!player.dropped) {
    player.pos.copy(bus.position);
    player.mesh.visible = false;
    if (keys['Space'] || busPath.t >= 0.98) {
      player.dropped = true;
      player.mesh.visible = true;
      player.pos.y = 90; player.gliding = false;
      document.getElementById('bus-hint').classList.add('hidden');
    }
  }
  if (busPath.t >= 1) {
    busActive = false; bus.visible = false;
    document.getElementById('bus-hint').classList.add('hidden');
    for (const e of entities) if (!e.dropped) { e.dropped = true; e.mesh.visible = true; e.pos.y = 85; }
  }
}
function dropFromBus(b) {
  b.dropped = true;
  b.pos.set(bus.position.x + (Math.random() - .5) * 14, 88, bus.position.z + (Math.random() - .5) * 14);
  b.mesh.visible = true;
  b.yaw = Math.random() * 6;
}

// ============ IA DOS BOTS ============
const _tmp = new THREE.Vector3();
function botThink(b, now) {
  const ai = b.ai;
  // acha inimigo mais próximo visível (<45m, menos snipe através do mapa)
  let best = null, bestD = 45;
  for (const o of entities) {
    if (o === b || !o.alive || o.falling) continue;
    const d = b.pos.distanceTo(o.pos);
    if (d < bestD) { bestD = d; best = o; }
  }
  ai.enemy = best;
  if (!best) {
    // loot próximo?
    let ls = null, ld = 60;
    for (const s of lootSpots) {
      if (s.taken) continue;
      const d = Math.hypot(b.pos.x - s.x, b.pos.z - s.z);
      if (d < ld) { ld = d; ls = s; }
    }
    if (ls) { ai.state = 'loot'; ai.target.set(ls.x, 0, ls.z); ai.lootSpot = ls; }
    else {
      ai.state = 'zone';
      const a = Math.random() * 6;
      const r = storm.radius * 0.5 * Math.random();
      ai.target.set(storm.center.x + Math.cos(a) * r, 0, storm.center.y + Math.sin(a) * r);
    }
  } else {
    ai.state = 'fight';
    // strafe orbitando
    if (Math.random() < 0.02) ai.strafe *= -1;
    const ang = Math.atan2(b.pos.x - best.pos.x, b.pos.z - best.pos.z) + ai.strafe * 0.6;
    const wantD = b.cur === 'shotgun' || bestD < 14 ? 9 : 22;
    ai.target.set(best.pos.x + Math.sin(ang) * wantD, 0, best.pos.z + Math.cos(ang) * wantD);
    b.cur = bestD < 15 ? 'shotgun' : 'rifle';
    // mira com erro baseado em skill
    const err = (1 - ai.skill) * 0.09;
    const dx = best.pos.x - b.pos.x, dz = best.pos.z - b.pos.z;
    b.yaw = Math.atan2(-dx, -dz) + (Math.random() - .5) * err * 2;
    const dy = (best.pos.y + 1.6) - (b.pos.y + 2.1);
    b.pitch = THREE.MathUtils.clamp(Math.atan2(dy, Math.hypot(dx, dz)) + (Math.random() - .5) * err, -1, 1);
    // atira (cadência menor p/ partida durar)
    if (now > ai.nextShot && bestD < 42) {
      tryShoot(b, now);
      ai.nextShot = now + (0.7 + Math.random() * 1.1) * (1.7 - ai.skill);
    }
    // constrói parede se levou dano / perto
    if ((b.hp < 60 && Math.random() < 0.03) || (bestD < 18 && Math.random() < 0.015)) placeBuild(b, 'wall');
    // pega shield / recarrega
    const w = b.weapons[b.cur];
    if (w.ammo === 0) reload(b);
  }
  // zona: se fora, prioriza zona
  const dStorm = Math.hypot(b.pos.x - storm.center.x, b.pos.z - storm.center.y);
  if (dStorm > storm.radius * 0.9 && ai.state !== 'fight') {
    ai.state = 'zone';
    ai.target.set(storm.center.x, 0, storm.center.y);
  }
}
function botUpdate(b, dt, now) {
  if (!b.alive) return;
  if (b.falling) {
    b.pos.y -= dt * (b.gliding ? 8 : 30);
    if (!b.gliding && b.pos.y < 40) { b.gliding = true; }
    if (b.gliding) {
      b.pos.x += -Math.sin(b.yaw) * dt * 14;
      b.pos.z += -Math.cos(b.yaw) * dt * 14;
      // mira loot/cidade
      b.yaw += dt * 0.3;
    }
    const gy = groundHeight(b.pos.x, b.pos.z);
    if (b.pos.y <= gy + 0.1) { b.pos.y = gy; b.falling = false; b.gliding = false; }
    b.mesh.position.copy(b.pos);
    return;
  }
  b.ai.think -= dt;
  if (b.ai.think <= 0) { b.ai.think = 0.3 + Math.random() * 0.3; botThink(b, now); }
  // movimento em direção ao target
  _tmp.set(b.ai.target.x - b.pos.x, 0, b.ai.target.z - b.pos.z);
  const dist = _tmp.length();
  if (dist > 1.5 || b.ai.state === 'fight') {
    _tmp.normalize();
    const sp = b.ai.state === 'fight' ? 6.5 : 7.5;
    let nx = b.pos.x + _tmp.x * sp * dt, nz = b.pos.z + _tmp.z * sp * dt;
    const c = collides(nx, nz);
    if (c) { // desvia / pula
      nx = b.pos.x - _tmp.z * sp * dt; nz = b.pos.z + _tmp.x * sp * dt;
      if (collides(nx, nz) && b.onGround) b.vel.y = 9;
    }
    b.pos.x = THREE.MathUtils.clamp(nx, -HALF + 5, HALF - 5);
    b.pos.z = THREE.MathUtils.clamp(nz, -HALF + 5, HALF - 5);
    if (b.ai.state !== 'fight') b.yaw = Math.atan2(-_tmp.x, -_tmp.z);
    b.speed = sp;
    // pulo aleatório
    if (Math.random() < dt * 0.4 && b.onGround) b.vel.y = 9;
  } else {
    b.speed = 0;
    // pegou loot?
    if (b.ai.lootSpot && dist < 3) {
      b.ai.lootSpot.taken = true;
      b.tier = Math.min(4, b.tier + 1);
      b.shield = Math.min(100, b.shield + 25);
      for (const lm of lootMeshes) if (lm.userData.spot === b.ai.lootSpot) lm.visible = false;
      b.ai.lootSpot = null; updateHpBar(b);
    }
  }
  // física vertical
  b.vel.y += GRAVITY * dt;
  b.pos.y += b.vel.y * dt;
  const gy = groundHeight(b.pos.x, b.pos.z);
  if (b.pos.y <= gy) { b.pos.y = gy; b.vel.y = 0; b.onGround = true; } else b.onGround = false;
  // recarga
  if (b.reloading > 0) {
    b.reloading -= dt;
    if (b.reloading <= 0) { const w = b.weapons[b.cur]; const need = w.mag - w.ammo, take = Math.min(need, w.res); w.ammo += take; w.res -= take; }
  }
  b.mesh.position.copy(b.pos);
  b.mesh.rotation.y = b.yaw;
  animateWalk(b, now);
  updateHpBar(b);
}

// ============ PLAYER UPDATE (TPS) ============
const camDist = 5.2, camSide = 1.1;
function playerUpdate(dt, now) {
  if (!player.alive) return;
  if (player.falling) {
    if (!busActive) { /* caiu fora do bus sem pular */ }
    if (player.mesh.visible) {
      player.pos.y -= dt * (player.gliding ? 9 : 32);
      player.yaw += 0; // mantém direção do mouse
      const fwd = (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0);
      player.pos.x += -Math.sin(player.yaw) * fwd * dt * 16;
      player.pos.z += -Math.cos(player.yaw) * fwd * dt * 16;
      const gy = groundHeight(player.pos.x, player.pos.z);
      if (player.pos.y <= gy) { player.pos.y = gy; player.falling = false; player.vel.y = 0; AudioSys.beep(300, .15, 'sine', .1); }
      player.mesh.position.copy(player.pos);
      player.mesh.rotation.y = player.yaw;
    }
    updateCamera(dt);
    return;
  }
  const sprint = keys['ShiftLeft'] || keys['ShiftRight'];
  const sp = sprint ? 9 : 6;
  let ix = 0, iz = 0;
  if (keys['KeyW']) iz += 1; if (keys['KeyS']) iz -= 1;
  if (keys['KeyA']) ix -= 1; if (keys['KeyD']) ix += 1;
  const has = (ix !== 0 || iz !== 0);
  // movimento relativo à câmera (yaw)
  const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
  let mx = 0, mz = 0;
  if (has) {
    const l = Math.hypot(ix, iz); ix /= l; iz /= l;
    // TPS: frente = (-sin,-cos), direita = (cos,-sin)
    mx = (-sin) * iz + cos * ix;
    mz = (-cos) * iz + (-sin) * ix;
  }
  let nx = player.pos.x + mx * sp * dt, nz = player.pos.z + mz * sp * dt;
  const c = collides(nx, nz);
  if (c) {
    // tenta deslizar por eixo
    if (!collides(nx, player.pos.z)) nz = player.pos.z;
    else if (!collides(player.pos.x, nz)) nx = player.pos.x;
    else { nx = player.pos.x; nz = player.pos.z; }
  }
  player.pos.x = THREE.MathUtils.clamp(nx, -HALF + 3, HALF - 3);
  player.pos.z = THREE.MathUtils.clamp(nz, -HALF + 3, HALF - 3);
  player.speed = has ? sp : 0;
  // pulo / gravidade
  player.vel.y += GRAVITY * dt;
  if (keys['Space'] && player.onGround) { player.vel.y = 10.5; player.onGround = false; }
  player.pos.y += player.vel.y * dt;
  const gy = groundHeight(player.pos.x, player.pos.z);
  if (player.pos.y <= gy) { player.pos.y = gy; player.vel.y = 0; player.onGround = true; } else player.onGround = false;

  if (shooting && pointerLocked) tryShoot(player, now);
  if (player.reloading > 0) {
    player.reloading -= dt;
    document.getElementById('reload-tip').classList.remove('hidden');
    if (player.reloading <= 0) {
      const w = player.weapons[player.cur];
      const need = w.mag - w.ammo, take = Math.min(need, w.res);
      w.ammo += take; w.res -= take;
      document.getElementById('reload-tip').classList.add('hidden');
      updateAmmoHUD();
    }
  }
  // coleta loot automática
  for (const lm of lootMeshes) {
    if (!lm.visible || !lm.userData.spot) continue;
    if (lm.position.distanceTo(player.pos) < 2.6) {
      lm.visible = false; lm.userData.spot.taken = true;
      player.tier = Math.min(4, player.tier + 1);
      const w = player.weapons.rifle, s = player.weapons.shotgun;
      w.ammo = w.mag; w.res = Math.min(240, w.res + 30);
      s.ammo = s.mag; s.res = Math.min(48, s.res + 8);
      player.shield = Math.min(100, player.shield + 25);
      player.mats.wood += 80; player.mats.brick += 40;
      AudioSys.chest(); updateHpBar(player); updateAmmoHUD(); updateMatsHUD();
      feed('🎁 Você pegou LOOT! +munição +escudo +mats', true);
    }
  }
  player.mesh.position.copy(player.pos);
  player.mesh.rotation.y = player.yaw;
  animateWalk(player, now);
  if (player.recoil > 0) player.recoil = Math.max(0, player.recoil - dt * 8);
  updateCamera(dt);
}
function updateCamera(dt) {
  const p = player;
  // vista cinematográfica dentro do ônibus: mostra a ilha de cima
  if (busActive && !p.dropped) {
    const bp = bus.position;
    const desired = new THREE.Vector3(bp.x - 22, bp.y + 10, bp.z + 30);
    camera.position.lerp(desired, 1 - Math.pow(0.001, dt));
    camera.lookAt(bp.x, 0, bp.z);
    return;
  }
  const back = new THREE.Vector3(Math.sin(p.yaw), 0, Math.cos(p.yaw));
  const eyeY = p.pos.y + 2.6;
  const desired = new THREE.Vector3(
    p.pos.x + back.x * camDist + Math.cos(p.yaw) * camSide,
    eyeY + Math.tan(-p.pitch) * -2 + 1.2 - p.pitch * 2,
    p.pos.z + back.z * camDist - Math.sin(p.yaw) * camSide
  );
  // colisão simples da câmera com prédios
  const c = collides(desired.x, desired.z);
  if (c) { desired.x = p.pos.x + back.x * 2.2; desired.z = p.pos.z + back.z * 2.2; }
  desired.y = Math.max(desired.y, groundHeight(desired.x, desired.z) + 0.6);
  camera.position.lerp(desired, 1 - Math.pow(0.0001, dt));
  const look = new THREE.Vector3(p.pos.x - back.x * 6, eyeY + p.pitch * 8, p.pos.z - back.z * 6);
  camera.lookAt(look);
  // arma aponta: gira torso
  p.mesh.userData.gun.rotation.x = p.pitch * 0.6;
}

// ============ HUD ============
function updateAmmoHUD() {
  document.getElementById('ammo-1').textContent = player.weapons.rifle.ammo + '/' + player.weapons.rifle.res;
  document.getElementById('ammo-2').textContent = player.weapons.shotgun.ammo + '/' + player.weapons.shotgun.res;
}
function updateMatsHUD() {
  document.getElementById('mat-wood').textContent = player.mats.wood;
  document.getElementById('mat-brick').textContent = player.mats.brick;
  document.getElementById('mat-metal').textContent = player.mats.metal;
}
function updateAliveHUD() {
  const n = entities.filter(e => e.alive).length;
  document.getElementById('alive').textContent = n;
  document.getElementById('kills').textContent = player.kills;
  document.getElementById('hp-fill').style.width = player.hp + '%';
  document.getElementById('hp-text').textContent = Math.ceil(player.hp);
  document.getElementById('shield-fill').style.width = player.shield + '%';
  document.getElementById('shield-text').textContent = Math.ceil(player.shield);
}
function feed(html, me) {
  const kf = document.getElementById('killfeed');
  const d = document.createElement('div');
  d.className = 'kill-msg' + (me ? ' me' : ''); d.innerHTML = html;
  kf.prepend(d);
  while (kf.children.length > 5) kf.lastChild.remove();
  setTimeout(() => d.remove(), 6000);
}
let hmT = null;
function showHitmarker(kill) {
  const h = document.getElementById('hitmarker');
  h.classList.add('show'); if (kill) h.classList.add('kill');
  clearTimeout(hmT); hmT = setTimeout(() => h.classList.remove('show', 'kill'), 120);
}
const mm = document.getElementById('minimap').getContext('2d');
function drawMinimap() {
  const S = 160, k = S / MAP_SIZE;
  mm.fillStyle = '#2d5a27'; mm.fillRect(0, 0, S, S);
  // lago
  mm.fillStyle = '#2f9be8';
  mm.beginPath(); mm.arc((130 + HALF) * k, (-110 + HALF) * k, 45 * k, 0, 7); mm.fill();
  // cidade
  mm.fillStyle = '#8a8f96'; mm.fillRect((0 - 60 + HALF) * k, (0 - 60 + HALF) * k, 120 * k, 120 * k);
  // storm
  mm.strokeStyle = '#e040fb'; mm.lineWidth = 2;
  mm.beginPath(); mm.arc((storm.center.x + HALF) * k, (storm.center.y + HALF) * k, storm.radius * k, 0, 7); mm.stroke();
  mm.strokeStyle = '#fff'; mm.lineWidth = 1;
  mm.beginPath(); mm.arc((storm.targetC.x + HALF) * k, (storm.targetC.y + HALF) * k, storm.targetR * k, 0, 7); mm.stroke();
  for (const e of entities) {
    if (!e.alive) continue;
    mm.fillStyle = e.isPlayer ? '#ffd700' : '#ff5252';
    mm.fillRect((e.pos.x + HALF) * k - 2, (e.pos.z + HALF) * k - 2, 4, 4);
  }
}
function checkEnd() {
  const alive = entities.filter(e => e.alive);
  if (!player.alive) {
    const rank = alive.length + 1;
    showEnd(false, rank);
  } else if (alive.length === 1 && alive[0] === player) {
    showEnd(true, 1);
  }
  updateAliveHUD();
}
function showEnd(win, rank) {
  document.exitPointerLock?.();
  const es = document.getElementById('end-screen');
  es.classList.remove('hidden');
  document.getElementById('end-title').textContent = win ? '#1 VICTORY ROYALE!' : `#${rank} — DERROTA`;
  document.getElementById('end-sub').textContent = win ? 'Você é o último sobrevivente! 🏆' : 'Boa tentativa! Caia de novo e busque o Top 1.';
  document.getElementById('end-stats').innerHTML =
    `<div class="stat">Kills<b>${player.kills}</b></div><div class="stat">Sobreviventes<b>${entities.filter(e => e.alive).length}</b></div><div class="stat">Fase Storm<b>${storm.phase}</b></div>`;
  if (win) AudioSys.kill();
}

// ============ LOOP PRINCIPAL (meta 40 FPS) ============
let last = performance.now(), fpsAcc = 0, fpsN = 0, fpsT = 0, nowS = 0;
function animate() {
  requestAnimationFrame(animate);
  const nowMs = performance.now();
  let dt = (nowMs - last) / 1000;
  last = nowMs;
  dt = Math.min(dt, 0.05);
  nowS += dt;
  // FPS meter + auto-quality p/ segurar 40
  fpsAcc += 1 / Math.max(dt, 1e-4); fpsN++; fpsT += dt;
  if (fpsT >= 0.5) {
    const fps = Math.round(fpsAcc / fpsN);
    document.getElementById('fps').textContent = fps;
    const box = document.getElementById('fps-box');
    box.className = fps >= TARGET_FPS ? 'good' : 'low';
    box.id = 'fps-box';
    if (QUALITY === 'auto') {
      if (fps < 33 && pixelScale > 0.6) { pixelScale -= 0.1; renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25) * pixelScale); }
      else if (fps > 55 && pixelScale < 1.0) { pixelScale += 0.05; renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25) * pixelScale); }
    }
    fpsAcc = 0; fpsN = 0; fpsT = 0;
  }
  if (gameStarted) {
    updateBus(dt);
    playerUpdate(dt, nowS);
    for (const b of bots) botUpdate(b, dt, nowS);
    updateStorm(dt);
    // tracers
    for (const t of tracerPool) {
      if (!t.m.visible) continue;
      t.life -= dt;
      if (t.life <= 0) t.m.visible = false;
    }
    // nuvens deriva
    for (const c of clouds) { c.position.x += dt * 1.5; if (c.position.x > 380) c.position.x = -380; }
    // loot flutua
    const tt = nowS * 2;
    for (const lm of lootMeshes) { if (lm.visible) { lm.rotation.y += dt; lm.position.y += Math.sin(tt + lm.position.x) * dt * 0.3; } }
    updateAliveHUD();
  } else {
    // menu: câmera orbitando a ilha
    const t = nowMs * 0.0001;
    camera.position.set(Math.sin(t) * 180, 90, Math.cos(t) * 180);
    camera.lookAt(0, 0, 0);
    for (const b of bots) { b.mesh.position.set(Math.cos(t * 3 + b.yaw) * 20, 0, Math.sin(t * 3 + b.yaw) * 20); }
    player.mesh.position.set(0, 0, 8);
    player.mesh.rotation.y = t * 2;
  }
  renderer.render(scene, camera);
}
updateAmmoHUD(); updateMatsHUD(); updateAliveHUD();
animate();

import * as THREE from 'three';

// =====================================================================
//  ROADSTER: NAMMA BENGALURU EDITION
//  Forward is -Z. car.s = distance travelled, car world z = -car.s
// =====================================================================

const ROAD_HALF = 8;          // asphalt half-width
const PATH_IN = 8.4;          // footpath starts
const PATH_OUT = 11;          // footpath ends
const CAR_HW = 0.95, CAR_HL = 2.25;
const TOTAL = 3300;
// Drive modes, Tesla-style. The game clock scales with cruise speed, so Chill isn't a handicap.
const MODES = { chill: { cruise: 26, label: 'Chill' }, sport: { cruise: 34, label: 'Sport' }, plaid: { cruise: 44, label: 'Plaid' } };
let driveMode = 'sport';
try { const m = localStorage.getItem('rb-mode'); if (MODES[m]) driveMode = m; } catch (e) {}
const cruise = () => MODES[driveMode].cruise;
const GRAV = 30, HOP_V = 11.5, HOP_COST = 16, HOVER_DRAIN = 26, BOOST_DRAIN = 20, AIR_REGEN = 14, MAX_HOVER_Y = 6.5;
const START_MIN = 8 * 60 + 52, STANDUP_MIN = 9 * 60 + 30, SEC_PER_MIN = 2.2;

const STAGES = [
  { s: 0,    name: 'HSR Layout',               sub: '27th Main. Filter coffee in hand. Feeling optimistic.' },
  { s: 700,  name: 'Silk Board Junction',      sub: 'Estimated wait: 3 business days' },
  { s: 1200, name: 'Outer Ring Road · Bellandur', sub: 'Metro construction since 2019. The lake is foaming again.' },
  { s: 2050, name: 'Marathahalli Bridge',      sub: 'Potholes have been upgraded to craters' },
  { s: 2700, name: 'Whitefield',               sub: 'Almost there. So is everyone else.' },
];
const STAGE_CFG = [
  { gap: 21, mix: { auto: 4, bike: 4, car: 3, cow: 1.3, bus: 0.8, pothole: 1.5 } },
  { gap: 16, mix: { auto: 3, bike: 4, car: 3, bus: 2, cow: 0.4, pothole: 1 } },
  { gap: 18, mix: { car: 4, bus: 2, tanker: 2, auto: 2.5, bike: 3, pothole: 1 } },
  { gap: 16, mix: { auto: 3, bike: 3, car: 3, pothole: 4, breaker: 1.4, cow: 1, tanker: 1 } },
  { gap: 17, mix: { car: 4, auto: 3, bike: 3, bus: 1.5, cow: 1, breaker: 0.8 } },
];

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const wpick = (mix) => { let t = 0; for (const k in mix) t += mix[k]; let r = Math.random() * t; for (const k in mix) { r -= mix[k]; if (r <= 0) return k; } return Object.keys(mix)[0]; };

// ---------------------------------------------------------------------
//  Renderer / scene
// ---------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const FOG = 0xe6d3b3;
scene.fog = new THREE.Fog(FOG, 70, 250);
{
  const c = document.createElement('canvas'); c.width = 4; c.height = 256;
  const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#9fc0d8'); gr.addColorStop(0.55, '#dcd6c4'); gr.addColorStop(1, '#e6d3b3');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; scene.background = t;
}
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 400);
scene.add(new THREE.HemisphereLight(0xfff3dd, 0x8a6a4a, 1.25));
const sun = new THREE.DirectionalLight(0xffe2b8, 1.9);
sun.position.set(-30, 40, -20); scene.add(sun);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------------------------------------------------------------------
//  Shared geometry / materials / textures
// ---------------------------------------------------------------------
const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 14);
const SPH = new THREE.IcosahedronGeometry(1, 1);
const matCache = new Map();
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts }));
  return matCache.get(key);
}
function box(parent, w, h, d, color, x = 0, y = 0, z = 0, m) {
  const mesh = new THREE.Mesh(BOX, m || mat(color));
  mesh.scale.set(w, h, d); mesh.position.set(x, y, z); parent.add(mesh); return mesh;
}
function cyl(parent, r, h, color, x = 0, y = 0, z = 0, axis = 'y', m) {
  const mesh = new THREE.Mesh(CYL, m || mat(color));
  mesh.scale.set(r, h, r); mesh.position.set(x, y, z);
  if (axis === 'x') mesh.rotation.z = Math.PI / 2; if (axis === 'z') mesh.rotation.x = Math.PI / 2;
  parent.add(mesh); return mesh;
}
function sph(parent, r, color, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
  const mesh = new THREE.Mesh(SPH, mat(color)); mesh.scale.set(r * sx, r * sy, r * sz); mesh.position.set(x, y, z); parent.add(mesh); return mesh;
}

const texCache = new Map();
function textTex(text, { bg = '#ffd23f', fg = '#1b1b1b', w = 512, h = 128, font = '800 64px "Baloo 2", sans-serif', sub = null, subFont = '700 30px "Noto Sans Kannada", sans-serif', border = null } = {}) {
  const key = [text, bg, fg, w, h, font, sub].join('|');
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  if (border) { g.strokeStyle = border; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10); }
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  const lines = String(text).split('\n');
  g.font = font;
  const top = sub ? h * 0.62 : h / 2; const lh = parseInt(font.match(/(\d+)px/)[1]) * 1.05;
  lines.forEach((ln, i) => {
    let size = parseInt(font.match(/(\d+)px/)[1]);
    g.font = font; while (g.measureText(ln).width > w * 0.92 && size > 12) { size -= 2; g.font = font.replace(/\d+px/, size + 'px'); }
    g.fillText(ln, w / 2, top + (i - (lines.length - 1) / 2) * lh);
  });
  if (sub) { g.font = subFont; g.fillText(sub, w / 2, h * 0.24); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  texCache.set(key, t); return t;
}
function signPlane(parent, tex, w, h, x, y, z, ry = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, fog: true }));
  m.position.set(x, y, z); m.rotation.y = ry; parent.add(m); return m;
}
function radialTex(inner = 'rgba(0,0,0,0.55)', outer = 'rgba(0,0,0,0)') {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, inner); gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
}
const SHADOW_TEX = radialTex();
const PUFF_TEX = radialTex('rgba(255,255,255,1)', 'rgba(255,255,255,0)');

function stripeTex(a, b, n = 6, w = 256, h = 64) {
  const key = 'stripe' + a + b + n;
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  for (let i = -2; i < n * 2; i++) { g.fillStyle = i % 2 ? a : b; g.beginPath(); const x = i * w / n; g.moveTo(x, 0); g.lineTo(x + w / n, 0); g.lineTo(x + w / n * 2, h); g.lineTo(x + w / n, h); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; texCache.set(key, t); return t;
}

// ---------------------------------------------------------------------
//  Ground, road, footpaths (follow the car, scroll their textures)
// ---------------------------------------------------------------------
const ROAD_TILE = 40;
function roadTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 1024; const g = c.getContext('2d');
  g.fillStyle = '#4a4a4d'; g.fillRect(0, 0, 512, 1024);
  for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${Math.random() < .5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.07})`; g.fillRect(Math.random() * 512, Math.random() * 1024, 3, 3); }
  // patchwork repairs
  for (let i = 0; i < 6; i++) { g.fillStyle = `rgba(40,40,42,${rand(.12, .25)})`; g.fillRect(rand(0, 430), rand(0, 940), rand(40, 110), rand(30, 90)); }
  // faded lane dashes (3 lanes each way... in theory)
  g.fillStyle = 'rgba(235,235,225,0.55)';
  for (const x of [128, 256, 384]) for (let y = 0; y < 1024; y += 128) { if (Math.random() < 0.8) g.fillRect(x - 4, y, 8, rand(40, 70)); }
  g.fillStyle = 'rgba(235,235,225,0.7)'; g.fillRect(6, 0, 6, 1024); g.fillRect(500, 0, 6, 1024);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
function pathTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#9b8f84'; g.fillRect(0, 0, 128, 256);
  for (let y = 0; y < 256; y += 32) for (let x = 0; x < 128; x += 32) {
    if (Math.random() < 0.12) continue; // missing tile, of course
    g.fillStyle = Math.random() < .5 ? '#b8a99a' : '#a7978a'; g.fillRect(x + 2, y + 2, 28, 28);
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}
const roadTex = roadTexture(); roadTex.repeat.set(1, 300 / ROAD_TILE);
const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, 300), new THREE.MeshLambertMaterial({ map: roadTex }));
road.rotation.x = -Math.PI / 2; scene.add(road);
const pTex = pathTexture(); pTex.repeat.set(1, 300 / 8);
const paths = [-1, 1].map(side => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(PATH_OUT - PATH_IN + 0.6, 300), new THREE.MeshLambertMaterial({ map: pTex }));
  m.rotation.x = -Math.PI / 2; m.position.x = side * (PATH_IN + PATH_OUT) / 2; m.position.y = 0.16; scene.add(m); return m;
});
const curbTex = stripeTex('#f2d21b', '#1c1c1c', 2, 64, 64); // yellow-black curbs, quintessential
const curbMat = new THREE.MeshLambertMaterial({ map: curbTex });
curbTex.wrapS = curbTex.wrapT = THREE.RepeatWrapping; curbTex.repeat.set(1, 300 / 2);
const curbs = [-1, 1].map(side => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.22, 300), curbMat);
  m.position.set(side * (ROAD_HALF + 0.2), 0.1, 0); scene.add(m); return m;
});
// rotate curb texture so stripes run across the curb
curbTex.rotation = Math.PI / 2;
const earth = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: 0xa7805c }));
earth.rotation.x = -Math.PI / 2; earth.position.y = -0.02; scene.add(earth);

// ---------------------------------------------------------------------
//  The Roadster
// ---------------------------------------------------------------------
function buildRoadster() {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xf3f3f0, roughness: 0.32, metalness: 0.15 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0b0d12, roughness: 0.1, metalness: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1b1e, roughness: 0.6 });
  const W = 1.95;
  // body: SR-71 / Esprit wedge side profile (u: front -> back along length)
  const s = new THREE.Shape();
  s.moveTo(-2.35, 0.36); s.lineTo(-2.28, 0.52); s.lineTo(-0.75, 0.84); s.lineTo(1.85, 0.98);
  s.lineTo(2.35, 0.94); s.lineTo(2.38, 0.46); s.lineTo(2.1, 0.24); s.lineTo(-1.95, 0.24); s.closePath();
  const bg = new THREE.ExtrudeGeometry(s, { depth: W, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2 });
  bg.translate(0, 0, -W / 2);
  const body = new THREE.Mesh(bg, white); body.rotation.y = -Math.PI / 2; g.add(body);
  // canopy
  const c = new THREE.Shape();
  c.moveTo(-0.85, 0.82); c.lineTo(0.0, 1.24); c.lineTo(0.85, 1.22); c.lineTo(1.75, 0.98); c.closePath();
  const cg = new THREE.ExtrudeGeometry(c, { depth: 1.36, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2 });
  cg.translate(0, 0, -0.68);
  const canopy = new THREE.Mesh(cg, glass); canopy.rotation.y = -Math.PI / 2; g.add(canopy);
  // side intakes
  for (const sx of [-1, 1]) box(g, 0.04, 0.22, 0.9, 0, sx * (W / 2 + 0.07), 0.55, 0.9, dark);
  // wheels with Cybercab-style aero covers
  const tire = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  const cap = new THREE.MeshStandardMaterial({ color: 0xd6d9dd, roughness: 0.4, metalness: 0.5 });
  g.wheels = [];
  for (const [x, z] of [[-1, -1.45], [1, -1.45], [-1, 1.5], [1, 1.5]]) {
    const wg = new THREE.Group(); wg.position.set(x * 1.02, 0.42, z); g.add(wg);
    cyl(wg, 0.42, 0.36, 0, 0, 0, 0, 'x', tire);
    cyl(wg, 0.32, 0.02, 0, x * 0.19, 0, 0, 'x', cap);
    g.wheels.push(wg);
  }
  // active rear wing
  box(g, 1.9, 0.05, 0.38, 0, 0, 1.28, 2.08, white);
  for (const sx of [-0.6, 0.6]) box(g, 0.06, 0.32, 0.1, 0, sx, 1.1, 2.1, dark);
  // light bars
  box(g, 1.75, 0.04, 0.05, 0, 0, 0.53, -2.36, new THREE.MeshBasicMaterial({ color: 0xffffff }));
  box(g, 1.95, 0.05, 0.05, 0, 0, 0.84, 2.4, new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
  // rear diffuser
  box(g, 1.5, 0.16, 0.12, 0, 0, 0.3, 2.36, dark);
  // 4 SpaceX cold-gas thrusters (small, high on the tail so they don't read as wheels)
  g.nozzles = [];
  for (const [x, y] of [[-0.7, 0.66], [-0.45, 0.66], [0.45, 0.66], [0.7, 0.66]]) {
    cyl(g, 0.07, 0.18, 0, x, y, 2.42, 'z', new THREE.MeshStandardMaterial({ color: 0x55585e, metalness: 0.8, roughness: 0.3 }));
    g.nozzles.push(new THREE.Vector3(x, y, 2.6));
  }
  // underglow (suction fan) visible when hovering
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 5), new THREE.MeshBasicMaterial({ map: radialTex('rgba(150,220,255,1)', 'rgba(150,220,255,0)'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
  glow.rotation.x = -Math.PI / 2; glow.position.y = 0.05; g.add(glow); g.glow = glow;
  // marigold garland on the hood, obviously (it was just blessed at the temple)
  for (let i = 0; i <= 10; i++) {
    const t = i / 10; const x = (t - 0.5) * 1.6; const z = -1.2 - Math.cos((t - 0.5) * Math.PI) * 0.55;
    const y = 0.62 + (z + 2.3) * 0.17;
    sph(g, 0.085, i % 2 ? 0xff8c00 : 0xffb300, x, y + 0.04, z);
  }
  // nimbu-mirchi hanging from the front bumper
  const nm = new THREE.Group(); nm.position.set(0.35, 0.42, -2.42); g.add(nm); g.nimbu = nm;
  box(nm, 0.012, 0.22, 0.012, 0x111111, 0, -0.11, 0);
  sph(nm, 0.07, 0xf6e13a, 0, -0.26, 0, 1, 1.15, 1);
  for (let i = 0; i < 4; i++) { const ch = cyl(nm, 0.025, 0.2, 0x1f9d3a, 0, -0.43 - i * 0.12, 0); ch.scale.set(0.03, 0.12, 0.03); ch.position.y = -0.4 - i * 0.07; }
  return g;
}
const carMesh = buildRoadster();
scene.add(carMesh);
const carShadow = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 6), new THREE.MeshBasicMaterial({ map: SHADOW_TEX, transparent: true, depthWrite: false }));
carShadow.rotation.x = -Math.PI / 2; scene.add(carShadow);
// tight dark contact shadow that only shows when the wheels are on the ground
const carContact = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 5), new THREE.MeshBasicMaterial({ map: radialTex('rgba(0,0,0,0.9)', 'rgba(0,0,0,0)'), transparent: true, depthWrite: false }));
carContact.rotation.x = -Math.PI / 2; scene.add(carContact);

// ---------------------------------------------------------------------
//  Traffic & hazards
// ---------------------------------------------------------------------
const AUTO_SLOGANS = ['Appa Amma\nBlessings', 'Sound Horn', 'Don\'t Kiss Me', 'Mother\'s Gift', 'Ex-Girlfriend\'s\nGift', 'Meter Ahead\n(Not Working)', 'Only Duty', 'Jai Karnataka', 'Life is\nRace'];
const PLATES = ['KA 01 MG 4521', 'KA 03 HB 9087', 'KA 05 EZ 1234', 'KA 51 N 7777', 'KA 04 MK 2019', 'KA 53 Z 0420'];
const CAB_PLATES = ['KA 01 C 6969', 'KA 05 C 3141', 'KA 03 C 8008', 'KA 51 C 1000'];
const CAR_COLORS = [0xffffff, 0xc0c4c8, 0x9e1b1b, 0x274b8a, 0x2e2e2e, 0xd9d2c0, 0x6b2f86];

function shadowUnder(g, w, d) {
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.4, d * 1.25), new THREE.MeshBasicMaterial({ map: SHADOW_TEX, transparent: true, depthWrite: false }));
  sh.rotation.x = -Math.PI / 2; sh.position.y = 0.03; g.add(sh);
}
function wheels(g, w, z1, z2, r = 0.32) {
  for (const z of [z1, z2]) for (const sx of [-1, 1]) cyl(g, r, 0.25, 0x151515, sx * w / 2, r, z, 'x');
}

const BUILDERS = {
  auto() {
    const g = new THREE.Group();
    box(g, 1.3, 0.55, 2.5, 0x1f8a3a, 0, 0.6, 0);
    box(g, 1.32, 0.35, 1.0, 0xf5c518, 0, 0.98, -0.8);          // yellow nose
    box(g, 1.38, 0.95, 1.9, 0x161616, 0, 1.38, 0.2);            // black canvas hood
    box(g, 1.2, 0.08, 1.7, 0xf5c518, 0, 1.88, 0.2);
    box(g, 0.9, 0.5, 0.05, 0x9fd8ef, 0, 1.3, -0.75);            // windscreen
    sph(g, 0.17, 0x6b4428, 0.2, 1.42, -0.35);                   // auto anna
    const back = signPlane(g, textTex(pick(AUTO_SLOGANS), { bg: '#f5c518', font: '800 54px "Baloo 2", sans-serif' }), 1.2, 0.42, 0, 1.0, 1.26);
    cyl(g, 0.26, 0.2, 0x151515, 0, 0.26, -1.0, 'x'); cyl(g, 0.26, 0.2, 0x151515, -0.58, 0.26, 0.8, 'x'); cyl(g, 0.26, 0.2, 0x151515, 0.58, 0.26, 0.8, 'x');
    shadowUnder(g, 1.3, 2.5);
    return { mesh: g, w: 1.35, d: 2.6, h: 1.95, vz: rand(9, 16), kind: 'auto', roof: true, ai: { t: rand(0.5, 2), tx: 0 } };
  },
  bus() {
    const g = new THREE.Group();
    const vajra = Math.random() < 0.5;
    const col = vajra ? 0x1f5fb0 : 0xb5332e;
    box(g, 2.55, 2.5, 10, col, 0, 1.75, 0);
    box(g, 2.6, 0.75, 9.6, 0x1b2430, 0, 2.25, -0.1);             // windows
    box(g, 2.56, 0.18, 10, vajra ? 0xffffff : 0xe8dcc0, 0, 1.45, 0);
    box(g, 2.5, 0.25, 9.8, 0xdadada, 0, 3.05, 0);
    signPlane(g, textTex(pick(['500D  HEBBAL', '335E  KADUGODI', 'G-4  WHITEFIELD', '201  SRINAGAR', 'KIA-8  AIRPORT']), { bg: '#111', fg: '#ff9a1c', font: '700 60px Inter, sans-serif' }), 2.0, 0.42, 0, 2.75, 5.02);
    signPlane(g, textTex('BMTC', { bg: vajra ? '#1f5fb0' : '#b5332e', fg: '#fff', font: '800 70px Inter, sans-serif' }), 1.2, 0.4, 0, 1.2, 5.02);
    wheels(g, 2.4, -3.2, 3.2, 0.5);
    // passengers hanging out of the door, as is tradition
    for (let i = 0; i < 3; i++) { const p = new THREE.Group(); p.position.set(1.42 + i * 0.1, 0.9, -3.6 + i * 0.45); g.add(p); box(p, 0.3, 0.9, 0.25, pick([0x2d6cdf, 0xd9483b, 0xeeeeee, 0x3c9b4f]), 0, 0.5, 0); sph(p, 0.15, 0x6b4428, 0, 1.08, 0); p.rotation.z = -0.25 - i * 0.1; }
    shadowUnder(g, 2.6, 10);
    return { mesh: g, w: 2.55, d: 10, h: 3.2, vz: rand(7, 12), kind: 'bus', roof: true, ai: { t: rand(2, 5), tx: 0 } };
  },
  bike() {
    const g = new THREE.Group();
    box(g, 0.32, 0.45, 1.5, pick([0x111111, 0xb32222, 0x1e3f9a, 0x777777]), 0, 0.55, 0);
    cyl(g, 0.3, 0.12, 0x111111, 0, 0.3, -0.62, 'x'); cyl(g, 0.3, 0.12, 0x111111, 0, 0.3, 0.62, 'x');
    const riders = Math.random() < 0.25 ? 3 : Math.random() < 0.5 ? 2 : 1;
    for (let i = 0; i < riders; i++) {
      const z = -0.15 + i * 0.38;
      box(g, 0.42, 0.6, 0.3, pick([0x2d6cdf, 0xd9483b, 0xf2f2f2, 0x3c9b4f, 0xe0a100, 0x8a2be2]), 0, 1.1 - i * 0.04, z);
      sph(g, 0.17, i === 0 && Math.random() < 0.7 ? pick([0xffd400, 0xd92b2b, 0x111111, 0xffffff]) : 0x3b2a1e, 0, 1.55 - i * 0.04, z);
    }
    if (Math.random() < 0.3) box(g, 0.5, 0.45, 0.45, 0xff6f00, 0, 1.15, 0.7); // delivery bag
    shadowUnder(g, 0.6, 1.6);
    return { mesh: g, w: 0.55, d: 1.7, h: 1.6, vz: rand(12, 22), kind: 'bike', roof: false, ai: { ph: rand(0, 6), f: rand(1.2, 2.6), amp: rand(0.6, 1.8) } };
  },
  car() {
    const g = new THREE.Group();
    const cab = Math.random() < 0.35;
    const big = Math.random() < 0.3;
    const col = cab ? 0xffffff : pick(CAR_COLORS);
    const L = big ? 4.4 : 3.7, Wd = big ? 1.85 : 1.65;
    box(g, Wd, 0.72, L, col, 0, 0.6, 0);
    box(g, Wd - 0.15, 0.58, L * 0.55, col, 0, 1.22, big ? 0.2 : 0.1);
    box(g, Wd - 0.1, 0.42, L * 0.5, 0x1b2430, 0, 1.24, big ? 0.2 : 0.1);
    box(g, Wd + 0.02, 0.1, 0.05, 0xd41c1c, 0, 0.82, L / 2 + 0.01);
    signPlane(g, textTex(cab ? pick(CAB_PLATES) : pick(PLATES), { bg: cab ? '#f5d000' : '#fff', fg: '#111', font: '700 56px Inter, sans-serif', w: 512, h: 112 }), 0.62, 0.15, 0, 0.6, L / 2 + 0.02);
    if (cab && Math.random() < .6) signPlane(g, textTex('ON DUTY', { bg: '#111', fg: '#ff3', font: '800 60px Inter' }), 0.7, 0.18, 0, 1.6, L * 0.1);
    wheels(g, Wd, -L * 0.32, L * 0.32);
    shadowUnder(g, Wd, L);
    return { mesh: g, w: Wd, d: L, h: big ? 1.6 : 1.5, vz: rand(11, 20), kind: 'car', roof: true, ai: { t: rand(2, 5), tx: 0 } };
  },
  cow() {
    const g = new THREE.Group();
    const col = pick([0xf2ede4, 0xe9e1d3, 0xd8c7a8]);
    const body = new THREE.Group(); g.add(body);
    box(body, 0.8, 0.75, 1.75, col, 0, 1.05, 0);
    box(body, 0.5, 0.3, 0.45, col, 0, 1.52, -0.5); // hump
    for (const [x, z] of [[-0.28, -0.65], [0.28, -0.65], [-0.28, 0.65], [0.28, 0.65]]) box(body, 0.16, 0.7, 0.16, col, x, 0.35, z);
    box(body, 0.42, 0.42, 0.65, col, 0, 1.35, -1.1);
    box(body, 0.3, 0.2, 0.2, 0x2a2a2a, 0, 1.2, -1.42);
    const hc = pick([0xd92b2b, 0x2d6cdf, 0xff9f1c]);
    for (const sx of [-1, 1]) { const h = cyl(body, 0.05, 0.4, hc, sx * 0.2, 1.68, -1.05); h.rotation.z = sx * 0.5; }
    box(body, 0.08, 0.5, 0.08, col, 0, 0.95, 0.95); // tail
    body.rotation.y = pick([0, Math.PI / 2, -Math.PI / 2, Math.PI * 0.25]);
    shadowUnder(g, 1.4, 2);
    const crossing = Math.random() < 0.35;
    return { mesh: g, w: 1.5, d: 1.8, h: 1.75, vz: 0, kind: 'cow', roof: false, ai: { vx: crossing ? pick([-1, 1]) * rand(0.8, 1.4) : 0 } };
  },
  tanker() {
    const g = new THREE.Group();
    box(g, 2.3, 1.9, 2.2, 0xe24e1b, 0, 1.6, -2.6);
    box(g, 2.2, 0.8, 0.1, 0x9fd8ef, 0, 2.0, -3.71);
    box(g, 2.4, 0.35, 7, 0x2a2a2a, 0, 0.8, 0);
    const tank = cyl(g, 1.15, 5, 0x2f6fd6, 0, 2.05, 1.0, 'z');
    signPlane(g, textTex('HORN OK\nPLEASE', { bg: '#ffd400', fg: '#d0131b', font: '800 70px "Baloo 2", sans-serif', w: 512, h: 256, border: '#1b8f3a' }), 1.9, 0.95, 0, 1.95, 3.52);
    signPlane(g, textTex('DRINKING WATER ₹1800', { bg: '#2f6fd6', fg: '#fff', font: '800 52px Inter' }), 2.2, 0.32, 1.17, 2.0, 1.0, Math.PI / 2);
    wheels(g, 2.3, -2.6, 2.4, 0.5);
    shadowUnder(g, 2.4, 7.4);
    return { mesh: g, w: 2.4, d: 7.4, h: 3.2, vz: rand(8, 13), kind: 'tanker', roof: true, ai: { t: 99, tx: 0 } };
  },
  pothole() {
    const g = new THREE.Group();
    const r = rand(0.8, 1.6);
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 9), new THREE.MeshLambertMaterial({ color: 0x232325 }));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.02; m.scale.set(1, rand(0.6, 1), 1); g.add(m);
    const w = new THREE.Mesh(new THREE.CircleGeometry(r * 0.7, 7), new THREE.MeshLambertMaterial({ color: 0x6a5a3a, transparent: true, opacity: 0.6 }));
    w.rotation.x = -Math.PI / 2; w.position.y = 0.03; g.add(w);
    return { mesh: g, w: r * 1.6, d: r * 1.6, h: 0, vz: 0, kind: 'pothole', flat: true };
  },
  breaker() {
    const g = new THREE.Group();
    const marked = Math.random() < 0.3;
    const m = box(g, ROAD_HALF * 2, 0.2, 0.7, 0, 0, 0.1, 0, marked ? new THREE.MeshLambertMaterial({ map: stripeTex('#f2d21b', '#1c1c1c', 16, 512, 32) }) : mat(0x55555a));
    return { mesh: g, w: ROAD_HALF * 2, d: 0.8, h: 0, vz: 0, kind: 'breaker', flat: true, marked, xFixed: 0 };
  },
  foam() {
    const g = new THREE.Group();
    for (let i = 0; i < 7; i++) sph(g, rand(0.6, 1.3), 0xffffff, rand(-1.5, 1.5), rand(0.4, 1.6), rand(-1.5, 1.5));
    g.children.forEach(c => { c.material = new THREE.MeshLambertMaterial({ color: 0xf6fbff, transparent: true, opacity: 0.85 }); });
    return { mesh: g, w: 3.2, d: 3.2, h: 2.2, vz: 0, kind: 'foam', ghost: true, ai: { vx: pick([-1, 1]) * rand(1, 2.2) } };
  },
  barricade() {
    const g = new THREE.Group();
    const m = new THREE.MeshLambertMaterial({ map: stripeTex('#ff6a00', '#ffffff', 6) });
    box(g, 3.6, 0.9, 0.3, 0, 0, 0.75, 0, m);
    for (const sx of [-1.5, 1.5]) box(g, 0.12, 0.4, 0.5, 0x333333, sx, 0.2, 0);
    signPlane(g, textTex('METRO WORK IN PROGRESS', { bg: '#ffd400', fg: '#111', font: '800 46px Inter' }), 2.6, 0.35, 0, 1.4, 0.16);
    return { mesh: g, w: 3.6, d: 0.6, h: 1.2, vz: 0, kind: 'barricade' };
  },
  pillar() {
    const g = new THREE.Group();
    cyl(g, 1.0, 10, 0xa9a9a4, 0, 5, 0);
    box(g, 4.2, 1.2, 2.4, 0xa9a9a4, 0, 10.4, 0);
    box(g, 3.4, 1.4, 34, 0x9c9c97, 0, 11.6, 0); // viaduct span
    signPlane(g, textTex('NAMMA METRO\nOpening 2019 2023 2025 Soon', { bg: '#7b2d8e', fg: '#fff', font: '800 44px Inter', w: 512, h: 160 }), 3, 0.95, 0, 3.2, 1.02);
    shadowUnder(g, 2, 2);
    return { mesh: g, w: 2.0, d: 2.0, h: 99, vz: 0, kind: 'pillar' };
  },
  cop() {
    const g = new THREE.Group();
    box(g, 0.45, 0.8, 0.3, 0x1d2a4a, 0, 0.4, 0);
    box(g, 0.55, 0.7, 0.35, 0xf4f4f4, 0, 1.15, 0);
    sph(g, 0.18, 0x6b4428, 0, 1.68, 0);
    box(g, 0.42, 0.1, 0.42, 0xf4f4f4, 0, 1.86, 0);
    const arm = box(g, 0.12, 0.6, 0.12, 0xf4f4f4, 0.36, 1.45, 0); arm.rotation.z = -2.2;
    signPlane(g, textTex('TRAFFIC\nPOLICE', { bg: '#fff', fg: '#1d2a4a', font: '800 50px Inter', w: 256, h: 160 }), 0.7, 0.45, 0, 2.4, 0.01);
    shadowUnder(g, 0.8, 0.8);
    return { mesh: g, w: 0.6, d: 0.6, h: 1.9, vz: 0, kind: 'cop', ai: { arm } };
  },
  gate() {
    const g = new THREE.Group();
    for (const sx of [-1, 1]) box(g, 1.2, 8, 1.2, 0x222222, sx * 11.5, 4, 0);
    box(g, 24.2, 1.6, 1.2, 0x111111, 0, 8.4, 0);
    signPlane(g, textTex('TECH PARK · GATE 3', { bg: '#111', fg: '#fff', font: '300 64px Inter', w: 1024, h: 96 }), 20, 1.3, 0, 8.4, 0.61);
    signPlane(g, textTex('Please keep your badge ready. Visitors: 45 min queue.', { bg: '#e82127', fg: '#fff', font: '600 40px Inter', w: 1024, h: 64 }), 14, 0.7, 0, 6.9, 0.61);
    return { mesh: g, w: 0, d: 0, h: 0, vz: 0, kind: 'gate', ghost: true };
  },
};

let obstacles = [];
function addObstacle(kind, x, s, extra = {}) {
  const o = BUILDERS[kind]();
  Object.assign(o, extra);
  o.x = o.xFixed !== undefined ? o.xFixed : x; o.z = -s; o.y = 0;
  if (o.vz && extra.vz === undefined) {/* keep random */}
  if (o.ai && 'tx' in o.ai) o.ai.tx = o.x; // don't all beeline for the centre on spawn
  o.mesh.position.set(o.x, 0, o.z);
  o.hitCd = 0; o.cleared = false;
  scene.add(o.mesh); obstacles.push(o); return o;
}
function clearObstacles() { for (const o of obstacles) scene.remove(o.mesh); obstacles = []; }

// ---------------------------------------------------------------------
//  Scenery: buildings, signboards, trees, poles with tangled wires
// ---------------------------------------------------------------------
const SHOPS = [
  ['Sri Lakshmi Darshini', 'ದರ್ಶಿನಿ'], ['Udupi Grand Hotel', 'ಹೋಟೆಲ್'], ['Filter Kaapi ₹15', 'ಕಾಫಿ'], ['Raghavendra Stores', null],
  ['Iyengar\'s Bakery', null], ['Mobile Recharge & Xerox', null], ['Manjunatha Hardware', null], ['Biryani Since 1987', null],
  ['PG for Gents · WiFi · Food', null], ['Co-Working: Hot Desks (Literally)', null], ['Tasty Thindi', 'ನಮ್ಮ ಬೆಂಗಳೂರು'],
  ['Ganesh Condiments', null], ['Ayurvedic Hair Oil · 100% Natural', null], ['Hosur Road Tyres', null], ['Brahmin\'s Coffee Bar', 'ಕಾಫಿ'],
  ['Silk Sarees Mega Sale', null], ['Dosa Camp', 'ಸ್ವಾಗತ'], ['Startup Café · Pitch Decks Free', null],
];
const BILLBOARDS = [
  'Bengaluru: Come for the weather.\nStay because you\'re stuck in traffic.',
  'Rent ₹65,000 / month\n+ 10 months deposit',
  'HIRING: 10x Engineer\n0x Work-Life Balance',
  'Your startup\'s runway is shorter\nthan this traffic signal',
  'Peak Bengaluru: Taking a\nboard meeting in an auto',
  'Water Tanker ₹1800\nWater not guaranteed',
  'Silk Board Flyover\nNow 4% complete!',
  '2BHK in Whitefield\n"Just 10 mins from ORR"*',
];
const BLD_COLORS = [0xf2b5c4, 0xa8e0d0, 0xf6e27a, 0xc8b6e2, 0xf4c69a, 0xe8e2d6, 0x9fd2f0, 0xffffff, 0xd6efb0, 0xf09a8f];
const SIGN_BG = ['#ffd23f', '#e8432e', '#1f8a3a', '#2f6fd6', '#fff', '#7b2d8e', '#ff7a00'];

const scenery = []; // {obj, len}
let sceneryNextS = [-40, -40];
function buildBuilding(side) {
  const g = new THREE.Group();
  const w = rand(5, 11), h = rand(5, 17), d = rand(7, 13);
  const col = pick(BLD_COLORS);
  box(g, w, h, d, col, side * (PATH_OUT + 1 + w / 2), h / 2, 0);
  // floors / windows stripes
  for (let y = 3; y < h - 1; y += 3) box(g, 0.08, 0.9, d * 0.8, 0x2a2f38, side * (PATH_OUT + 0.96), y + 0.6, 0);
  // water tank on roof (Sintex, mandatory)
  if (Math.random() < 0.7) cyl(g, 0.7, 1.2, 0x111111, side * (PATH_OUT + 1 + w / 2) + rand(-1, 1), h + 0.6, rand(-2, 2));
  // ground floor shop board
  const [name, kn] = pick(SHOPS);
  const bg = pick(SIGN_BG); const fg = bg === '#fff' || bg === '#ffd23f' ? '#c0161c' : '#fff';
  signPlane(g, textTex(name, { bg, fg, sub: kn, font: '800 56px "Baloo 2", sans-serif' }), d * 0.85, 1.5, side * (PATH_OUT + 0.94), 3.2, 0, -side * Math.PI / 2);
  // shop shutter
  box(g, 0.06, 2.4, d * 0.6, 0x8b8b8b, side * (PATH_OUT + 0.95), 1.2, 0);
  return { obj: g, len: d + rand(0.5, 3) };
}
function buildTree(side) {
  const g = new THREE.Group();
  const x = side * rand(PATH_OUT - 0.8, PATH_OUT + 0.2);
  cyl(g, 0.22, 4, 0x6b4a2e, x, 2, 0);
  sph(g, rand(2, 3.2), pick([0x3f7f3a, 0x4d8f3f, 0x2f6b34]), x - side * 1.2, 5, 0, 1.3, 0.6, 1.2);
  return { obj: g, len: rand(6, 12) };
}
function buildBillboard(side) {
  const g = new THREE.Group();
  const x = side * (PATH_OUT + 3);
  for (const dz of [-3, 3]) box(g, 0.3, 9, 0.3, 0x444444, x, 4.5, dz);
  signPlane(g, textTex(pick(BILLBOARDS), { bg: '#111', fg: '#fff', font: '700 44px Inter', w: 1024, h: 384 }), 9, 3.4, x - side * 0.2, 8, 0, -side * Math.PI / 2 * 0.75);
  return { obj: g, len: 14 };
}

// electric poles, every 24u, both sides, with tangled sagging wires to the next pole
const POLE_GAP = 24;
const poles = [];
const wireMat = new THREE.LineBasicMaterial({ color: 0x151515 });
function buildPole(side) {
  const g = new THREE.Group();
  const x = side * (PATH_IN + 0.5);
  cyl(g, 0.1, 8, 0x8d8d8d, x, 4, 0);
  box(g, 1.4, 0.1, 0.1, 0x555555, x, 7.6, 0);
  if (Math.random() < 0.4) box(g, 0.5, 0.6, 0.4, 0x6b6b6b, x - side * 0.3, 6.4, 0); // transformer-ish box
  const n = 3 + ((Math.random() * 4) | 0);
  for (let i = 0; i < n; i++) {
    const pts = []; const y0 = rand(6.2, 7.6), sag = rand(0.6, 2.2), dx = rand(-0.6, 0.6);
    for (let k = 0; k <= 8; k++) { const t = k / 8; pts.push(new THREE.Vector3(x + dx * Math.sin(t * Math.PI), y0 - sag * Math.sin(t * Math.PI), -t * POLE_GAP)); }
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat));
  }
  // bonus wire coil
  if (Math.random() < 0.3) { const c = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.05, 4, 10), mat(0x151515)); c.position.set(x, 6.8, -0.3); g.add(c); }
  return g;
}
function initScenery() {
  for (const it of scenery) scene.remove(it.obj); scenery.length = 0;
  for (const p of poles) scene.remove(p.obj); poles.length = 0;
  sceneryNextS = [-40, -40];
  for (let side of [-1, 1]) for (let k = 0; k < 14; k++) { const g = buildPole(side); g.position.z = -(k * POLE_GAP - 40); scene.add(g); poles.push({ obj: g, s: k * POLE_GAP - 40 }); }
  updateScenery(0);
}
function updateScenery(carS) {
  for (let i = 0; i < 2; i++) {
    const side = i ? 1 : -1;
    while (sceneryNextS[i] < carS + 260) {
      const r = Math.random();
      const it = r < 0.68 ? buildBuilding(side) : r < 0.92 ? buildTree(side) : buildBillboard(side);
      it.s = sceneryNextS[i] + it.len / 2; it.obj.position.z = -it.s; scene.add(it.obj); scenery.push(it);
      sceneryNextS[i] += it.len;
    }
  }
  for (let i = scenery.length - 1; i >= 0; i--) if (scenery[i].s < carS - 30) { scene.remove(scenery[i].obj); scenery.splice(i, 1); }
  for (const p of poles) if (p.s < carS - 30) { p.s += 14 * POLE_GAP; p.obj.position.z = -p.s; }
}

// ---------------------------------------------------------------------
//  Particles (cold-gas vapour, dust)
// ---------------------------------------------------------------------
const particles = [];
for (let i = 0; i < 260; i++) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: PUFF_TEX, transparent: true, depthWrite: false, opacity: 0 }));
  sp.visible = false; scene.add(sp); particles.push({ sp, life: 0, max: 1, v: new THREE.Vector3(), s0: 1, s1: 2, a: 1 });
}
let pIdx = 0;
function puff(pos, vel, life, s0, s1, color = 0xffffff, a = 0.8) {
  const p = particles[pIdx = (pIdx + 1) % particles.length];
  p.sp.position.copy(pos); p.v.copy(vel); p.life = p.max = life; p.s0 = s0; p.s1 = s1; p.a = a;
  p.sp.material.color.setHex(color); p.sp.visible = true;
}
function updateParticles(dt) {
  for (const p of particles) {
    if (p.life <= 0) continue;
    p.life -= dt; if (p.life <= 0) { p.sp.visible = false; continue; }
    const t = 1 - p.life / p.max;
    p.sp.position.addScaledVector(p.v, dt); p.v.multiplyScalar(1 - 2.5 * dt);
    const s = lerp(p.s0, p.s1, t); p.sp.scale.set(s, s, s); p.sp.material.opacity = p.a * (1 - t);
  }
}

// ---------------------------------------------------------------------
//  Audio — all synthesized, zero assets
// ---------------------------------------------------------------------
const AU = {
  ctx: null, master: null, muted: false,
  init() {
    if (this.ctx) return;
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    const ctx = this.ctx = new C();
    this.master = ctx.createGain(); this.master.gain.value = 0.55; this.master.connect(ctx.destination);
    // noise buffer
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const d = nb.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = nb;
    // EV whine
    this.eng = ctx.createOscillator(); this.eng.type = 'sawtooth';
    this.eng2 = ctx.createOscillator(); this.eng2.type = 'sine';
    const ef = ctx.createBiquadFilter(); ef.type = 'lowpass'; ef.frequency.value = 900;
    this.engG = ctx.createGain(); this.engG.gain.value = 0;
    this.eng.connect(ef); this.eng2.connect(ef); ef.connect(this.engG); this.engG.connect(this.master);
    this.eng.start(); this.eng2.start();
    // thruster hiss
    const ns = ctx.createBufferSource(); ns.buffer = nb; ns.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 0.6;
    this.thrG = ctx.createGain(); this.thrG.gain.value = 0;
    ns.connect(bp); bp.connect(this.thrG); this.thrG.connect(this.master); ns.start();
    this.thrF = bp;
  },
  t() { return this.ctx.currentTime; },
  setEngine(speed, thrust) {
    if (!this.ctx) return;
    const t = this.t();
    this.eng.frequency.setTargetAtTime(60 + speed * 3.2, t, 0.1);
    this.eng2.frequency.setTargetAtTime(300 + speed * 14, t, 0.1);
    this.engG.gain.setTargetAtTime(state === 'playing' ? 0.035 + speed * 0.0006 : 0, t, 0.2);
    this.thrG.gain.setTargetAtTime(thrust * 0.32, t, 0.05);
    this.thrF.frequency.setTargetAtTime(900 + thrust * 1400, t, 0.1);
  },
  tone(freq, dur, type = 'square', vol = 0.2, pan = 0, when = 0, slide = 0) {
    if (!this.ctx) return;
    const t = this.t() + when;
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.setValueAtTime(vol, t + dur * 0.7); g.gain.linearRampToValueAtTime(0, t + dur);
    const p = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    o.connect(g); if (p) { p.pan.value = pan; g.connect(p); p.connect(this.master); } else g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  },
  noiseHit(dur = 0.3, freq = 800, vol = 0.4, type = 'lowpass') {
    if (!this.ctx) return;
    const t = this.t(); const s = this.ctx.createBufferSource(); s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random()); s.stop(t + dur);
  },
  horn(pitch = 1, pan = 0, vol = 0.18, dur = 0.32) { this.tone(400 * pitch, dur, 'square', vol * 0.6, pan); this.tone(505 * pitch, dur, 'sawtooth', vol * 0.4, pan); },
  musicalHorn(pan = 0) { // truck "pom-pom" melody horn
    const notes = [523, 659, 784, 659, 523, 784]; notes.forEach((n, i) => this.tone(n, 0.16, 'square', 0.06, pan, i * 0.15));
  },
  moo() { if (!this.ctx) return; this.tone(150, 1.0, 'sawtooth', 0.22, 0, 0, 0.6); this.tone(152, 1.0, 'triangle', 0.15, 0, 0, 0.62); },
  crash() { this.noiseHit(0.45, 900, 0.5); this.tone(70, 0.3, 'sine', 0.5, 0, 0, 0.5); this.tone(820, 0.08, 'square', 0.06, 0, 0.05); },
  hop() { this.noiseHit(0.35, 2400, 0.35, 'bandpass'); this.tone(220, 0.2, 'sine', 0.12, 0, 0, 2.2); },
  land() { this.tone(90, 0.15, 'sine', 0.3, 0, 0, 0.6); this.noiseHit(0.12, 500, 0.2); },
  thud() { this.tone(60, 0.2, 'sine', 0.45, 0, 0, 0.5); this.noiseHit(0.2, 400, 0.3); },
  ching() { this.tone(1318, 0.09, 'triangle', 0.2); this.tone(1760, 0.3, 'triangle', 0.2, 0, 0.08); },
  ping() { this.tone(880, 0.07, 'sine', 0.14); this.tone(1320, 0.12, 'sine', 0.14, 0, 0.08); },
  stunt() { [523, 659, 784, 1046].forEach((n, i) => this.tone(n, 0.12, 'square', 0.07, 0, i * 0.07)); },
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.55; },
};

// ---------------------------------------------------------------------
//  UI helpers
// ---------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const ui = { spd: $('spd'), clock: $('clock'), progfill: $('progfill'), progcar: $('progcar'), stage: $('stageName'), air: $('airfill'), swag: $('swag'), challan: $('challan'), flash: $('flash'), banner: $('banner'), hint: $('hint'), toasts: $('toasts'), foam: $('foam'), tick: $('tick') };
{ // progress ticks
  const pt = $('progticks'); STAGES.slice(1).forEach(st => { const s = document.createElement('span'); s.style.left = (st.s / TOTAL * 100) + '%'; pt.appendChild(s); });
}
let flashT = 0;
function flash(text, sub = '', color) {
  ui.flash.innerHTML = text + (sub ? `<small>${sub}</small>` : '');
  ui.flash.style.color = color || '';
  ui.flash.classList.remove('pop'); void ui.flash.offsetWidth; ui.flash.classList.add('pop');
  flashT = 1.0;
}
function banner(a, b) {
  ui.banner.querySelector('.b1').textContent = a; ui.banner.querySelector('.b2').textContent = b;
  ui.banner.classList.remove('show'); void ui.banner.offsetWidth; ui.banner.classList.add('show');
}
let hintT = 0;
function hint(text, dur = 3) { ui.hint.innerHTML = text; ui.hint.classList.add('on'); hintT = dur; }
function toast(from, msg, sys = false) {
  const el = document.createElement('div'); el.className = 'toast' + (sys ? ' sys' : '');
  el.innerHTML = `<div class="from">${from}<span>${fmtClock(game.clock)}</span></div>${msg}`;
  ui.toasts.prepend(el); AU.ping();
  while (ui.toasts.children.length > 3) ui.toasts.lastChild.remove();
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 450); }, 5200);
}
function fmtClock(min) { const h = Math.floor(min / 60), m = Math.floor(min % 60); return `${h > 12 ? h - 12 : h}:${String(m).padStart(2, '0')}`; }

const TICKER = [
  'Traffic update: Everything is jammed. Everything. Back to you.',
  'Silk Board junction declared a UNESCO World Waiting Site.',
  'Local man spots a flying Tesla, refuses to be impressed: "Auto anna does that daily."',
  'Weather: 24°C, pleasant. Pothole forecast: 98% chance.',
  'BBMP announces road will be dug up again next week for "better connectivity".',
  'Namma Metro Purple Line on time. Your bus? Lol.',
  'Breaking: Bellandur lake foam applies for Kannada Rajyotsava award.',
  'ORR commuters report seeing the same auto for the last 40 minutes.',
];
ui.tick.textContent = TICKER.join('   •   ');

const KANNADA_HITS = ['Swalpa adjust maadi!', 'Yen guru?!', 'Side kodi saar!', 'Ayyo!', 'Nodkond hogi guru!', 'Enri idu?!', 'Olle kelsa...', 'Guru, meter haaku!'];

// ---------------------------------------------------------------------
//  Input
// ---------------------------------------------------------------------
const keys = {}; const pressed = {};
const KEYMAP = { Escape: 'pause', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'boost', KeyW: 'boost', ArrowDown: 'brake', KeyS: 'brake', Space: 'hop', ShiftLeft: 'hover', ShiftRight: 'hover', KeyF: 'roll', KeyH: 'horn', KeyG: 'fsd', KeyM: 'mute', KeyP: 'pause', Enter: 'enter' };
addEventListener('keydown', (e) => {
  const k = KEYMAP[e.code]; if (!k) return;
  e.preventDefault();
  if (!keys[k]) pressed[k] = true; keys[k] = true;
});
addEventListener('keyup', (e) => { const k = KEYMAP[e.code]; if (k) { e.preventDefault(); keys[k] = false; } });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; setPaused(true); });
document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });
// touch
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
document.querySelectorAll('#touch button').forEach(b => {
  const k = b.dataset.k;
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); if (!keys[k]) pressed[k] = true; keys[k] = true; b.classList.add('on'); });
  const up = () => { keys[k] = false; b.classList.remove('on'); };
  b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
});

// ---------------------------------------------------------------------
//  Game state
// ---------------------------------------------------------------------
let state = 'title';
let paused = false;
const car = {};
const game = {};
function resetGame() {
  Object.assign(car, { x: -3, y: 0, s: 0, vy: 0, vx: 0, speed: 0, air: 100, onGround: true, roll: 0, rolling: false, hopHeld: 0, hoverArmed: false, thrust: 0, support: null, shake: 0, crashCd: 0, tilt: 0, pitch: 0 });
  Object.assign(game, {
    clock: START_MIN, t: 0, swag: 0, challans: [], cowsRespected: 0, cowsHit: 0, potholes: 0, crashes: 0, honks: 0, rolls: 0, surf: 0, hops: 0,
    stage: -1, nextSpawn: 135, events: buildEvents(), lateMsgs: [9 * 60 + 31, 9 * 60 + 40, 9 * 60 + 52, 10 * 60 + 5], foamT: 0, ambT: 1, pausedT: 0, fsdCd: 0,
  });
  clearObstacles();
  initScenery();
  // pre-spawn scripted set pieces
  spawnSetPieces();
  ui.challan.textContent = '₹0';
}

function spawnSetPieces() {
  // a parked cow right at the start, to set expectations
  addObstacle('cow', 6.8, 115, { ai: { vx: 0 } });
  // Silk Board gridlock wall: 6 rows of zero-speed chaos across the entire width, footpaths included
  for (let r = 0; r < 6; r++) {
    const s = 940 + r * 11;
    let x = -10.6;
    while (x < 10.6) {
      const onPath = Math.abs(x) > PATH_IN - 0.2;
      const kind = onPath ? 'bike' : wpick({ bus: 1.3, auto: 3, car: 3, bike: 2 });
      const o = BUILDERS[kind]();
      const cx = x + o.w / 2 + 0.05;
      if (cx + o.w / 2 > 10.9) { x += 0.6; continue; }
      o.x = cx; o.z = -(s + rand(-1.5, 1.5)); o.vz = 0; o.gridlock = true;
      if (o.ai) o.ai = { t: 999, tx: cx, ph: 0, f: 0, amp: 0 };
      o.mesh.position.set(o.x, 0, o.z); o.hitCd = 0; o.cleared = false; scene.add(o.mesh); obstacles.push(o);
      x += o.w + rand(0.1, 0.6);
    }
  }
  addObstacle('cop', 0, 1003);           // cop on a podium in the middle of the junction
  // Metro construction on ORR: pillars down the middle with barricades
  for (let s = 1320; s < 1720; s += 34) {
    addObstacle('pillar', 0, s);
    if (Math.random() < 0.55) addObstacle('barricade', pick([-1, 1]) * rand(2.4, 5.5), s + rand(-8, 8));
  }
  // Bellandur foam drift
  for (let s = 1780; s < 2000; s += rand(18, 30)) addObstacle('foam', rand(-7, 7), s);
  // Traffic cops at the roadside
  for (const s of [430, 1250, 1900, 2380, 2950]) addObstacle('cop', pick([-1, 1]) * 9.2, s);
  // the finish gate
  addObstacle('gate', 0, TOTAL);
}

function buildEvents() {
  // distance-triggered story beats: [s, fn]
  return [
    [5, () => toast('Manager 👔', 'Morning! Standup at 9:30 sharp. Client is joining 🙂')],
    [40, () => hint(isTouch ? '<b>HOP</b> to jump · <b>hold</b> to hover · <b>ROLL</b> in the air' : '<b>SPACE</b> to hop · <b>hold</b> to hover · <b>F</b> barrel roll in the air', 5)],
    [200, () => toast('Family Group 🙏 (247)', 'Good Morning 🌞🌻 Have a blessed Friday. Forwarded as received.')],
    [480, () => toast('Amma', 'Did you eat breakfast? Take tiffin. Don\'t drive fast in that flying thing.')],
    [820, () => hint(`Silk Board ahead. <b>Hop + hold ${isTouch ? 'HOP' : 'SPACE'}</b> to fly over the gridlock. Save your cold gas!`, 5)],
    [880, () => toast('Google Maps', 'Silk Board: 47 min delay. Rerouting… Rerouting… Giving up.', true)],
    [1100, () => toast('Tesla Service', 'Your Roadster has logged 14 potholes. Please do not tell Elon.', true)],
    [1300, () => toast('HR', 'Reminder: RTO is 5 days/week. Badge-in after 9:30 counts as "half day" 🙂')],
    [1290, () => hint('Metro pillars ahead — you can\'t fly over those. Steer!', 3.5)],
    [1760, () => hint('Bellandur lake foam ahead. Visibility: emotional.', 3.5)],
    [1700, () => toast('Swiggy', 'Your masala dosa is stuck at Silk Board too 🛵💨', true)],
    [2150, () => toast('Landlord', 'Rent increased 20% from next month. Market rate only sir 🙏')],
    [2500, () => toast('Teammate', 'bro manager already joined the call 😬 where are you')],
    [2900, () => toast('Manager 👔', '?')],
  ].sort((a, b) => a[0] - b[0]);
}

// ---------------------------------------------------------------------
//  Spawning procedural traffic
// ---------------------------------------------------------------------
function stageAt(s) { let i = 0; for (let k = 0; k < STAGES.length; k++) if (s >= STAGES[k].s) i = k; return i; }
function inGridlockZone(s) { return s > 905 && s < 1030; }
function inMetroZone(s) { return s > 1300 && s < 1740; }
function spawnAt(s) {
  if (s > TOTAL - 30) return;
  const st = stageAt(s); const cfg = STAGE_CFG[st];
  const n = 1 + (Math.random() < 0.45) + (Math.random() < 0.15);
  const used = [];
  for (let i = 0; i < n; i++) {
    let kind = wpick(cfg.mix);
    if (inGridlockZone(s)) return;
    if (kind === 'breaker' && i > 0) continue;
    let x;
    if (kind === 'bike' && Math.random() < 0.3) x = pick([-1, 1]) * rand(PATH_IN + 0.5, PATH_OUT - 0.6); // footpath riders
    else x = rand(-ROAD_HALF + 1.2, ROAD_HALF - 1.2);
    if (inMetroZone(s) && Math.abs(x) < 2.2) x = Math.sign(x || 1) * rand(2.6, 6.8);
    if (used.some(u => Math.abs(u - x) < 3)) continue;
    used.push(x);
    addObstacle(kind, x, s + rand(-3, 3));
  }
}

// ---------------------------------------------------------------------
//  Update
// ---------------------------------------------------------------------
function addSwag(n, why) { game.swag += n; }
function issueChallan(amount, reason) {
  game.challans.push({ amount, reason }); AU.ching();
  const tot = game.challans.reduce((a, c) => a + c.amount, 0); ui.challan.textContent = '₹' + tot.toLocaleString('en-IN');
  toast('Bengaluru Traffic Police 🚓', `e-Challan ₹${amount}: ${reason}`, true);
}

function update(dt) {
  game.t += dt;
  game.clock += dt * (cruise() / 44) / SEC_PER_MIN;
  const prevY = car.y;

  // ---------- horizontal
  const steer = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  const steerRate = 9 + Math.min(car.speed, 40) * 0.12;
  car.vx = lerp(car.vx, steer * steerRate, 1 - Math.exp(-dt * 8));
  car.x = clamp(car.x + car.vx * dt, -PATH_OUT + 1.05, PATH_OUT - 1.05);
  const onPath = Math.abs(car.x) > PATH_IN + 0.2;

  // ---------- speed / thrusters
  let thrust = 0;
  let target = keys.brake ? 0 : cruise() * (onPath && car.onGround ? 0.65 : 1);
  if (keys.boost && car.air > 1 && !keys.brake) { target = cruise() * 1.55; car.air -= BOOST_DRAIN * dt; thrust = Math.max(thrust, 0.7); }
  const acc = car.speed < target ? (target > cruise() ? 40 : 34) : (keys.brake ? 70 : 20);
  car.speed = car.speed < target ? Math.min(target, car.speed + acc * dt) : Math.max(target, car.speed - acc * dt);
  car.s += car.speed * dt;
  if (onPath && car.onGround && car.speed > 20 && Math.random() < dt * 2) car.shake = Math.max(car.shake, 0.07);

  // ---------- hop / hover
  if (pressed.hop || pressed.hover) {
    if (car.onGround) {
      if (car.air >= HOP_COST) {
        car.vy = HOP_V; car.air -= HOP_COST; car.onGround = false; car.support = null; game.hops++;
        AU.hop(); car.hoverArmed = false; car.hopHeld = 0;
        for (let i = 0; i < 14; i++) puffNozzle(new THREE.Vector3(rand(-2, 2), rand(-3, -1), rand(2, 6)), 0.8, 0.6, 2.4);
      } else { hint('Cold gas low — it recharges while you drive', 1.6); }
    } else car.hoverArmed = true;
  }
  const holding = keys.hop || keys.hover;
  if (holding) car.hopHeld += dt; else { car.hopHeld = 0; }
  let hovering = false;
  if (!car.onGround && holding && (car.hopHeld > 0.22 || car.hoverArmed) && car.air > 0) {
    hovering = true;
    const lift = car.y < MAX_HOVER_Y ? 42 : 30;
    car.vy += lift * dt;
    car.vy = Math.min(car.vy, car.y < MAX_HOVER_Y ? 6 : 0.5);
    car.air -= HOVER_DRAIN * dt; thrust = 1;
  }
  car.vy -= GRAV * dt;
  car.y += car.vy * dt;

  // ---------- barrel roll
  if (pressed.roll) {
    if (!car.onGround && !car.rolling && car.y > 0.6) { car.rolling = true; car.roll = 0; car.rollDir = steer || pick([-1, 1]); }
    else if (car.onGround) hint(isTouch ? 'Get airborne first (HOP), then ROLL' : 'Get airborne first (SPACE), then F', 1.6);
  }
  if (car.rolling) {
    car.roll += dt / 0.7;
    if (car.roll >= 1) { car.rolling = false; car.roll = 0; game.rolls++; addSwag(250); flash('BARREL ROLL!', '+250 swag'); AU.stunt(); }
  }

  // ---------- ground & roof support
  const groundBase = onPath ? 0.16 : 0;
  let support = groundBase; let supportObj = null;
  for (const o of obstacles) {
    if (!o.roof || o.ghost) continue;
    if (Math.abs(o.x - car.x) < o.w / 2 + CAR_HW * 0.6 && Math.abs(o.z + car.s) < o.d / 2 + CAR_HL * 0.6) {
      if (prevY >= o.h - 0.15 && o.h > support) { support = o.h; supportObj = o; }
    }
  }
  if (car.y <= support) {
    if (!car.onGround) {
      // landing
      if (car.rolling) { car.rolling = false; car.roll = 0; car.speed *= 0.45; car.shake = 0.4; AU.crash(); flash('SKETCHY LANDING', pick(['Bhai ye kya tha?', 'Chassis says ouch', 'Saar, insurance claim?'])); }
      else if (car.vy < -6) { AU.land(); car.shake = Math.max(car.shake, 0.15); for (let i = 0; i < 8; i++) puff(new THREE.Vector3(car.x + rand(-1.5, 1.5), support + 0.2, -car.s + rand(-2, 2)), new THREE.Vector3(rand(-3, 3), rand(0.5, 2), rand(-1, 3)), 0.8, 0.8, 2.5, 0xc9a77c, 0.5); }
      if (supportObj && !car.support) { flash(supportObj.kind === 'bus' ? 'BUS SURFING!' : 'ROOF PARKING!', 'Namma style'); }
    }
    car.y = support; car.vy = 0; car.onGround = true; car.support = supportObj;
  } else if (car.y > support + 0.05) {
    car.onGround = false; car.support = null;
  }
  if (car.support) { game.surf += dt; addSwag(80 * dt); }

  // ---------- air regen
  if (car.onGround && !thrust) car.air = Math.min(100, car.air + AIR_REGEN * dt);
  car.air = Math.max(0, car.air);
  car.thrust = lerp(car.thrust, thrust, 1 - Math.exp(-dt * 12));
  if (car.thrust > 0.1 && Math.random() < car.thrust) for (let i = 0; i < 2; i++) puffNozzle(new THREE.Vector3(rand(-0.6, 0.6), hovering ? rand(-6, -3) : rand(-0.5, 0.5), rand(4, 10)), 0.55, 0.35, 1.6);

  // ---------- obstacles
  updateObstacles(dt, prevY);

  // ---------- stage / events / clock
  const st = stageAt(car.s);
  if (st !== game.stage) { game.stage = st; banner(STAGES[st].name, STAGES[st].sub); ui.stage.textContent = STAGES[st].name; }
  while (game.events.length && car.s >= game.events[0][0]) game.events.shift()[1]();
  if (game.lateMsgs.length && game.clock >= game.lateMsgs[0]) {
    const m = game.lateMsgs.shift();
    const msgs = { [9 * 60 + 31]: ['Manager 👔', 'Starting without you. Let\'s take this offline 🙂'], [9 * 60 + 40]: ['Manager 👔', 'Can you share your screen? Oh wait.'], [9 * 60 + 52]: ['HR', 'Hi! Can we schedule a quick 1:1? 🙂'], [10 * 60 + 5]: ['IT Dept', 'Your laptop access has been transferred to "Agent-7". Thanks for your service.'] };
    toast(...msgs[m], m >= 10 * 60);
  }
  if (game.clock >= 10 * 60 + 15) return endGame(false);

  // ---------- horn
  if (pressed.horn) {
    game.honks++; AU.horn(1, 0, 0.22);
    let cowNear = false;
    for (const o of obstacles) {
      const dz = -car.s - o.z;
      if (dz > 0 && dz < 35 && Math.abs(o.x - car.x) < 3.5) {
        if (o.kind === 'cow') cowNear = true;
        else if (!o.gridlock && (o.kind === 'bike' || o.kind === 'auto' || o.kind === 'car') && o.ai) {
          const away = o.x > car.x ? 1 : -1; o.ai.tx = clamp(o.x + away * rand(3, 5), -ROAD_HALF + 1, ROAD_HALF - 1); o.ai.t = 2.5; o.ai.base = o.ai.tx;
        }
      }
    }
    if (cowNear && Math.random() < 0.7) { hint('🐄 The cow is unimpressed by your horn.', 2); setTimeout(() => AU.moo(), 300); }
    else if (game.honks === 30) toast('Bengaluru Traffic Police 🚓', 'Honk count: 30. Congratulations, you are now a local.', true);
  }
  if (pressed.fsd) {
    if (game.fsdCd <= 0) {
      game.fsdCd = 6;
      toast('FSD (Supervised)', pick([
        'Detected: 41 autos, 3 cows, 0 lanes. Lane logic not found. Please take over 🙏',
        'Scanning… A cow is making eye contact. Disengaging immediately.',
        'Route planned. ETA: Tuesday. Handing control back to you.',
        'Neural net has requested a transfer to the Austin office.',
      ]), true);
    }
  }
  game.fsdCd -= dt;

  // ---------- ambient Bangalore soundscape
  game.ambT -= dt;
  if (game.ambT <= 0) {
    game.ambT = rand(0.35, 1.8) * (st === 1 ? 0.5 : 1);
    if (Math.random() < 0.08) AU.musicalHorn(rand(-0.8, 0.8));
    else AU.horn(rand(0.7, 1.5), rand(-0.9, 0.9), rand(0.03, 0.09), rand(0.12, 0.45));
  }

  // ---------- foam overlay
  game.foamT -= dt; ui.foam.classList.toggle('on', game.foamT > 0);

  // ---------- finish
  if (car.s >= TOTAL) endGame(true);

  // ---------- recycle / spawn
  while (game.nextSpawn < car.s + 230) { spawnAt(game.nextSpawn); game.nextSpawn += STAGE_CFG[stageAt(game.nextSpawn)].gap * rand(0.65, 1.35); }
  for (let i = obstacles.length - 1; i >= 0; i--) {
    const o = obstacles[i];
    if (o.z > -car.s + 30) { scene.remove(o.mesh); obstacles.splice(i, 1); }
  }
  updateScenery(car.s);
}

function puffNozzle(vel, life, s0, s1) {
  const n = pick(carMesh.nozzles); const p = n.clone(); carMesh.localToWorld(p);
  puff(p, vel, life, s0, s1, 0xe9f6ff, 0.75);
}

function updateObstacles(dt, prevY) {
  const carZ = -car.s;
  for (const o of obstacles) {
    // --- AI
    if (o.vz) o.z -= o.vz * dt;
    if (o.ai && !o.gridlock) {
      if (o.kind === 'auto' || o.kind === 'car' || o.kind === 'bus') {
        o.ai.t -= dt;
        if (o.ai.t <= 0) {
          o.ai.t = o.kind === 'auto' ? rand(0.7, 2.2) : rand(2.5, 6);
          o.ai.tx = clamp(o.x + rand(-1, 1) * (o.kind === 'auto' ? 5 : 3), -ROAD_HALF + o.w / 2 + 0.3, ROAD_HALF - o.w / 2 - 0.3);
        }
        const dx = o.ai.tx - o.x; const sp = o.kind === 'auto' ? 3.2 : 1.8;
        o.x += clamp(dx, -sp * dt, sp * dt);
        o.mesh.rotation.y = -clamp(dx, -1, 1) * 0.12;
        if (o.kind === 'auto') o.mesh.rotation.z = Math.sin(game.t * 9 + o.z) * 0.02; // the wobble
      } else if (o.kind === 'bike') {
        if (o.ai.base === undefined) o.ai.base = o.x;
        o.ai.ph += dt * o.ai.f;
        const nx = o.ai.base + Math.sin(o.ai.ph) * o.ai.amp;
        o.mesh.rotation.z = (o.x - nx) * 2.5; o.mesh.rotation.y = (o.x - nx) * 3;
        o.x = clamp(nx, -PATH_OUT + 0.6, PATH_OUT - 0.6);
      } else if (o.kind === 'cow' || o.kind === 'foam') {
        o.x += o.ai.vx * dt;
        if (Math.abs(o.x) > PATH_OUT) o.ai.vx *= -1;
      } else if (o.kind === 'cop') {
        if (o.ai.arm) o.ai.arm.rotation.z = -2.2 + Math.sin(game.t * 6) * 0.6;
      }
    }
    o.mesh.position.x = o.x; o.mesh.position.z = o.z;
    o.hitCd -= dt;

    // --- interactions
    const dx = car.x - o.x, dz = carZ - o.z;
    const ox = (CAR_HW + o.w / 2) - Math.abs(dx), oz = (CAR_HL + o.d / 2) - Math.abs(dz);
    if (o.kind === 'cop') { copCheck(o, dz); }
    if (ox <= 0 || oz <= 0) continue;

    if (o.kind === 'gate') continue;
    if (o.kind === 'foam') { if (car.y < 2.6) { if (game.foamT <= 0) { flash('LAKE FOAM!', 'Bellandur says hi'); AU.noiseHit(0.5, 3000, 0.25, 'highpass'); } game.foamT = 1.1; } continue; }
    if (o.flat) {
      if (!car.onGround || car.y > 0.3 || o.cleared) continue;
      o.cleared = true;
      if (o.kind === 'pothole') {
        game.potholes++; car.speed *= 0.6; car.vy = 4.5; car.onGround = false; car.shake = 0.4; AU.thud();
        for (let i = 0; i < 8; i++) puff(new THREE.Vector3(o.x + rand(-1, 1), 0.3, o.z + rand(-1, 1)), new THREE.Vector3(rand(-2, 2), rand(1, 4), rand(-2, 2)), 0.9, 0.6, 2, 0x8a7254, 0.6);
        if (game.potholes === 1 || Math.random() < 0.35) flash('POTHOLE!', pick(['BBMP sends regards', 'Suspension: 📉', 'That one had fish in it', `Pothole #${game.potholes}`]));
      } else if (o.kind === 'breaker') {
        if (car.speed > cruise() * 0.7) {
          car.vy = 7 + car.speed * 0.12; car.onGround = false; car.shake = 0.3; AU.thud(); addSwag(60);
          flash(o.marked ? 'SPEED BREAKER!' : 'UNMARKED SPEED BREAKER!', 'Free airtime, courtesy BBMP');
        } else { car.vy = 3; car.onGround = false; AU.thud(); }
      }
      continue;
    }
    // solid obstacle — are we above it?
    if (car.y >= o.h - 0.05) {
      if (!o.cleared && !car.support) {
        o.cleared = true;
        if (o.kind === 'cow') { game.cowsRespected++; addSwag(150); flash('COW RESPECTED 🙏', '+150 karma'); AU.moo(); }
        else if (o.kind === 'bus' || o.kind === 'tanker') { addSwag(120); if (Math.random() < 0.5) flash('OVER THE ' + (o.kind === 'bus' ? 'BMTC' : 'TANKER') + '!', '+120 swag'); }
        else addSwag(40);
      }
      continue;
    }
    if (car.support === o) continue;
    // collision!
    if (o.kind === 'pillar' || ox > oz * 0.6 || o.kind === 'cow' || o.kind === 'cop') {
      // head-on / rear-end: push car behind the obstacle
      // gentle bumps just tailgate; only real impacts count as crashes
      const impact = dz > 0 ? Math.max(0, car.speed - o.vz) : 0;
      if (dz > 0) { car.s = -o.z - o.d / 2 - CAR_HL - 0.02; car.speed = impact > 12 ? Math.min(car.speed, o.vz) * 0.4 : Math.min(car.speed, o.vz); }
      else car.s = -o.z + o.d / 2 + CAR_HL + 0.02; // something rear-ended us
      if (o.hitCd <= 0) onHit(o, true, impact);
      o.hitCd = 0.6; // refreshed every frame of contact, so being stuck never re-triggers
    } else {
      car.x += Math.sign(dx || 1) * ox; car.vx = Math.sign(dx || 1) * 4; car.speed *= 0.92;
      if (o.hitCd <= 0) onHit(o, false, 0);
      o.hitCd = 0.6;
    }
  }
}

function onHit(o, hard, impact) {
  if (hard && impact <= 12 && o.kind !== 'cow' && o.kind !== 'cop') { // tailgating, not crashing
    AU.thud(); car.shake = Math.max(car.shake, 0.05);
    if (Math.random() < 0.25) hint(pick(['Bumper-to-bumper. Literally.', 'Tailgating, Bengaluru style', 'Gap? What gap?', 'Hop over them — SPACE']), 1.6);
    return;
  }
  car.shake = Math.max(car.shake, hard ? clamp(impact / 70, 0.15, 0.5) : 0.12);
  if (hard) { game.crashes++; AU.crash(); } else AU.thud();
  if (o.kind === 'cow') {
    game.cowsHit++; AU.moo(); game.swag = Math.max(0, game.swag - 200);
    flash('YOU BUMPED A COW', 'The cow did not move. The cow will never move. −200 karma', '#ff5a5a');
    return;
  }
  if (o.kind === 'cop') { issueChallan(2000, 'Nudging an on-duty officer with a ₹2.5 cr car'); flash('SORRY SIR!', 'Very sorry sir. Very very sorry.', '#ff5a5a'); return; }
  if (o.kind === 'pillar') { flash('METRO PILLAR', 'It has been there since 2019. You have not.'); return; }
  if (o.kind === 'barricade') { flash('BARRICADE!', 'Metro work in progress (since forever)'); return; }
  const line = pick(KANNADA_HITS);
  flash(line, o.kind === 'auto' ? 'Auto anna: "Meter mele 50 kodi saar"' : o.kind === 'bus' ? 'BMTC does not brake. BMTC never brakes.' : o.kind === 'bike' ? 'Delivery guy: "Ma\'am, 2 mins away"' : '');
  if (o.kind === 'auto' || o.kind === 'car' || o.kind === 'bike') setTimeout(() => AU.horn(rand(0.9, 1.3), 0, 0.15, 0.5), 150);
}

function copCheck(o, dz) {
  if (o.fined || Math.abs(dz) > 6) return;
  const near = Math.abs(car.x - o.x) < 13;
  if (!near) return;
  if (car.y > 1.8) { o.fined = true; issueChallan(500, 'Flying without a valid pilot licence (Sec. 420-HOVER)'); }
  else if (car.speed > cruise() * 1.3) { o.fined = true; issueChallan(1000, 'Overspeeding — first recorded case on this road'); }
  else if (Math.abs(car.x) > PATH_IN + 0.2 && Math.abs(car.x - o.x) < 6) { o.fined = true; issueChallan(500, 'Driving on footpath (like everyone else)'); }
}

// ---------------------------------------------------------------------
//  Render-side sync
// ---------------------------------------------------------------------
const camPos = new THREE.Vector3(0, 5, 10);
const camLook = new THREE.Vector3();
function syncVisuals(dt) {
  const z = -car.s;
  carMesh.position.set(car.x, car.y, z);
  car.tilt = lerp(car.tilt, -car.vx * 0.025, 1 - Math.exp(-dt * 10));
  const pitchT = car.onGround ? 0 : clamp(car.vy * 0.02, -0.15, 0.2);
  car.pitch = lerp(car.pitch, pitchT, 1 - Math.exp(-dt * 6));
  carMesh.rotation.set(car.pitch, -car.vx * 0.012, car.tilt + (car.rolling ? car.rollDir * -car.roll * Math.PI * 2 : 0));
  for (const w of carMesh.wheels) w.children[0].rotation.x += car.speed * dt / 0.37;
  carMesh.nimbu.rotation.z = Math.sin(game.t * 7) * 0.15 + car.vx * 0.03;
  carMesh.nimbu.rotation.x = -car.speed * 0.008;
  const hover = car.thrust * (car.onGround ? 0 : 1);
  carMesh.glow.material.opacity = hover * 0.9; carMesh.glow.position.y = -car.y + 0.05 + 0.01; carMesh.glow.scale.setScalar(1 + car.y * 0.1);

  const ground = Math.abs(car.x) > PATH_IN + 0.2 ? 0.17 : 0.02;
  const sy = car.support ? car.support.h : ground;
  carShadow.position.set(car.x, sy + 0.02, z);
  const hgt = Math.max(0, car.y - sy);
  carShadow.material.opacity = clamp(1 - hgt / 9, 0.15, 1);
  carShadow.scale.setScalar(1 + hgt * 0.08);
  carContact.position.set(car.x, sy + 0.025, z);
  carContact.material.opacity = clamp(1 - hgt / 1.2, 0, 1);
  if (car.onGround) carMesh.position.y += Math.sin(game.t * 38) * 0.008 * Math.min(1, car.speed / 30); // road buzz

  // road follows car, texture scrolls
  for (const m of [road, ...paths, ...curbs]) m.position.z = z - 100;
  roadTex.offset.y = car.s / ROAD_TILE; pTex.offset.y = car.s / 8; curbTex.offset.x = car.s / 2;
  earth.position.z = z - 100;
  sun.position.set(car.x - 25, 40, z + 18); sun.target.position.set(car.x, 0, z); sun.target.updateMatrixWorld();

  // camera
  car.shake = Math.max(0, car.shake - dt * 2.2);
  const sh = car.shake * car.shake;
  camPos.x = lerp(camPos.x, car.x * (camera.aspect < 1 ? 0.85 : 0.55), 1 - Math.exp(-dt * 6));
  camPos.y = lerp(camPos.y, 4.0 + car.y * 0.6, 1 - Math.exp(-dt * 5));
  camPos.z = z + 9.5 + Math.min(car.speed, 70) * 0.03;
  camera.position.copy(camPos); // smooth sway instead of per-frame jitter
  camera.position.x += sh * Math.sin(game.t * 23) * 0.8; camera.position.y += sh * Math.sin(game.t * 17 + 1) * 0.6;
  camLook.set(car.x * 0.75, 1.0 + car.y * 0.75, z - 10);
  camera.lookAt(camLook);
  const fov = (camera.aspect < 1 ? 84 : 62) + Math.max(0, car.speed - cruise()) * 0.35; // portrait phones need a wider view
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = lerp(camera.fov, fov, 1 - Math.exp(-dt * 4)); camera.updateProjectionMatrix(); }
}

let hudT = 0;
function updateHUD(dt) {
  hudT -= dt; if (hudT > 0) return; hudT = 0.05;
  ui.spd.textContent = Math.round(car.speed * 2.2);
  ui.clock.textContent = fmtClock(game.clock);
  ui.clock.classList.toggle('late', game.clock > STANDUP_MIN);
  const p = clamp(car.s / TOTAL, 0, 1) * 100;
  ui.progfill.style.width = p + '%'; ui.progcar.style.left = p + '%';
  ui.air.style.width = car.air + '%'; ui.air.classList.toggle('low', car.air < HOP_COST);
  ui.swag.textContent = Math.round(game.swag).toLocaleString('en-IN');
  hintT -= 0.05; if (hintT <= 0) ui.hint.classList.remove('on');
}

// ---------------------------------------------------------------------
//  Flow
// ---------------------------------------------------------------------
function setPaused(p) {
  if (state !== 'playing' || paused === p) return;
  paused = p;
  $('pause').classList.toggle('hidden', !p);
  for (const k in keys) keys[k] = false;
  if (AU.ctx) p ? AU.ctx.suspend() : AU.ctx.resume();
}
function setMode(m) {
  driveMode = m;
  try { localStorage.setItem('rb-mode', m); } catch (e) {}
  document.querySelectorAll('.seg button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  $('modeLbl').textContent = MODES[m].label.toUpperCase();
}
function startGame() {
  AU.init(); if (AU.ctx && AU.ctx.state === 'suspended') AU.ctx.resume();
  paused = false; $('pause').classList.add('hidden');
  resetGame();
  state = 'playing';
  $('title').classList.add('hidden'); $('over').classList.add('hidden'); $('hud').classList.remove('hidden');
  if (isTouch) $('touch').classList.remove('hidden');
  ui.toasts.innerHTML = '';
  flash('0–60 in 0.8s', 'Straight into traffic');
}
function endGame(arrived) {
  if (state !== 'playing') return;
  state = 'over';
  $('touch').classList.add('hidden');
  const late = game.clock - STANDUP_MIN;
  const tot = game.challans.reduce((a, c) => a + c.amount, 0);
  let title, sub;
  if (!arrived) { title = 'Replaced by an AI agent.'; sub = 'It\'s 10:15. Your access has been revoked. The Roadster is still in traffic.'; }
  else if (late <= 0 && game.swag >= 2500) { title = 'Certified Namma Bengaluru Pilot 🏆'; sub = 'On time AND stylish. Auto annas will speak of this day.'; }
  else if (late <= 0) { title = 'Made it. Standup awaits.'; sub = '"Any blockers?" — "Silk Board." — "Valid."'; }
  else if (late <= 10) { title = '"Let\'s take this offline 🙂"'; sub = `${Math.ceil(late)} min late. You blame Silk Board. Everyone nods.`; }
  else { title = 'Work From Home Recommended'; sub = `${Math.ceil(late)} min late. Maybe the Roadster should have stayed in Austin.`; }
  $('oTitle').textContent = title; $('oSub').textContent = sub;
  const rows = [
    ['Badge-in time', fmtClock(game.clock) + ' AM'],
    ['Swag', Math.round(game.swag).toLocaleString('en-IN')],
    ['Cows respected (flown over)', game.cowsRespected],
    ['Cows bumped', game.cowsHit],
    ['Barrel rolls', game.rolls],
    ['Potholes found', game.potholes],
    ['Crashes', game.crashes],
    ['Bus-surfing time', game.surf.toFixed(1) + 's'],
    ['Honks', game.honks],
    ['Challans', '₹' + tot.toLocaleString('en-IN') + (game.challans.length ? ` (${game.challans.length})` : '')],
  ];
  $('oStats').innerHTML = rows.map(([a, b]) => `<div>${a}</div><div>${b}</div>`).join('');
  setTimeout(() => { $('over').classList.remove('hidden'); $('hud').classList.add('hidden'); }, arrived ? 900 : 200);
  if (arrived) { flash('BADGE IN ✅', fmtClock(game.clock) + ' AM'); AU.stunt(); }
}
$('startBtn').addEventListener('click', startGame);
$('againBtn').addEventListener('click', startGame);
$('resumeBtn').addEventListener('click', () => setPaused(false));
$('restartBtn').addEventListener('click', startGame);
$('pauseBtn').addEventListener('click', () => setPaused(true));
$('muteBtn').addEventListener('click', () => { AU.setMuted(!AU.muted); $('muteBtn').textContent = AU.muted ? 'SOUND: OFF' : 'SOUND: ON'; });
document.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
document.querySelectorAll('button').forEach(b => b.addEventListener('click', () => b.blur())); // keep SPACE from re-clicking
setMode(driveMode);

// ---------------------------------------------------------------------
//  Main loop
// ---------------------------------------------------------------------
resetGame(); game.events = [];
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (pressed.mute) { AU.setMuted(!AU.muted); $('muteBtn').textContent = AU.muted ? 'SOUND: OFF' : 'SOUND: ON'; }
  if (state === 'title' || state === 'over') {
    if ((pressed.enter || (pressed.hop && state === 'title')) && !(state === 'over' && $('over').classList.contains('hidden'))) startGame();
    // idle showroom orbit on title
    if (state === 'title') {
      game.t += dt;
      const a = game.t * 0.25;
      carMesh.position.set(car.x, 0, 0); carMesh.rotation.set(0, 0, 0);
      carShadow.position.set(car.x, 0.02, 0);
      for (const m of [road, ...paths, ...curbs, earth]) m.position.z = -100;
      camera.position.set(car.x + Math.sin(a) * 7.5, 2.4, Math.cos(a) * 7.5);
      camera.lookAt(car.x, 0.6, 0);
      carMesh.nimbu.rotation.z = Math.sin(game.t * 3) * 0.2;
    } else {
      updateParticles(dt);
    }
    AU.setEngine(0, 0);
  } else {
    if (pressed.pause || (paused && pressed.enter)) setPaused(!paused);
    if (!paused) {
      update(dt);
      syncVisuals(dt);
      updateParticles(dt);
      updateHUD(dt);
      AU.setEngine(car.speed, car.thrust);
    }
  }
  for (const k in pressed) pressed[k] = false;
  renderer.render(scene, camera);
}
document.fonts && document.fonts.ready.then(() => { if (state !== 'title') return; texCache.clear(); resetGame(); game.events = []; });
requestAnimationFrame(frame);

// debug hook for automated playtesting
window.__game = {
  car, game, obstacles: () => obstacles, keys, pressed, startGame, get state() { return state; },
  // fast-forward the sim: ctl(t) may set keys/pressed each tick
  sim(sec, ctl) { const dt = 1 / 60; for (let t = 0; t < sec && state === 'playing'; t += dt) { ctl && ctl(t); update(dt); syncVisuals(dt); updateParticles(dt); for (const k in pressed) pressed[k] = false; } updateHUD(1); renderer.render(scene, camera); return { s: +car.s.toFixed(1), x: +car.x.toFixed(2), y: +car.y.toFixed(2), speed: +car.speed.toFixed(1), air: +car.air.toFixed(0), clock: fmtClock(game.clock), state, crashes: game.crashes, swag: Math.round(game.swag) }; },
};

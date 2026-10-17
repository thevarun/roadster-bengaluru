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
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.2, 700);
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
  if (!matCache.has(key)) { const m = new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts }); m.userData.shared = true; matCache.set(key, m); }
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
function textTex(text, { bg = '#ffd23f', fg = '#1b1b1b', w = 512, h = 128, font = '800 64px "Baloo 2", sans-serif', sub = null, subFont = '700 30px "Baloo 2", sans-serif', border = null } = {}) {
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
//  Sky: hazy sun, drifting clouds, circling black kites, far skyline with cranes.
//  Everything here follows the camera, so it reads as "infinitely far" and stays calm.
// ---------------------------------------------------------------------
const sky = new THREE.Group(); scene.add(sky);
function skylineTexture() {
  const W = 2048, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const towers = (col, minH, maxH, gap) => {
    g.fillStyle = col; let x = -10;
    while (x < W) {
      const bw = rand(16, 58), bh = rand(minH, maxH); g.fillRect(x, H - bh, bw, bh);
      if (Math.random() < 0.22) g.fillRect(x + bw / 2 - 1, H - bh - 18, 2, 18);            // antenna
      if (Math.random() < 0.15) g.fillRect(x + 4, H - bh - 8, bw - 8, 8);                 // rooftop box
      x += bw + rand(0, gap);
    }
  };
  towers('#bdbab1', 30, 110, 10);                                                          // far haze layer
  g.fillStyle = '#a19f98';
  // gopurams
  for (let i = 0; i < 2; i++) {
    const x = rand(200, W - 200), base = 70, tiers = 6;
    for (let k = 0; k < tiers; k++) { const w = base - k * 9; g.fillRect(x - w / 2, H - 40 - k * 14, w, 14); }
    g.fillRect(x - 10, H - 40 - tiers * 14 - 8, 20, 8);
  }
  // a crowned tech tower
  { const x = rand(300, W - 300); g.fillRect(x, H - 175, 40, 175); g.beginPath(); g.moveTo(x - 4, H - 175); g.lineTo(x + 20, H - 205); g.lineTo(x + 44, H - 175); g.fill(); }
  towers('#a8a9a6', 15, 70, 26);                                                           // nearer layer
  // melt the bottom into the horizon haze
  const gr = g.createLinearGradient(0, H * 0.55, 0, H); gr.addColorStop(0, 'rgba(230,211,179,0)'); gr.addColorStop(1, 'rgba(230,211,179,1)');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const skyline = new THREE.Mesh(new THREE.PlaneGeometry(1000, 125), new THREE.MeshBasicMaterial({ map: skylineTexture(), transparent: true, fog: false, depthWrite: false }));
skyline.position.set(0, 50, -330); sky.add(skyline);
const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTex('rgba(255,244,214,1)', 'rgba(255,226,170,0)'), fog: false, depthWrite: false, transparent: true, opacity: 0.95 }));
sunSprite.scale.set(110, 110, 1); sunSprite.position.set(-150, 95, -420); sky.add(sunSprite);
const sunCore = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTex('rgba(255,252,240,1)', 'rgba(255,252,240,0)'), fog: false, depthWrite: false, transparent: true }));
sunCore.scale.set(34, 34, 1); sunCore.position.copy(sunSprite.position); sky.add(sunCore);
function cloudTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 112; const g = c.getContext('2d');
  for (let i = 0; i < 9; i++) {
    const x = rand(50, 206), y = rand(50, 80), r = rand(22, 42);
    const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 112);
  }
  return new THREE.CanvasTexture(c);
}
const clouds = [];
for (let i = 0; i < 7; i++) {
  const cl = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTexture(), fog: false, depthWrite: false, transparent: true, opacity: rand(0.5, 0.8) }));
  const sc = rand(90, 150); cl.scale.set(sc, sc * 0.44, 1); cl.position.set(rand(-280, 280), rand(85, 130), rand(-360, -400));
  cl.userData.v = rand(1.5, 4); sky.add(cl); clouds.push(cl);
}
// black kites (the birds), lazily circling over the road ahead
const kites = [];
for (let i = 0; i < 6; i++) {
  const k = new THREE.Group();
  const wl = box(k, 1.5, 0.06, 0.45, 0x2a2420, -0.68, 0, 0); wl.rotation.z = 0.22;
  const wr = box(k, 1.5, 0.06, 0.45, 0x2a2420, 0.68, 0, 0); wr.rotation.z = -0.22;
  box(k, 0.25, 0.12, 0.9, 0x2a2420, 0, 0, 0.05);
  k.userData = { cx: rand(-35, 35), cy: rand(26, 42), cz: rand(-80, -160), r: rand(8, 20), a: rand(0, 6.28), w: rand(0.25, 0.45) * pick([-1, 1]), wl, wr, flap: rand(0, 10) };
  sky.add(k); kites.push(k);
}
function updateSky(dt) {
  sky.position.set(camera.position.x, 0, camera.position.z);
  for (const cl of clouds) { cl.position.x += cl.userData.v * dt; if (cl.position.x > 300) cl.position.x = -300; }
  for (const k of kites) {
    const u = k.userData; u.a += u.w * dt; u.flap += dt;
    k.position.set(u.cx + Math.cos(u.a) * u.r, u.cy + Math.sin(u.a * 0.7) * 1.5, u.cz + Math.sin(u.a) * u.r);
    k.rotation.y = -u.a - (u.w > 0 ? 0 : Math.PI); k.rotation.z = (u.w > 0 ? -1 : 1) * 0.35;
    const f = Math.sin(u.flap * 9) * (Math.sin(u.flap * 0.6) > 0.7 ? 0.35 : 0.04); // mostly gliding, occasional flaps
    u.wl.rotation.z = 0.22 + f; u.wr.rotation.z = -0.22 - f;
  }
}

// ---------------------------------------------------------------------
//  The Roadster
// ---------------------------------------------------------------------
// extrude a side profile across the car's width, tapering the upper part inward (tumblehome)
function wedge(shape, width, taperFrom, taperSpan, taper, bevel) {
  const geo = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3 });
  geo.translate(0, 0, -width / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const k = 1 - taper * clamp((p.getY(i) - taperFrom) / taperSpan, 0, 1); p.setZ(i, p.getZ(i) * k); }
  geo.computeVertexNormals();
  return geo;
}
function aeroCapTex() { // Cybercab-style flat aero wheel cover
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#d9dcdf'; g.beginPath(); g.arc(64, 64, 64, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(40,44,50,0.55)'; g.lineWidth = 3;
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; g.beginPath(); g.moveTo(64 + Math.cos(a) * 18, 64 + Math.sin(a) * 18); g.quadraticCurveTo(64 + Math.cos(a + 0.5) * 44, 64 + Math.sin(a + 0.5) * 44, 64 + Math.cos(a + 0.9) * 60, 64 + Math.sin(a + 0.9) * 60); g.stroke(); }
  g.fillStyle = '#2a2d33'; g.beginPath(); g.arc(64, 64, 12, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// ---------- vehicle versions (selector on the landing page)
const MODELS = {
  roadster: { name: 'Roadster', price: 'Ex-showroom ₹2.5 Cr*', tag: 'The one from the launch event. *Plus GST, road tax, insurance and "handling charges".', paint: 'white',
    mods: { hover: 1, hop: 1, steer: 1, horn: 1 }, stats: { Hover: 3, 'Gap squeeze': 3, Horn: 3 } },
  rocket: { name: 'Roadster Rocket', price: '₹3.1 Cr · 3-year waiting list', tag: 'One seat only. Zero space for relatives asking for a lift. Perimeter thrusters hover longer; turns a little slower.', paint: 'black',
    mods: { hover: 0.7, hop: 1.12, steer: 0.88, horn: 1 }, stats: { Hover: 5, 'Gap squeeze': 2, Horn: 3 } },
  namma: { name: 'Roadster Namma Spec', price: '₹2.5 Cr + ₹40 for the meter (not working)', tag: 'Fitted at a Shivajinagar garage: auto livery, mud flaps, extra nimbu-mirchi. Squeezes through gaps like an auto, honks like one too.', livery: true,
    mods: { hover: 1, hop: 1, steer: 1.22, horn: 1.2 }, stats: { Hover: 3, 'Gap squeeze': 5, Horn: 4 } },
  shaadi: { name: 'Roadster Shaadi Edition', price: '₹2.5 Cr + ₹3 L in marigolds', tag: 'Decked out for the baraat. The horn plays the band-baaja and traffic parts for the groom. All those flowers make it hover less.', paint: 'white',
    mods: { hover: 1.3, hop: 0.95, steer: 1, horn: 1.8 }, stats: { Hover: 2, 'Gap squeeze': 3, Horn: 5 } },
};
const PAINTS = { white: ['Ambassador White', 0xf4f4f1], black: ['Neta-ji Black', 0x1d1e22], red: ['Sindoor Red', 0xa3121b], blue: ['BMTC Blue', 0x1f3c88], silver: ['Every-Other-Car Silver', 0x9ea3a8] };
let carCfg = { model: 'roadster', paint: 'white' };
try { const c = JSON.parse(localStorage.getItem('rb-car')); if (c && MODELS[c.model] && PAINTS[c.paint]) carCfg = c; } catch (e) {}
let VEH = MODELS[carCfg.model].mods;
const vehicleLabel = () => MODELS[carCfg.model].name + (MODELS[carCfg.model].livery ? ' · Auto livery' : ' · ' + PAINTS[carCfg.paint][0]);

function buildRoadster(cfg = carCfg) {
  const g = new THREE.Group();
  const model = MODELS[cfg.model];
  const white = new THREE.MeshStandardMaterial({ color: model.livery ? 0x1f8a3a : PAINTS[cfg.paint][1], roughness: 0.28, metalness: cfg.paint === 'black' || cfg.paint === 'silver' ? 0.45 : 0.2 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0a0c11, roughness: 0.08, metalness: 0.7 });
  const black = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.55 });
  const W = 1.98;
  // body: SR-71 / Esprit wedge — knife nose, hood rising in one line, long flat deck, cut-off tail
  const s = new THREE.Shape();
  s.moveTo(-2.42, 0.3); s.lineTo(-2.46, 0.4); s.lineTo(-2.25, 0.48); s.lineTo(-0.85, 0.79); s.lineTo(1.0, 0.92);
  s.lineTo(2.0, 0.97); s.lineTo(2.44, 0.93); s.lineTo(2.47, 0.56); s.lineTo(2.25, 0.26); s.lineTo(-2.1, 0.24); s.closePath();
  const body = new THREE.Mesh(wedge(s, W, 0.45, 0.5, 0.16, 0.08), white); body.rotation.y = -Math.PI / 2; g.add(body);
  // wrap-around canopy
  const c = new THREE.Shape();
  c.moveTo(-0.95, 0.74); c.lineTo(-0.1, 1.2); c.lineTo(0.75, 1.24); c.lineTo(1.6, 1.07); c.lineTo(2.05, 0.95); c.lineTo(2.0, 0.86); c.lineTo(-0.95, 0.68); c.closePath();
  const canopy = new THREE.Mesh(wedge(c, 1.5, 0.8, 0.45, 0.3, 0.05), glass); canopy.rotation.y = -Math.PI / 2; g.add(canopy);
  // black lower chines, wheel arches, side intakes
  for (const sx of [-1, 1]) {
    box(g, 0.06, 0.13, 3.9, 0, sx * 1.08, 0.33, 0.05, black);
    box(g, 0.03, 0.2, 0.75, 0, sx * 1.06, 0.62, 0.72, black);
    for (const wz of [-1.45, 1.5]) {
      const arch = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 6, 18, Math.PI), black);
      arch.rotation.y = Math.PI / 2; arch.position.set(sx * 1.09, 0.42, wz); g.add(arch);
    }
  }
  // wheels with Cybercab-style aero covers
  const tire = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  const cap = new THREE.MeshStandardMaterial({ map: aeroCapTex(), roughness: 0.35, metalness: 0.4 });
  g.wheels = [];
  for (const [x, z] of [[-1, -1.45], [1, -1.45], [-1, 1.5], [1, 1.5]]) {
    const wg = new THREE.Group(); wg.position.set(x * 1.04, 0.42, z); g.add(wg);
    cyl(wg, 0.42, 0.36, 0, 0, 0, 0, 'x', tire);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.34, 20), cap); disc.position.x = x * 0.185; disc.rotation.y = x * Math.PI / 2; wg.add(disc);
    g.wheels.push(wg);
  }
  // nose: splitter + light bar
  box(g, 1.9, 0.05, 0.4, 0, 0, 0.22, -2.3, black);
  box(g, 1.7, 0.04, 0.04, 0, 0, 0.44, -2.56, new THREE.MeshBasicMaterial({ color: 0xffffff }));
  // tail: black fascia, full-width light bar, diffuser
  box(g, 1.92, 0.3, 0.04, 0, 0, 0.67, 2.56, black);
  box(g, 1.96, 0.06, 0.05, 0, 0, 0.87, 2.56, new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
  box(g, 1.6, 0.14, 0.18, 0, 0, 0.3, 2.36, black);
  // active rear wing with endplates
  box(g, 2.0, 0.05, 0.42, 0, 0, 1.32, 2.14, model.livery ? new THREE.MeshStandardMaterial({ color: 0xf5c518, roughness: 0.4 }) : white);
  for (const sx of [-1, 1]) { box(g, 0.04, 0.22, 0.46, 0, sx * 1.0, 1.26, 2.14, black); box(g, 0.05, 0.32, 0.1, 0, sx * 0.55, 1.12, 2.16, black); }
  // 4 SpaceX cold-gas thrusters in the tail fascia
  g.nozzles = [];
  for (const x of [-0.72, -0.45, 0.45, 0.72]) {
    cyl(g, 0.07, 0.16, 0, x, 0.66, 2.6, 'z', new THREE.MeshStandardMaterial({ color: 0x55585e, metalness: 0.8, roughness: 0.3 }));
    g.nozzles.push(new THREE.Vector3(x, 0.66, 2.72));
  }
  // underglow (suction fan) visible when hovering
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 5), new THREE.MeshBasicMaterial({ map: radialTex('rgba(150,220,255,1)', 'rgba(150,220,255,0)'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
  glow.rotation.x = -Math.PI / 2; glow.position.y = 0.05; g.add(glow); g.glow = glow;
  // marigold garland on the hood (it was just blessed at the temple)
  for (let i = 0; i <= 10; i++) {
    const t = i / 10, x = (t - 0.5) * 1.3, z = -1.3 - Math.cos((t - 0.5) * Math.PI) * 0.4;
    sph(g, 0.065, i % 2 ? 0xff8c00 : 0xffb300, x, 0.5 + (z + 2.25) / 1.4 * 0.31 + 0.06, z);
  }
  // nimbu-mirchi hanging from the nose
  const nm = new THREE.Group(); nm.position.set(0.35, 0.36, -2.56); g.add(nm); g.nimbu = nm;
  box(nm, 0.012, 0.22, 0.012, 0x111111, 0, -0.11, 0);
  sph(nm, 0.07, 0xf6e13a, 0, -0.26, 0, 1, 1.15, 1);
  for (let i = 0; i < 4; i++) { const ch = cyl(nm, 0.025, 0.2, 0x1f9d3a, 0, -0.43 - i * 0.12, 0); ch.scale.set(0.03, 0.12, 0.03); ch.position.y = -0.4 - i * 0.07; }
  if (cfg.model === 'rocket') { // perimeter thruster pods + a red pinstripe
    const pod = new THREE.MeshStandardMaterial({ color: 0x55585e, metalness: 0.8, roughness: 0.3 });
    for (const sx of [-1, 1]) {
      for (const z of [-1.95, -0.2, 0.75]) cyl(g, 0.08, 0.14, 0, sx * 1.1, 0.5, z, 'x', pod);
      box(g, 0.02, 0.035, 3.6, 0, sx * 1.075, 0.56, 0.1, new THREE.MeshBasicMaterial({ color: 0xe82127 }));
    }
  }
  if (cfg.model === 'shaadi') { // baraat car: marigold strands over the canopy and along the sides, flowers on the nose, ribbon bow
    const strand = (pts, n) => { for (let i = 0; i <= n; i++) { const t = i / n, p = pts(t); sph(g, 0.075, i % 3 === 0 ? 0xff5a1f : i % 2 ? 0xff8c00 : 0xffb300, p[0], p[1], p[2]); } };
    for (const z of [-0.2, 0.7]) strand(t => [(t - 0.5) * 1.9, 0.95 + Math.sin(t * Math.PI) * 0.36, z], 16);
    for (const sx of [-1, 1]) strand(t => [sx * 1.1, 0.62 - Math.sin(t * Math.PI * 3) * 0.06, -2.1 + t * 4.2], 22);
    for (let i = 0; i < 9; i++) sph(g, 0.1, i % 2 ? 0xff3b6b : 0xffd23f, rand(-0.5, 0.5), 0.56, -2.15 + rand(-0.1, 0.15));
    for (const sx of [-1, 1]) { const r = box(g, 0.5, 0.04, 0.22, 0xe8336f, sx * 0.22, 0.72, -1.05); r.rotation.y = sx * 0.6; }
    sph(g, 0.09, 0xe8336f, 0, 0.73, -1.05);
  }
  if (model.livery) { // Namma Spec: auto-rickshaw yellow beltline, mud flaps, rear nimbu-mirchi
    const yel = new THREE.MeshStandardMaterial({ color: 0xf5c518, roughness: 0.4 });
    for (const sx of [-1, 1]) {
      box(g, 0.03, 0.12, 3.9, 0, sx * 1.06, 0.66, 0.05, yel);
      for (const wz of [-0.85, 2.1]) { box(g, 0.3, 0.32, 0.03, 0x111111, sx * 1.0, 0.2, wz); box(g, 0.1, 0.05, 0.035, 0xe82127, sx * 1.0, 0.3, wz + 0.003); }
    }
    const nm2 = nm.clone(); nm2.position.set(-0.6, 0.6, 2.6); g.add(nm2);
  }
  return g;
}
let carMesh = buildRoadster();
function applyVehicle(cfg) {
  carCfg = cfg; VEH = MODELS[cfg.model].mods;
  try { localStorage.setItem('rb-car', JSON.stringify(cfg)); } catch (e) {}
  const old = carMesh, nm = buildRoadster(cfg);
  nm.position.copy(old.position); nm.rotation.copy(old.rotation);
  scene.remove(old); disposeObj(old); scene.add(nm); carMesh = nm;
  for (const el of document.querySelectorAll('.vehLabel')) el.textContent = vehicleLabel();
}
scene.add(carMesh);
// flat decals get a depth offset so they never z-fight with the road (that was the flicker)
const DECAL = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
const carShadow = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 6), new THREE.MeshBasicMaterial({ map: SHADOW_TEX, transparent: true, depthWrite: false, ...DECAL }));
carShadow.rotation.x = -Math.PI / 2; scene.add(carShadow);
// tight dark contact shadow that only shows when the wheels are on the ground
const carContact = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 5), new THREE.MeshBasicMaterial({ map: radialTex('rgba(0,0,0,0.9)', 'rgba(0,0,0,0)'), transparent: true, depthWrite: false, ...DECAL }));
carContact.rotation.x = -Math.PI / 2; scene.add(carContact);

// ---------------------------------------------------------------------
//  Traffic & hazards
// ---------------------------------------------------------------------
const AUTO_SLOGANS = ['Appa Amma\nBlessings', 'Sound Horn', 'Don\'t Kiss Me', 'Mother\'s Gift', 'Ex-Girlfriend\'s\nGift', 'Meter Ahead\n(Not Working)', 'Only Duty', 'Jai Karnataka', 'Life is\nRace'];
const CAR_COLORS = [0xffffff, 0xc0c4c8, 0x9e1b1b, 0x274b8a, 0x2e2e2e, 0xd9d2c0, 0x6b2f86];

function shadowUnder(g, w, d) {
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.4, d * 1.25), new THREE.MeshBasicMaterial({ map: SHADOW_TEX, transparent: true, depthWrite: false, ...DECAL }));
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
    if (Math.random() < 0.2) signPlane(g, textTex(pick(AUTO_SLOGANS), { bg: '#f5c518', font: '800 54px "Baloo 2", sans-serif' }), 1.2, 0.42, 0, 1.0, 1.26);
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
    box(g, 2.0, 0.32, 0.04, 0, 0, 2.75, 5.02, new THREE.MeshBasicMaterial({ color: 0xc2701a })); // route LED board
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
    box(g, 0.6, 0.15, 0.02, cab ? 0xf5d000 : 0xf2f2f2, 0, 0.6, L / 2 + 0.02); // number plate
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
    wheels(g, 2.3, -2.6, 2.4, 0.5);
    shadowUnder(g, 2.4, 7.4);
    return { mesh: g, w: 2.4, d: 7.4, h: 3.2, vz: rand(8, 13), kind: 'tanker', roof: true, ai: { t: 99, tx: 0 } };
  },
  pothole() {
    const g = new THREE.Group();
    const r = rand(0.8, 1.6);
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 9), new THREE.MeshLambertMaterial({ color: 0x232325, ...DECAL }));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.02; m.scale.set(1, rand(0.6, 1), 1); g.add(m);
    const w = new THREE.Mesh(new THREE.CircleGeometry(r * 0.7, 7), new THREE.MeshLambertMaterial({ color: 0x6a5a3a, transparent: true, opacity: 0.6, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
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
    return { mesh: g, w: 3.6, d: 0.6, h: 1.2, vz: 0, kind: 'barricade' };
  },
  pillar() {
    const g = new THREE.Group();
    cyl(g, 1.0, 10, 0xa9a9a4, 0, 5, 0);
    box(g, 4.2, 1.2, 2.4, 0xa9a9a4, 0, 10.4, 0);
    box(g, 3.4, 1.4, 34, 0x9c9c97, 0, 11.6, 0); // viaduct span
    if (Math.random() < 0.3) signPlane(g, textTex('NAMMA METRO\nOpening 2019 2023 2025 Soon', { bg: '#7b2d8e', fg: '#fff', font: '800 44px Inter', w: 512, h: 160 }), 3, 0.95, 0, 3.2, 1.02);
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
function clearObstacles() { for (const o of obstacles) { scene.remove(o.mesh); disposeObj(o.mesh); } obstacles = []; }

// ---------------------------------------------------------------------
//  Scenery: buildings, signboards, trees, poles with tangled wires
// ---------------------------------------------------------------------
const SHOPS = [
  ['Sri Lakshmi Darshini', null], ['Udupi Grand Hotel', null], ['Filter Kaapi ₹15', null], ['Raghavendra Stores', null],
  ['Iyengar\'s Bakery', null], ['Mobile Recharge & Xerox', null], ['Manjunatha Hardware', null], ['Biryani Since 1987', null],
  ['PG for Gents · WiFi · Food', null], ['Co-Working: Hot Desks (Literally)', null], ['Tasty Thindi', null],
  ['Ganesh Condiments', null], ['Ayurvedic Hair Oil · 100% Natural', null], ['Hosur Road Tyres', null], ['Brahmin\'s Coffee Bar', null],
  ['Silk Sarees Mega Sale', null], ['Dosa Camp', null], ['Startup Café · Pitch Decks Free', null],
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

// facade window tiles: 1 floor (3u) x 2 bays (6u), transparent so the wall colour shows through
const FACADES = [];
for (let v = 0; v < 8; v++) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d');
  for (let b = 0; b < 2; b++) {
    const x0 = 26 + b * 128, y0 = 30, w = 76, h = 66;
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x0 - 12, y0 - 14, w + 24, 7);                    // chajja (sunshade)
    g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(x0 - 5, y0 - 5, w + 10, h + 10);             // frame
    g.fillStyle = pick(['#2b3440', '#34404e', '#26313b', '#3a3f46']); g.fillRect(x0, y0, w, h);
    if (Math.random() < 0.5) { g.fillStyle = pick(['#d94b4b', '#e0a100', '#3c9b4f', '#7b2d8e', '#2f6fd6', '#f28c8c']); g.fillRect(x0 + (Math.random() < 0.5 ? 0 : w * 0.55), y0, w * 0.45, h); } // curtain
    g.strokeStyle = 'rgba(25,25,25,0.8)'; g.lineWidth = 3;                                         // window grill
    for (let k = 1; k < 6; k++) { g.beginPath(); g.moveTo(x0 + k * w / 6, y0); g.lineTo(x0 + k * w / 6, y0 + h); g.stroke(); }
    if ((v + b) % 3 === 0) { g.fillStyle = '#f2f2f2'; g.fillRect(x0 + 10, y0 + h + 10, 50, 20); g.fillStyle = '#b5b5b5'; for (let k = 0; k < 4; k++) g.fillRect(x0 + 14, y0 + h + 13 + k * 4, 42, 1.5); } // AC unit
  }
  g.fillStyle = 'rgba(0,0,0,0.1)'; g.fillRect(0, 120, 256, 8);                                    // floor band
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.MeshLambertMaterial({ map: t, transparent: true }); m.userData.shared = true; FACADES.push(m);
}
function facade(g, side, width, height, y, xFace) {
  const geo = new THREE.PlaneGeometry(width, height), uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * width / 6, uv.getY(i) * height / 3);
  const m = new THREE.Mesh(geo, pick(FACADES)); m.position.set(xFace, y + height / 2, 0); m.rotation.y = -side * Math.PI / 2; g.add(m); return m;
}
const rebarMat = new THREE.LineBasicMaterial({ color: 0x5a4636 }); rebarMat.userData.shared = true;
function rebar(g, pts, top) { // rods sticking out of pillar tops: "next floor coming soon"
  const v = [];
  for (const [x, z] of pts) for (let k = 0; k < 3; k++) { const ox = rand(-0.15, 0.15), oz = rand(-0.15, 0.15); v.push(x + ox, top, z + oz, x + ox + rand(-0.25, 0.25), top + rand(0.9, 1.5), z + oz + rand(-0.25, 0.25)); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.add(new THREE.LineSegments(geo, rebarMat));
}
function laundry(g, x, y, z, span) {
  for (let i = 0; i < 4; i++) box(g, 0.03, rand(0.5, 0.9), rand(0.4, 0.7), pick([0xd94b4b, 0x2f6fd6, 0xf2c12e, 0xffffff, 0x3c9b4f, 0xe86fa8, 0x7b2d8e]), x, y - 0.35, z - span / 2 + (i + 0.5) * span / 4);
}
function roofStuff(g, cx, top, d, side) {
  if (Math.random() < 0.75) cyl(g, 0.7, 1.2, 0x111111, cx + rand(-1, 1), top + 0.6, rand(-d / 3, d / 3));     // Sintex tank, mandatory
  if (Math.random() < 0.35) { const dsh = sph(g, 0.45, 0xe8e8e8, cx + rand(-1.5, 1.5), top + 0.7, rand(-d / 3, d / 3), 1, 1, 0.25); dsh.rotation.y = side * 0.8; dsh.rotation.x = -0.5; }
  if (Math.random() < 0.06) { cyl(g, 0.12, 9, 0x9a9a9a, cx, top + 4.5, 0); for (let k = 0; k < 3; k++) box(g, 0.25, 0.9, 0.12, 0xdcdcdc, cx + Math.cos(k * 2.1) * 0.3, top + 8.2, Math.sin(k * 2.1) * 0.3); } // mobile tower
}
function shopSign(g, side, d) {
  const [name, kn] = pick(SHOPS);
  const bg = pick(SIGN_BG); const fg = bg === '#fff' || bg === '#ffd23f' ? '#c0161c' : '#fff';
  if (Math.random() < 0.35) signPlane(g, textTex(name, { bg, fg, sub: kn, font: '800 56px "Baloo 2", sans-serif' }), d * 0.85, 1.5, side * (PATH_OUT + 0.94), 3.2, 0, -side * Math.PI / 2);
  box(g, 0.06, 2.4, d * 0.6, 0x8b8b8b, side * (PATH_OUT + 0.95), 1.2, 0); // shutter
}

// --- archetypes
function bldShop(side) {
  const g = new THREE.Group();
  const w = rand(6, 11), floors = 1 + ((Math.random() * 4) | 0), h = 4.2 + floors * 3, d = rand(7, 13);
  const fx = side * (PATH_OUT + 1), cx = fx + side * w / 2, out = -side;
  box(g, w, h, d, pick(BLD_COLORS), cx, h / 2, 0);
  if (Math.random() < 0.5) box(g, w + 0.06, 0.5, d + 0.06, pick(BLD_COLORS), cx, 4.2, 0);  // contrast band
  facade(g, side, d * 0.92, floors * 3, 4.2, fx + out * 0.03);
  shopSign(g, side, d);
  if (Math.random() < 0.55) for (let f = 0; f < floors; f++) {
    const y = 4.4 + f * 3, span = d * rand(0.4, 0.6), z = rand(-d / 4, d / 4);
    box(g, 0.9, 0.15, span, 0xd8d2c4, fx + out * 0.45, y, z);
    box(g, 0.05, 0.8, span, 0x3a3a3a, fx + out * 0.88, y + 0.45, z);
    if (Math.random() < 0.45) laundry(g, fx + out * 0.7, y + 1.9, z, span * 0.9);
  }
  roofStuff(g, cx, h, d, side);
  if (Math.random() < 0.3) { // half-built extra floor
    const pts = [[cx - w / 2 + 0.3, -d / 2 + 0.3], [cx + w / 2 - 0.3, -d / 2 + 0.3], [cx - w / 2 + 0.3, d / 2 - 0.3], [cx + w / 2 - 0.3, d / 2 - 0.3]];
    for (const [x, z] of pts) box(g, 0.35, 1.6, 0.35, 0x9d9a94, x, h + 0.8, z);
    rebar(g, pts, h + 1.6);
  }
  return { obj: g, len: d + rand(0.3, 2.5) };
}
function bldGlass(side) {
  const g = new THREE.Group();
  const w = rand(10, 15), h = rand(16, 28), d = rand(14, 22), set = 4;
  const fx = side * (PATH_OUT + 1 + set), cx = fx + side * w / 2, out = -side;
  box(g, set + 0.5, 0.12, d, 0xc9c6bf, side * (PATH_OUT + 1 + set / 2), 0.06, 0);           // plaza
  box(g, w, h, d, 0x7da6bd, cx, h / 2, 0, new THREE.MeshLambertMaterial({ color: 0x86afc6, emissive: 0x1a2a36 }));
  for (let y = 3; y < h; y += 3) box(g, 0.1, 0.18, d + 0.02, 0xe6eef2, fx + out * 0.05, y, 0);  // mullions
  for (let z = -d / 2 + 2; z < d / 2; z += 3) box(g, 0.1, h, 0.12, 0xd0dde4, fx + out * 0.05, h / 2, z);
  box(g, 0.3, 2.6, 4, 0x1b2430, fx + out * 0.1, 1.3, 0);                                     // lobby doors
  return { obj: g, len: d + rand(1, 4) };
}
function bldConstruction(side) {
  const g = new THREE.Group();
  const w = rand(8, 12), n = 2 + ((Math.random() * 4) | 0), d = rand(9, 13), fh = 3.2, set = 1.5;
  const fx = side * (PATH_OUT + 1 + set), cx = fx + side * w / 2;
  const cols = [-w / 2 + 0.3, 0, w / 2 - 0.3], rows = [-d / 2 + 0.3, 0, d / 2 - 0.3];
  for (let f = 0; f <= n; f++) {
    box(g, w, 0.3, d, 0xa8a49c, cx, f * fh + 0.15, 0);
    if (f < n) for (const ox of cols) for (const oz of rows) box(g, 0.4, fh, 0.4, 0x9d9a94, cx + ox, f * fh + fh / 2, oz);
  }
  box(g, 0.3, fh - 0.3, d, 0xb5523b, cx + side * (w / 2 - 0.2), fh / 2, 0);                  // one brick wall so far
  rebar(g, cols.flatMap(ox => rows.map(oz => [cx + ox, oz])), n * fh + 0.3);
  const net = new THREE.Mesh(new THREE.PlaneGeometry(d * 0.9, fh * 2), new THREE.MeshLambertMaterial({ color: 0x2e8b57, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
  net.position.set(fx - side * 0.05, (n - 1) * fh + 0.3, 0); net.rotation.y = -side * Math.PI / 2; g.add(net);
  // hoarding along the footpath
  box(g, 0.08, 2.2, d * 0.95, 0x2f6fd6, side * (PATH_OUT + 0.95), 1.1, 0); // tin-sheet hoarding
  if (Math.random() < 0.5) { // tower crane
    const mh = n * fh + rand(10, 16), mx = cx + side * (w / 2 + 1), dir = pick([-1, 1]);
    box(g, 0.7, mh, 0.7, 0xf2c12e, mx, mh / 2, 0);
    const jib = new THREE.Group(); jib.position.set(mx, mh, 0); jib.rotation.y = rand(0, Math.PI); g.add(jib);
    box(jib, 0.5, 0.5, 20, 0xf2c12e, 0, 0, dir * 6);
    box(jib, 1.2, 1.0, 1.6, 0x666666, 0, -0.2, -dir * 3.5);
    box(jib, 0.04, rand(4, 9), 0.04, 0x222222, 0, -3, dir * 11);
  }
  return { obj: g, len: d + set + rand(0.5, 2) };
}
function bldTemple(side) {
  const g = new THREE.Group();
  const d = 10, fx = side * (PATH_OUT + 1);
  const wall = new THREE.MeshLambertMaterial({ map: stripeTex('#c1272d', '#f4efe6', 10, 256, 64) });
  box(g, 0.4, 1.6, d, 0, fx + side * 0.2, 0.8, 0, wall);                                     // red-white striped wall
  box(g, 5, 3.2, 5, 0xf4efe6, fx + side * 5.5, 1.6, 0);                                     // sanctum
  const tiers = [0xe8b04a, 0xd9534f, 0x3f9d6a, 0x5b8fd6, 0xf2e6c9, 0xe8b04a];
  tiers.forEach((c, i) => box(g, 3.2 - i * 0.42, 1.1, 4.4 - i * 0.55, c, fx + side * 2.2, 1.6 + 0.55 + i * 1.1, 0));  // gopuram
  box(g, 0.9, 0.6, 1.4, 0xd9534f, fx + side * 2.2, 1.6 + tiers.length * 1.1 + 0.3, 0);
  for (const dz of [-0.4, 0, 0.4]) sph(g, 0.16, 0xf4c430, fx + side * 2.2, 1.6 + tiers.length * 1.1 + 0.8, dz);   // kalasam
  cyl(g, 0.05, 5, 0x6b4a2e, fx + side * 5.5, 5.7, 1.8);
  const flag = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.9, 0), new THREE.Vector3(0, -0.45, 1.3)]), new THREE.MeshBasicMaterial({ color: 0xff8c1a, side: THREE.DoubleSide }));
  flag.position.set(fx + side * 5.5, 8.1, 1.8); g.add(flag);
  return { obj: g, len: d + 1 };
}
function bldApartment(side) {
  const g = new THREE.Group();
  const w = rand(9, 13), floors = 4 + ((Math.random() * 3) | 0), h = 3.5 + floors * 3, d = rand(12, 16), set = 1.5;
  const fx = side * (PATH_OUT + 1 + set), cx = fx + side * w / 2, out = -side;
  box(g, 0.25, 1.4, d, 0xe8e2d6, side * (PATH_OUT + 1.05), 0.7, 0);                         // compound wall
  box(g, w, h, d, pick(BLD_COLORS), cx, h / 2, 0);
  facade(g, side, d * 0.9, floors * 3, 3.5, fx + out * 0.03);
  for (let f = 0; f < floors; f++) {
    const y = 3.7 + f * 3;
    box(g, 1.1, 0.15, d * 0.8, 0xd8d2c4, fx + out * 0.55, y, 0);
    box(g, 0.05, 0.85, d * 0.8, 0xeeeeee, fx + out * 1.08, y + 0.48, 0);
    if (Math.random() < 0.4) laundry(g, fx + out * 0.85, y + 1.95, rand(-d / 4, d / 4), d * 0.35);
  }
  roofStuff(g, cx, h, d, side);
  return { obj: g, len: d + set + rand(0.5, 2) };
}
function buildBuilding(side, s) {
  const st = stageAt(Math.max(0, s));
  const techy = st >= 2 ? 1 : 0.3;
  return ({ shop: bldShop, glass: bldGlass, construction: bldConstruction, temple: bldTemple, apartment: bldApartment })[wpick({ shop: 5, apartment: 1.6, construction: 1.4, glass: 1.2 * techy, temple: 0.5 })](side);
}
// free per-instance geometry/materials when scenery is recycled (shared ones are flagged)
const SHARED_GEO = new Set([BOX, CYL, SPH]);
function disposeObj(obj) {
  obj.traverse((m) => {
    if (m.geometry && !SHARED_GEO.has(m.geometry)) m.geometry.dispose();
    if (m.material && !m.material.userData.shared) m.material.dispose();
  });
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
  for (const it of scenery) { scene.remove(it.obj); disposeObj(it.obj); } scenery.length = 0;
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
      const it = r < 0.74 ? buildBuilding(side, sceneryNextS[i]) : r < 0.96 ? buildTree(side) : buildBillboard(side);
      it.s = sceneryNextS[i] + it.len / 2; it.obj.position.z = -it.s; scene.add(it.obj); scenery.push(it);
      sceneryNextS[i] += it.len;
    }
  }
  for (let i = scenery.length - 1; i >= 0; i--) if (scenery[i].s < carS - 30) { scene.remove(scenery[i].obj); disposeObj(scenery[i].obj); scenery.splice(i, 1); }
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
//  sfx bus (incl. street reverb) -> compressor -> master. One mute switch (master).
//  Horns are spatial (pan + distance lowpass) and type-specific.
// ---------------------------------------------------------------------
const HORNS = {
  car:  { f: [415, 494], type: 'sawtooth', bp: 1300, q: 1.2, dur: [0.14, 0.42], reps: [1, 3], gap: 0.09, vol: 0.10 },
  auto: { f: [640], type: 'square', bp: 1700, q: 3, dur: [0.07, 0.13], reps: [2, 4], gap: 0.07, vol: 0.08 },
  bike: { f: [880, 1046], type: 'square', bp: 2200, q: 2.5, dur: [0.05, 0.09], reps: [2, 3], gap: 0.06, vol: 0.05 },
  bus:  { f: [196, 247, 294], type: 'sawtooth', bp: 900, q: 0.9, dur: [0.35, 0.7], reps: [1, 2], gap: 0.15, vol: 0.10 },
};

const AU = {
  ctx: null, muted: false, scene: 'title', paused: false,
  init() {
    if (this.ctx) return;
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    const ctx = this.ctx = new C();
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.9; this.master.connect(ctx.destination);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.25;
    comp.connect(this.master);
    // analyser tap for level checks (debug)
    this.meter = ctx.createAnalyser(); this.meter.fftSize = 2048; comp.connect(this.meter);
    this.sfx = ctx.createGain(); this.sfx.gain.value = 1; this.sfx.connect(comp);
    // reverb returns into the sfx bus, so pausing/muting silences the tails too
    this.verb = ctx.createConvolver(); this.verb.buffer = this.impulse(2.2, 2.8);
    const vg = ctx.createGain(); vg.gain.value = 0.55; this.verb.connect(vg); vg.connect(this.sfx);
    this.white = this.noiseBuf(false); this.brown = this.noiseBuf(true);
    // continuous beds
    this.ambG = this.bed(this.brown, 'lowpass', 320, 0.6);              // far-off traffic rumble
    this.windG = this.bed(this.white, 'bandpass', 600, 0.5); this.windF = this._f;   // speed wind
    this.thrG = this.bed(this.white, 'highpass', 1400, 0.7); this.thrF = this._f;    // cold-gas hiss
    // EV motor: soft sine pair + faint inverter whine (Teslas are quiet; the city isn't)
    this.motorG = ctx.createGain(); this.motorG.gain.value = 0; this.motorG.connect(this.sfx);
    this.motor = ctx.createOscillator(); this.motor.type = 'sine'; this.motor.connect(this.motorG); this.motor.start();
    const m2g = ctx.createGain(); m2g.gain.value = 0.35; m2g.connect(this.motorG);
    this.motor2 = ctx.createOscillator(); this.motor2.type = 'triangle'; this.motor2.connect(m2g); this.motor2.start();
    this.whineG = ctx.createGain(); this.whineG.gain.value = 0; this.whineG.connect(this.sfx);
    this.whine = ctx.createOscillator(); this.whine.type = 'sine'; this.whine.connect(this.whineG); this.whine.start();
  },
  // ---------- plumbing
  noiseBuf(brown) {
    const ctx = this.ctx, b = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w; }
    return b;
  },
  impulse(dur, decay) {
    const ctx = this.ctx, len = ctx.sampleRate * dur, b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
    return b;
  },
  bed(buf, type, freq, q) {
    const ctx = this.ctx, s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = 0;
    s.connect(f); f.connect(g); g.connect(this.sfx); s.start(0, Math.random() * 2);
    this._f = f; return g;
  },
  // spatial input: lowpass + level by distance, stereo pan, reverb send. Returns the node to connect sources into.
  spatial(pan = 0, dist = 0, verb = 0.12, bus = this.sfx) {
    const ctx = this.ctx;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lerp(7000, 850, dist);
    const g = ctx.createGain(); g.gain.value = 1 - dist * 0.75;
    f.connect(g);
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); g.connect(p); p.connect(bus); } else g.connect(bus);
    const s = ctx.createGain(); s.gain.value = verb + dist * 0.6; g.connect(s); s.connect(this.verb);
    return f;
  },
  env(g, t, a, peak, hold, r) {
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    g.gain.setValueAtTime(Math.max(peak, 0.0002), t + a + hold); g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + r);
  },
  osc(type, f, t, dur, dest) {
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.connect(dest); o.start(t); o.stop(t + dur + 0.05); return o;
  },
  noise(t, dur, type, freq, q, vol, dest, buf = this.white) {
    const ctx = this.ctx, s = ctx.createBufferSource(); s.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); this.env(g, t, 0.005, vol, 0, dur);
    s.connect(f); f.connect(g); g.connect(dest); s.start(t, Math.random() * 2); s.stop(t + dur + 0.1); return f;
  },
  ok() { return this.ctx && this.ctx.state === 'running'; },
  now(d = 0) { return this.ctx.currentTime + 0.01 + d; },

  // ---------- state
  setScene(sc) { this.scene = sc; },
  setPaused(p) {
    this.paused = p; if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sfx.gain.setTargetAtTime(p ? 0 : 1, t, 0.05);
  },
  setMuted(m, persist = true) {
    this.muted = m; if (persist) try { localStorage.setItem('rb-muted', m ? '1' : '0'); } catch (e) {}
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.03);
  },
  setEngine(speed, thrust) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, on = this.scene === 'play' && !this.paused, k = speed / 70;
    const base = 70 + speed * 2.2;
    this.motor.frequency.setTargetAtTime(base, t, 0.08); this.motor2.frequency.setTargetAtTime(base * 2.01, t, 0.08);
    this.motorG.gain.setTargetAtTime(on ? 0.035 + k * 0.05 : 0, t, 0.15);
    this.whine.frequency.setTargetAtTime(900 + speed * 32, t, 0.1);
    this.whineG.gain.setTargetAtTime(on ? 0.004 + k * 0.008 : 0, t, 0.15);
    this.windG.gain.setTargetAtTime(on ? k * k * 0.11 : 0, t, 0.2); this.windF.frequency.setTargetAtTime(450 + speed * 18, t, 0.2);
    this.ambG.gain.setTargetAtTime(on ? 0.12 : this.scene === 'title' ? 0.05 : 0.03, t, 0.4);
    this.thrG.gain.setTargetAtTime(on ? thrust * 0.12 : 0, t, 0.04); this.thrF.frequency.setTargetAtTime(1100 + thrust * 1600, t, 0.08);
  },

  // ---------- horns
  honk(kind = 'car', pan = 0, dist = 0, delay = 0) {
    if (!this.ok()) return;
    if (kind === 'truck') return this.truckHorn(pan, dist, delay);
    const H = HORNS[kind] || HORNS.car, ctx = this.ctx, t = this.now(delay);
    const inp = this.spatial(pan, dist, 0.1);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = H.bp; bp.Q.value = H.q; bp.connect(inp);
    const reps = H.reps[0] + ((Math.random() * (H.reps[1] - H.reps[0] + 1)) | 0);
    const dur = rand(H.dur[0], H.dur[1]), pj = rand(0.94, 1.06);
    for (let r = 0; r < reps; r++) {
      const t0 = t + r * (dur + H.gap), g = ctx.createGain(); this.env(g, t0, 0.008, H.vol * 3, dur, 0.05); g.connect(bp);
      for (const f of H.f) {
        const o = this.osc(H.type, f * pj * (kind === 'bus' ? 1.05 : 1), t0, dur + 0.1, g);
        if (kind === 'bus') o.frequency.exponentialRampToValueAtTime(f * pj, t0 + 0.08); // air-horn sag
      }
    }
  },
  truckHorn(pan, dist, delay) { // pressure horn "la-la-la"
    const ctx = this.ctx, t = this.now(delay), inp = this.spatial(pan, dist, 0.15);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200; lp.connect(inp);
    const tune = pick([[523, 659, 784, 659, 587, 523], [659, 784, 880, 784, 659], [587, 659, 587, 523, 587]]);
    tune.forEach((n, i) => { const g = ctx.createGain(); this.env(g, t + i * 0.14, 0.01, 0.07, 0.1, 0.03); g.connect(lp); this.osc('square', n, t + i * 0.14, 0.15, g); this.osc('triangle', n * 1.003, t + i * 0.14, 0.15, g); });
  },
  playerHorn(model = 'roadster') { // the Roadster: crisp, expensive, dual-tone. Also ignored.
    if (!this.ok()) return;
    if (model === 'namma') return this.honk('auto', 0, 0);
    if (model === 'shaadi') return this.bandBaaja();
    const ctx = this.ctx, t = this.now(), inp = this.spatial(0, 0, 0.08);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 0.8; bp.connect(inp);
    const g = ctx.createGain(); this.env(g, t, 0.01, 0.35, 0.24, 0.06); g.connect(bp);
    this.osc('sawtooth', 440, t, 0.35, g); this.osc('sawtooth', 554.4, t, 0.35, g);
  },

  // ---------- sfx
  moo(pan = 0) {
    if (!this.ok()) return;
    const ctx = this.ctx, t = this.now(), inp = this.spatial(pan, 0.1, 0.2);
    const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 480; f1.Q.value = 3;
    const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 950; f2.Q.value = 5;
    const g = ctx.createGain(); this.env(g, t, 0.18, 0.9, 0.75, 0.45);
    const g2 = ctx.createGain(); g2.gain.value = 0.4;
    g.connect(f1); g.connect(g2); g2.connect(f2); f1.connect(inp); f2.connect(inp);
    const o = this.osc('sawtooth', 105, t, 1.5, g);
    o.frequency.exponentialRampToValueAtTime(148, t + 0.3); o.frequency.exponentialRampToValueAtTime(122, t + 0.95); o.frequency.exponentialRampToValueAtTime(92, t + 1.35);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 5; const lg = ctx.createGain(); lg.gain.value = 3; lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + 1.5);
  },
  crash() {
    if (!this.ok()) return;
    const t = this.now(), inp = this.spatial(0, 0, 0.15);
    this.noise(t, 0.4, 'lowpass', 260, 0.7, 0.9, inp, this.brown);      // body thump
    this.noise(t, 0.22, 'bandpass', 2400, 2.5, 0.25, inp);               // metal
    const g = this.ctx.createGain(); this.env(g, t, 0.003, 0.5, 0.02, 0.25); g.connect(inp);
    this.osc('sine', 70, t, 0.3, g).frequency.exponentialRampToValueAtTime(40, t + 0.25);
  },
  thud() {
    if (!this.ok()) return;
    const t = this.now(), inp = this.spatial(0, 0, 0.05);
    const g = this.ctx.createGain(); this.env(g, t, 0.003, 0.45, 0.01, 0.18); g.connect(inp);
    this.osc('sine', 85, t, 0.22, g).frequency.exponentialRampToValueAtTime(45, t + 0.18);
    this.noise(t, 0.15, 'lowpass', 220, 0.7, 0.5, inp, this.brown);
  },
  land() { this.thud(); },
  hop() { // cold-gas "pssshh" + soft thunk
    if (!this.ok()) return;
    const t = this.now(), inp = this.spatial(0, 0, 0.12);
    const f = this.noise(t, 0.4, 'highpass', 1600, 0.5, 0.32, inp);
    f.frequency.setValueAtTime(3200, t); f.frequency.exponentialRampToValueAtTime(900, t + 0.4);
    const g = this.ctx.createGain(); this.env(g, t, 0.003, 0.25, 0.01, 0.1); g.connect(inp);
    this.osc('sine', 160, t, 0.15, g).frequency.exponentialRampToValueAtTime(90, t + 0.1);
  },
  whoosh() {
    if (!this.ok()) return;
    const t = this.now(), f = this.noise(t, 0.6, 'bandpass', 400, 1.2, 0.35, this.spatial(0, 0, 0.3));
    f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(3200, t + 0.5);
  },
  pluck(f, t, vol = 0.12, dest) {
    const g = this.ctx.createGain(); this.env(g, t, 0.004, vol, 0.01, 0.45); g.connect(dest);
    this.osc('triangle', f, t, 0.5, g); this.osc('sine', f * 2, t, 0.3, g);
  },
  ping() { if (!this.ok()) return; const t = this.now(), d = this.spatial(0.3, 0, 0.1); this.pluck(1174.7, t, 0.07, d); this.pluck(1568, t + 0.09, 0.07, d); },
  bandBaaja() { // brassy wedding-band phrase
    const ctx = this.ctx, t = this.now(), inp = this.spatial(0, 0, 0.18);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600; lp.connect(inp);
    [[587, 0.12], [587, 0.12], [659, 0.12], [784, 0.24], [740, 0.12], [659, 0.3]].reduce((at, [f, d]) => {
      const g = ctx.createGain(); this.env(g, t + at, 0.015, 0.16, d - 0.04, 0.04); g.connect(lp);
      this.osc('sawtooth', f, t + at, d + 0.05, g); this.osc('square', f * 1.004, t + at, d + 0.05, g); return at + d;
    }, 0);
    this.noise(t, 0.1, 'highpass', 6000, 0.7, 0.12, inp); this.noise(t + 0.48, 0.1, 'highpass', 6000, 0.7, 0.12, inp); // cymbal ticks
  },
  bell() { // temple bell for the delivery pooja
    if (!this.ok()) return;
    const ctx = this.ctx, t = this.now(), d = this.spatial(0, 0, 0.4);
    for (const [f, v, dec] of [[880, 0.16, 2.4], [1324, 0.08, 1.8], [2205, 0.05, 1.2], [2650, 0.03, 0.8]]) {
      const g = ctx.createGain(); this.env(g, t, 0.003, v, 0.01, dec); g.connect(d); this.osc('sine', f, t, dec + 0.1, g);
    }
  },
  coconut() { if (!this.ok()) return; const t = this.now(), d = this.spatial(0, 0, 0.1); this.noise(t, 0.12, 'bandpass', 900, 1.5, 0.5, d); this.thud(); },
  ching() {
    if (!this.ok()) return;
    const t = this.now(), d = this.spatial(0, 0, 0.15);
    this.noise(t, 0.05, 'highpass', 5000, 0.7, 0.2, d);
    this.pluck(1318.5, t + 0.02, 0.12, d); this.pluck(1760, t + 0.1, 0.12, d); this.pluck(2637, t + 0.1, 0.05, d);
  },
  stunt() { if (!this.ok()) return; const t = this.now(), d = this.spatial(0, 0, 0.25); [587.3, 740, 880, 1174.7].forEach((n, i) => this.pluck(n, t + i * 0.07, 0.11, d)); },
  fsdEngage() { if (!this.ok()) return; const t = this.now(), d = this.spatial(0, 0, 0.3); this.pluck(659.3, t, 0.12, d); this.pluck(987.8, t + 0.13, 0.12, d); },
  fsdAlarm() { // takeover-immediately triple beeps
    if (!this.ok()) return;
    const ctx = this.ctx, t = this.now(), d = this.spatial(0, 0, 0.05);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3500; lp.connect(d);
    for (let grp = 0; grp < 3; grp++) for (let b = 0; b < 3; b++) {
      const t0 = t + grp * 0.48 + b * 0.11, g = ctx.createGain(); this.env(g, t0, 0.004, 0.16, 0.055, 0.02); g.connect(lp);
      this.osc('square', 1568, t0, 0.09, g);
    }
  },
};
try { AU.muted = localStorage.getItem('rb-muted') === '1'; } catch (e) {}
let audioUnlocked = false;
function unlockAudio() {
  if (audioUnlocked) return; audioUnlocked = true;
  AU.init(); if (AU.ctx && AU.ctx.state === 'suspended') AU.ctx.resume();
  syncAudioButtons();
}
addEventListener('pointerdown', unlockAudio); addEventListener('keydown', unlockAudio);
function syncAudioButtons() {
  for (const el of document.querySelectorAll('.soundBtn')) { el.textContent = AU.muted ? '🔇 Sound: Off' : '🔊 Sound: On'; el.classList.toggle('off', AU.muted); }
}
const HORN_OF = { auto: 'auto', bike: 'bike', bus: 'bus', car: 'car' };
const hornKind = (o) => o.kind === 'tanker' ? (Math.random() < 0.5 ? 'truck' : 'bus') : HORN_OF[o.kind] || 'car';
// spatial, density-driven street honks (replaces constant random honking)
function ambientHonks() {
  const carZ = -car.s;
  const near = obstacles.filter(o => HORN_OF[o.kind] || o.kind === 'tanker').filter(o => o.z > carZ - 110 && o.z < carZ + 25);
  game.ambT = rand(2, 4.5) / (1 + near.length * 0.03) * (game.stage === 1 ? 0.6 : 1);
  if (!near.length) { if (Math.random() < 0.5) AU.honk(pick(['car', 'auto', 'bus']), rand(-1, 1), rand(0.75, 1)); return; }
  const v = pick(near), place = (o) => [clamp((o.x - car.x) / 12, -1, 1), clamp(Math.abs(carZ - o.z) / 110, 0, 1)];
  AU.honk(hornKind(v), ...place(v));
  if (Math.random() < 0.3) { const w = pick(near); AU.honk(hornKind(w), ...place(w), rand(0.25, 0.7)); } // someone always honks back
}

// ---------------------------------------------------------------------
//  UI helpers
// ---------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const ui = { fsd: $('fsd'), fsdState: $('fsdState'), fsdDetect: $('fsdDetect'), fsdMsg: $('fsdMsg'), spd: $('spd'), clock: $('clock'), progfill: $('progfill'), progcar: $('progcar'), stage: $('stageName'), air: $('airfill'), swag: $('swag'), challan: $('challan'), flash: $('flash'), banner: $('banner'), hint: $('hint'), toasts: $('toasts'), foam: $('foam'), tick: $('tick') };
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
addEventListener('blur', () => { for (const k in keys) keys[k] = false; if (!window.__noAutoPause) setPaused(true); }); // __noAutoPause: debug flag for automated screenshots
document.addEventListener('visibilitychange', () => { if (document.hidden && !window.__noAutoPause) setPaused(true); });
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
    clock: START_MIN, t: 0, swag: 0, challans: [], cowsRespected: 0, cowsHit: 0, potholes: 0, crashes: 0, honks: 0, rolls: 0, roofHops: 0, hops: 0,
    stage: -1, nextSpawn: 135, events: buildEvents(), lateMsgs: [9 * 60 + 31, 9 * 60 + 40, 9 * 60 + 52, 10 * 60 + 5], foamT: 0, ambT: 1, pausedT: 0, fsdCd: 0, fsd: null,
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
    [610, () => hint(isTouch ? 'Tired of driving? Tap <b>FSD</b> 🤖' : 'Tired of driving? Press <b>G</b> for FSD (Supervised) 🤖', 3.5)],
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
function issueChallan(amount, reason, quiet = false) {
  game.challans.push({ amount, reason }); AU.ching();
  const tot = game.challans.reduce((a, c) => a + c.amount, 0); ui.challan.textContent = '₹' + tot.toLocaleString('en-IN');
  if (!quiet) toast('Bengaluru Traffic Police 🚓', `e-Challan ₹${amount}: ${reason}`, true);
  ui.challan.classList.remove('bump'); void ui.challan.offsetWidth; ui.challan.classList.add('bump');
}

// ---------- FSD (Supervised): engages, panics, demands you take over
const FSD_REASONS = [
  ['Lane markings not found.', 'Possibly never existed.'],
  ['Auto indicated left, turned right.', 'Neural net has left the chat.'],
  ['3 vehicles occupying 1 space.', 'Physics.exe stopped responding.'],
  ['Route planned. ETA: next Tuesday.', 'Handing control back to you.'],
  ['FSD has applied for a transfer', 'to the Austin office.'],
  ['Pedestrian, cow and BMTC bus', 'all have right of way. Simultaneously.'],
];
function startFSD() {
  if (game.fsd) return;
  if (game.fsdCd > 0) { hint('FSD is recovering from the last attempt. Give it a moment 🙏', 1.8); return; }
  const near = obstacles.filter(o => o.z < -car.s + 5 && o.z > -car.s - 150);
  const n = (...k) => near.filter(o => k.includes(o.kind)).length;
  const counts = { autos: n('auto'), bikes: n('bike'), cars: n('car'), buses: n('bus', 'tanker'), cows: n('cow') };
  const reason = counts.cows ? ['A cow is making eye contact.', 'Disengaging out of respect 🙏'] : pick(FSD_REASONS);
  game.fsd = { t: 0, phase: 'engaged', counts, reason };
  ui.fsd.className = 'engaged'; ui.fsdState.textContent = 'ENGAGED';
  ui.fsdMsg.innerHTML = 'Scanning Bengaluru<span class="dots"></span>';
  AU.fsdEngage();
}
function updateFSD(dt) {
  const f = game.fsd; f.t += dt;
  if (f.phase === 'engaged') {
    const k = Math.min(1, f.t / 1.1), c = f.counts, r = (v) => Math.round(v * k);
    ui.fsdDetect.innerHTML = `<b>${r(c.autos)}</b> autos · <b>${r(c.bikes)}</b> two-wheelers · <b>${r(c.cars)}</b> cars · <b>${r(c.buses)}</b> buses · <b>${r(c.cows)}</b> cows · <b class="zero">0</b> lanes`;
    if (f.t > 1.6) {
      f.phase = 'takeover'; ui.fsd.className = 'takeover'; ui.fsdState.textContent = 'DISENGAGED';
      ui.fsdMsg.innerHTML = `<div class="tk">⚠ TAKE OVER IMMEDIATELY</div><div class="why">${f.reason[0]}<br>${f.reason[1]}</div>`;
      document.body.classList.add('alarm'); AU.fsdAlarm(); car.shake = Math.max(car.shake, 0.12);
    }
  } else if (f.t > 4.4) {
    ui.fsd.className = 'hidden'; document.body.classList.remove('alarm'); game.fsd = null; game.fsdCd = 4;
  }
}

function update(dt) {
  game.t += dt;
  game.clock += dt * (cruise() / 44) / SEC_PER_MIN;
  const prevY = car.y;

  // ---------- horizontal
  let steer = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  if (game.fsd && game.fsd.phase === 'engaged') steer = Math.sin(game.fsd.t * 8) * 0.7; // the neural net, deciding
  const steerRate = (9 + Math.min(car.speed, 40) * 0.12) * VEH.steer;
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
        car.vy = HOP_V * VEH.hop; car.air -= HOP_COST; car.onGround = false; car.support = null; game.hops++;
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
    car.air -= HOVER_DRAIN * VEH.hover * dt; thrust = 1;
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
  if (supportObj && car.y <= support) {
    // never park on vehicles (it reads as a stuck hover): bounce off the roof instead
    car.y = support; car.vy = Math.max(7.5, Math.sqrt(2 * GRAV * (3.8 - support))); car.onGround = false; car.support = null; // clears a bus
    car.speed = Math.max(car.speed, cruise() * 0.6); // and always moves you forward
    game.roofHops++; addSwag(30); AU.thud(); car.shake = Math.max(car.shake, 0.1);
    if (game.roofHops === 1 || Math.random() < 0.2) flash('ROOF HOP!', pick(['Namma style', 'Sorry uncle!', 'Using the BMTC as a trampoline']));
  } else if (car.y <= support) {
    if (!car.onGround) {
      // landing
      if (car.rolling) { car.rolling = false; car.roll = 0; car.speed *= 0.45; car.shake = 0.4; AU.crash(); flash('SKETCHY LANDING', pick(['Bhai ye kya tha?', 'Chassis says ouch', 'Saar, insurance claim?'])); }
      else if (car.vy < -6) { AU.land(); car.shake = Math.max(car.shake, 0.15); for (let i = 0; i < 8; i++) puff(new THREE.Vector3(car.x + rand(-1.5, 1.5), support + 0.2, -car.s + rand(-2, 2)), new THREE.Vector3(rand(-3, 3), rand(0.5, 2), rand(-1, 3)), 0.8, 0.8, 2.5, 0xc9a77c, 0.5); }
    }
    car.y = support; car.vy = 0; car.onGround = true; car.support = null;
  } else if (car.y > support + 0.05) {
    car.onGround = false; car.support = null;
  }

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
    game.honks++; AU.playerHorn(carCfg.model);
    let cowNear = false;
    for (const o of obstacles) {
      const dz = -car.s - o.z;
      if (dz > 0 && dz < 35 * VEH.horn && Math.abs(o.x - car.x) < 3.5 * VEH.horn) {
        if (o.kind === 'cow') cowNear = true;
        else if (!o.gridlock && (o.kind === 'bike' || o.kind === 'auto' || o.kind === 'car') && o.ai) {
          const away = o.x > car.x ? 1 : -1; o.ai.tx = clamp(o.x + away * rand(3, 5) * VEH.horn, -ROAD_HALF + 1, ROAD_HALF - 1); o.ai.t = 2.5; o.ai.base = o.ai.tx;
        }
      }
    }
    if (cowNear && Math.random() < 0.7) { hint('🐄 The cow is unimpressed by your horn.', 2); setTimeout(() => AU.moo(), 300); }
    else if (game.honks === 30) toast('Bengaluru Traffic Police 🚓', 'Honk count: 30. Congratulations, you are now a local.', true);
  }
  if (pressed.fsd) startFSD();
  if (game.fsd) updateFSD(dt);
  game.fsdCd -= dt;

  // ---------- ambient Bangalore soundscape
  game.ambT -= dt;
  if (game.ambT <= 0) ambientHonks();

  // ---------- foam overlay
  game.foamT -= dt; ui.foam.classList.toggle('on', game.foamT > 0);

  // ---------- finish
  if (car.s >= TOTAL) endGame(true);

  // ---------- recycle / spawn
  while (game.nextSpawn < car.s + 230) { spawnAt(game.nextSpawn); game.nextSpawn += STAGE_CFG[stageAt(game.nextSpawn)].gap * rand(0.65, 1.35); }
  for (let i = obstacles.length - 1; i >= 0; i--) {
    const o = obstacles[i];
    if (o.z > -car.s + 30) { scene.remove(o.mesh); disposeObj(o.mesh); obstacles.splice(i, 1); }
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
    if (o.kind === 'foam') { if (car.y < 2.6) { if (game.foamT <= 0) { flash('LAKE FOAM!', 'Bellandur says hi'); AU.whoosh(); } game.foamT = 1.1; } continue; }
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
        if (HORN_OF[o.kind] && Math.random() < 0.35) AU.honk(hornKind(o), clamp((o.x - car.x) / 10, -1, 1), 0.1, 0.15); // they honk at the flying car
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
  if (o.kind === 'cop') { issueChallan(2000, 'Nudging an on-duty officer', true); flash('SORRY SIR!', 'e-Challan ₹2,000 · Very very sorry sir', '#ff5a5a'); return; }
  if (o.kind === 'pillar') { flash('METRO PILLAR', 'It has been there since 2019. You have not.'); return; }
  if (o.kind === 'barricade') { flash('BARRICADE!', 'Metro work in progress (since forever)'); return; }
  const line = pick(KANNADA_HITS);
  flash(line, o.kind === 'auto' ? 'Auto anna: "Meter mele 50 kodi saar"' : o.kind === 'bus' ? 'BMTC does not brake. BMTC never brakes.' : o.kind === 'bike' ? 'Delivery guy: "Ma\'am, 2 mins away"' : '');
  if (HORN_OF[o.kind] || o.kind === 'tanker') AU.honk(hornKind(o), clamp((o.x - car.x) / 10, -1, 1), 0.05, 0.15);
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
  updateSky(dt);
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
const PRO_TIPS = [
  'Autos indicate left to turn right. Plan accordingly.',
  'Hover over cops: challan. Hover over cows: karma. Choose wisely.',
  'Thrusters and hover share one tank. Save gas for Silk Board.',
  'If the bus is moving, it has right of way. If it is stopped, it also has right of way.',
  'Silk Board is not a junction. It is a lifestyle.',
  'Unmarked speed breakers are free airtime. Courtesy BBMP.',
  'Barrel rolls only count if you land them.',
  'Honk to clear two-wheelers. Cows are immune.',
];
function fillPause() {
  $('pzTip').textContent = pick(PRO_TIPS);
  syncAudioButtons();
}
function setPaused(p) {
  if (state !== 'playing' || paused === p) return;
  paused = p;
  if (p) fillPause();
  $('pause').classList.toggle('hidden', !p);
  for (const k in keys) keys[k] = false;
  AU.setPaused(p);
}
// ---------- vehicle selector
let garageOpen = false;
function renderGarage() {
  const m = MODELS[carCfg.model];
  $('gModels').innerHTML = Object.entries(MODELS).map(([k, v]) => `<button class="gmodel${k === carCfg.model ? ' on' : ''}" data-model="${k}">${v.name}</button>`).join('');
  $('gPrice').textContent = m.price;
  $('gDesc').textContent = m.tag;
  $('gStats').innerHTML = Object.entries(m.stats).map(([k, v]) => `<span>${k}</span><div class="gbar">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= v ? 'on' : ''}"></i>`).join('')}</div>`).join('');
  $('gPaint').innerHTML = Object.entries(PAINTS).map(([k, [n, c]]) => `<button data-paint="${k}" title="${n}" aria-label="${n}" class="${k === carCfg.paint ? 'on' : ''}" style="background:#${c.toString(16).padStart(6, '0')}"></button>`).join('');
  $('gPaint').classList.toggle('locked', !!m.livery);
  $('gPaintName').textContent = m.livery ? 'Auto livery (fixed by the auto stand)' : PAINTS[carCfg.paint][0];
  $('gModels').querySelectorAll('button').forEach(b => b.onclick = () => { const k = b.dataset.model; applyVehicle({ model: k, paint: MODELS[k].paint || carCfg.paint }); renderGarage(); });
  $('gPaint').querySelectorAll('button').forEach(b => b.onclick = () => { applyVehicle({ model: carCfg.model, paint: b.dataset.paint }); renderGarage(); });
}
let garageCfgAtOpen = '';
function setGarage(open) {
  garageOpen = open;
  $('garage').classList.toggle('hidden', !open); $('title').classList.toggle('hidden', open);
  $('garage').querySelector('.gpanel').classList.remove('away');
  if (open) { garageCfgAtOpen = JSON.stringify(carCfg); renderGarage(); } else camera.clearViewOffset();
}
// ---------- delivery pooja: break a coconut, roll over a lemon under each wheel, ring the bell
let pooja = null, poojaZ = 0;
function takeDelivery() {
  if (JSON.stringify(carCfg) === garageCfgAtOpen) return setGarage(false); // nothing new, no ceremony
  unlockAudio(); AU.coconut();
  $('garage').querySelector('.gpanel').classList.add('away'); camera.clearViewOffset();
  const lg = new THREE.Group(); scene.add(lg);
  const lemons = [[-1.04, -1.45], [1.04, -1.45], [-1.04, 1.5], [1.04, 1.5]].map(([x, z]) => sph(lg, 0.14, 0xf6e13a, car.x + x, 0.13, z - 1.0, 1, 0.85, 1));
  pooja = { t: 0, lg, lemons, step: 0 };
  $('pooja').innerHTML = '<span>Coconut broken ✓</span>'; $('pooja').classList.remove('hidden');
}
function updatePooja(dt) {
  const p = pooja; p.t += dt; updateParticles(dt);
  const k = clamp((p.t - 0.4) / 1.0, 0, 1);
  poojaZ = -(k * k * (3 - 2 * k)) * 1.3;                                       // roll forward over the lemons
  for (const w of carMesh.wheels) w.children[0].rotation.x -= (k > 0 && k < 1 ? 3.5 : 0) * dt;
  p.lemons.forEach((l, i) => {
    const wheelZ = (i < 2 ? -1.45 : 1.5) + poojaZ;
    if (l.scale.y > 0.06 && wheelZ <= l.position.z + 0.05) {
      l.scale.set(0.2, 0.035, 0.2); l.position.y = 0.03;
      for (let j = 0; j < 5; j++) puff(l.position.clone().add(new THREE.Vector3(0, 0.15, 0)), new THREE.Vector3(rand(-1.5, 1.5), rand(0.5, 2), rand(-1.5, 1.5)), 0.5, 0.2, 0.6, 0xf6e13a, 0.9);
    }
  });
  if (p.step === 0 && p.t > 1.2) { p.step = 1; $('pooja').innerHTML += '<span>Lemons crushed ✓</span>'; AU.thud(); }
  if (p.step === 1 && p.t > 1.7) { p.step = 2; $('pooja').innerHTML += '<span class="big">Shubh yatra! 🙏</span>'; AU.bell(); }
  if (p.t > 3.2) finishPooja();
}
function finishPooja() {
  if (!pooja) return;
  scene.remove(pooja.lg); disposeObj(pooja.lg); pooja = null; poojaZ = 0;
  $('pooja').classList.add('hidden'); setGarage(false);
}
function setMode(m) {
  driveMode = m;
  try { localStorage.setItem('rb-mode', m); } catch (e) {}
  document.querySelectorAll('.seg button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  $('modeLbl').textContent = MODES[m].label.toUpperCase();
}
function startGame() {
  if (garageOpen) setGarage(false);
  unlockAudio(); if (AU.ctx && AU.ctx.state === 'suspended') AU.ctx.resume();
  AU.setScene('play'); AU.setPaused(false);
  paused = false; $('pause').classList.add('hidden');
  resetGame();
  state = 'playing';
  $('title').classList.add('hidden'); $('over').classList.add('hidden'); $('hud').classList.remove('hidden');
  if (isTouch) $('touch').classList.remove('hidden');
  ui.toasts.innerHTML = ''; ui.fsd.className = 'hidden'; document.body.classList.remove('alarm');
  flash('0–60 in 0.8s', 'Straight into traffic');
}
function endGame(arrived) {
  if (state !== 'playing') return;
  state = 'over';
  $('touch').classList.add('hidden'); ui.fsd.className = 'hidden'; document.body.classList.remove('alarm');
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
    ['Vehicle', vehicleLabel()],
    ['Badge-in time', fmtClock(game.clock) + ' AM'],
    ['Swag', Math.round(game.swag).toLocaleString('en-IN')],
    ['Cows respected (flown over)', game.cowsRespected],
    ['Cows bumped', game.cowsHit],
    ['Barrel rolls', game.rolls],
    ['Potholes found', game.potholes],
    ['Crashes', game.crashes],
    ['Roof hops', game.roofHops],
    ['Honks', game.honks],
    ['Challans', '₹' + tot.toLocaleString('en-IN') + (game.challans.length ? ` (${game.challans.length})` : '')],
  ];
  $('oStats').innerHTML = rows.map(([a, b]) => `<div>${a}</div><div>${b}</div>`).join('');
  setTimeout(() => { $('over').classList.remove('hidden'); $('hud').classList.add('hidden'); }, arrived ? 900 : 200);
  if (arrived) { flash('BADGE IN ✅', fmtClock(game.clock) + ' AM'); AU.stunt(); }
  AU.setScene('over');
}
$('startBtn').addEventListener('click', startGame);
$('againBtn').addEventListener('click', startGame);
$('resumeBtn').addEventListener('click', () => setPaused(false));
$('vehBtn').addEventListener('click', () => setGarage(true));
$('gDone').addEventListener('click', takeDelivery);
$('restartBtn').addEventListener('click', startGame);
$('pauseBtn').addEventListener('click', () => setPaused(true));
document.querySelectorAll('.soundBtn').forEach(b => b.addEventListener('click', () => { unlockAudio(); AU.setMuted(!AU.muted); syncAudioButtons(); }));
document.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
document.querySelectorAll('button').forEach(b => b.addEventListener('click', () => b.blur())); // keep SPACE from re-clicking
setMode(driveMode);
syncAudioButtons();
for (const el of document.querySelectorAll('.vehLabel')) el.textContent = vehicleLabel();

// ---------------------------------------------------------------------
//  Main loop
// ---------------------------------------------------------------------
resetGame(); game.events = [];
let last = performance.now();
let viewScene = scene;
function frame(now) {
  requestAnimationFrame(frame);
  if (state === 'og') { renderer.render(viewScene, camera); return; }
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (pressed.mute) { AU.setMuted(!AU.muted); syncAudioButtons(); hint(AU.muted ? '🔇 Muted · M to unmute' : '🔊 Sound on', 1.4); }
  if (state === 'title' || state === 'over') {
    if (garageOpen) { if (pooja) { if (pressed.pause || pressed.enter) finishPooja(); else updatePooja(dt); } else if (pressed.pause) setGarage(false); else if (pressed.enter) takeDelivery(); }
    else if ((pressed.enter || (pressed.hop && state === 'title')) && !(state === 'over' && $('over').classList.contains('hidden'))) startGame();
    // idle showroom orbit on title
    if (state === 'title') {
      game.t += dt;
      const a = game.t * 0.25;
      carMesh.position.set(car.x, 0, poojaZ); carMesh.rotation.set(0, 0, 0);
      carShadow.position.set(car.x, 0.02, poojaZ); carContact.position.set(car.x, 0.025, poojaZ); carContact.material.opacity = 1;
      for (const m of [road, ...paths, ...curbs, earth]) m.position.z = -100;
      const portrait = camera.aspect < 1, r = (garageOpen ? 6.4 : 7.5) * (portrait ? 1.6 : 1);
      camera.position.set(car.x + Math.sin(a) * r, (garageOpen ? 2.0 : 2.4) * (portrait ? 1.4 : 1), Math.cos(a) * r);
      camera.lookAt(car.x, 0.6, 0);
      if (pooja) { camera.position.set(car.x + 5.6, 1.5, poojaZ - 0.6); camera.lookAt(car.x, 0.35, poojaZ - 0.6); } // side-on so you see the lemons go
      else if (garageOpen) { // keep the car clear of the panel: left of it on desktop, above it on phones
        const w = innerWidth, h = innerHeight;
        if (w > 760) camera.setViewOffset(w, h, 190, 0, w, h); else camera.setViewOffset(w, h, 0, h * 0.24, w, h);
      }
      updateSky(dt);
      carMesh.nimbu.rotation.z = Math.sin(game.t * 3) * 0.2;
      game.ambT -= dt; if (game.ambT <= 0) { game.ambT = rand(2.5, 6); AU.honk(pick(['car', 'auto', 'bus', 'bike']), rand(-1, 1), rand(0.7, 1)); } // distant city
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
const OG_MODE = new URLSearchParams(location.search).has('og');
document.fonts && document.fonts.ready.then(() => {
  if (state !== 'title') return; texCache.clear(); resetGame(); game.events = [];
  if (OG_MODE) setupOgCard();
});
// ?og — share card: a parody of the launch-event photo. Dark stage, red floor light,
// the Roadster mid-flip on a cold-gas trail over a lineup of autos, a cow, a BMTC bus and a tanker.
function setupOgCard() {
  document.body.classList.add('og');
  state = 'og';
  const st = new THREE.Scene();
  st.background = new THREE.Color(0x030405); st.fog = new THREE.Fog(0x030405, 34, 95);
  st.add(new THREE.HemisphereLight(0x9fb3c8, 0x0a0a0a, 0.6));
  const key = new THREE.DirectionalLight(0xdfe8ff, 1.7); key.position.set(6, 18, 20); st.add(key);
  const redFill = new THREE.DirectionalLight(0xff2a36, 0.3); redFill.position.set(0, 1.5, 14); st.add(redFill);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(220, 140), new THREE.MeshStandardMaterial({ color: 0x0b0c0f, roughness: 0.35, metalness: 0.3 }));
  floor.rotation.x = -Math.PI / 2; st.add(floor);
  for (const [z, w, o] of [[4.2, 36, 1], [5.4, 26, 0.45]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.14), new THREE.MeshBasicMaterial({ color: 0xff2a36, transparent: true, opacity: o }));
    m.rotation.x = -Math.PI / 2; m.position.set(-3, 0.02, z); st.add(m);
  }
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(44, 6), new THREE.MeshBasicMaterial({ map: radialTex('rgba(255,40,50,0.5)', 'rgba(255,40,50,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.rotation.x = -Math.PI / 2; glow.position.set(-3, 0.03, 4.7); st.add(glow);
  // the lineup, side-on — the Bengaluru edition of "a row of cars and a Semi"
  let x = -15.5;
  for (const k of ['auto', 'cow', 'auto', 'bus', 'auto', 'tanker']) {
    const o = BUILDERS[k](), m = o.mesh;
    if (k === 'cow') m.children[0].rotation.y = 0;
    m.rotation.y = -Math.PI / 2;
    x += o.d / 2; m.position.set(x, 0, 0); x += o.d / 2 + 0.7; st.add(m);
  }
  // the Roadster, mid-flip
  st.add(carMesh); carMesh.rotation.order = 'YXZ';
  carMesh.position.set(5.4, 6.8, 3); carMesh.rotation.set(0.42, -Math.PI / 2 + 0.55, -0.55); carMesh.scale.setScalar(1.55); // nose-up, banked toward camera
  const carKey = new THREE.DirectionalLight(0xffffff, 1.2); carKey.position.set(4, 4, 20); st.add(carKey);
  carMesh.glow.material.opacity = 0; carMesh.updateMatrixWorld(true);
  const puffAt = (p, sc, op) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: PUFF_TEX, transparent: true, depthWrite: false, opacity: op }));
    sp.scale.set(sc, sc, 1); sp.position.copy(p); st.add(sp);
  };
  for (let i = 0; i < 80; i++) { // vapour arc from the launch point up to the car
    const t = i / 79, px = lerp(-19, 3.0, t), py = 0.6 + 6.0 * (1 - (1 - t) * (1 - t));
    puffAt(new THREE.Vector3(px + rand(-0.4, 0.4), py + rand(-0.35, 0.35), rand(-0.6, 0.6)), lerp(3.6, 1.5, t) * rand(0.8, 1.3), (0.18 + 0.45 * t) * rand(0.6, 1));
  }
  for (const n of carMesh.nozzles) for (let i = 0; i < 4; i++) { const p = n.clone(); carMesh.localToWorld(p); p.add(new THREE.Vector3(rand(-0.8, 0.2), rand(-0.3, 0.6), rand(-0.4, 0.4))); puffAt(p, rand(0.9, 1.8), 0.7); }
  for (let i = 0; i < 7; i++) puffAt(new THREE.Vector3(rand(-30, 30), rand(4, 18), -25), rand(14, 26), 0.035); // stage haze
  camera.fov = 38; camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  camera.position.set(-1.5, 6.2, 30); camera.lookAt(-1.5, 6.0, 0);
  viewScene = st;
}
requestAnimationFrame(frame);

// debug hook for automated playtesting
window.__game = {
  car, game, obstacles: () => obstacles, keys, pressed, startGame, setPaused, AU, get state() { return state; },
  poojaStep(sec) { for (let t = 0; t < sec && pooja; t += 1 / 60) updatePooja(1 / 60); renderer.render(scene, camera); return pooja ? pooja.step : 'done'; },
  // fast-forward the sim: ctl(t) may set keys/pressed each tick
  sim(sec, ctl) { const dt = 1 / 60; for (let t = 0; t < sec && state === 'playing'; t += dt) { ctl && ctl(t); update(dt); syncVisuals(dt); updateParticles(dt); for (const k in pressed) pressed[k] = false; } updateHUD(1); renderer.render(scene, camera); return { s: +car.s.toFixed(1), x: +car.x.toFixed(2), y: +car.y.toFixed(2), speed: +car.speed.toFixed(1), air: +car.air.toFixed(0), clock: fmtClock(game.clock), state, crashes: game.crashes, swag: Math.round(game.swag) }; },
};

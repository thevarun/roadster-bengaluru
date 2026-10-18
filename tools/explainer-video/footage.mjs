// Footage for the explainer: headless Chrome + DevTools protocol + virtual time, teaching overlays from ov.js.
// Usage: node footage.mjs <clip,clip|all> [secondsOverride]
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';

const DIR = new URL('.', import.meta.url).pathname;
const PORT = 9231, FPS = 30, W = 1280, H = 720, URL_ = 'http://localhost:8742/';
const OV = readFileSync(DIR + 'ov.js', 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// each clip: seconds, tick (game ms advanced per captured frame; <33 = slow motion), setup + per-frame page JS
const CLIPS = {
  hook: { sec: 22, setup: `g.car.s = 860; g.car.x = 1.2; g.car.speed = 34; g.game.nextSpawn = 880;`,
    frame: (i) => `__ov.bot(); ${i >= 20 && i < 150 ? 'g.keys.hop = true;' : ''} ${i === 20 ? 'g.pressed.hop = true;' : ''} ${i === 60 ? 'g.pressed.roll = true;' : ''}` },
  wire: { sec: 20, setup: `g.car.s = 300; g.game.nextSpawn = 320;`,
    frame: (i) => `__ov.bot(); ${i === 60 ? "__ov.wire(true); __ov.setLabel('<b>Wireframe</b> · boxes, cylinders, spheres');" : ''}` },
  overhead: { sec: 40, setup: `g.car.s = 2050; g.game.nextSpawn = 2070; __ov.noFog = true; __ov.lines = false;`,
    frame: (i) => {
      const t = Math.min(1, i / 150), e = t * t * (3 - 2 * t); // ease from chase view up to the map view over 5 s
      return `__ov.bot(); __ov.lines = ${i > 160}; __ov.boxes = ${i > 160};
        __ov.cam = (c, car) => { const e = ${e.toFixed(4)}; const z = -car.s;
          c.up.set(-e, 1 - e, 0).normalize(); c.fov = 62 - e * 12;
          c.position.set(car.x * (1 - e), 3 + e * 172, z + 9 * (1 - e) - 100 * e);
          c.lookAt(car.x * (1 - e), 0.5 * (1 - e), z - 20 - 80 * e); };
        ${i === 160 ? "__ov.setLabel('<b>Top-down</b> · only nearby traffic exists');" : ''}`;
    } },
  physics: { sec: 34, setup: `g.car.s = 420; g.game.nextSpawn = 440; __ov.readout = true;
      __ov.cam = (c, car) => { c.fov = 74; c.position.set(car.x + 16, 4.2, -car.s + 2); c.lookAt(car.x, 3.4, -car.s - 1); };`,
    frame: (i) => {
      const s = i / FPS; const hold = (s > 7 && s < 12) || (s > 19 && s < 24.5);
      const tap = [1, 3.5, 7, 15, 19].some(t => Math.abs(s - t) < 0.02);
      return `__ov.clearAhead(-20, 40); __ov.bot({ noHop: true }); g.keys.hop = ${hold}; ${tap ? 'g.pressed.hop = true;' : ''}`;
    } },
  boxes: { sec: 12, tick: 20, setup: `g.car.s = 600; g.game.nextSpawn = 620; __ov.boxes = true; __ov.setLabel('<b>Collision boxes</b> · <span style="color:#ffd23f">nearby</span> · <span style="color:#ff4d5e">overlap</span> · <span style="color:#7CFC9A">cleared</span>');
      __ov.cam = (c, car) => { c.position.set(car.x + 5, 6.5, -car.s + 11); c.lookAt(car.x, 0.8, -car.s - 12); };`,
    frame: (i) => `__ov.bot({ reach: 13 });` },
  roofhop: { sec: 16, tick: 22, setup: `g.car.s = 520; g.car.speed = 34; g.game.nextSpawn = 540; __ov.clearAhead(-20, 70); __ov.boxes = true;
      __ov.cam = (c, car) => { c.position.set(car.x + 8, 6, -car.s + 9); c.lookAt(car.x, 2, -car.s - 7); };`,
    frame: (i) => {
      const k = i % 240; // one roof hop every ~8 captured seconds
      let js = `g.keys.left = g.keys.right = false; ${i > 0 ? '__ov.clearAhead(-8, 70, window.__b);' : ''}`;
      if (k === 1) js += `__ov.clearAhead(-6, 70); (__ov.place('bus', 34, g.car.x) || __ov.place('tanker', 34, g.car.x));
        window.__b = g.obstacles().find(q => (q.kind === 'bus' || q.kind === 'tanker') && Math.abs(-q.z - g.car.s - 34) < 1); if (__b) { __b.vz = 21; __b.ai && (__b.ai.t = 99); }`;
      js += `if (window.__b) { const dz = -__b.z - g.car.s; if (dz < 19 && dz > 15 && g.car.onGround) g.pressed.hop = true; g.keys.hop = dz > __b.d / 2 - 1.5 && dz < 19; } else g.keys.hop = false;`;
      return js;
    } },
  crash: { sec: 18, setup: `g.car.s = 700; g.game.nextSpawn = 720; __ov.clearAhead(-10, 80);`,
    frame: (i) => {
      const k = i % 180; let js = `g.keys.hop = false; g.keys.left = g.keys.right = false;`;
      if (k === 15) js += `__ov.place(${i < 180 ? "'auto'" : i < 360 ? "'car'" : "'auto'"}, 30, g.car.x);`;
      if (k === 120) js += `__ov.clearAhead(-10, 80);`;
      return js;
    } },
};

const only = process.argv[2] === 'all' || !process.argv[2] ? Object.keys(CLIPS) : process.argv[2].split(',');
const secOverride = +process.argv[3] || 0;

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${DIR}profile-${Date.now()}`, '--hide-scrollbars',
  '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--force-device-scale-factor=1', `--window-size=${W},${H}`,
  '--mute-audio', 'about:blank'], { stdio: 'ignore' });
let ws, id = 0; const pending = new Map(), waiters = [];
async function connect() {
  for (let i = 0; i < 50; i++) {
    try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); const p = l.find(t => t.type === 'page'); if (p) return p.webSocketDebuggerUrl; } catch (e) {}
    await sleep(200);
  }
  throw new Error('chrome did not start');
}
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const once = (method) => new Promise(res => waiters.push({ method, res }));
const to = (p, ms, l) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error('timeout: ' + l)), ms))]);
const ev = async (expr) => { const r = await to(send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }), 20000, 'eval'); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 500)); return r.result.value; };
async function advance(ms) { const p = once('Emulation.virtualTimeBudgetExpired'); await to(send('Emulation.setVirtualTimePolicy', { policy: 'advance', budget: ms }), 20000, 'policy'); await to(p, 20000, 'budget'); }

(async () => {
  ws = new WebSocket(await connect());
  await new Promise(r => ws.addEventListener('open', r));
  ws.addEventListener('message', (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); }
    else if (d.method) for (let i = waiters.length - 1; i >= 0; i--) if (waiters[i].method === d.method) waiters.splice(i, 1)[0].res(d.params);
  });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    try { localStorage.removeItem('rb-car'); localStorage.setItem('rb-muted', '1'); } catch (e) {}
    window.__noAutoPause = true; window.__rafQ = []; window.requestAnimationFrame = (cb) => { window.__rafQ.push(cb); return 0; };
    window.__tick = (ms) => { window.__t = (window.__t || performance.now()) + ms; const q = window.__rafQ; window.__rafQ = []; for (const cb of q) cb(window.__t); return 1; };` });

  for (const name of only) {
    const C = CLIPS[name], OUT = DIR + 'clips/' + name; mkdirSync(OUT, { recursive: true });
    await send('Emulation.setVirtualTimePolicy', { policy: 'pause' });
    await send('Page.navigate', { url: URL_ });
    await advance(3500);
    for (let k = 0; k < 60 && !(await ev('!!window.__game')); k++) { await sleep(500); await advance(200); }
    for (let i = 0; i < 10; i++) { await ev('__tick(33.333)'); await advance(33.333); }
    await ev(OV);
    await ev(`(() => { const g = __game; g.AU.setMuted(true, false); g.startGame(); g.game.events = []; g.game.lateMsgs = []; ${C.setup}
      document.getElementById('toasts').innerHTML = ''; window.g = g; return 1; })()`);
    const n = Math.round((secOverride || C.sec) * FPS), tick = C.tick || 1000 / FPS;
    for (let i = 0; i < n; i++) {
      await ev(C.frame(i) + '; 1');
      await ev(`__tick(${tick})`); await advance(1000 / FPS);
      let r; for (let a = 0; a < 6 && !r; a++) { try { r = await to(send('Page.captureScreenshot', { format: 'jpeg', quality: 90 }), 4000, 'shot'); } catch (e) { console.log('shot retry', name, i, a); await advance(16); } }
      if (!r) throw new Error('screenshot stuck');
      writeFileSync(`${OUT}/f${String(i).padStart(4, '0')}.jpg`, Buffer.from(r.data, 'base64'));
      if (i % 60 === 0) console.log(name, i, '/', n, JSON.stringify(await ev(`({s: g.car.s|0, y: +g.car.y.toFixed(1), st: g.state, cr: g.game.crashes, roof: g.game.roofHops, n: g.obstacles().length})`)));
    }
  }
  ws.close(); chrome.kill(); process.exit(0);
})().catch(e => { console.error(e); chrome.kill(); process.exit(1); });

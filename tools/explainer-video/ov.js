// Page-side teaching overlays for the explainer captures. Evaluated after the game loads.
(() => {
  const G = __game, T = G.THREE, scene = G.scene, cam = G.camera, renderer = G.renderer;
  const ov = window.__ov = { cam: null, boxes: false, readout: false, lines: false, label: '', graph: [] };

  // ---------- DOM layer
  const css = document.createElement('style');
  css.textContent = `
  #xv{position:fixed;inset:0;pointer-events:none;z-index:99999;font-family:-apple-system,'SF Pro Display','Helvetica Neue',sans-serif;color:#fff}
  #xvLabel{position:absolute;left:28px;bottom:26px;padding:8px 14px;border-radius:10px;background:rgba(10,12,16,.72);font:600 15px/1 -apple-system,sans-serif;letter-spacing:.14em;text-transform:uppercase;display:none}
  #xvLabel b{color:#f5a623;font-weight:700}
  #xvRead{position:absolute;right:28px;top:170px;width:300px;padding:16px 18px;border-radius:14px;background:rgba(10,12,16,.78);display:none;font:500 15px/1.5 'SF Mono',Menlo,monospace}
  #xvRead .k{color:#9aa4b2} #xvRead .v{float:right;color:#fff;font-weight:700}
  #xvRead .bar{height:8px;border-radius:4px;background:#2a2f38;margin:4px 0 10px;overflow:hidden} #xvRead .bar i{display:block;height:100%;background:#7fd3ff}
  #xvRead canvas{display:block;margin-top:8px}
  .xvTag{position:absolute;transform:translate(-50%,-100%);padding:4px 9px;border-radius:6px;font:700 13px/1.2 -apple-system,sans-serif;letter-spacing:.06em;white-space:nowrap}`;
  document.head.appendChild(css);
  const root = document.createElement('div'); root.id = 'xv';
  root.innerHTML = `<div id="xvLabel"></div><div id="xvRead"></div>`;
  document.body.appendChild(root);
  const tags = {};
  function tag(id, text, bg, x, y, align = -50, valign = -100) {
    let el = tags[id]; if (!el) { el = tags[id] = document.createElement('div'); el.className = 'xvTag'; root.appendChild(el); }
    el.textContent = text; el.style.background = bg; el.style.color = bg === '#f5a623' || bg === '#7CFC9A' ? '#111' : '#fff';
    el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.transform = `translate(${align}%,${valign}%)`; el.style.display = 'block';
  }
  const hideTags = () => { for (const k in tags) tags[k].style.display = 'none'; };
  const toScreen = (v) => { const p = v.clone().project(cam); return [(p.x + 1) / 2 * innerWidth, (1 - p.y) / 2 * innerHeight, p.z < 1]; };

  // ---------- 3D helpers (one pool of wire boxes, reused every frame)
  const boxGeo = new T.BoxGeometry(1, 1, 1), edges = new T.EdgesGeometry(boxGeo);
  const pool = [];
  function wireBox(i, color) {
    let m = pool[i];
    if (!m) { m = pool[i] = new T.LineSegments(edges, new T.LineBasicMaterial({ color, depthTest: false, transparent: true })); m.renderOrder = 999; scene.add(m); }
    m.material.color.set(color); m.visible = true; return m;
  }
  const lineMat = (c) => new T.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.85, depthTest: false });
  const spawnLine = new T.Mesh(new T.BoxGeometry(40, 0.2, 1.2), lineMat(0x7CFC9A)); spawnLine.renderOrder = 998;
  const killLine = new T.Mesh(new T.BoxGeometry(40, 0.2, 1.2), lineMat(0xff4d5e)); killLine.renderOrder = 998;
  const roadBox = new T.LineSegments(edges, new T.LineBasicMaterial({ color: 0xf5a623, depthTest: false })); roadBox.renderOrder = 999;
  scene.add(spawnLine, killLine, roadBox);

  ov.wire = (on) => scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if ('wireframe' in m && !(m instanceof T.LineBasicMaterial)) m.wireframe = on; }); });

  function drawBoxes() {
    const c = G.car, obs = G.obstacles(); let n = 0;
    if (ov.boxes) {
      for (const o of obs) {
        if (o.flat || o.kind === 'gate' || o.kind === 'foam') continue;
        const dz = -o.z - c.s; if (dz < -12 || dz > 90) continue;
        const ox = (0.95 + o.w / 2) - Math.abs(c.x - o.x), oz = (2.25 + o.d / 2) - Math.abs(-c.s - o.z);
        const overlap = ox > 0 && oz > 0, above = c.y >= o.h - 0.05;
        const col = overlap ? (above ? 0x7CFC9A : 0xff4d5e) : 0xffd23f;
        const m = wireBox(n++, col); m.position.set(o.x, o.h / 2, o.z); m.scale.set(o.w, o.h, o.d);
      }
      const m = wireBox(n++, 0x5ad1ff); m.position.set(c.x, c.y + 0.6, -c.s); m.scale.set(1.9, 1.2, 4.5);
    }
    for (let i = n; i < pool.length; i++) pool[i].visible = false;
  }

  // ---------- readout (physics clip)
  const gc = document.createElement('canvas'); gc.width = 264; gc.height = 90;
  function drawReadout() {
    const el = document.getElementById('xvRead');
    if (!ov.readout) { el.style.display = 'none'; return; }
    const c = G.car; el.style.display = 'block';
    ov.graph.push(c.y); if (ov.graph.length > 132) ov.graph.shift();
    el.innerHTML = `<div><span class="k">gravity</span><span class="v">−30 m/s²</span></div>
      <div><span class="k">y · height</span><span class="v">${c.y.toFixed(2)} m</span></div>
      <div><span class="k">vy · up-speed</span><span class="v">${(c.vy >= 0 ? '+' : '') + c.vy.toFixed(1)} m/s</span></div>
      <div><span class="k">air · cold gas</span><span class="v">${Math.round(c.air)}%</span></div><div class="bar"><i style="width:${c.air}%"></i></div>
      <div class="k">height over time</div>`;
    const x = gc.getContext('2d'); x.clearRect(0, 0, 264, 90); x.strokeStyle = '#2a2f38'; x.beginPath(); x.moveTo(0, 86); x.lineTo(264, 86); x.stroke();
    x.strokeStyle = '#f5a623'; x.lineWidth = 2.5; x.beginPath();
    ov.graph.forEach((y, i) => { const px = i * 2, py = 86 - y * 11; i ? x.lineTo(px, py) : x.moveTo(px, py); }); x.stroke();
    el.appendChild(gc);
  }

  // ---------- render hook: optional camera override, restored after drawing
  const R = renderer.render.bind(renderer);
  renderer.render = (s, c) => {
    if (s !== scene) return R(s, c);
    drawBoxes();
    const showLines = ov.lines; spawnLine.visible = killLine.visible = roadBox.visible = showLines;
    if (showLines) {
      const z = -G.car.s; spawnLine.position.set(0, 0.3, z - 230); killLine.position.set(0, 0.3, z + 30);
      roadBox.position.set(0, 0.2, z - 100); roadBox.scale.set(16, 0.4, 400);
    }
    if (!ov.cam) { hideTags(); R(s, c); drawReadout(); return; }
    const save = { p: c.position.clone(), q: c.quaternion.clone(), up: c.up.clone(), fov: c.fov, fog: s.fog };
    ov.cam(c, G.car); c.updateProjectionMatrix(); c.updateMatrixWorld();
    if (ov.noFog) s.fog = null;
    R(s, c);
    hideTags();
    if (showLines) {
      const z = -G.car.s;
      let [x, y, ok] = toScreen(new T.Vector3(-9, 0, z - 230)); if (ok) tag('sp', 'SPAWN · 230 m ahead', '#7CFC9A', x - 6, y, -100);
      [x, y, ok] = toScreen(new T.Vector3(9, 0, z + 30)); if (ok) tag('kl', 'DELETE · 30 m behind', '#ff4d5e', x + 6, y, 0, 0);
      [x, y, ok] = toScreen(new T.Vector3(G.car.x, 3, z)); if (ok) tag('car', 'YOU', '#5ad1ff', x, y - 6);
    }
    s.fog = save.fog; c.position.copy(save.p); c.quaternion.copy(save.q); c.up.copy(save.up); c.fov = save.fov; c.updateProjectionMatrix();
    drawReadout();
  };

  ov.setLabel = (html) => { const el = document.getElementById('xvLabel'); el.innerHTML = html; el.style.display = html ? 'block' : 'none'; };

  // ---------- simple autopilot: steer to the emptiest lane, hop/hover over whatever is in the way
  ov.bot = (o = {}) => {
    const c = G.car, obs = G.obstacles(), k = G.keys, p = G.pressed;
    const blocking = (x, far) => obs.filter(q => { const dz = -q.z - c.s; return dz > 0 && dz < far && !q.flat && q.kind !== 'gate' && q.kind !== 'foam' && Math.abs(q.x - x) < q.w / 2 + 1.25; });
    let best = c.x, bestCost = 1e9;
    for (const x of [-6, -3.5, -1, 1.5, 4, 6.5]) { const cost = blocking(x, 45).length * 10 + Math.abs(x - c.x) * 0.6; if (cost < bestCost) { bestCost = cost; best = x; } }
    k.left = best < c.x - 0.4; k.right = best > c.x + 0.4;
    const threat = blocking(c.x, o.reach || 16).length > 0;
    if (o.noHop) { k.hop = false; return; }
    if (threat && c.onGround && c.air > 20) p.hop = true;
    k.hop = threat && c.air > 5;
  };
  ov.clearAhead = (from, to, keep) => { const c = G.car, obs = G.obstacles(); for (let i = obs.length - 1; i >= 0; i--) { const dz = -obs[i].z - c.s; if (dz > from && dz < to && !obs[i].flat && obs[i] !== keep && Math.abs(obs[i].x - c.x) < 9) { scene.remove(obs[i].mesh); obs.splice(i, 1); } } };
  ov.place = (kind, ahead, x) => { // move the nearest vehicle of a kind to a spot just ahead of the car
    const c = G.car, o = G.obstacles().filter(q => q.kind === kind).sort((a, b) => Math.abs(-a.z - c.s - ahead) - Math.abs(-b.z - c.s - ahead))[0];
    if (!o) return false; o.x = x ?? c.x; o.z = -c.s - ahead; o.cleared = false; if (o.ai) o.ai.tx = o.x; o.mesh.position.set(o.x, o.mesh.position.y, o.z); return true;
  };
  return 1;
})();

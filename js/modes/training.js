// מצב אימון: מטווח (עומדות → זזות), בוטים קל/בינוני/קשה, מסך תוצאות + שיא לכל נשק (localStorage).
// מצלמת גוף שלישי מעל הכתף, הבובה מ-models/mannequin.js + Animator, נשקים זמניים מ-animlab.js.
import * as THREE from 'three';
import { Animator } from '../core/anim.js';
import { buildMannequin } from '../models/mannequin.js';
import { buildKnife } from '../models/knife.js';
import { buildWeapon } from '../models/weapons.js';
import { buildCharacter } from '../models/character.js';
import { weapon as W } from '../data/weapons.js';
import { createControls, isTouch } from '../core/controls.js';
import { createHud } from '../core/hud.js';
import { addCoins } from '../store.js';

const V3 = THREE.Vector3;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const rnd = (a, b) => a + Math.random() * (b - a);
const ease = (t) => t * t * (3 - 2 * t);
const GRAV = 16, JUMP = 6.2, WALK = 4.2, RUN = 6.5, PR = 0.35;
const LOADOUT = ['knife', 'pistol', 'rifle'];
const MAKE = { knife: () => buildKnife('default'), pistol: () => buildWeapon('pistol', 'default'), rifle: () => buildWeapon('rifle', 'default') };
const RELOAD_T = 1.3;
const BEST_KEY = 's3d.train.best.v1';
const MODES = {
  range:  { he: 'מטווח', par: 60 },
  easy:   { he: 'בוטים · קל', par: 60 },
  medium: { he: 'בוטים · בינוני', par: 90 },
  hard:   { he: 'בוטים · קשה', par: 120 },
};
// רמות בוטים: react = זמן תגובה, acc = סיכוי פגיעה בסיסי, rof = זמן בין צרורות, burst = יריות בצרור
const BOT_LV = {
  easy:   { count: 3, hp: 70,  react: 0.9,  acc: 0.22, rof: 1.2,  burst: 1, dmg: 7, speed: 2.4, engage: [3, 6],   wait: [1.5, 3],   hurtCover: 0.3, gun: 'pistol', color: '#6b4a2a' },
  medium: { count: 4, hp: 100, react: 0.55, acc: 0.36, rof: 0.9,  burst: 2, dmg: 8, speed: 3.1, engage: [2.5, 5], wait: [1, 2.2],   hurtCover: 0.6, gun: 'rifle',  color: '#5a2a2a' },
  hard:   { count: 5, hp: 120, react: 0.3,  acc: 0.5,  rof: 0.75, burst: 3, dmg: 9, speed: 3.8, engage: [2, 4],   wait: [0.6, 1.4], hurtCover: 0.9, gun: 'rifle',  color: '#3a1630' },
};
const SPREAD = { knife: 0, pistol: 0.004, rifle: 0.006 };
const KICK = { pistol: 0.022, rifle: 0.011 };

// ---------- שיאים ----------
const loadBest = () => { try { return JSON.parse(localStorage.getItem(BEST_KEY)) || {}; } catch (_) { return {}; } };
const saveBest = (b) => { try { localStorage.setItem(BEST_KEY, JSON.stringify(b)); } catch (_) {} };

// ---------- חומרים וטקסטורות (פעם אחת) ----------
let MAT = null;
function canvasTex(w, h, draw, rep = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep);
  t.anisotropy = 4; return t;
}
function mats() {
  if (MAT) return MAT;
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, ...o });
  const ground = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#7d7a6c'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * 0.05})`; g.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
    g.strokeStyle = '#00000030'; g.lineWidth = 3; g.strokeRect(0, 0, w, h);
  }, 60);
  const crate = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#8b6b43'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#5b4228'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10);
    g.lineWidth = 8; g.beginPath(); g.moveTo(8, 8); g.lineTo(w - 8, h - 8); g.stroke();
    g.strokeStyle = '#00000025'; g.lineWidth = 2; for (let y = 24; y < h; y += 24) { g.beginPath(); g.moveTo(10, y); g.lineTo(w - 10, y); g.stroke(); }
  });
  const bull = canvasTex(128, 192, (g, w, h) => {
    g.fillStyle = '#ece6d3'; g.fillRect(0, 0, w, h);
    for (const [r, c] of [[56, '#c8382c'], [42, '#ece6d3'], [28, '#c8382c'], [14, '#ece6d3'], [6, '#c8382c']]) { g.fillStyle = c; g.beginPath(); g.arc(w / 2, h * 0.45, r, 0, 7); g.fill(); }
    g.strokeStyle = '#2b2b2b'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4);
  });
  const fx = (color) => new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  MAT = {
    ground: std({ map: ground }), crate: std({ map: crate }), concrete: std({ color: '#9aa0a6' }), wall: std({ color: '#6f7782' }),
    berm: std({ color: '#a38f6a' }), stripe: std({ color: '#e9e4d2' }), steel: std({ color: '#3a3f47', metalness: 0.5, roughness: 0.5 }),
    bull: std({ map: bull }), head: std({ color: '#c8382c' }), hit: new THREE.MeshBasicMaterial({ visible: false }),
    flash: fx('#ffcf6e'), tracer: '#ffd88a', botTracer: '#ff8a6e',
  };
  return MAT;
}

// ---------- גאומטריה: חיתוך קטע/תיבה ----------
function segBox(o, d, maxT, b) { // d מנורמל; מחזיר t ראשון או Infinity
  let t0 = 0, t1 = maxT;
  for (const k of ['x', 'y', 'z']) {
    if (Math.abs(d[k]) < 1e-9) { if (o[k] < b.min[k] || o[k] > b.max[k]) return Infinity; continue; }
    let a = (b.min[k] - o[k]) / d[k], c = (b.max[k] - o[k]) / d[k];
    if (a > c) { const s = a; a = c; c = s; }
    if (a > t0) t0 = a; if (c < t1) t1 = c; if (t0 > t1) return Infinity;
  }
  return t0;
}

const CSS = `
.s3t { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; padding:16px; pointer-events:auto;
  background:linear-gradient(180deg,#0b0d12aa,#0b0d12dd); overflow:auto; }
.s3t-card { width:min(560px,100%); max-height:100%; overflow:auto; background:#151922ee; border:1px solid #2a3142; border-radius:18px; padding:18px;
  display:flex; flex-direction:column; gap:10px; align-items:stretch; }
.s3t-card h2 { margin:0; font-size:28px; font-weight:900; text-align:center; }
.s3t-card .btn { width:100%; }
.s3t-row { display:flex; gap:8px; flex-wrap:wrap; justify-content:center; }
.s3t-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; }
.s3t-stat { background:#0b0d12; border-radius:12px; padding:8px; text-align:center; }
.s3t-stat b { display:block; font-size:22px; } .s3t-stat small { color:#8b95a7; font-size:12px; }
.s3t-tbl { width:100%; border-collapse:collapse; font-size:13px; text-align:center; }
.s3t-tbl th { color:#8b95a7; font-weight:400; padding:4px; } .s3t-tbl td { padding:5px 4px; border-top:1px solid #2a3142; }
.s3t-new { color:#ffb020; font-weight:900; }
.s3t-help { color:#8b95a7; font-size:12px; line-height:1.6; text-align:center; }
.s3t-pause { position:absolute; top:max(10px, env(safe-area-inset-top)); left:10px; pointer-events:auto; }
@media (max-width:420px) { .s3t-grid { grid-template-columns:repeat(2,1fr); } }
`;

export function startTraining(scene, camera, ui, back, renderer) {
  const M = mats();
  const touch = isTouch();
  // שמירת מצב הסצנה הראשית לשחזור
  const saved = { bg: scene.background, fog: scene.fog, fov: camera.fov, near: camera.near, far: camera.far, pr: renderer?.getPixelRatio() };
  scene.background = new THREE.Color('#a9c2d8');
  scene.fog = new THREE.Fog('#a9c2d8', 50, 150);
  camera.fov = 70; camera.near = 0.05; camera.far = 220; camera.updateProjectionMatrix();
  if (renderer && touch) renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);

  const root = new THREE.Group(); root.name = 'training'; scene.add(root);
  const world = new THREE.Group(); root.add(world);
  const sun = new THREE.DirectionalLight('#fff1d6', 1.3); sun.position.set(-20, 40, -12); root.add(sun);
  const flashLight = new THREE.PointLight('#ffc060', 0, 6, 2); root.add(flashLight);

  // ---------- שחקן ----------
  const rig = buildCharacter({ skin: 'default' }); root.add(rig.root);
  const an = rig.anim || new Animator(rig);
  const models = Object.fromEntries(LOADOUT.map((id) => [id, MAKE[id]()]));
  const P = { pos: new V3(), vel: new V3(), vy: 0, ground: true, yaw: 0, pitch: 0, hp: 100, w: 2, ammo: { pistol: 12, rifle: 30 }, reloadT: 0, cd: 0, bloom: 0, yawPrev: 0, speed: 0, aim: 0 };
  function equip(i) {
    if (i === P.w && an.weapon) return;
    P.w = i; const id = LOADOUT[i];
    an.setWeapon(models[id], id); P.reloadT = 0; P.cd = 0.35;
  }

  // ---------- עולם ----------
  let boxes = [], worldHits = [], geos = [], hitList = [], hitDirty = true;
  const addGeo = (g) => { geos.push(g); return g; };
  function clearWorld() {
    world.clear(); geos.forEach((g) => g.dispose()); geos = []; boxes = []; worldHits = []; hitDirty = true;
  }
  function addBox(x, z, w, h, d, mat, y0 = 0, collide = true) {
    const m = new THREE.Mesh(addGeo(new THREE.BoxGeometry(w, h, d)), mat);
    m.position.set(x, y0 + h / 2, z); world.add(m); worldHits.push(m);
    if (mat === M.crate) { const g = m.geometry, uv = g.attributes.uv; /* טקסטורה לפי גודל */ for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.max(1, Math.round(Math.max(w, d))), uv.getY(i) * Math.max(1, Math.round(h))); }
    if (collide) boxes.push({ min: new V3(x - w / 2, y0, z - d / 2), max: new V3(x + w / 2, y0 + h, z + d / 2), cover: h >= 1 && w < 8 && d < 8 });
    return m;
  }
  function addGround() {
    const g = new THREE.Mesh(addGeo(new THREE.PlaneGeometry(240, 240)), M.ground);
    g.rotation.x = -Math.PI / 2; world.add(g); worldHits.push(g);
  }
  function buildRange() {
    clearWorld(); addGround();
    addBox(-12.5, 21, 1, 3, 54, M.wall); addBox(12.5, 21, 1, 3, 54, M.wall);       // קירות צד
    addBox(0, 49, 26, 7, 4, M.berm);                                                // סוללה אחורית
    addBox(0, -6, 26, 3, 1, M.wall);                                                // קיר אחורי
    addBox(-6.5, 1.6, 11, 1.0, 0.5, M.concrete); addBox(6.5, 1.6, 11, 1.0, 0.5, M.concrete); // דלפק ירי עם מעבר באמצע
    for (const z of [10, 20, 30, 40]) {
      const s = new THREE.Mesh(addGeo(new THREE.PlaneGeometry(24, 0.25)), M.stripe); s.rotation.x = -Math.PI / 2; s.position.set(0, 0.01, z); world.add(s);
    }
    for (let i = -4; i <= 4; i++) addBox(i * 2.6, 47, 0.12, 4.5, 0.12, M.steel, 0, false); // עמודי רקע
  }
  function buildArena() {
    clearWorld(); addGround();
    addBox(0, 19, 38, 3.2, 1, M.wall); addBox(0, -19, 38, 3.2, 1, M.wall); addBox(19, 0, 1, 3.2, 38, M.wall); addBox(-19, 0, 1, 3.2, 38, M.wall);
    const C = M.crate, K = M.concrete;
    [[-8, -9, 2, 1.2, 2, C], [8, -9, 2, 1.2, 2, C], [0, -4, 5, 2.2, 1, K], [-12, 0, 1.5, 2.4, 4, K], [12, 0, 1.5, 2.4, 4, K],
     [-5, 4, 2, 1.1, 2, C], [5, 4, 2, 1.1, 2, C], [0, 9, 4, 2.2, 1, K], [-10, 10, 2, 2, 2, C], [10, 10, 2, 2, 2, C],
     [-4, 14, 2, 1.2, 1.5, C], [4, 14, 1.5, 1.2, 2, C], [-14, -13, 2.2, 1, 2.2, C], [14, -13, 2.2, 1, 2.2, C], [0, 15.5, 2, 2.2, 2, K]]
      .forEach(([x, z, w, h, d, m]) => addBox(x, z, w, h, d, m));
    addBox(-14, -13, 1.4, 1, 1.4, C, 1); // ערימה לטיפוס
  }
  // התנגשות עיגול/תיבות + קרקע (משותף לשחקן ולבוטים)
  function collide(pos, r, h = 1.75) {
    for (const b of boxes) {
      if (pos.y >= b.max.y - 0.05 || pos.y + h <= b.min.y) continue;
      const cx = clamp(pos.x, b.min.x, b.max.x), cz = clamp(pos.z, b.min.z, b.max.z);
      let dx = pos.x - cx, dz = pos.z - cz; const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) { const d = Math.sqrt(d2), k = (r - d) / d; pos.x += dx * k; pos.z += dz * k; }
      else { // בתוך התיבה – יוצאים בציר הקצר
        const ex = [b.min.x - r - pos.x, b.max.x + r - pos.x, b.min.z - r - pos.z, b.max.z + r - pos.z];
        let bi = 0; for (let i = 1; i < 4; i++) if (Math.abs(ex[i]) < Math.abs(ex[bi])) bi = i;
        if (bi < 2) pos.x += ex[bi]; else pos.z += ex[bi];
      }
    }
  }
  function groundAt(pos, r) {
    let g = 0;
    for (const b of boxes) if (pos.x > b.min.x - r * 0.5 && pos.x < b.max.x + r * 0.5 && pos.z > b.min.z - r * 0.5 && pos.z < b.max.z + r * 0.5 && pos.y >= b.max.y - 0.3) g = Math.max(g, b.max.y);
    return g;
  }
  const _sd = new V3();
  function blocked(a, b) {
    _sd.subVectors(b, a); const L = _sd.length(); if (L < 1e-6) return false; _sd.divideScalar(L);
    for (const bx of boxes) if (segBox(a, _sd, L, bx) < L) return true;
    return false;
  }
  function rayBoxes(o, d, maxT) { let t = maxT; for (const b of boxes) t = Math.min(t, segBox(o, d, t, b)); return t; }

  // ---------- אפקטים: הבזק, נותבים, פגיעות ----------
  const fxg = new THREE.Group(); root.add(fxg);
  const flashGeo = new THREE.PlaneGeometry(0.32, 0.32);
  const flashes = Array.from({ length: 8 }, () => {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(flashGeo, M.flash); m.rotation.set(i === 0 ? 0 : Math.PI / 2, i === 2 ? Math.PI / 2 : 0, 0); g.add(m); }
    g.visible = false; fxg.add(g); return { g, life: 0 };
  });
  const tracerGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, -0.5);
  const tracers = Array.from({ length: 28 }, () => {
    const mat = new THREE.MeshBasicMaterial({ color: M.tracer, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const m = new THREE.Mesh(tracerGeo, mat); m.visible = false; fxg.add(m);
    return { m, a: new V3(), b: new V3(), dir: new V3(), L: 0, age: 0, life: 0 };
  });
  const puffGeo = new THREE.SphereGeometry(1, 6, 4);
  const puffs = Array.from({ length: 20 }, () => {
    const mat = new THREE.MeshBasicMaterial({ color: '#d9cfb8', transparent: true, depthWrite: false });
    const m = new THREE.Mesh(puffGeo, mat); m.visible = false; fxg.add(m); return { m, age: 0, life: 0 };
  });
  let fi = 0, ti = 0, pi = 0;
  function flash(at, player) {
    const f = flashes[fi++ % flashes.length]; f.g.position.copy(at); f.g.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    f.g.scale.setScalar(rnd(0.7, 1.2)); f.g.visible = true; f.life = 0.05;
    if (player) { flashLight.position.copy(at); flashLight.intensity = 6; }
  }
  function tracer(a, b, color) {
    const t = tracers[ti++ % tracers.length]; t.a.copy(a); t.b.copy(b); t.dir.subVectors(b, a); t.L = t.dir.length(); t.dir.divideScalar(t.L || 1);
    t.age = 0; t.life = t.L / 260 + 0.04; t.m.material.color.set(color); t.m.material.opacity = 1; t.m.visible = true;
  }
  function puff(at, color = '#d9cfb8', size = 0.08) {
    const p = puffs[pi++ % puffs.length]; p.m.position.copy(at); p.m.material.color.set(color); p.size = size; p.age = 0; p.life = 0.3; p.m.visible = true;
  }
  const _h = new V3(), _tl = new V3();
  function updateFx(dt) {
    for (const f of flashes) if (f.g.visible && (f.life -= dt) <= 0) f.g.visible = false;
    flashLight.intensity = Math.max(0, flashLight.intensity - dt * 120);
    for (const t of tracers) {
      if (!t.m.visible) continue;
      t.age += dt;
      if (t.age >= t.life) { t.m.visible = false; continue; }
      const head = Math.min(t.L, t.age * 260), tail = Math.max(0, head - 5);
      _h.copy(t.a).addScaledVector(t.dir, head); _tl.copy(t.a).addScaledVector(t.dir, tail);
      t.m.position.copy(_h); t.m.lookAt(_tl);
      t.m.scale.set(0.022, 0.022, Math.max(0.05, head - tail));
      t.m.material.opacity = head >= t.L ? 0.4 : 1;
    }
    for (const p of puffs) {
      if (!p.m.visible) continue;
      p.age += dt; const k = p.age / p.life;
      if (k >= 1) { p.m.visible = false; continue; }
      p.m.scale.setScalar(p.size * (1 + k * 2)); p.m.material.opacity = 0.8 * (1 - k);
    }
  }

  // ---------- מטרות ----------
  const tgtGeo = { post: new THREE.BoxGeometry(0.07, 0.75, 0.07), body: new THREE.BoxGeometry(0.55, 0.8, 0.05), neck: new THREE.BoxGeometry(0.1, 0.1, 0.04),
    head: new THREE.CylinderGeometry(0.14, 0.14, 0.05, 20).rotateX(Math.PI / 2), base: new THREE.BoxGeometry(0.5, 0.08, 0.3) };
  let targets = [];
  function makeTarget(x, z, move = null) {
    const g = new THREE.Group(); g.position.set(x, 0, z); world.add(g);
    const base = new THREE.Mesh(tgtGeo.base, M.steel); base.position.y = 0.04; g.add(base);
    const pivot = new THREE.Group(); pivot.position.y = 0.08; g.add(pivot);
    const post = new THREE.Mesh(tgtGeo.post, M.steel); post.position.y = 0.375; pivot.add(post);
    const body = new THREE.Mesh(tgtGeo.body, M.bull); body.position.y = 1.15; pivot.add(body);
    const neck = new THREE.Mesh(tgtGeo.neck, M.steel); neck.position.y = 1.58; pivot.add(neck);
    const head = new THREE.Mesh(tgtGeo.head, M.head); head.position.y = 1.75; pivot.add(head);
    const t = { kind: 'target', g, pivot, alive: true, fall: 0, rise: 0, move, x0: x, hit: [body, head] };
    body.userData = { ent: t, zone: 'body' }; head.userData = { ent: t, zone: 'head' };
    targets.push(t); hitDirty = true; return t;
  }
  const STATIC = [[-6, 10], [-2, 14], [3, 12], [7, 18], [-4, 22], [1, 26], [6, 30], [-7, 33]];
  const MOVING = [[12, 2.4], [20, 3.2], [28, 4.2], [16, 3.6], [24, 4.8], [32, 5.5]]; // [z, מהירות]
  let movingSpawned = 0;
  function spawnMoving() {
    const [z, sp] = MOVING[movingSpawned++];
    makeTarget(0, z, { amp: rnd(5, 8.5), w: sp / 7, ph: Math.random() * 6 });
  }

  // ---------- בוטים ----------
  let bots = [];
  const botBodyGeo = new THREE.BoxGeometry(0.5, 1.3, 0.36), botHeadGeo = new THREE.SphereGeometry(0.15, 10, 8);
  function makeBot(x, z, lv) {
    const L = BOT_LV[lv];
    const r = buildMannequin({ hoodie: L.color, vest: '#2a2d24', pants: '#3a3d44', mask: '#0a0a0a' });
    world.add(r.root);
    const a = new Animator(r); const gun = MAKE[L.gun](); a.setWeapon(gun, L.gun);
    const body = new THREE.Mesh(botBodyGeo, M.hit); body.position.y = 0.85; r.root.add(body);
    const head = new THREE.Mesh(botHeadGeo, M.hit); head.position.y = 0.1; r.j.head.add(head);
    const b = { kind: 'bot', rig: r, an: a, gun, L, pos: new V3(x, 0, z), vel: new V3(), yaw: Math.PI, yawPrev: Math.PI, hp: L.hp, alive: true,
      state: 'engage', st: rnd(...L.engage), seeT: 0, lostT: 0, fireT: rnd(0.5, 1.5), burst: 0, burstT: 0, strafe: Math.random() < 0.5 ? 1 : -1, strafeT: 1,
      goal: null, spot: null, deadT: 0, hit: [body, head] };
    body.userData = { ent: b, zone: 'body' }; head.userData = { ent: b, zone: 'head' };
    bots.push(b); hitDirty = true; return b;
  }
  function coverSpots() {
    const out = [];
    for (const b of boxes) {
      if (!b.cover) continue;
      const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2, hx = (b.max.x - b.min.x) / 2 + 0.6, hz = (b.max.z - b.min.z) / 2 + 0.6;
      out.push(new V3(cx + hx, 0, cz), new V3(cx - hx, 0, cz), new V3(cx, 0, cz + hz), new V3(cx, 0, cz - hz));
    }
    return out.filter((p) => Math.abs(p.x) < 18 && Math.abs(p.z) < 18);
  }
  let spots = [];
  const _eye = new V3(), _pc = new V3(), _ph = new V3(), _sp = new V3();
  function pickCover(b) {
    _pc.copy(P.pos).y += 1.5;
    let best = null, bs = Infinity;
    for (const s of spots) {
      if (bots.some((o) => o !== b && o.alive && o.spot === s)) continue;
      _sp.copy(s).y = 1.3;
      if (!blocked(_pc, _sp)) continue; // לא מוסתר מהשחקן
      const dp = s.distanceTo(P.pos);
      const score = s.distanceTo(b.pos) + (dp < 6 ? 20 : 0) + Math.abs(dp - 13) * 0.3;
      if (score < bs) { bs = score; best = s; }
    }
    return best;
  }

  // ---------- סטטיסטיקה ----------
  let stats;
  const newStats = () => ({ shots: 0, hits: 0, heads: 0, kills: 0, w: Object.fromEntries(LOADOUT.map((id) => [id, { shots: 0, hits: 0, heads: 0 }])) });
  const shot = (id) => { stats.shots++; stats.w[id].shots++; };
  const hitStat = (id, head) => { stats.hits++; stats.w[id].hits++; if (head) { stats.heads++; stats.w[id].heads++; } };

  // ---------- מצב ----------
  const st = { dying: false, mode: 'lobby', run: null, start: 'rifle', time: 0, count: 0, phase: 0, paused: false, lobbyT: 0, result: null };
  let ctl = null, hud = null;
  const layer = document.createElement('div'); layer.style.cssText = 'position:absolute;inset:0;pointer-events:none';
  ui.innerHTML = ''; ui.appendChild(layer);
  let screen = null;
  const setScreen = (html) => {
    if (screen) screen.remove(); screen = null;
    if (!html) return null;
    screen = document.createElement('div'); screen.className = 's3t'; screen.innerHTML = html; ui.appendChild(screen); return screen;
  };

  function resetPlayer(x, z, yaw) {
    P.pos.set(x, 0, z); P.vel.set(0, 0, 0); P.vy = 0; P.yaw = P.yawPrev = yaw; P.pitch = 0; P.hp = 100;
    P.ammo.pistol = W('pistol').mag; P.ammo.rifle = W('rifle').mag; P.reloadT = 0; P.bloom = 0;
    P.w = -1; equip(LOADOUT.indexOf(st.start));
  }

  function lobby() {
    st.mode = 'lobby'; st.paused = false;
    disposeRun();
    buildRange(); targets = []; bots = [];
    STATIC.slice(0, 5).forEach(([x, z]) => makeTarget(x, z));
    resetPlayer(0, -1, 0);
    const best = loadBest();
    const wch = (id) => `<button class="chip ${st.start === id ? 'on' : ''}" data-w="${id}">${{ knife: '🔪', pistol: '🔫', rifle: '🎯' }[id]} ${W(id).he}</button>`;
    const cell = (id, m) => { const b = best[id]?.[m]; return b ? `<b>${b.score}</b><br><small style="color:#8b95a7">${Math.round(b.acc * 100)}% · ${b.time.toFixed(1)}ש׳</small>` : '<small style="color:#8b95a7">—</small>'; };
    const s = setScreen(`<div class="s3t-card">
      <h2>🎯 אימון</h2>
      <div class="s3t-row">${LOADOUT.map(wch).join('')}</div>
      <button class="btn" data-run="range">🎯 מטווח <small>מטרות עומדות ← זזות</small></button>
      <button class="btn" data-run="easy">🟢 בוטים · קל <small>3 יריבים</small></button>
      <button class="btn" data-run="medium">🟠 בוטים · בינוני <small>4 יריבים</small></button>
      <button class="btn" data-run="hard">🔴 בוטים · קשה <small>5 יריבים</small></button>
      <table class="s3t-tbl"><tr><th>🏆 שיאים</th>${Object.values(MODES).map((m) => `<th>${m.he}</th>`).join('')}</tr>
        ${LOADOUT.map((id) => `<tr><td>${W(id).he}</td>${Object.keys(MODES).map((m) => `<td>${cell(id, m)}</td>`).join('')}</tr>`).join('')}</table>
      <div class="s3t-help">${touch ? 'ג׳ויסטיק שמאלי = תנועה · גרירה בצד ימין = כיוון · כפתורים: ירי, קפיצה, טעינה, החלפה'
        : 'WASD תנועה · Shift ריצה · עכבר כיוון · קליק ירי · קליק ימני כוונת · R טעינה · 1/2/3 או Q נשק · רווח קפיצה · Esc הפסקה'}</div>
      <button class="btn" id="tback">→ חזרה לתפריט</button>
    </div>`);
    s.querySelectorAll('[data-w]').forEach((b) => (b.onclick = () => { st.start = b.dataset.w; equip(LOADOUT.indexOf(st.start)); lobby(); }));
    s.querySelectorAll('[data-run]').forEach((b) => (b.onclick = () => begin(b.dataset.run)));
    s.querySelector('#tback').onclick = exit;
  }

  function begin(mode) {
    disposeRun();
    st.run = mode; st.mode = 'run'; st.dying = false; st.runId = (st.runId || 0) + 1; st.time = 0; st.count = 3; st.phase = 1; st.paused = false; stats = newStats();
    targets = []; bots = []; movingSpawned = 0;
    if (mode === 'range') {
      buildRange(); STATIC.forEach(([x, z]) => makeTarget(x, z)); resetPlayer(0, -1, 0);
    } else {
      buildArena(); spots = coverSpots(); resetPlayer(0, -16, 0);
      const L = BOT_LV[mode];
      for (let i = 0; i < L.count; i++) makeBot(-10 + (20 * i) / Math.max(1, L.count - 1) + rnd(-1, 1), rnd(11, 16), mode);
    }
    setScreen(null);
    hud = createHud(layer);
    ctl = createControls({ ui: layer, canvas: renderer?.domElement || document.querySelector('canvas') });
    const pb = document.createElement('button'); pb.className = 'chip s3t-pause'; pb.textContent = 'II'; pb.onclick = () => pause(true); layer.appendChild(pb);
    ctl.lock();
    hud.setHp(P.hp);
  }

  function disposeRun() {
    ctl?.dispose(); ctl = null; hud?.dispose(); hud = null; layer.innerHTML = '';
    bots.forEach((b) => world.remove(b.rig.root)); bots = [];
  }

  const later = (fn, ms) => { const id = st.runId; setTimeout(() => { if (T.active && st.mode === 'run' && st.runId === id) fn(); }, ms); };
  function pause(on) {
    if (st.mode !== 'run') return;
    st.paused = on;
    if (!on) { setScreen(null); ctl.enabled = true; ctl.lock(); return; }
    ctl.enabled = false; ctl.fireHeld = false;
    if (document.pointerLockElement) document.exitPointerLock();
    const s = setScreen(`<div class="s3t-card"><h2>⏸ הפסקה</h2>
      <button class="btn" id="pr">▶️ המשך</button><button class="btn" id="pa">🔁 התחל מחדש</button><button class="btn" id="pl">🎯 חזרה לאימון</button></div>`);
    s.querySelector('#pr').onclick = () => pause(false);
    s.querySelector('#pa').onclick = () => begin(st.run);
    s.querySelector('#pl').onclick = lobby;
  }

  function finish(win) {
    st.mode = 'results';
    const time = st.time, best = loadBest(), mode = st.run, par = MODES[mode].par;
    const rows = LOADOUT.filter((id) => stats.w[id].shots > 0).map((id) => {
      const s = stats.w[id], acc = s.shots ? s.hits / s.shots : 0;
      const score = Math.round(s.hits * 100 + s.heads * 50 + acc * 300 + (win ? Math.max(0, par - time) * 5 : 0));
      const prev = best[id]?.[mode];
      const isNew = !prev || score > prev.score;
      if (isNew) { best[id] = best[id] || {}; best[id][mode] = { score, acc, time, heads: s.heads, at: Date.now() }; }
      return { id, s, acc, score, prev, isNew };
    });
    saveBest(best);
    const coins = Math.min(150, (win ? 25 : 5) + stats.hits + stats.heads * 2); addCoins(coins, 'train'); // פרס מטבעות (store.js)
    st.result = { win, time, stats, rows, coins };
    disposeRun();
    const acc = stats.shots ? stats.hits / stats.shots : 0;
    const title = mode === 'range' ? '🏁 המטווח הושלם!' : win ? '🏆 ניצחת את הבוטים!' : '💀 נפלת';
    const s = setScreen(`<div class="s3t-card"><h2>${title}</h2>
      <div style="text-align:center;color:#8b95a7">${MODES[mode].he}${mode !== 'range' ? ` · הופלו ${stats.kills}/${BOT_LV[mode].count}` : ''} · <b style="color:#ffd54a">🪙 +${coins}</b></div>
      <div class="s3t-grid">
        <div class="s3t-stat"><b>${time.toFixed(1)}</b><small>⏱ זמן (שניות)</small></div>
        <div class="s3t-stat"><b>${Math.round(acc * 100)}%</b><small>🎯 דיוק</small></div>
        <div class="s3t-stat"><b>${stats.heads}</b><small>💀 פגיעות ראש</small></div>
        <div class="s3t-stat"><b>${stats.hits}/${stats.shots}</b><small>פגיעות / יריות</small></div>
      </div>
      ${rows.length ? `<table class="s3t-tbl"><tr><th>נשק</th><th>יריות</th><th>דיוק</th><th>ראש</th><th>ניקוד</th><th>שיא</th></tr>
        ${rows.map((r) => `<tr><td>${W(r.id).he}</td><td>${r.s.shots}</td><td>${Math.round(r.acc * 100)}%</td><td>${r.s.heads}</td><td><b>${r.score}</b></td>
          <td>${r.isNew ? '<span class="s3t-new">🆕 שיא חדש!</span>' : r.prev.score}</td></tr>`).join('')}</table>` : '<div class="s3t-help">לא נורו יריות</div>'}
      <button class="btn" id="ra">🔁 שוב</button><button class="btn" id="rl">🎯 אימון אחר</button><button class="btn" id="rm">→ תפריט ראשי</button></div>`);
    s.querySelector('#ra').onclick = () => begin(mode);
    s.querySelector('#rl').onclick = lobby;
    s.querySelector('#rm').onclick = exit;
  }

  function exit() {
    disposeRun(); setScreen(null); clearWorld();
    scene.remove(root); style.remove();
    scene.background = saved.bg; scene.fog = saved.fog;
    camera.fov = saved.fov; camera.near = saved.near; camera.far = saved.far; camera.updateProjectionMatrix();
    if (renderer && saved.pr) renderer.setPixelRatio(saved.pr);
    T.active = false; back();
  }

  // ---------- ירי שחקן ----------
  const _aimPt = new V3();
  const ray = new THREE.Raycaster(), _f = new V3(), _r = new V3(), _u = new V3(), _d = new V3(), _m = new V3(), _end = new V3();
  function getHitList() {
    if (!hitDirty) return hitList;
    hitList = [...worldHits];
    for (const t of targets) if (t.alive) hitList.push(...t.hit);
    for (const b of bots) if (b.alive) hitList.push(...b.hit);
    hitDirty = false; return hitList;
  }
  function spreadNow() {
    const id = LOADOUT[P.w];
    return (SPREAD[id] + P.bloom + clamp(P.speed / RUN, 0, 1) * 0.025 + (P.ground ? 0 : 0.04)) * (1 - P.aim * 0.45);
  }
  function muzzleOf(model, out) { return model.userData.muzzle ? model.localToWorld(out.copy(model.userData.muzzle)) : model.getWorldPosition(out); }
  function damage(ent, zone, id) {
    const wd = W(id), head = zone === 'head';
    hitStat(id, head);
    if (ent.kind === 'target') {
      ent.alive = false; hitDirty = true; hud?.hit({ head, kill: true });
      if (head) hud?.toast('🎯 ראש!', 700);
      return;
    }
    ent.hp -= wd.dmg * (head ? wd.head : 1);
    ent.flinch = 0.15;
    if (ent.hp <= 0) {
      ent.alive = false; ent.deadT = 0; hitDirty = true; stats.kills++;
      hud?.hit({ head, kill: true }); hud?.toast(head ? '💀 חיסול בראש!' : '✔️ חיסול', 900);
    } else {
      hud?.hit({ head });
      if (Math.random() < ent.L.hurtCover && ent.state !== 'cover') { ent.state = 'cover'; ent.spot = null; }
      ent.seeT = Math.max(ent.seeT, ent.L.react); // יודע איפה אתה
    }
  }
  function fire() {
    const id = LOADOUT[P.w];
    if (id === 'knife') return melee();
    if (P.reloadT > 0) return;
    if (P.ammo[id] <= 0) { reload(); return; }
    P.ammo[id]--; P.cd = 60 / W(id).rpm; shot(id);
    an.trigger('shoot');
    camera.getWorldDirection(_f); _r.crossVectors(_f, camera.up).normalize(); _u.crossVectors(_r, _f);
    const sp = spreadNow(), a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * sp;
    _d.copy(_f).addScaledVector(_r, Math.cos(a) * rr).addScaledVector(_u, Math.sin(a) * rr).normalize();
    const near = camera.position.distanceTo(_m.copy(P.pos).setY(P.pos.y + 1.5)) * 0.9;
    ray.set(camera.position, _d); ray.near = near; ray.far = W(id).range + near;
    const hit = ray.intersectObjects(getHitList(), false)[0];
    _end.copy(camera.position).addScaledVector(_d, hit ? hit.distance : ray.far);
    if (hit?.object.userData.ent) { damage(hit.object.userData.ent, hit.object.userData.zone, id); puff(hit.point, hit.object.userData.ent.kind === 'bot' ? '#b3262a' : '#f2e8d0', 0.06); }
    else if (hit) puff(hit.point);
    rig.root.updateMatrixWorld(true);
    muzzleOf(models[id], _m); flash(_m, true); tracer(_m, _end, M.tracer);
    { const kk = KICK[id] * rnd(0.8, 1.2); P.pitch += kk; P.kick = (P.kick || 0) + kk; } P.yaw += (Math.random() - 0.5) * KICK[id] * 0.6;
    P.bloom = Math.min(0.05, P.bloom + (id === 'rifle' ? 0.006 : 0.012));
    if (P.ammo[id] === 0) reload();
  }
  function melee() {
    P.cd = 60 / W('knife').rpm; shot('knife'); an.trigger('slash');
    const reach = 2.3;
    camera.getWorldDirection(_d);
    _m.copy(P.pos).y += 1.4;
    ray.set(camera.position, _d); ray.near = 0; ray.far = camera.position.distanceTo(_m) + reach;
    const hit = ray.intersectObjects(getHitList(), false).find((h) => h.object.userData.ent && h.point.distanceTo(_m) < reach);
    if (hit) { damage(hit.object.userData.ent, hit.object.userData.zone, 'knife'); puff(hit.point, '#b3262a', 0.05); return; }
    // סיוע קל: היעד הקרוב בקונוס קדמי
    _f.set(Math.sin(P.yaw), 0, Math.cos(P.yaw));
    let best = null, bd = reach;
    for (const e of [...targets, ...bots]) {
      if (!e.alive) continue;
      const ep = e.kind === 'bot' ? e.pos : e.g.position;
      _r.subVectors(ep, P.pos).setY(0); const d = _r.length();
      if (d < bd && d > 0.01 && _r.dot(_f) / d > 0.75) { bd = d; best = e; }
    }
    if (best) { damage(best, 'body', 'knife'); puff(_m.copy(best.kind === 'bot' ? best.pos : best.g.position).setY(1.2), '#b3262a', 0.05); }
  }
  function reload() {
    const id = LOADOUT[P.w];
    if (id === 'knife' || P.reloadT > 0 || P.ammo[id] >= W(id).mag) return;
    P.reloadT = RELOAD_T; an.trigger('reload');
  }

  // ---------- בוט: מוח ----------
  const _to = new V3(), _mv = new V3();
  function updateBot(b, dt) {
    const L = b.L;
    if (!b.alive) {
      b.deadT += dt;
      const k = ease(Math.min(1, b.deadT / 0.6));
      b.rig.root.rotation.set(-k * Math.PI / 2 * 0.95, b.yaw, 0, 'YXZ');
      b.rig.root.position.set(b.pos.x, b.pos.y + k * 0.15, b.pos.z);
      if (b.deadT > 3 && b.rig.root.parent) world.remove(b.rig.root);
      return;
    }
    _to.subVectors(P.pos, b.pos).setY(0); const dist = _to.length(); _to.divideScalar(dist || 1);
    _eye.copy(b.pos).y += 1.55; _pc.copy(P.pos).y += 1.25; _ph.copy(P.pos).y += 1.65;
    const losBody = !blocked(_eye, _pc), los = losBody || !blocked(_eye, _ph);
    const go = st.count <= 0 && P.hp > 0;
    if (los && go) { b.seeT += dt; b.lostT = 0; } else { b.seeT = Math.max(0, b.seeT - dt * 1.5); b.lostT += dt; }

    // תנועה לפי מצב
    _mv.set(0, 0, 0);
    b.st -= dt;
    if (go) {
      if (b.state === 'engage') {
        b.strafeT -= dt; if (b.strafeT <= 0) { b.strafe *= -1; b.strafeT = rnd(0.6, 1.8); }
        _mv.set(-_to.z * b.strafe, 0, _to.x * b.strafe); // צעדי צד
        if (dist > 16 || b.lostT > 1.5) _mv.addScaledVector(_to, 0.9); else if (dist < 7) _mv.addScaledVector(_to, -0.8);
        if (b.st <= 0) { b.state = 'cover'; b.spot = null; }
      } else if (b.state === 'cover') {
        if (!b.spot) { b.spot = pickCover(b); if (!b.spot) { b.state = 'engage'; b.st = rnd(...L.engage); } else b.st = 8; }
        if (b.spot) {
          _mv.subVectors(b.spot, b.pos).setY(0);
          const d = _mv.length();
          if (d < 0.4) { _mv.set(0, 0, 0); b.state = 'hide'; b.st = rnd(...L.wait); }
          else _mv.divideScalar(d);
          if (b.st <= 0) { b.state = 'engage'; b.st = rnd(...L.engage); } // נתקע? חוזר לקרב
        }
      } else if (b.state === 'hide') {
        if (b.st <= 0) { b.state = 'engage'; b.st = rnd(...L.engage); b.spot = null; }
      }
    }
    // הפרדה בין בוטים
    for (const o of bots) if (o !== b && o.alive) { const dx = b.pos.x - o.pos.x, dz = b.pos.z - o.pos.z, d2 = dx * dx + dz * dz; if (d2 < 1.2 && d2 > 1e-4) { _mv.x += dx / d2 * 0.3; _mv.z += dz / d2 * 0.3; } }
    const ml = _mv.length(); if (ml > 1) _mv.divideScalar(ml);
    const spd = L.speed * (b.state === 'cover' ? 1.25 : 1) * (b.flinch > 0 ? 0.3 : 1);
    b.flinch = Math.max(0, (b.flinch || 0) - dt);
    b.vel.lerp(_mv.multiplyScalar(spd), 1 - Math.exp(-8 * dt));
    b.pos.addScaledVector(b.vel, dt);
    collide(b.pos, PR);

    // כיוון מבט
    const hs = Math.hypot(b.vel.x, b.vel.z);
    let want = b.yaw;
    if (los && go) want = Math.atan2(_to.x, _to.z); else if (hs > 0.3) want = Math.atan2(b.vel.x, b.vel.z);
    let dy = ((want - b.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    b.yaw += dy * (1 - Math.exp(-10 * dt));
    const yawRate = (b.yaw - b.yawPrev) / Math.max(dt, 1e-3); b.yawPrev = b.yaw;

    // ירי
    b.fireT -= dt;
    if (go && los && b.seeT > L.react && b.state !== 'cover' && Math.abs(dy) < 0.4) {
      if (b.burst > 0) { b.burstT -= dt; if (b.burstT <= 0) { botShot(b, dist, losBody ? _pc : _ph); b.burst--; b.burstT = 0.12; } }
      else if (b.fireT <= 0) { b.burst = L.burst; b.burstT = 0; b.fireT = L.rof * rnd(0.8, 1.3); }
    }
    b.rig.root.position.copy(b.pos); b.rig.root.rotation.set(0, b.yaw, 0);
    b.an.update(dt, { speed: clamp(hs / 6.5, 0, 1), pitch: Math.atan2(_pc.y - _eye.y, dist) * (los ? 1 : 0), yawRate, aiming: los && go });
  }
  const _bm = new V3(), _aim = new V3();
  function botShot(b, dist, aimAt) {
    const L = b.L;
    b.an.trigger('shoot');
    b.rig.root.updateMatrixWorld(true);
    muzzleOf(b.gun, _bm); flash(_bm, false);
    const moving = P.speed > 2.5 ? 0.7 : 1, air = P.ground ? 1 : 0.7;
    const p = L.acc * clamp(1.3 - dist / 28, 0.35, 1.2) * moving * air;
    const hit = Math.random() < p;
    _aim.copy(aimAt);
    if (hit) _aim.add(_d.set(rnd(-0.15, 0.15), rnd(-0.2, 0.2), rnd(-0.15, 0.15)));
    else { _d.set(rnd(-1, 1), rnd(-0.6, 0.9), rnd(-1, 1)).normalize().multiplyScalar(rnd(0.6, 1.4)); _aim.add(_d); }
    // לאורך הקו ועד שפוגע במשהו
    _d.subVectors(_aim, _bm); let L2 = _d.length(); _d.divideScalar(L2);
    if (!hit) { L2 = rayBoxes(_bm, _d, 60); if (!isFinite(L2) || L2 > 60) L2 = 60; }
    _end.copy(_bm).addScaledVector(_d, L2);
    tracer(_bm, _end, M.botTracer);
    if (!hit) { if (L2 < 60) puff(_end); return; }
    P.hp -= L.dmg;
    // כיוון הפגיעה ביחס למבט: 0 = מלפנים, חיובי = מימין
    const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw), rx = -fz, rz = fx;
    const dx = b.pos.x - P.pos.x, dz = b.pos.z - P.pos.z;
    hud?.hurt(Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz));
    if (P.hp <= 0 && !st.dying) { P.hp = 0; st.dying = true; later(() => finish(false), 600); }
  }

  // ---------- לולאה ----------
  const _cam = new V3(), _piv = new V3(), _dir = new V3(), _wish = new V3();
  function updatePlayer(dt) {
    const id = LOADOUT[P.w];
    const alive = P.hp > 0;
    if (ctl && alive && !st.paused) {
      const l = ctl.lookDelta();
      const sens = 1 - P.aim * 0.4;
      P.yaw -= l.x * sens; P.pitch = clamp(P.pitch + l.y * sens, -1.2, 1.2);
      if (ctl.take('slot1')) equip(0); if (ctl.take('slot2')) equip(1); if (ctl.take('slot3')) equip(2);
      if (ctl.take('switch')) equip((P.w + 1) % LOADOUT.length);
      if (ctl.take('reload')) reload();
      if (ctl.take('jump') && P.ground) { P.vy = JUMP; P.ground = false; }
      if (ctl.take('pause')) pause(true);
      P.cd -= dt;
      const pressed = ctl.take('fire');
      if (st.count <= 0 && P.cd <= 0 && (pressed || (ctl.fireHeld && (id === 'rifle' || id === 'knife')))) fire();
      P.aim += ((ctl.aimHeld ? 1 : 0) - P.aim) * (1 - Math.exp(-12 * dt));
    }
    if (P.reloadT > 0) { P.reloadT -= dt; if (P.reloadT <= 0) { P.reloadT = 0; P.ammo[id] = W(id).mag; } }
    P.bloom = Math.max(0, P.bloom - dt * 0.06);

    // תנועה
    const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw);
    const mv = ctl && alive && !st.paused ? ctl.move : { x: 0, y: 0 };
    const sprint = ctl?.sprint && mv.y > 0.3 && !ctl.fireHeld && P.aim < 0.3;
    const max = (sprint ? RUN : WALK) * (1 - P.aim * 0.4);
    _wish.set(-fz * mv.x + fx * mv.y, 0, fx * mv.x + fz * mv.y).multiplyScalar(max);
    P.vel.lerp(_wish, 1 - Math.exp(-(P.ground ? 12 : 3) * dt));
    P.pos.addScaledVector(P.vel, dt);
    P.vy -= GRAV * dt; P.pos.y += P.vy * dt;
    const g = groundAt(P.pos, PR);
    if (P.pos.y <= g) { P.pos.y = g; P.vy = 0; P.ground = true; } else if (P.pos.y > g + 0.05) P.ground = false;
    collide(P.pos, PR);
    P.speed = Math.hypot(P.vel.x, P.vel.z);

    // רתע חוזר: הכוונת חוזרת למקום אחרי הירי
    if (P.kick > 0) { const rc = Math.min(P.kick, P.kick * 7 * dt + 0.0004); P.pitch -= rc; P.kick -= rc; }
    // דמות
    rig.root.position.copy(P.pos); rig.root.rotation.set(0, P.yaw, 0);
    const yawRate = (P.yaw - P.yawPrev) / Math.max(dt, 1e-3); P.yawPrev = P.yaw;
    const s = P.speed <= WALK ? (P.speed / WALK) * 0.5 : 0.5 + clamp((P.speed - WALK) / (RUN - WALK), 0, 1) * 0.5;

    // מצלמה מעל הכתף הימנית (ימין הדמות = -X מקומי)
    const cp = Math.cos(P.pitch);
    _dir.set(fx * cp, Math.sin(P.pitch), fz * cp);
    const side = 1.05 - P.aim * 0.3, dist = 3.0 - P.aim * 0.9;
    _piv.set(P.pos.x - fz * side, P.pos.y + 1.85, P.pos.z + fx * side);
    _cam.copy(_dir).negate();
    let t = rayBoxes(_piv, _cam, dist + 0.25);
    t = Math.max(0.3, Math.min(dist, t - 0.25));
    camera.position.copy(_piv).addScaledVector(_cam, t);
    if (camera.position.y < 0.2) camera.position.y = 0.2;
    camera.lookAt(_cam.copy(camera.position).add(_dir));
    // הנשק מכוון בדיוק לנקודה שבמרכז הכוונת
    _aimPt.copy(camera.position).addScaledVector(_dir, 60);
    an.update(dt, { speed: s, pitch: P.pitch, yawRate, aiming: P.aim > 0.5, aimPoint: _aimPt });
    const fov = 70 - P.aim * 18;
    if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = fov; camera.updateProjectionMatrix(); }

    if (hud) {
      hud.setAmmo(id === 'knife' ? 0 : P.ammo[id], id === 'knife' ? 0 : W(id).mag, P.reloadT > 0);
      hud.setHp(P.hp);
      hud.setWeapons(LOADOUT.map((x) => W(x)), P.w);
      hud.setReticle(id);
      const focal = innerHeight / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      hud.spread(id === 'knife' ? 0 : spreadNow() * focal);
    }
  }

  function updateTargets(dt) {
    let alive = 0;
    for (const t of targets) {
      if (t.alive) {
        alive++;
        if (t.rise < 1) { t.rise = Math.min(1, t.rise + dt * 3); t.pivot.rotation.x = (1 - ease(t.rise)) * 1.5; }
        if (t.move && st.count <= 0) { t.g.position.x = t.x0 + Math.sin(st.time * t.move.w * 2 + t.move.ph) * t.move.amp; }
      } else if (t.fall < 1) {
        t.fall = Math.min(1, t.fall + dt * 3.5); t.pivot.rotation.x = ease(t.fall) * 1.5;
      } else if (t.g.visible && st.mode === 'run') t.g.visible = false;
    }
    return alive;
  }

  const T = {
    active: true, st, P, an, rig, get bots() { return bots; }, get targets() { return targets; }, get ctl() { return ctl; }, get hud() { return hud; },
    begin, lobby, exit, finish,
    // בדיקות: כיוון אל נקודה וירייה
    aimAt(p) { _d.subVectors(p, camera.position); P.yaw = Math.atan2(_d.x, _d.z); P.pitch = Math.atan2(_d.y, Math.hypot(_d.x, _d.z)); },
    fire() { P.cd = 0; fire(); },
    update(dt) {
      dt = Math.min(dt, 0.05);
      if (st.mode === 'lobby' || st.mode === 'results') {
        st.lobbyT += dt;
        an.update(dt, { speed: 0, pitch: 0, yawRate: 0 });
        rig.root.position.copy(P.pos); rig.root.rotation.set(0, P.yaw, 0);
        const a = st.lobbyT * 0.12;
        camera.position.set(Math.sin(a) * 6 + 3, 2.2, -5 + Math.cos(a) * 1.5);
        camera.lookAt(0, 1.2, 8);
        updateTargets(dt); updateFx(dt);
        return;
      }
      if (st.paused) return;
      if (st.count > 0) {
        st.count -= dt;
        hud?.setTop(st.count > 0 ? `<span style="font-size:28px">${Math.ceil(st.count)}</span>` : 'צא! 🔥');
      } else if (!st.dying) st.time += dt;
      updatePlayer(dt);
      const alive = updateTargets(dt);
      for (const b of bots) updateBot(b, dt);
      updateFx(dt);
      if (st.mode !== 'run') return;
      const tm = `⏱ ${st.time.toFixed(1)}`;
      if (st.run === 'range') {
        if (st.phase === 1) {
          if (st.count <= 0) hud.setTop(`שלב 1/2 · מטרות עומדות · נשארו ${alive} · ${tm}`);
          if (alive === 0) { st.phase = 2; hud.toast('שלב 2: מטרות זזות! 🏃', 1500); targets = targets.filter((t) => t.g.visible || t.fall < 1); spawnMoving(); spawnMoving(); spawnMoving(); }
        } else {
          const left = alive + (MOVING.length - movingSpawned);
          hud.setTop(`שלב 2/2 · מטרות זזות · נשארו ${left} · ${tm}`);
          if (alive < 3 && movingSpawned < MOVING.length) spawnMoving();
          if (left === 0) finish(true);
        }
      } else if (st.count <= 0) {
        const left = bots.filter((b) => b.alive).length;
        hud.setTop(`${MODES[st.run].he} · נשארו ${left} 🤖 · ${tm}`);
        if (left === 0 && !st.dying) { st.dying = true; later(() => finish(true), 900); }
      }
    },
  };
  lobby();
  return T;
}

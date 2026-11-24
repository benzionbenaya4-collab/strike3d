// מצב לבד: בסיס 9 (אימה). 3 פרקים: ההתרסקות → המעבדה → הבריחה.
// startBase9(scene, camera, ui, back, renderer) → { active, update(dt) } – אותה צורה כמו שאר המצבים.
// פנס עם סוללה הוא הכלי העיקרי: צללים זזים רק בחושך, קופאים באור ונסוגים. תחמושת נדירה, במקומות נסתרים.
// שליטה: core/controls.js (מקלדת/עכבר/מגע) + E/✋ פעולה, F/🔦 פנס. HUD: core/hud.js + תיבה משלנו (תחמושת, סוללה).
import * as THREE from 'three';
import { buildKnife } from '../models/knife.js';
import { buildWeapon } from '../models/weapons.js';
import { buildCharacter } from '../models/character.js';
import { weapon as W } from '../data/weapons.js';
import { createControls, isTouch } from '../core/controls.js';
import { createHud } from '../core/hud.js';
import { addCoins, getLoadout } from '../store.js';
import { buildBase9 } from '../world/base9/level.js';
import { createShadows } from '../world/base9/shadows.js';
import { createAudio } from '../world/base9/audio.js';
import { CHAPTERS, GOALS, VOICE, DOCS, ENDING, DEATH } from '../world/base9/story.js';

const V3 = THREE.Vector3;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const rnd = (a, b) => a + Math.random() * (b - a);
const GRAV = 16, JUMP = 5.6, WALK = 3.4, RUN = 5.6, PR = 0.32;
const SLOTS = ['knife', 'pistol', 'rifle'];
const RELOAD_T = 1.4;
const DRAIN = 1.15;           // % סוללה לשנייה
const SAVE_KEY = 's3d.base9.v1', REWARD_KEY = 's3d.base9.rewards.v1';
const REWARD = { 1: [60, 15], 2: [90, 20], 3: [200, 40] }; // [פעם ראשונה, חזרה]
const START = { 1: [1.5, -43.5, 0.15], 2: [0, 3, 0], 3: [0, 60.6, 0] };
const DOC_IDS = ['log1', 'log2', 'note', 'tape1', 'log3', 'tape2', 'log4'];
const BAT_IDS = ['bat1', 'bat3', 'bat4', 'bat5'];
const PARTS = { p_fuel: 'מיכל דלק', p_cell: 'סוללת מטוס', p_mod: 'מודול בקרה' };

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (_) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} },
};

function segBox(o, d, maxT, b) {
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
.b9 { position:absolute; inset:0; pointer-events:none; font-family:Rubik, sans-serif; color:#e8ecf2; direction:rtl; }
.b9 .s3h-ammo { display:none; }
.b9 .s3h-slots { bottom:max(122px, calc(env(safe-area-inset-bottom) + 108px)); }
.b9-scr { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; padding:16px; pointer-events:auto;
  background:radial-gradient(ellipse at 50% 35%, #0d1218ee 0%, #020304f6 75%); overflow:auto; z-index:20; }
.b9-card { width:min(560px,100%); max-height:100%; overflow:auto; background:#0e1116f2; border:1px solid #2a2f3a; border-radius:16px; padding:18px;
  display:flex; flex-direction:column; gap:10px; box-shadow:0 0 40px #000; }
.b9-card h2 { margin:0; font-size:28px; font-weight:900; text-align:center; letter-spacing:1px; }
.b9-card h3 { margin:0; font-size:20px; } .b9-card p { margin:0; line-height:1.7; font-size:16px; color:#c9d0da; }
.b9-card .btn { width:100%; } .b9-muted { color:#7d8796; font-size:13px; text-align:center; line-height:1.6; }
.b9-doc { background:#d9d2bc; color:#2a2418; font-family:'Courier New', Rubik, monospace; border-color:#8a7a5a; }
.b9-doc p { color:#2a2418; font-family:Rubik, sans-serif; } .b9-doc h3 { color:#3a2a10; }
.b9-tape { background:#11151b; border-color:#3a4250; } .b9-tape p { color:#a9d0ff; font-style:italic; }
.b9-pad { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; direction:ltr; }
.b9-pad button { padding:14px 0; font:700 22px Rubik; border-radius:12px; border:1px solid #2a3142; background:#1a1f29; color:#fff; cursor:pointer; }
.b9-disp { direction:ltr; text-align:center; font:900 34px 'Courier New', monospace; letter-spacing:12px; background:#050807; color:#3dff8a;
  border-radius:10px; padding:8px; border:1px solid #1d3a28; min-height:58px; }
.b9-box { position:absolute; background:#0b0e13c8; border:1px solid #232a36; border-radius:12px; padding:7px 11px; }
.b9-inv { bottom:max(14px, env(safe-area-inset-bottom)); left:16px; min-width:150px; font-size:13px; }
.b9-inv .am { direction:ltr; text-align:left; font-size:28px; font-weight:900; } .b9-inv .am small { font-size:15px; color:#7d8796; }
.b9-bat { height:8px; background:#050608; border-radius:5px; overflow:hidden; margin-top:4px; } .b9-bat i { display:block; height:100%; background:#f6e27a; transition:width .2s; }
.b9-bat i.low { background:#ff5a3b; }
.b9-items { position:absolute; top:max(54px, env(safe-area-inset-top)); left:50%; transform:translateX(-50%); display:flex; gap:6px; font-size:18px; }
.b9-items span { background:#0b0e13c8; border:1px solid #232a36; border-radius:8px; padding:2px 6px; }
.b9-sub { position:absolute; left:50%; transform:translateX(-50%); bottom:max(150px, calc(env(safe-area-inset-bottom) + 140px)); width:min(640px,92vw);
  text-align:center; font-size:18px; font-weight:700; color:#bfe0ff; text-shadow:0 2px 6px #000, 0 0 2px #000; opacity:0; transition:opacity .3s; }
.b9-sub b { color:#7fb8ff; }
.b9-prompt { position:absolute; left:50%; top:60%; transform:translateX(-50%); background:#0b0e13d0; border:1px solid #3a4250; border-radius:10px;
  padding:6px 12px; font-size:15px; font-weight:700; display:none; white-space:nowrap; }
.b9-prompt kbd { background:#e8ecf2; color:#000; border-radius:4px; padding:0 6px; margin-inline-end:6px; font-family:Rubik; }
.b9-title { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; opacity:0; transition:opacity 1.2s;
  text-align:center; padding:16px; } .b9-title h1 { margin:0; font-size:clamp(28px,7vw,52px); font-weight:900; text-shadow:0 0 24px #000; }
.b9-title div { color:#8b95a7; font-size:16px; }
.b9-fade { position:absolute; inset:0; background:#000; opacity:0; transition:opacity .8s; }
.b9-dmg { position:absolute; inset:0; background:radial-gradient(ellipse at center, transparent 40%, #400000c0 100%); opacity:0; transition:opacity .6s; }
.b9-tb { position:absolute; width:62px; height:62px; border-radius:50%; border:2px solid #ffffff50; background:#151922aa; color:#fff; font:700 12px Rubik;
  display:flex; flex-direction:column; align-items:center; justify-content:center; pointer-events:auto; z-index:5; touch-action:none; user-select:none; -webkit-user-select:none; }
.b9-tb span { font-size:22px; line-height:1; } .b9-tb.hot { background:#ffb02088; border-color:#ffb020; } .b9-tb.off { opacity:.5; }
.b9-pause { position:absolute; top:max(10px, env(safe-area-inset-top)); left:10px; pointer-events:auto; z-index:5; }
.b9-prog { position:absolute; left:50%; top:66%; transform:translateX(-50%); width:200px; height:10px; background:#050608; border-radius:6px; overflow:hidden; display:none; border:1px solid #333; }
.b9-prog i { display:block; height:100%; width:0; background:#3dff8a; }
@media (pointer: coarse) { .b9 .s3h-slots { bottom:auto; top:max(160px, calc(env(safe-area-inset-top) + 106px)); } .b9-inv { bottom:auto; top:max(54px, env(safe-area-inset-top)); } .b9-items { top:max(124px, env(safe-area-inset-top)); left:auto; right:16px; transform:none; } }
`;

export function startBase9(scene, camera, ui, back, renderer) {
  const touch = isTouch();
  // ---------- שמירת מצב הסצנה הראשית ----------
  const saved = { bg: scene.background, fog: scene.fog, env: scene.environment, fov: camera.fov, near: camera.near, far: camera.far, pr: renderer?.getPixelRatio(), lights: [] };
  scene.traverse((o) => { if (o.isLight) { saved.lights.push([o, o.intensity]); o.intensity = 0; } });
  const FOG = new THREE.Color('#04060a');
  scene.background = FOG.clone(); scene.fog = new THREE.FogExp2(FOG.clone(), 0.055); scene.environment = null;
  camera.fov = 68; camera.near = 0.05; camera.far = 140; camera.updateProjectionMatrix();
  if (renderer && touch) renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);

  const root = new THREE.Group(); root.name = 'base9-mode'; scene.add(root);
  // ---------- אורות (מספר קבוע – בלי קימפול שיידרים מחדש) ----------
  const moon = new THREE.DirectionalLight('#6f86b8', 0.4); moon.position.set(-30, 50, -60); root.add(moon);
  const amb = new THREE.HemisphereLight('#3a4a6a', '#0a0806', 0.1); root.add(amb);
  const torch = new THREE.SpotLight('#fff1cf', 0, 28, 0.42, 0.5, 1.4); root.add(torch, torch.target);
  const near = new THREE.PointLight('#8aa0c8', 2.5, 6, 1.4); root.add(near);   // ראיית לילה חלשה סביב השחקן
  const muzzle = new THREE.PointLight('#ffc060', 0, 8, 2); root.add(muzzle);
    const pool = Array.from({ length: 3 }, () => { const l = new THREE.PointLight('#ffe2b0', 0, 7, 1.5); root.add(l); return { l, lamp: null }; });

  // ---------- שחקן ----------
  const rig = buildCharacter({ skin: getLoadout()?.outfit || 'default' }); root.add(rig.root);
  const an = rig.anim;
  const models = { knife: buildKnife(getLoadout()?.knife || 'default'), pistol: buildWeapon('pistol', 'default'), rifle: buildWeapon('rifle', 'default') };
  const P = { pos: new V3(), vel: new V3(), vy: 0, ground: true, yaw: 0, pitch: 0, yawPrev: 0, speed: 0, aim: 0, w: -1, cd: 0, reloadT: 0, kick: 0, hurtT: 9, shake: 0, stepT: 0,
    lightPos: new V3(), lightDir: new V3(0, 0, 1), lightRange: 22, lightCos: Math.cos(0.36), lightOn: false, alive: true, chapter: 1 };

  // ---------- מצב משחק (נשמר בנקודות שמירה) ----------
  let G = null;
  const newGame = () => {
    const d = () => String(Math.floor(Math.random() * 10));
    return { v: 1, ch: 1, flags: [], docs: [], inv: { flashlight: false, pistol: false, rifle: false, card: false, fuse: false, key: false, parts: [] },
      installed: 0, ammo: { pistol: 0, rifle: 0 }, reserve: { pistol: 0, rifle: 0 }, battery: 100, hp: 100, light: false, pos: START[1].slice(0, 2), yaw: START[1][2],
      code: { a: d() + d(), b: d() + d(), sec: String(100 + Math.floor(Math.random() * 900)) + d() }, rifleRoll: Math.random() < 0.3 };
  };
  const has = (f) => G.flags.includes(f);
  const flag = (f) => { if (!has(f)) G.flags.push(f); };
  let checkpoint = null;

  // ---------- עולם ----------
  let level = null, shadows = null;
  const env = {
    spots: null,
    isLit(p) {
      for (const f of level.fires) if (Math.hypot(p.x - f.pos.x, p.z - f.pos.z) < f.r) return true;
      for (const l of level.lamps) if (l.on && !l.fire && l.cur > 0.5 && Math.abs(p.x - l.pos.x) < l.r * 0.8 && Math.abs(p.z - l.pos.z) < l.r * 0.8 && level.areaAt(p) === level.areaAt(l.pos)) return true;
      return false;
    },
    blocked(a, b) { _sd.subVectors(b, a); const L = _sd.length(); if (L < 1e-6) return false; _sd.divideScalar(L); for (const bx of level.boxes) if (!bx.tree && segBox(a, _sd, L, bx) < L) return true; return false; },
    collide: (p, r) => collide(p, r),
  };
  const _sd = new V3();
  function collide(pos, r, h = 1.75) {
    for (const b of level.boxes) {
      if (pos.y >= b.max.y - 0.05 || pos.y + h <= b.min.y) continue;
      if (pos.x < b.min.x - r || pos.x > b.max.x + r || pos.z < b.min.z - r || pos.z > b.max.z + r) continue;
      const cx = clamp(pos.x, b.min.x, b.max.x), cz = clamp(pos.z, b.min.z, b.max.z);
      const dx = pos.x - cx, dz = pos.z - cz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) { const d = Math.sqrt(d2), k = (r - d) / d; pos.x += dx * k; pos.z += dz * k; }
      else {
        const ex = [b.min.x - r - pos.x, b.max.x + r - pos.x, b.min.z - r - pos.z, b.max.z + r - pos.z];
        let bi = 0; for (let i = 1; i < 4; i++) if (Math.abs(ex[i]) < Math.abs(ex[bi])) bi = i;
        if (bi < 2) pos.x += ex[bi]; else pos.z += ex[bi];
      }
    }
  }
  function groundAt(pos, r) {
    let g = 0;
    for (const b of level.boxes) if (pos.x > b.min.x - r * 0.5 && pos.x < b.max.x + r * 0.5 && pos.z > b.min.z - r * 0.5 && pos.z < b.max.z + r * 0.5 && pos.y >= b.max.y - 0.3) g = Math.max(g, b.max.y);
    return g;
  }
  const rayBoxes = (o, d, maxT, skipTrees = false) => { let t = maxT; for (const b of level.boxes) if (!(skipTrees && b.tree)) t = Math.min(t, segBox(o, d, t, b)); return t; };

  function buildWorld() {
    if (level) { level.dispose(); shadows.dispose(); }
    level = buildBase9(); root.add(level.group);
    env.spots = level.spots;
    level.setPower('always', true);
    shadows = createShadows(root, env);
  }
  // מצב חזותי של פריט שהושלם (גם בשחזור)
  function visualDone(id) {
    const it = level.item(id); if (!it) return;
    it.done = true;
    if (it.obj && !['lever'].includes(id)) it.obj.visible = false;
    if (id === 'panel') { it.panel.rotation.z = 1.2; it.panel.position.set(-1.45, 0.06, 24); }
    if (id === 'locker') it.door.rotation.y = -1.9;
    if (id === 'lever') it.arm.rotation.z = 0.6;
  }
  const snapDoor = (id) => { level.openDoor(id); level.doors[id].k = 0.999; };
  function applyState() {
    for (const f of G.flags) visualDone(f);
    if (has('main_open')) { snapDoor('main'); level.readerLed.material = new THREE.MeshBasicMaterial({ color: '#2aff6a' }); }
    if (has('sec_open')) { snapDoor('sec'); level.secPad.material = new THREE.MeshBasicMaterial({ color: '#2aff6a' }); }
    if (has('han_open')) { snapDoor('hangar'); level.hanPad.material = new THREE.MeshBasicMaterial({ color: '#2aff6a' }); }
    if (has('bay_open')) snapDoor('bay');
    if (has('power')) { level.setPower('gen', true); level.genLed.material = new THREE.MeshBasicMaterial({ color: '#2aff6a' }); }
    if (G.ch >= 3) level.setPower('hangar', true);
  }

  // ---------- שמירה ----------
  function save(atX, atZ, yaw) {
    G.pos = [atX ?? P.pos.x, atZ ?? P.pos.z]; G.yaw = yaw ?? P.yaw; G.hp = Math.max(G.hp, 100); G.light = P.lightOn;
    checkpoint = JSON.parse(JSON.stringify(G)); store.set(SAVE_KEY, checkpoint);
  }
  function load(state) {
    G = JSON.parse(JSON.stringify(state)); P.chapter = G.ch;
    buildWorld(); applyState();
    P.pos.set(G.pos[0], 0, G.pos[1]); P.vel.set(0, 0, 0); P.vy = 0; P.yaw = P.yawPrev = G.yaw; P.pitch = -0.05; P.alive = true; P.hurtT = 9; P.reloadT = 0;
    G.hp = 100; P.lightOn = G.inv.flashlight && G.light && G.battery > 0;
    P.w = -1; equip(G.inv.rifle ? 2 : G.inv.pistol ? 1 : 0);
    shadows.spawn(G.ch, G.ch === 1 ? 5 : G.ch === 2 ? 6 : G.installed >= 3 ? 9 : 6);
    au.setAmbience(level.areaAt(P.pos));
    voiceQ.length = 0; voiceT = 0; sub(null);
  }

  // ---------- נשקים ----------
  const owned = () => SLOTS.filter((id) => id === 'knife' || G.inv[id]);
  function equip(i) {
    const id = SLOTS[i]; if (!id || (id !== 'knife' && !G.inv[id])) return;
    if (i === P.w && an.weapon) return;
    P.w = i; an.setWeapon(models[id], id); P.reloadT = 0; P.cd = 0.35;
  }
  const _f = new V3(), _r = new V3(), _u = new V3(), _d = new V3(), _m = new V3(), _end = new V3(), _aimPt = new V3();
  const tracer = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new V3(), new V3()]), new THREE.LineBasicMaterial({ color: '#ffd88a', transparent: true, fog: false }));
  tracer.visible = false; tracer.frustumCulled = false; root.add(tracer); let tracerT = 0;
  function fire() {
    const id = SLOTS[P.w];
    if (id === 'knife') return melee();
    if (P.reloadT > 0) return;
    if (G.ammo[id] <= 0) { if (G.reserve[id] > 0) reload(); else { au.sfx('empty'); hud?.toast('אין כדורים', 700); P.cd = 0.3; } return; }
    G.ammo[id]--; P.cd = 60 / W(id).rpm; an.trigger('shoot'); au.sfx('shot');
    camera.getWorldDirection(_f); _r.crossVectors(_f, camera.up).normalize(); _u.crossVectors(_r, _f);
    const sp = (id === 'rifle' ? 0.008 : 0.005) + clamp(P.speed / RUN, 0, 1) * 0.02, a = Math.random() * 6.283, rr = Math.sqrt(Math.random()) * sp;
    _d.copy(_f).addScaledVector(_r, Math.cos(a) * rr).addScaledVector(_u, Math.sin(a) * rr).normalize();
    const n0 = camera.position.distanceTo(_m.copy(P.pos).setY(P.pos.y + 1.5)) * 0.9;
    const tw = rayBoxes(camera.position, _d, W(id).range);
    const h = shadows.hitRay(camera.position, _d, tw);
    const t = h && h.t > n0 ? h.t : tw;
    if (h && h.t > n0) { const kill = shadows.damage(h.s, h.head ? 2 : 1); hud?.hit({ head: h.head, kill }); au.sfx('hiss'); if (kill) hud?.toast('הצל התפוגג', 900); }
    _end.copy(camera.position).addScaledVector(_d, Math.min(t, 60));
    rig.root.updateMatrixWorld(true);
    const mdl = models[id]; if (mdl.userData.muzzle) mdl.localToWorld(_m.copy(mdl.userData.muzzle)); else mdl.getWorldPosition(_m);
    muzzle.position.copy(_m); muzzle.intensity = 12;
    tracer.geometry.attributes.position.setXYZ(0, _m.x, _m.y, _m.z); tracer.geometry.attributes.position.setXYZ(1, _end.x, _end.y, _end.z);
    tracer.geometry.attributes.position.needsUpdate = true; tracer.visible = true; tracerT = 0.05;
    const kk = (id === 'rifle' ? 0.012 : 0.024) * rnd(0.8, 1.2); P.pitch += kk; P.kick += kk;
    if (G.ammo[id] === 0 && G.reserve[id] > 0) reload();
  }
  function melee() {
    P.cd = 60 / W('knife').rpm; an.trigger('slash'); au.sfx('knife');
    _f.set(Math.sin(P.yaw), 0, Math.cos(P.yaw));
    let best = null, bd = 2.4;
    for (const s of shadows.list) {
      if (!s.alive || s.fade < 0.3) continue;
      _r.subVectors(s.pos, P.pos).setY(0); const d = _r.length();
      if (d < bd && d > 0.01 && _r.dot(_f) / d > 0.6) { bd = d; best = s; }
    }
    if (best) { const kill = shadows.damage(best, best.state === 'frozen' ? 3 : 1.5); hud?.hit({ kill }); au.sfx('hiss'); if (kill) hud?.toast('הצל התפוגג', 900); }
  }
  function reload() {
    const id = SLOTS[P.w];
    if (id === 'knife' || P.reloadT > 0 || G.ammo[id] >= W(id).mag || G.reserve[id] <= 0) return;
    P.reloadT = RELOAD_T; an.trigger('reload'); au.sfx('click');
  }
  function finishReload() {
    const id = SLOTS[P.w]; if (id === 'knife') return;
    const n = Math.min(W(id).mag - G.ammo[id], G.reserve[id]); G.ammo[id] += n; G.reserve[id] -= n;
  }
  function giveAmmo(id, n) { G.reserve[id] += n; }

  // ---------- UI ----------
  const layer = document.createElement('div'); layer.className = 'b9';
  ui.innerHTML = ''; ui.appendChild(layer);
  let ctl = null, hud = null, hudEls = null, screen = null;
  const setScreen = (html, cls = '') => {
    screen?.remove(); screen = null;
    if (!html) return null;
    screen = document.createElement('div'); screen.className = 'b9-scr'; screen.innerHTML = `<div class="b9-card ${cls}">${html}</div>`; ui.appendChild(screen); return screen;
  };
  const au = createAudio();
  const st = { mode: 'menu', t: 0, cine: null, install: null, deadT: 0 };

  function buildHud() {
    hud = createHud(layer);
    ctl = createControls({ ui: layer, canvas: renderer?.domElement || document.querySelector('canvas') });
    const el = document.createElement('div'); el.style.cssText = 'position:absolute;inset:0;pointer-events:none';
    el.innerHTML = `
      <div class="b9-dmg"></div>
      <div class="b9-box b9-inv"><div class="wn" style="color:#ffb020"></div><div class="am"></div>
        <div style="display:flex;justify-content:space-between;margin-top:4px"><span>🔦 סוללה</span><b class="bp">100%</b></div><div class="b9-bat"><i></i></div></div>
      <div class="b9-items"></div>
      <div class="b9-sub"></div>
      <div class="b9-prompt"></div>
      <div class="b9-prog"><i></i></div>
      <div class="b9-title"><h1></h1><div></div></div>
      <div class="b9-fade"></div>
      <button class="chip b9-pause">II</button>
      ${touch ? `<div class="b9-tb" data-b="use" style="right:calc(26px + env(safe-area-inset-right));bottom:232px"><span>✋</span>פעולה</div>
        <div class="b9-tb" data-b="light" style="right:calc(108px + env(safe-area-inset-right));bottom:222px"><span>🔦</span>פנס</div>` : ''}`;
    layer.appendChild(el);
    const $ = (s) => el.querySelector(s);
    hudEls = { root: el, wn: $('.wn'), am: $('.am'), bp: $('.bp'), bat: $('.b9-bat i'), items: $('.b9-items'), sub: $('.b9-sub'), prompt: $('.b9-prompt'),
      prog: $('.b9-prog'), progI: $('.b9-prog i'), title: $('.b9-title'), fade: $('.b9-fade'), dmg: $('.b9-dmg'), use: $('[data-b=use]'), light: $('[data-b=light]'), last: {} };
    $('.b9-pause').onclick = () => pause(true);
    for (const b of el.querySelectorAll('.b9-tb')) {
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (b.dataset.b === 'use') act(); else toggleLight(); }, { passive: false });
      b.addEventListener('touchstart', (e) => { e.stopPropagation(); }, { passive: true });
    }
  }
  function disposeHud() { ctl?.dispose(); ctl = null; hud?.dispose(); hud = null; hudEls = null; layer.innerHTML = ''; }

  // כתוביות של הקול ברדיו
  const voiceQ = []; let voiceT = 0;
  function voice(key) { if (!VOICE[key]) return; for (const l of VOICE[key]) voiceQ.push(l); }
  function sub(text) { if (!hudEls) return; if (text) hudEls.sub.innerHTML = `<b>📻 הקול:</b> ${text}`; hudEls.sub.style.opacity = text ? 1 : 0; }
  function updateVoice(dt) {
    if (voiceT > 0) { voiceT -= dt; if (voiceT <= 0) sub(null); return; }
    if (!voiceQ.length) return;
    const [t, s] = voiceQ.shift(); sub(t); voiceT = s; au.radio(Math.min(1.2, s * 0.4));
  }
  function goal(k, ...a) { G.goal = k; const g = GOALS[k]; hud?.setTop(`🎯 ${typeof g === 'function' ? g(...a) : g}`); }
  function refreshGoal() {
    let k;
    if (G.ch === 1) k = !G.inv.flashlight ? 'wake' : !G.inv.pistol ? 'kit' : !G.inv.card ? (has('gate') ? 'gate' : 'door') : 'door';
    else if (G.ch === 2) k = !has('power') ? (G.inv.fuse ? 'genOn' : has('gen_seen') ? 'fuse' : 'power') : (has('a_known') && has('b_known') ? 'hangar' : 'code');
    else k = G.installed < 3 ? 'parts' : !has('bay_open') ? 'lever' : 'fly';
    goal(k, G.installed);
    if (G.ch === 1 && k === 'door' && !G.inv.card) goal('gate');
  }
  function title(h, s, ms = 3500) {
    if (!hudEls) return; hudEls.title.querySelector('h1').textContent = h; hudEls.title.querySelector('div').textContent = s || '';
    hudEls.title.style.opacity = 1; clearTimeout(st.titleT); st.titleT = setTimeout(() => { if (hudEls) hudEls.title.style.opacity = 0; }, ms);
  }
  function itemsBar() {
    const i = G.inv, list = [];
    if (i.card) list.push('💳'); if (i.fuse) list.push('🔌'); if (i.key) list.push('🗝️');
    for (const p of i.parts) list.push({ p_fuel: '⛽', p_cell: '🔋', p_mod: '🧩' }[p]);
    const k = list.join(''); if (hudEls.last.items === k) return; hudEls.last.items = k;
    hudEls.items.innerHTML = list.map((x) => `<span>${x}</span>`).join('');
  }

  function showDoc(id) {
    const d = DOCS[id]; const body = typeof d.body === 'function' ? d.body(G.code) : d.body;
    if (!G.docs.includes(id)) G.docs.push(id);
    if (id === 'tape1') flag('b_known'); if (id === 'log3') flag('a_known');
    au.sfx('page'); if (id.startsWith('tape')) au.radio(2);
    popup(`<h3>${d.icon} ${d.title}</h3>${body.map((p) => `<p>${p}</p>`).join('')}<button class="btn" data-close>סגור</button>`,
      id.startsWith('tape') ? 'b9-tape' : 'b9-doc', () => { refreshGoal(); if (id === 'log3' || id === 'tape1') hud?.toast('📒 הספרות נרשמו ביומנים (הפסקה)', 1800); });
  }
  function keypad(code, onOk) {
    let v = '';
    const s = popup(`<h3>🔢 הקש קוד</h3><div class="b9-disp">----</div>
      <div class="b9-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-k="${n}">${n}</button>`).join('')}<button data-k="del">⌫</button><button data-k="0">0</button><button data-k="ok" style="background:#1d3a28">✔</button></div>
      <button class="btn" data-close>ביטול</button>`);
    const disp = s.querySelector('.b9-disp');
    const show = () => { disp.textContent = (v + '----').slice(0, 4); disp.style.color = ''; };
    s.querySelectorAll('[data-k]').forEach((b) => (b.onclick = () => {
      const k = b.dataset.k;
      if (k === 'del') v = v.slice(0, -1);
      else if (k === 'ok') {
        if (v === code) { au.sfx('ok'); closePopup(); onOk(); return; }
        au.sfx('denied'); disp.textContent = 'שגוי'; disp.style.color = '#ff4a3a'; v = ''; return;
      } else if (v.length < 4) { v += k; au.sfx('beep'); }
      show();
    }));
  }
  let popCb = null;
  function popup(html, cls = '', cb = null) {
    st.mode = 'popup'; popCb = cb;
    if (ctl) { ctl.enabled = false; ctl.fireHeld = false; }
    if (document.pointerLockElement) document.exitPointerLock();
    const s = setScreen(html, cls);
    s.querySelectorAll('[data-close]').forEach((b) => (b.onclick = closePopup));
    return s;
  }
  function closePopup() {
    setScreen(null); st.mode = 'play';
    if (ctl) { ctl.enabled = true; ctl.take('pause'); ctl.take('fire'); ctl.lock(); }
    const cb = popCb; popCb = null; cb?.();
  }

  // ---------- מסכים ----------
  function menu() {
    st.mode = 'menu'; disposeHud();
    if (!level) { G = newGame(); buildWorld(); P.pos.set(START[1][0], 0, START[1][1]); }
    const sv = store.get(SAVE_KEY);
    const s = setScreen(`<h2>👻 בסיס 9</h2>
      <p style="text-align:center">המטוס שלך התרסק בלילה ליד בסיס סודי נטוש. ניסוי "החייל המושלם" השתבש – והחיילים הפכו לצללים.<br>
      <b style="color:#f6e27a">הם זזים רק בחושך.</b> הפנס הוא הנשק הכי חזק שלך.</p>
      <button class="btn" id="bnew">▶️ משחק חדש <small>3 פרקים</small></button>
      ${sv?.v === 1 ? `<button class="btn" id="bcont">⏩ המשך <small>${CHAPTERS[sv.ch - 1].he}</small></button>` : ''}
      <button class="btn" id="bsnd">🔊 סאונד <small>${st.muted ? 'כבוי' : 'פועל'}</small></button>
      <div class="b9-muted">${touch ? 'ג׳ויסטיק שמאלי = תנועה · גרירה בצד ימין = מבט · ✋ פעולה · 🔦 פנס · 💥 ירי' : 'WASD תנועה · עכבר מבט · קליק ירי · E פעולה · F פנס · R טעינה · 1/2/3 נשק · Esc הפסקה'}<br>מומלץ עם אוזניות 🎧</div>
      <button class="btn" id="bback">→ חזרה</button>`);
    s.querySelector('#bnew').onclick = () => { au.start(); begin(newGame(), true); };
    s.querySelector('#bcont')?.addEventListener('click', () => { au.start(); begin(sv, false); });
    s.querySelector('#bsnd').onclick = () => { st.muted = !st.muted; au.setMuted(st.muted); menu(); };
    s.querySelector('#bback').onclick = exit;
  }
  function begin(state, fresh) {
    setScreen(null); disposeHud(); buildHud();
    load(state); checkpoint = JSON.parse(JSON.stringify(G)); store.set(SAVE_KEY, checkpoint);
    st.mode = 'play'; st.t = 0;
    const c = CHAPTERS[G.ch - 1]; title(c.he, c.sub, 4200);
    if (fresh) { voice('wake'); fadeIn(2.5); } else fadeIn(1);
    refreshGoal(); ctl.lock();
  }
  function fadeIn(sec) { if (!hudEls) return; const f = hudEls.fade; f.style.transition = 'none'; f.style.opacity = 1; void f.offsetWidth; f.style.transition = `opacity ${sec}s`; f.style.opacity = 0; }
  function pause(on) {
    if (st.mode !== 'play' && st.mode !== 'pause') return;
    if (!on) { setScreen(null); st.mode = 'play'; ctl.enabled = true; ctl.take('pause'); ctl.lock(); return; }
    st.mode = 'pause'; ctl.enabled = false; ctl.fireHeld = false;
    if (document.pointerLockElement) document.exitPointerLock();
    const docs = G.docs.map((id) => `<button class="chip" data-doc="${id}">${DOCS[id].icon} ${DOCS[id].title}</button>`).join('');
    const s = setScreen(`<h2>⏸ הפסקה</h2><div class="b9-muted">${CHAPTERS[G.ch - 1].he} · 🎯 ${typeof GOALS[G.goal] === 'function' ? GOALS[G.goal](G.installed) : GOALS[G.goal] || ''}</div>
      ${docs ? `<h3>📒 יומנים וקלטות</h3><div style="display:flex;flex-wrap:wrap;gap:6px">${docs}</div>` : ''}
      <button class="btn" id="pr">▶️ המשך</button><button class="btn" id="pc">↩️ חזרה לנקודת השמירה</button>
      <button class="btn" id="ps">🔊 סאונד <small>${st.muted ? 'כבוי' : 'פועל'}</small></button><button class="btn" id="pm">→ יציאה לתפריט</button>`);
    s.querySelector('#pr').onclick = () => pause(false);
    s.querySelector('#pc').onclick = () => begin(checkpoint, false);
    s.querySelector('#ps').onclick = () => { st.muted = !st.muted; au.setMuted(st.muted); pause(true); };
    s.querySelector('#pm').onclick = () => { au.setAmbience(null); menu(); };
    s.querySelectorAll('[data-doc]').forEach((b) => (b.onclick = () => { const id = b.dataset.doc; st.mode = 'play'; showDoc(id); popCb = () => { st.mode = 'play'; pause(true); }; }));
  }
  function die() {
    P.alive = false; st.mode = 'dead'; st.deadT = 0; au.sfx('die'); au.setDanger(0);
    if (document.pointerLockElement) document.exitPointerLock();
    if (ctl) ctl.enabled = false;
    setTimeout(() => {
      if (!T.active || st.mode !== 'dead') return;
      const s = setScreen(`<h2>💀 ${DEATH[Math.floor(Math.random() * DEATH.length)]}</h2><div class="b9-muted">${CHAPTERS[G.ch - 1].he}</div>
        <button class="btn" id="dc">↩️ חזרה לנקודת השמירה</button><button class="btn" id="dm">→ יציאה לתפריט</button>`);
      s.querySelector('#dc').onclick = () => begin(checkpoint, false);
      s.querySelector('#dm').onclick = () => { au.setAmbience(null); menu(); };
    }, 1400);
  }
  function reward(ch) {
    const r = store.get(REWARD_KEY) || {};
    const first = !r[ch]; r[ch] = (r[ch] || 0) + 1; store.set(REWARD_KEY, r);
    const n = REWARD[ch][first ? 0 : 1]; addCoins(n, 'base9');
    return n;
  }
  function chapterDone(ch) {
    const n = reward(ch);
    G.ch = ch + 1; P.chapter = G.ch; voiceQ.length = 0; voiceT = 0; sub(null);
    hud?.toast(`✔️ ${CHAPTERS[ch - 1].he} הושלם · 🪙 +${n}`, 3200);
    const c = CHAPTERS[G.ch - 1];
    setTimeout(() => { if (T.active && st.mode === 'play') title(c.he, c.sub, 4000); }, 1800);
    if (G.ch === 2) { voice('inside'); shadows.spawn(2, 6); }
    if (G.ch === 3) { voice('hangar'); level.setPower('hangar', true); shadows.spawn(3, 6); au.sfx('sting'); }
    const [x, z, y] = START[G.ch]; save(x, z, y);
    refreshGoal();
  }

  // ---------- אינטראקציה ----------
  let focus = null;
  function findFocus() {
    let best = null, bd = Infinity;
    for (const it of level.items) {
      if (!it.label || (it.done && !DOC_IDS.includes(it.id))) continue;
      const dx = it.pos.x - P.pos.x, dz = it.pos.z - P.pos.z, d = Math.hypot(dx, dz);
      if (d > it.r || Math.abs(it.pos.y - P.pos.y - 1) > 1.8) continue;
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }
  const pickup = (id, msg) => { level.take(id); flag(id); au.sfx('pickup'); if (msg) hud?.toast(msg, 1600); };
  function act() {
    if (st.mode !== 'play' || !focus || st.install) return;
    const id = focus.id;
    if (DOC_IDS.includes(id)) return showDoc(id);
    if (BAT_IDS.includes(id)) { pickup(id, '🔋 סוללה +50%'); G.battery = Math.min(100, G.battery + 50); return; }
    if (PARTS[id]) { pickup(id, `🔧 ${PARTS[id]}`); G.inv.parts.push(id); refreshGoal(); if (G.inv.parts.length + G.installed === 3) hud?.toast('יש את כל החלקים – למטוס!', 2000); return; }
    switch (id) {
      case 'flashlight': pickup(id, '🔦 פנס! F / 🔦 להדלקה'); G.inv.flashlight = true; P.lightOn = true; voice('flashlight'); refreshGoal(); break;
      case 'kit': pickup(id, '🔫 אקדח + 6 כדורים'); G.inv.pistol = true; G.ammo.pistol = 6; equip(1); voice('kit'); refreshGoal(); break;
      case 'radio': voice('wake'); au.radio(1.5); break;
      case 'card': pickup(id, '💳 כרטיס כניסה'); G.inv.card = true; refreshGoal(); break;
      case 'main':
        if (has('main_open')) return;
        if (!G.inv.card) { au.sfx('denied'); hud?.toast('נעול. צריך כרטיס', 1400); if (!has('gate')) { flag('gate'); voice('gate'); } refreshGoal(); return; }
        flag('main_open'); level.openDoor('main'); level.readerLed.material = new THREE.MeshBasicMaterial({ color: '#2aff6a' }); au.sfx('ok'); au.sfx('door'); break;
      case 'panel': pickup(id, '🔫 מצאת 6 כדורים מאחורי הלוח'); giveAmmo('pistol', 6); visualDone('panel'); break;
      case 'gen':
        if (has('power')) { hud?.toast('הגנרטור עובד', 1000); return; }
        flag('gen_seen');
        if (!G.inv.fuse) { au.sfx('denied'); hud?.toast('חסר נתיך 🔌', 1500); refreshGoal(); return; }
        G.inv.fuse = false; flag('power'); level.setPower('gen', true); level.genLed.material = new THREE.MeshBasicMaterial({ color: '#2aff6a' });
        au.sfx('gen'); voice('genOn'); hud?.toast('⚡ החשמל חזר', 1800); save(-5, 16, Math.PI / 2); refreshGoal(); break;
      case 'locker':
        if (!G.inv.key) { au.sfx('denied'); hud?.toast('נעולה. צריך מפתח קטן 🗝️', 1500); return; }
        pickup(id, '🔫 6 כדורים + 🔋 סוללה'); giveAmmo('pistol', 6); G.battery = Math.min(100, G.battery + 40); G.inv.key = false; visualDone('locker'); break;
      case 'drawer': pickup(id, '🗝️ מפתח קטן'); G.inv.key = true; break;
      case 'secpad':
        if (has('sec_open')) return;
        keypad(G.code.sec, () => { flag('sec_open'); flag('secpad'); level.openDoor('sec'); level.secPad.material = new THREE.MeshBasicMaterial({ color: '#2aff6a' }); au.sfx('door'); });
        break;
      case 'cache':
        if (G.rifleRoll) { pickup(id, '🎯 רובה סער! + 30 כדורים'); G.inv.rifle = true; G.ammo.rifle = 30; equip(2); }
        else { pickup(id, '🔫 8 כדורים לאקדח'); giveAmmo('pistol', 8); }
        break;
      case 'fuse': pickup(id, '🔌 נתיך'); G.inv.fuse = true; refreshGoal(); break;
      case 'hanpad':
        if (has('han_open')) return;
        if (!has('power')) { au.sfx('denied'); hud?.toast('המקלדת כבויה – אין חשמל', 1500); return; }
        keypad(G.code.a + G.code.b, () => { flag('han_open'); flag('hanpad'); level.openDoor('hangar'); level.hanPad.material = new THREE.MeshBasicMaterial({ color: '#2aff6a' }); au.sfx('door'); });
        break;
      case 'ammo_h': pickup(id, '🔫 4 כדורים'); giveAmmo('pistol', 4); if (G.inv.rifle) giveAmmo('rifle', 10); break;
      case 'jetfix':
        if (G.installed >= 3) { hud?.toast('המטוס מוכן', 1000); return; }
        if (!G.inv.parts.length) { hud?.toast(`חסרים חלקים (${G.installed}/3)`, 1400); return; }
        st.install = { t: 0, need: 2.2 * G.inv.parts.length }; hudEls.prog.style.display = 'block'; au.sfx('click'); break;
      case 'lever':
        if (has('bay_open')) return;
        if (G.installed < 3) { au.sfx('denied'); hud?.toast('קודם תקן את המטוס', 1400); return; }
        flag('bay_open'); flag('lever'); visualDone('lever'); level.openDoor('bay'); au.sfx('door'); au.sfx('sting'); refreshGoal();
        hud?.toast('השערים נפתחים!', 1800); shadows.spawn(3, 9); break;
      case 'board':
        if (!has('bay_open')) { hud?.toast(G.installed < 3 ? 'המטוס לא מוכן' : 'השערים סגורים', 1400); return; }
        startCine(); break;
    }
  }
  function updateInstall(dt) {
    const I = st.install; if (!I) return;
    const it = level.item('jetfix');
    if (Math.hypot(it.pos.x - P.pos.x, it.pos.z - P.pos.z) > it.r + 0.6) { st.install = null; hudEls.prog.style.display = 'none'; hud?.toast('התיקון הופסק', 900); return; }
    I.t += dt; hudEls.progI.style.width = (100 * I.t / I.need) + '%';
    hud?.setTop(`🔧 מתקין… ${Math.round(100 * I.t / I.need)}%`);
    if (I.t >= I.need) {
      G.installed += G.inv.parts.length; G.inv.parts = []; st.install = null; hudEls.prog.style.display = 'none'; au.sfx('ok');
      if (G.installed >= 3) { voice('lever'); hud?.toast('✈️ המטוס תוקן!', 1800); save(3.5, 69.5, 0); shadows.spawn(3, 8); }
      else voice('parts');
      refreshGoal();
    }
  }
  function toggleLight() {
    if (st.mode !== 'play' || !G.inv.flashlight) return;
    if (!P.lightOn && G.battery <= 0) { au.sfx('empty'); hud?.toast('הסוללה ריקה', 1000); return; }
    P.lightOn = !P.lightOn; au.sfx('click');
  }
  const onKey = (e) => {
    if (st.mode !== 'play' || e.repeat) return;
    if (e.code === 'KeyE') act();
    if (e.code === 'KeyF') toggleLight();
  };
  addEventListener('keydown', onKey);

  // ---------- סוף: טוויסט + המראה ----------
  function startCine() {
    st.mode = 'cine'; st.cine = { t: 0, x: level.jet.position.x, z: level.jet.position.z, y: 0, v: 0, done: false };
    if (ctl) ctl.enabled = false; if (document.pointerLockElement) document.exitPointerLock();
    rig.root.visible = false; P.lightOn = false; shadows.clear(); au.setDanger(0);
    hud?.show(false); if (ctl?.layer) ctl.layer.style.display = 'none'; for (const c of hudEls.root.children) if (!c.matches('.b9-sub, .b9-fade')) c.style.display = 'none';
    for (const n of level.jet.userData.nozzles || []) { if (n.flame) n.flame.visible = true; if (n.disc) n.disc.visible = true; }
    voiceQ.length = 0; voiceT = 0; voice('twist'); au.sfx('engine');
    const skip = document.createElement('button'); skip.className = 'chip'; skip.textContent = 'דלג ⏭'; skip.style.cssText = 'position:absolute;bottom:20px;left:20px;pointer-events:auto;z-index:6';
    skip.onclick = () => endScreen(); hudEls.root.appendChild(skip);
  }
  function updateCine(dt) {
    const c = st.cine; c.t += dt;
    const j = level.jet;
    if (c.t > 3) c.v = Math.min(60, c.v + dt * (c.t > 9 ? 14 : 3));
    c.z += c.v * dt;
    if (c.z > 120) c.y += (c.v * 0.28) * dt;
    j.position.set(c.x, c.y, c.z); j.rotation.x = -Math.min(0.25, Math.max(0, (c.z - 120) * 0.006));
    j.userData.setThrottle?.(clamp(c.v / 40, 0.2, 1)); j.userData.update?.(dt);
    // מצלמה: מבפנים ההאנגר → עוקבת מהצד
    const cz = Math.min(c.z - 10, 160);
    camera.position.set(9, 2.2 + c.y * 0.3, Math.max(70, cz));
    camera.lookAt(j.position.x, j.position.y + 1.5, j.position.z);
    muzzle.position.set(c.x, c.y + 1, c.z - 9); muzzle.intensity = 8 * clamp(c.v / 30, 0, 1); muzzle.color.set('#7fb8ff');
    moon.intensity = 0.25 + clamp((c.z - 90) / 30, 0, 1) * 0.5; amb.intensity = 0.15; scene.fog.density = 0.022;
    if (c.t > 21 && !c.done) endScreen();
  }
  function endScreen() {
    if (st.cine?.done) return; if (st.cine) st.cine.done = true;
    st.mode = 'end'; const n = reward(3); store.set(SAVE_KEY, null); voiceQ.length = 0; sub(null); au.setAmbience(null);
    const s = setScreen(`<h2>${ENDING.title}</h2>${ENDING.body.map((p) => `<p>${p}</p>`).join('')}
      <div style="text-align:center;font-size:20px;color:#ffd54a;font-weight:900">🪙 +${n}</div>
      <div class="b9-muted">3/3 פרקים · נאספו ${G.docs.length}/${DOC_IDS.length} יומנים וקלטות</div>
      <button class="btn" id="en">🔁 שחק שוב</button><button class="btn" id="em">→ יציאה</button>`);
    s.querySelector('#en').onclick = () => begin(newGame(), true);
    s.querySelector('#em').onclick = exit;
  }

  function exit() {
    removeEventListener('keydown', onKey);
    disposeHud(); setScreen(null); au.dispose();
    level?.dispose(); shadows?.dispose(); scene.remove(root); style.remove();
    scene.background = saved.bg; scene.fog = saved.fog; scene.environment = saved.env;
    for (const [l, i] of saved.lights) l.intensity = i;
    camera.fov = saved.fov; camera.near = saved.near; camera.far = saved.far; camera.updateProjectionMatrix();
    if (renderer && saved.pr) renderer.setPixelRatio(saved.pr);
    T.active = false; back();
  }

  // ---------- תאורה ----------
  let poolT = 0, ambK = 1;
  function updateLights(dt, t) {
    for (const l of level.lamps) {
      if (!l.on) { l.cur = 0; l.m.material.emissiveIntensity = 0; continue; }
      l.ft = (l.ft ?? 0) - dt;
      if (l.ft <= 0) {
        l.ft = rnd(0.04, 0.5);
        const was = l.cur; l.cur = Math.random() < l.flicker * 0.55 ? rnd(0, 0.25) : rnd(0.85, 1);
        if (was > 0.5 && l.cur < 0.5 && l.flicker > 0.3 && P.pos.distanceTo(l.pos) < 8 && Math.random() < 0.3) au.sfx('flick');
      }
      l.m.material.emissiveIntensity = l.cur * 2.2;
    }
    poolT -= dt;
    if (poolT <= 0) {
      poolT = 0.2;
      const cand = level.lamps.filter((l) => l.on).map((l) => [l, l.pos.distanceToSquared(P.pos)]).sort((a, b) => a[1] - b[1]).slice(0, pool.length);
      pool.forEach((p, i) => { const c = cand[i]; p.lamp = c ? c[0] : null; if (p.lamp) { p.l.position.copy(p.lamp.pos); p.l.color.copy(p.lamp.color); p.l.distance = p.lamp.r * 1.9; } });
    }
    for (const p of pool) p.l.intensity = p.lamp ? p.lamp.cur * (p.lamp.fire ? 14 * (0.75 + 0.25 * Math.sin(t * 13) * Math.sin(t * 7.3)) : p.lamp.r > 6 ? 30 : 13) : 0;
    // ירח ואור סביבה לפי האזור
    const out = P.pos.z < 0.5 ? 1 : 0; ambK += (out - ambK) * (1 - Math.exp(-2 * dt));
    moon.intensity = 0.06 + ambK * 0.65; amb.intensity = 0.05 + ambK * 0.1;
    scene.fog.density = 0.075 - ambK * 0.02;
    near.position.set(P.pos.x, P.pos.y + 2.2, P.pos.z); near.intensity = 2.2 + (1 - ambK) * 1.2;
    if (st.mode !== 'cine') muzzle.intensity = Math.max(0, muzzle.intensity - dt * 160);
    if (tracerT > 0 && (tracerT -= dt) <= 0) tracer.visible = false;
  }

  // ---------- לולאת שחקן ----------
  const _cam = new V3(), _piv = new V3(), _dir = new V3(), _wish = new V3();
  function updatePlayer(dt) {
    const id = SLOTS[P.w];
    if (ctl && P.alive && st.mode === 'play') {
      const l = ctl.lookDelta();
      P.yaw -= l.x * (1 - P.aim * 0.4); P.pitch = clamp(P.pitch + l.y * (1 - P.aim * 0.4), -1.1, 1.1);
      if (ctl.take('slot1')) equip(0); if (ctl.take('slot2')) equip(1); if (ctl.take('slot3')) equip(2);
      if (ctl.take('switch')) { const o = owned(); equip(SLOTS.indexOf(o[(o.indexOf(SLOTS[P.w]) + 1) % o.length])); }
      if (ctl.take('reload')) reload();
      if (ctl.take('jump') && P.ground) { P.vy = JUMP; P.ground = false; }
      if (ctl.take('pause')) pause(true);
      P.cd -= dt;
      const pressed = ctl.take('fire');
      if (P.cd <= 0 && !st.install && (pressed || (ctl.fireHeld && (id === 'rifle' || id === 'knife')))) fire();
      P.aim += ((ctl.aimHeld ? 1 : 0) - P.aim) * (1 - Math.exp(-12 * dt));
    }
    if (P.reloadT > 0) { P.reloadT -= dt; if (P.reloadT <= 0) { P.reloadT = 0; finishReload(); } }
    const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw);
    const mv = ctl && P.alive && st.mode === 'play' && !st.install ? ctl.move : { x: 0, y: 0 };
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
    if (P.speed > 1 && P.ground) { P.stepT -= dt * P.speed; if (P.stepT <= 0) { P.stepT = 2.1; au.sfx('step'); } }
    if (P.kick > 0) { const rc = Math.min(P.kick, P.kick * 7 * dt + 0.0004); P.pitch -= rc; P.kick -= rc; }

    rig.root.position.copy(P.pos); rig.root.rotation.set(0, P.yaw, 0);
    const yawRate = (P.yaw - P.yawPrev) / Math.max(dt, 1e-3); P.yawPrev = P.yaw;
    const s = P.speed <= WALK ? (P.speed / WALK) * 0.5 : 0.5 + clamp((P.speed - WALK) / (RUN - WALK), 0, 1) * 0.5;

    // מצלמה מעל הכתף, קרובה יותר מבאימון (תחושה צפופה)
    const cp = Math.cos(P.pitch);
    _dir.set(fx * cp, Math.sin(P.pitch), fz * cp);
    const side = 0.8 - P.aim * 0.25, dist = 2.5 - P.aim * 0.8;
    _piv.set(P.pos.x - fz * side, P.pos.y + 1.75, P.pos.z + fx * side);
    _cam.copy(_dir).negate();
    let t = rayBoxes(_piv, _cam, dist + 0.25, true);
    t = Math.max(0.3, Math.min(dist, t - 0.25));
    camera.position.copy(_piv).addScaledVector(_cam, t);
    camera.position.y = clamp(camera.position.y, 0.25, level.ceilAt(P.pos) - 0.2);
    if (P.shake > 0) { P.shake = Math.max(0, P.shake - dt * 2); camera.position.x += (Math.random() - 0.5) * P.shake * 0.2; camera.position.y += (Math.random() - 0.5) * P.shake * 0.2; }
    camera.lookAt(_cam.copy(camera.position).add(_dir));
    const ta = rayBoxes(camera.position, _dir, 40, true);
    _aimPt.copy(camera.position).addScaledVector(_dir, Math.max(2, ta));
    an.update(dt, { speed: s, pitch: P.pitch, yawRate, aiming: P.aim > 0.5, aimPoint: _aimPt });
    const fov = 68 - P.aim * 16; if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = fov; camera.updateProjectionMatrix(); }

    // פנס: יוצא מהכתף הימנית לנקודת הכוונת
    if (P.lightOn) { G.battery = Math.max(0, G.battery - dt * DRAIN); if (G.battery <= 0) { P.lightOn = false; au.sfx('empty'); hud?.toast('🔦 הסוללה נגמרה!', 1500); } }
    P.lightPos.set(P.pos.x - fz * 0.28 + fx * 0.25, P.pos.y + 1.45, P.pos.z + fx * 0.28 + fz * 0.25);
    P.lightDir.subVectors(_aimPt, P.lightPos).normalize();
    torch.position.copy(P.lightPos); torch.target.position.copy(_aimPt);
    let flick = 1;
    if (G.battery < 15) flick = Math.sin(st.t * 31) * Math.sin(st.t * 7) > 0.5 ? 0.2 : 1;
    torch.intensity = P.lightOn ? 260 * flick * (0.6 + 0.4 * Math.min(1, G.battery / 30)) : 0;
    P.lightRange = 14 + Math.min(1, G.battery / 40) * 8;
  }

  function updateHud(dt) {
    if (!hud) return;
    const id = SLOTS[P.w];
    hud.setHp(G.hp); hud.setReticle(id); hud.setWeapons(owned().map((x) => W(x)), owned().indexOf(id));
    const E = hudEls, L = E.last;
    const am = id === 'knife' ? '🔪' : P.reloadT > 0 ? '…' : `${G.ammo[id]} <small>/ ${G.reserve[id]}</small>`;
    if (L.am !== am) { L.am = am; E.am.innerHTML = am; E.wn.textContent = W(id).he; }
    const b = Math.ceil(G.battery);
    if (L.b !== b) { L.b = b; E.bp.textContent = b + '%'; E.bat.style.width = b + '%'; E.bat.classList.toggle('low', b < 20); }
    itemsBar();
    if (E.light) E.light.classList.toggle('hot', P.lightOn), E.light.classList.toggle('off', !G.inv.flashlight);
    // הנחיה לפעולה
    focus = st.mode === 'play' ? findFocus() : null;
    const pk = focus ? focus.id + (focus.done ? 'd' : '') : '';
    if (L.pk !== pk) {
      L.pk = pk;
      E.prompt.style.display = focus ? 'block' : 'none';
      if (focus) E.prompt.innerHTML = `${touch ? '✋' : '<kbd>E</kbd>'}${DOC_IDS.includes(focus.id) ? 'לקרוא: ' : ''}${focus.label}`;
      E.use?.classList.toggle('hot', !!focus);
    }
    E.dmg.style.opacity = P.hurtT < 0.6 ? 1 : G.hp < 40 ? 0.5 : 0;
  }

  // ---------- טריגרים לפי מיקום ----------
  function triggers() {
    const z = P.pos.z;
    if (G.ch === 1 && has('main_open') && z > 1.2) chapterDone(1);
    else if (G.ch === 2 && z > 59.5) chapterDone(2);
    if (G.ch === 2 && z > 10 && !has('v_power')) { flag('v_power'); voice('power'); }
    if (G.ch === 2 && z > 43 && !has('v_lab')) { flag('v_lab'); voice('lab'); au.sfx('whisper'); }
    const area = level.areaAt(P.pos); if (area !== st.area) { st.area = area; au.setAmbience(area); }
  }

  const T = {
    active: true,
    get G() { return G; }, P, st, get level() { return level; }, get shadows() { return shadows; }, get ctl() { return ctl; },
    // לבדיקות
    tp(x, z, yaw = P.yaw) { P.pos.set(x, 0, z); P.vel.set(0, 0, 0); P.yaw = yaw; },
    act(id) { focus = level.item(id); act(); }, closePopup, begin, newGame, exit, menu,
    update(dt) {
      if (!T.active || !level) return;
      dt = Math.min(dt, 0.05); st.t += dt;
      level.update(dt, st.t);
      updateLights(dt, st.t);
      if (st.mode === 'menu') { // מבט איטי על ההריסות
        const a = st.t * 0.05;
        camera.position.set(1 + Math.sin(a) * 4, 2.4, -48 + Math.cos(a) * 2); camera.lookAt(8, 1, -37);
        rig.root.visible = false; return;
      }
      if (st.mode === 'cine') { updateCine(dt); updateVoice(dt); return; }
      if (st.mode === 'end') return;
      rig.root.visible = true;
      if (st.mode === 'pause' || st.mode === 'popup') { an.update(dt, { speed: 0 }); return; }
      updatePlayer(dt);
      if (st.mode === 'dead') { st.deadT += dt; rig.root.rotation.x = -Math.min(1.4, st.deadT * 2.5); camera.position.y = Math.max(0.6, camera.position.y - dt); return; }
      const r = shadows.update(dt, P);
      for (const e of r.events) {
        if (e.type === 'first') { au.sfx('sting'); if (!has('v_first')) { flag('v_first'); voice('firstShadow'); } }
        if (e.type === 'burn') au.sfx('hiss');
        if (e.type === 'whisper') au.sfx('whisper');
        if (e.type === 'hit' && P.alive) {
          G.hp -= e.dmg; P.hurtT = 0; P.shake = 1; au.sfx('hurt');
          const dx = e.s.pos.x - P.pos.x, dz = e.s.pos.z - P.pos.z, fx = Math.sin(P.yaw), fz = Math.cos(P.yaw);
          hud?.hurt(Math.atan2(dx * -fz + dz * fx, dx * fx + dz * fz));
          if (G.hp <= 0) { G.hp = 0; die(); }
        }
      }
      au.setDanger(r.near < 9 ? 1 - r.near / 9 : 0); au.tick(dt);
      P.hurtT += dt; if (P.hurtT > 8 && G.hp < 100) G.hp = Math.min(100, G.hp + dt * 2.5);
      updateInstall(dt); updateVoice(dt); triggers(); updateHud(dt);
    },
  };
  menu();
  return T;
}

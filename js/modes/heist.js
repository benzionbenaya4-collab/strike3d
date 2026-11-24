// 👑 ארמון הזהב – התגנבות: שומרים עם חרוטי ראייה, מצלמות (נטרול דרך מסוף), פריצה (משחק זיכרון), כספות (חוגה), שלל.
// בכספת האחרונה יש מפה של עיר נסתרת וצבא סודי. בסוף בוחרים: לברוח עם הזהב או לעצור את המלך. לכל בחירה יש פרק סיום אחר.
// startHeist(scene, camera, ui, back, renderer) → { active, update(dt) }
import * as THREE from 'three';
import { createSession, replayable, makeNpc, canvasTex, whoHtml, saveStory, getStory, V3, clamp, rnd, angDiff, beep, buzz } from './storykit.js';
import { addCoins } from '../store.js';

// ---------- מפה (תא = 2 מ׳) ----------
// # קיר · . רצפה · , דשא · h גדר חיה · f מזרקה · c עמוד · = שער הכספת
const MAP = [
  '########################', //0   חדר הכס (1-8) · גלריה (10-13) · חדר הכספת (15-22)
  '#........#....#........#',
  '#........#....#........#',
  '#........#....#........#',
  '#........#....#........#',
  '#........#....#........#',
  '#........#....#........#',
  '####.#####....####=#####', //7
  '#.....#..........#.....#', //8   אוצר (מערב) · אולם · אבטחה (מזרח)
  '#.....#..c....c..#.....#',
  '#.....#..........#.....#',
  '#......................#',
  '#.....#..c....c..#.....#',
  '#.....#..........#.....#',
  '#.....#..........#.....#',
  '###########..###########', //15
  '#,,,,,,,,,,,,,,,,,,,,,,#', //16  גן
  '#,hhhh,,,,,,,,,,,,hhhh,#',
  '#,,,,,,,,,,ff,,,,,,,,,,#',
  '#,,,,,,,,,,ff,,,,,,,,,,#',
  '#,hhhh,,,,,,,,,,,,hhhh,#',
  '#,,,,,,,,,,,,,,,,,,,,,,#',
  '####,###################', //22  פרצה בחומה (c4)
];
const CX = (c) => (c - 11.5) * 2, CZ = (r) => (r - 11) * 2;
const at = (r, c, y = 0) => new V3(CX(c), y, CZ(r));
const GUARDS = [
  { route: [[16, 1], [16, 8], [19, 8], [19, 1]] },
  { route: [[21, 8], [21, 22], [16, 22], [16, 9]] },
  { route: [[8, 8], [8, 15], [14, 15], [14, 8]] },
  { route: [[9, 19], [14, 19], [14, 21], [9, 21]] },
  { route: [[2, 2], [2, 7], [5, 7], [5, 2]], throne: true },
];
const CAMS = [
  { r: 8, c: 7, yaw: Math.PI / 4, sweep: 0.6 },        // אולם
  { r: 8, c: 18, yaw: Math.PI / 4, sweep: 0.55 },      // אגף האבטחה
  { r: 1, c: 10, yaw: 0.35, sweep: 0.4 },              // גלריה
  { r: 6, c: 15, yaw: 3 * Math.PI / 4, sweep: 0.5 },   // חדר הכספת
  { r: 14, c: 1, yaw: 3 * Math.PI / 4, sweep: 0.5 },   // אוצר
];
const LOOT = [ // [r, c, סוג, ערך]
  [17, 22, 'gem', 20], [9, 12, 'bar', 15], [14, 11, 'bar', 15], [2, 11, 'crown', 30], [4, 12, 'gem', 20], [6, 10, 'bar', 15],
  [10, 3, 'bar', 15], [12, 20, 'gem', 20], [3, 20, 'pile', 40], [4, 16, 'pile', 40], [6, 7, 'gem', 20],
];
const G_RANGE = 8.5, G_HALF = 0.55, C_RANGE = 11, C_HALF = 0.42, FAN = 14;

let MAT = null;
function mats() {
  if (MAT) return MAT;
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0, ...o });
  const marble = canvasTex(256, 256, (g, w, h) => {
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) { g.fillStyle = (x + y) % 2 ? '#e9e1cf' : '#3b2f2a'; g.fillRect(x * 128, y * 128, 128, 128); }
    g.strokeStyle = '#c9a44a'; g.lineWidth = 3; g.strokeRect(0, 0, w, h); g.strokeRect(128, 0, 0.1, h);
    for (let i = 0; i < 30; i++) { g.strokeStyle = `rgba(120,110,100,${Math.random() * 0.15})`; g.beginPath(); g.moveTo(Math.random() * w, Math.random() * h); g.lineTo(Math.random() * w, Math.random() * h); g.stroke(); }
  }, 1);
  const stone = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#d8c9a8'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#a89676'; g.lineWidth = 3;
    for (let y = 0; y < 8; y++) { g.beginPath(); g.moveTo(0, y * 32); g.lineTo(w, y * 32); g.stroke(); for (let x = 0; x < 4; x++) { const xx = x * 64 + (y % 2) * 32; g.beginPath(); g.moveTo(xx, y * 32); g.lineTo(xx, y * 32 + 32); g.stroke(); } }
    for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`; g.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
  });
  const grass = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#1f3a22'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(${40 + Math.random() * 40},${80 + Math.random() * 60},${40},0.35)`; g.fillRect(Math.random() * w, Math.random() * h, 1, 3); }
  }, 18);
  const glowTex = canvasTex(64, 64, (g, w, h) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, '#fff'); gr.addColorStop(0.4, '#ffffff55'); gr.addColorStop(1, '#fff0'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  MAT = {
    marble: std({ map: marble, roughness: 0.25, metalness: 0.1 }), stone: std({ map: stone }), grass: std({ map: grass, roughness: 1 }),
    hedge: std({ color: '#2f5a2a', roughness: 1 }), gold: std({ color: '#ffc83a', metalness: 0.9, roughness: 0.25, emissive: '#5a3a00', emissiveIntensity: 0.6 }),
    trim: std({ color: '#c9a44a', metalness: 0.8, roughness: 0.35 }), red: std({ color: '#7a1420' }), carpet: std({ color: '#8a1626', roughness: 1 }),
    steel: std({ color: '#6e7682', metalness: 0.8, roughness: 0.35 }), dark: std({ color: '#1a1c22', metalness: 0.4, roughness: 0.5 }),
    gem: std({ color: '#3ad0ff', metalness: 0.3, roughness: 0.1, emissive: '#0a5a80', emissiveIntensity: 0.8 }),
    water: std({ color: '#203a5a', roughness: 0.05, metalness: 0.6 }), screen: new THREE.MeshBasicMaterial({ color: '#36e27a' }),
    led: new THREE.MeshBasicMaterial({ color: '#ff2a2a' }), lamp: new THREE.MeshBasicMaterial({ color: '#ffd68a' }), glowTex,
  };
  return MAT;
}

const CSS = `
.hs-alarm { position:absolute; inset:0; pointer-events:none; box-shadow:inset 0 0 120px 30px #ff1a1a; opacity:0; }
.hs-eye { position:absolute; top:max(52px, calc(env(safe-area-inset-top) + 42px)); }
@media (max-width:520px) { .hs-eye { top:max(74px, calc(env(safe-area-inset-top) + 64px)); } }
.hs-eye { left:50%; transform:translate(-50%,-6px); font-size:18px; pointer-events:none; }
.hs-loot { position:absolute; top:max(10px, env(safe-area-inset-top)); right:10px; background:#0b0d12bb; border:1px solid #2a3142; border-radius:12px; padding:6px 10px; font-weight:800; color:#ffd54a; }
.hs-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; width:min(270px,76vw); align-self:center; }
.hs-node { aspect-ratio:1; border-radius:16px; border:2px solid #2a3142; background:#0b0d12; cursor:pointer; transition:background .12s, box-shadow .12s; touch-action:manipulation; }
.hs-node.lit { background:#36e27a; box-shadow:0 0 24px #36e27a; border-color:#36e27a; }
.hs-node.bad { background:#ff3b3b; box-shadow:0 0 24px #ff3b3b; }
.hs-term { font-family:ui-monospace,monospace; background:#06100a; color:#36e27a; border-radius:10px; padding:8px 10px; font-size:13px; direction:ltr; text-align:left; min-height:38px; }
.hs-dial { width:min(240px,66vw); height:min(240px,66vw); align-self:center; touch-action:none; cursor:grab; }
.hs-digits { display:flex; gap:10px; justify-content:center; font:900 26px ui-monospace,monospace; direction:ltr; }
.hs-digits span { background:#0b0d12; border-radius:10px; padding:4px 10px; min-width:56px; text-align:center; border:1px solid #2a3142; }
.hs-digits span.ok { color:#36e27a; border-color:#36e27a; } .hs-digits span.cur { border-color:#ffb020; }
.hs-noise { height:12px; background:#0b0d12; border-radius:6px; overflow:hidden; } .hs-noise i { display:block; height:100%; width:0; background:linear-gradient(90deg,#3a6,#ffd54a,#36e27a); }
.hs-map { width:100%; border-radius:12px; background:#1a140a; }
.hs-stars { text-align:center; font-size:34px; letter-spacing:4px; }
`;

function createHeist(scene, camera, ui, back, renderer) {
  const M = mats();
  const start = at(21, 4);
  const S = createSession({ scene, camera, ui, renderer, back, sky: '#0a0c1c', fog: ['#0a0c1c', 25, 80], dim: 0.15, exposure: 1.1,
    skin: { hoodie: '#1b1d24', hoodieDk: '#14161b', vest: '#2a2d36', pouch: '#23262e', pants: '#1b1d24', pantsDk: '#14161b', boots: '#111', mask: '#0a0a0a', hair: '#101010' },
    start: { x: start.x, z: start.z, yaw: Math.PI } });
  S.bounds = [-23, 23, -22.5, 22.5];
  S.camDist = 4.2;
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  const alarmEl = document.createElement('div'); alarmEl.className = 'hs-alarm'; S.hud.prepend(alarmEl);
  const eyeEl = document.createElement('div'); eyeEl.className = 'hs-eye'; eyeEl.textContent = '👁️'; S.hud.appendChild(eyeEl);
  const lootEl = document.createElement('div'); lootEl.className = 'hs-loot'; S.hud.appendChild(lootEl);
  const root = S.root, W = S.world, G = S.worldG;

  // ---------- תאורה ----------
  root.add(new THREE.HemisphereLight('#6a78b0', '#1a140c', 0.7));
  const moon = new THREE.DirectionalLight('#9fb0ff', 0.6); moon.position.set(-15, 30, 20); root.add(moon);
  const pl = (p, c, i, d) => { const l = new THREE.PointLight(c, i, d, 1.5); l.position.copy(p); root.add(l); return l; };
  pl(at(11, 11.5, 3.6), '#ffcf80', 10, 20);
  pl(at(3, 18.5, 3.4), '#ffd27a', 9, 16);
  pl(at(3, 4.5, 3.4), '#ff9a5a', 8, 16);
  pl(at(11, 3, 3.2), '#ffcf80', 5, 12); pl(at(11, 20, 3.2), '#a0c8ff', 5, 12);
  const alarmL = pl(at(11, 11.5, 6), '#ff2020', 0, 50);
  const fill = new THREE.PointLight('#b8c4ff', 3.5, 8, 1.4); root.add(fill); // אור מילוי עדין על הגנב
  S.P.pitch = -0.32;

  // ---------- בנייה מהמפה ----------
  const cell = (r, c) => MAP[r]?.[c] ?? '#';
  const interiorD = 32, gardenD = 14;
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(48, interiorD), M.marble); fl.rotation.x = -Math.PI / 2; fl.position.set(0, 0, CZ(7.5));
  fl.geometry.attributes.uv.array.forEach((_, i, a) => { a[i] *= i % 2 ? interiorD / 4 : 48 / 4; }); G.add(fl);
  const gr = new THREE.Mesh(new THREE.PlaneGeometry(48, gardenD), M.grass); gr.rotation.x = -Math.PI / 2; gr.position.set(0, 0, CZ(19)); G.add(gr);
  for (let r = 0; r < MAP.length; r++) { // קירות: איחוד רצפים בשורה
    let c = 0;
    while (c < 24) {
      if (cell(r, c) !== '#') { c++; continue; }
      let e = c; while (e < 23 && cell(r, e + 1) === '#') e++;
      const outer = r === 0 || r === 22 || c === 0 || e === 23 || r >= 16;
      const h = outer ? 5 : 4.2, w = (e - c + 1) * 2;
      W.add((CX(c) + CX(e)) / 2, CZ(r), w, h, 2, M.stone, 0, { uv: 4 });
      W.add((CX(c) + CX(e)) / 2, CZ(r), w + 0.1, 0.25, 2.1, M.trim, h - 0.25, { collide: false });
      c = e + 1;
    }
  }
  for (let r = 0; r < MAP.length; r++) for (let c = 0; c < 24; c++) {
    const k = cell(r, c);
    if (k === 'h') W.add(CX(c), CZ(r), 2, 1.8, 1.8, M.hedge);
    if (k === 'c') { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 4.2, 14), M.stone); m.position.set(CX(c), 2.1, CZ(r)); G.add(m); W.solid(CX(c), CZ(r), 1, 4.2, 1); }
  }
  // מזרקה
  { const p = at(18.5, 11.5); W.solid(p.x, p.z, 4, 0.9, 4, 0, false);
    const b = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.1, 0.8, 24), M.stone); b.position.set(p.x, 0.4, p.z); G.add(b);
    const w = new THREE.Mesh(new THREE.CylinderGeometry(1.85, 1.85, 0.05, 24), M.water); w.position.set(p.x, 0.78, p.z); G.add(w);
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 1.8, 10), M.trim); s.position.set(p.x, 1.4, p.z); G.add(s); }
  // שער הכספת
  const gateP = at(7, 18);
  const gate = W.add(gateP.x, gateP.z, 2, 4.2, 0.4, M.steel);
  for (let i = -3; i <= 3; i++) { const bar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 4.2, 0.08), M.trim); bar.position.set(i * 0.26, 0, 0.25); gate.add(bar); }
  // שטיח אדום מהכניסה לחדר הכס, כס, מסוף צבא
  W.add(CX(11.5), CZ(11), 3, 0.02, 14, M.carpet, 0, { collide: false });
  W.add(CX(4.5), CZ(3.5), 2.4, 0.02, 9, M.carpet, 0, { collide: false });
  const throne = at(1.2, 4.5);
  W.add(throne.x, throne.z, 1.6, 0.6, 1.2, M.trim); W.add(throne.x, throne.z - 0.5, 1.6, 2.6, 0.3, M.gold, 0.6);
  W.add(CX(1.5), CZ(1), 1.6, 1.1, 0.8, M.dark); const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.7), M.led); scr.position.set(CX(1.5), 1.5, CZ(1) + 0.41); G.add(scr);
  // פנסי גן
  for (const [r, c] of [[16, 4], [16, 19], [21, 9], [21, 14], [18, 8], [18, 15]]) {
    const p = at(r, c); const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2, 6), M.dark); post.position.set(p.x, 1, p.z); G.add(post);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), M.lamp); b.position.set(p.x, 2.05, p.z); G.add(b);
    const h = new THREE.Sprite(new THREE.SpriteMaterial({ map: M.glowTex, color: '#ffc870', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })); h.scale.set(1.6, 1.6, 1); h.position.copy(b.position); G.add(h);
  }
  // תמונות וגביעים לקישוט
  for (const [r, c, rot] of [[8, 10, 0], [8, 13, 0], [14, 10, Math.PI], [14, 13, Math.PI]]) {
    const p = at(r, c); const fr = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.1, 0.08), M.trim); fr.position.set(p.x, 2.4, p.z + (rot ? 0.95 : -0.95)); G.add(fr);
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.9), new THREE.MeshStandardMaterial({ color: ['#5a2a6a', '#2a4a6a', '#6a4a2a', '#2a5a3a'][(r + c) % 4] })); pic.position.set(p.x, 2.4, p.z + (rot ? 0.9 : -0.9)); pic.rotation.y = rot; G.add(pic);
  }

  // ---------- שלל ----------
  const lootGeo = { bar: new THREE.BoxGeometry(0.5, 0.18, 0.25), gem: new THREE.OctahedronGeometry(0.22), crown: new THREE.CylinderGeometry(0.26, 0.22, 0.25, 8, 1, true), pile: new THREE.ConeGeometry(0.7, 0.6, 9) };
  const st = { loot: 0, lootN: 0, camsOff: false, gateOpen: false, safe1: false, vault: false, caught: 0, phase: 'sneak', meter: 0, check: start.clone(), checkYaw: Math.PI, alarm: false, timer: 0, choice: null, paid: false, inHall: false };
  const loots = LOOT.map(([r, c, k, v]) => {
    const m = new THREE.Mesh(lootGeo[k], k === 'gem' ? M.gem : M.gold); const p = at(r, c);
    m.position.set(p.x, k === 'pile' ? 0.3 : 0.6, p.z); G.add(m);
    if (k === 'bar') { const m2 = m.clone(); m2.position.y = 0.2; m2.position.x += 0.1; m.add(m2); m2.position.set(0.12, -0.18, 0.05); }
    return { m, k, v, taken: false, base: m.position.y };
  });
  const updLoot = () => { lootEl.textContent = `💰 ${st.loot}`; };

  // ---------- שומרים ----------
  const guardOutfit = { hoodie: '#7a1420', hoodieDk: '#5e0f18', vest: '#d4a83a', pouch: '#b38a26', strap: '#3a2a0a', pants: '#1a1a22', pantsDk: '#121218', hair: '#222', mask: '#20140a', boots: '#120c08' };
  const fanMat = () => new THREE.MeshBasicMaterial({ color: '#ffe066', transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
  function makeFan() {
    const pos = new Float32Array((FAN + 2) * 3), idx = [];
    for (let i = 0; i < FAN; i++) idx.push(0, i + 1, i + 2);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx);
    const m = new THREE.Mesh(g, fanMat()); m.frustumCulled = false; m.renderOrder = 2; root.add(m); return m;
  }
  const _o = new V3(), _d = new V3();
  function updateFan(fan, origin, yaw, half, range, y0 = 0.06) {
    const pos = fan.geometry.attributes.position;
    pos.setXYZ(0, origin.x, y0, origin.z);
    _o.set(origin.x, 1.0, origin.z);
    for (let i = 0; i <= FAN; i++) {
      const a = yaw - half + (2 * half * i) / FAN;
      _d.set(Math.sin(a), 0, Math.cos(a));
      const t = Math.min(range, W.ray(_o, _d, range));
      pos.setXYZ(i + 1, origin.x + _d.x * t, y0, origin.z + _d.z * t);
    }
    pos.needsUpdate = true;
  }
  const guards = GUARDS.map((g, i) => {
    const p0 = at(...g.route[0]);
    const n = makeNpc(G, guardOutfit, p0.x, p0.z, 0);
    const spear = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2, 6), M.trim); spear.position.set(0, 0.2, 0.05); n.rig.j.handR?.add(spear);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.25, 6), M.steel); tip.position.y = 1.1; spear.add(tip);
    return { n, route: g.route.map(([r, c]) => at(r, c)), wp: 1, wait: 0, state: 'patrol', look: 0, seeing: false, fan: makeFan(), throne: !!g.throne, i, sus: null, susT: 0 };
  });
  function resetGuards() {
    for (const g of guards) { g.n.pos.copy(g.route[0]); g.wp = 1; g.wait = 0; g.state = st.alarm ? 'alert' : 'patrol'; g.sus = null; g.n.yaw = Math.atan2(g.route[1].x - g.route[0].x, g.route[1].z - g.route[0].z); }
  }
  resetGuards();

  // ---------- מצלמות ----------
  const cams = CAMS.map((c) => {
    const p = at(c.r, c.c, 3.3);
    const g = new THREE.Group(); g.position.copy(p); G.add(g);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.22, 0.5), M.dark); body.position.z = 0.2; g.add(body);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 10), M.steel); lens.rotation.x = Math.PI / 2; lens.position.z = 0.47; g.add(lens);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), M.led.clone()); led.position.set(0, 0.14, 0.3); g.add(led);
    g.rotation.x = 0.35;
    return { ...c, p, g, led, fan: makeFan(), t: Math.random() * 6, cur: c.yaw, seeing: false };
  });

  // ---------- נקודות פעולה ----------
  const termB = at(8, 1), termA = at(14, 22), safe1 = at(14, 5), vaultP = at(1, 18.5), consoleP = at(1.6, 1.5), exitP = at(22, 4);
  const terminal = (p, rot) => { W.add(p.x, p.z, 1, 1.3, 0.6, M.dark); const s = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), M.screen.clone()); s.position.set(p.x, 1.05, p.z); s.rotation.y = rot; s.translateZ(0.31); G.add(s); return s; };
  const scrB = terminal(termB, Math.PI / 2 + Math.PI / 4 * 0), scrA = terminal(termA, -Math.PI / 2);
  { W.add(safe1.x, safe1.z, 1, 1.2, 1, M.steel); const d = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 16), M.trim); d.rotation.x = Math.PI / 2; d.position.set(safe1.x, 0.7, safe1.z - 0.52); G.add(d); }
  const vaultDoor = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.4, 28), M.steel); vaultDoor.rotation.x = Math.PI / 2; vaultDoor.position.set(vaultP.x, 1.7, CZ(0) + 1.2); G.add(vaultDoor);
  const vd = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.2, 16), M.trim); vd.position.y = -0.25; vaultDoor.add(vd);
  for (let i = 0; i < 3; i++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 1.6), M.trim); sp.rotation.y = i * Math.PI / 3; sp.position.y = -0.3; vaultDoor.add(sp); }
  const mark = (p, color = '#ffb020') => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: M.glowTex, color, transparent: true, opacity: 0.9, depthTest: false, blending: THREE.AdditiveBlending })); s.scale.set(0.8, 0.8, 1); s.position.set(p.x, 2.4, p.z); root.add(s); return s; };
  const marks = { termB: mark(termB), termA: mark(termA, '#36e2ff'), safe1: mark(safe1, '#ffd54a'), vault: mark(vaultP), console: mark(consoleP, '#ff4a4a'), exit: mark(exitP, '#36e27a') };
  marks.console.visible = marks.exit.visible = false;
  S.spot({ pos: termB, r: 1.9, label: 'פרוץ למסוף השער 💻', on: () => !st.gateOpen && st.phase === 'sneak', use: () => hack('gate', 5) });
  S.spot({ pos: termA, r: 1.9, label: 'נטרל את המצלמות 📹', on: () => !st.camsOff && st.phase === 'sneak', use: () => hack('cams', 4) });
  S.spot({ pos: safe1, r: 1.9, label: 'פרוץ את הכספת הקטנה 🔐', on: () => !st.safe1 && st.phase === 'sneak', use: () => crack('safe1', 2) });
  S.spot({ pos: at(2, 18.5), r: 2.6, label: 'פרוץ את הכספת הגדולה 🏦', on: () => !st.vault && st.gateOpen && st.phase === 'sneak', use: () => crack('vault', 3) });
  S.spot({ pos: at(2.2, 1.5), r: 2.2, label: 'השבת את מסוף הצבא ⚔️', on: () => st.phase === 'king', use: () => hack('army', 6) });

  // ---------- מיני-משחק: פריצה (רצף זיכרון) ----------
  function hack(kind, len) {
    const seq = Array.from({ length: len }, () => Math.floor(Math.random() * 9));
    for (let i = 1; i < seq.length; i++) if (seq[i] === seq[i - 1]) seq[i] = (seq[i] + 1 + Math.floor(Math.random() * 8)) % 9;
    let input = 0, showing = true, fails = 0;
    const title = { gate: '💻 מסוף השער', cams: '📹 מערכת המצלמות', army: '⚔️ מסוף הצבא הסודי' }[kind];
    const m = S.modal(`<h2>${title}</h2><div class="hs-term">&gt; ACCESS: <span data-k="log">watch the pattern…</span></div>
      <p class="sk-muted" style="text-align:center">צפה ברצף הנורות, ואז הקש אותו בדיוק באותו סדר (${len} צעדים)</p>
      <div class="hs-grid">${Array.from({ length: 9 }, (_, i) => `<button class="hs-node" data-n="${i}"></button>`).join('')}</div>
      <button class="btn" data-k="quit" style="opacity:.7">✖ התרחק מהמסוף</button>`);
    const nodes = [...m.querySelectorAll('.hs-node')], log = m.querySelector('[data-k=log]');
    m._seq = seq;
    const play = () => {
      showing = true; input = 0; log.textContent = 'watch the pattern…';
      seq.forEach((n, i) => {
        setTimeout(() => { if (S.modalEl !== m) return; nodes[n].classList.add('lit'); beep(400 + n * 60, 0.12, 'sine'); }, 600 + i * 560);
        setTimeout(() => { nodes[n].classList.remove('lit'); if (i === seq.length - 1) { showing = false; log.textContent = 'your turn ▮'; } }, 600 + i * 560 + 380);
      });
    };
    nodes.forEach((b, i) => (b.onclick = () => {
      if (showing) return;
      if (i === seq[input]) {
        b.classList.add('lit'); setTimeout(() => b.classList.remove('lit'), 160); beep(400 + i * 60, 0.08, 'sine'); input++;
        log.textContent = '*'.repeat(input) + '▮';
        if (input === seq.length) { log.textContent = 'ACCESS GRANTED ✔'; beep(1200, 0.2, 'triangle'); buzz(40); setTimeout(() => { S.close(); hacked(kind); }, 500); }
      } else {
        fails++; b.classList.add('bad'); setTimeout(() => b.classList.remove('bad'), 300); beep(140, 0.25, 'sawtooth'); buzz(90);
        log.textContent = `ACCESS DENIED (${fails})`; showing = true; setTimeout(play, 700);
      }
    }));
    m.querySelector('[data-k=quit]').onclick = () => S.close();
    play();
  }
  function hacked(kind) {
    if (kind === 'gate') {
      st.gateOpen = true; W.remove(gate); marks.termB.visible = false; scrB.material.color.set('#2a6bff');
      S.toast('🔓 שער הכספת נפתח! (באגף המזרחי)', 2600);
    } else if (kind === 'cams') {
      st.camsOff = true; marks.termA.visible = false; scrA.material.color.set('#2a6bff');
      for (const c of cams) { c.fan.visible = false; c.led.material.color.set('#222'); }
      S.toast('📹 כל המצלמות כבויות', 2200);
    } else if (kind === 'army') return finale('hero');
    objective();
  }

  // ---------- מיני-משחק: כספת (חוגה) ----------
  function crack(kind, n) {
    const code = Array.from({ length: n }, () => 5 + Math.floor(Math.random() * 90));
    let cur = 0, idx = 0, lastTick = 0, hold = 0;
    const m = S.modal(`<h2>${kind === 'vault' ? '🏦 הכספת הגדולה' : '🔐 כספת קטנה'}</h2>
      <p class="sk-muted" style="text-align:center">סובב את החוגה (גרירה / ◀ ▶ / חצים). כשהמחוון מתמלא והחוגה "קליק" – נעל!</p>
      <div class="hs-digits">${code.map((_, i) => `<span data-d="${i}">--</span>`).join('')}</div>
      <canvas class="hs-dial" width="240" height="240"></canvas>
      <div class="hs-noise"><i></i></div>
      <div class="sk-row"><button class="sk-chip" data-k="l" style="font-size:20px;padding:10px 18px">◀</button>
        <button class="sk-chip" data-k="lock" style="font-size:16px;padding:10px 18px;border-color:#ffb020">🔒 נעל</button>
        <button class="sk-chip" data-k="r" style="font-size:20px;padding:10px 18px">▶</button></div>
      <button class="btn" data-k="quit" style="opacity:.7">✖ עזוב את הכספת</button>`);
    const cv = m.querySelector('canvas'), g = cv.getContext('2d'), noise = m.querySelector('.hs-noise i');
    const digits = [...m.querySelectorAll('[data-d]')];
    m._code = code;
    const dist = () => { const d = Math.abs(cur - code[idx]); return Math.min(d, 100 - d); };
    const draw = () => {
      g.clearRect(0, 0, 240, 240);
      g.save(); g.translate(120, 120);
      g.fillStyle = '#2a2d36'; g.beginPath(); g.arc(0, 0, 112, 0, 7); g.fill();
      g.strokeStyle = '#c9a44a'; g.lineWidth = 5; g.stroke();
      g.rotate(-cur / 100 * Math.PI * 2);
      for (let i = 0; i < 100; i++) {
        const a = i / 100 * Math.PI * 2, big = i % 10 === 0;
        g.strokeStyle = big ? '#ffd54a' : '#8b95a7'; g.lineWidth = big ? 3 : 1.5;
        g.beginPath(); g.moveTo(Math.sin(a) * 100, -Math.cos(a) * 100); g.lineTo(Math.sin(a) * (big ? 84 : 92), -Math.cos(a) * (big ? 84 : 92)); g.stroke();
        if (big) { g.save(); g.rotate(a); g.fillStyle = '#eef2f8'; g.font = '700 14px Rubik'; g.textAlign = 'center'; g.fillText(i, 0, -66); g.restore(); }
      }
      g.fillStyle = '#c9a44a'; g.beginPath(); g.arc(0, 0, 30, 0, 7); g.fill();
      g.restore();
      g.fillStyle = '#ff4a3b'; g.beginPath(); g.moveTo(120, 4); g.lineTo(112, -8 + 20); g.lineTo(128, 12); g.fill();
      const k = idx < code.length ? Math.max(0, 1 - dist() / 14) : 1;
      noise.style.width = k * 100 + '%';
      digits.forEach((d, i) => { d.textContent = i < idx ? String(code[i]).padStart(2, '0') : i === idx ? String(cur).padStart(2, '0') : '--'; d.className = i < idx ? 'ok' : i === idx ? 'cur' : ''; });
    };
    const turn = (dv) => {
      cur = (cur + dv + 100) % 100;
      if (idx < code.length) {
        const d = dist();
        if (cur !== lastTick) { lastTick = cur; beep(d === 0 ? 1500 : 300 + Math.max(0, 14 - d) * 40, d === 0 ? 0.06 : 0.02, d === 0 ? 'square' : 'sine', d === 0 ? 0.08 : 0.025); if (d === 0) buzz(30); }
      }
      draw();
    };
    const lock = () => {
      if (idx >= code.length) return;
      if (dist() <= 1) {
        idx++; beep(900, 0.12, 'triangle'); buzz(40);
        if (idx === code.length) { draw(); setTimeout(() => { S.close(); cracked(kind); }, 500); return; }
      } else { beep(120, 0.2, 'sawtooth'); buzz(80); cv.animate?.([{ transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }], 200); }
      draw();
    };
    // גרירה סיבובית
    let dragA = null, acc = 0;
    const ang = (e) => { const r = cv.getBoundingClientRect(); return Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2))); };
    cv.addEventListener('pointerdown', (e) => { dragA = ang(e); cv.setPointerCapture?.(e.pointerId); });
    cv.addEventListener('pointermove', (e) => {
      if (dragA == null) return; const a = ang(e); let d = a - dragA; if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; dragA = a;
      acc -= d / (Math.PI * 2) * 100; while (Math.abs(acc) >= 1) { const s = Math.sign(acc); turn(s); acc -= s; }
    });
    cv.addEventListener('pointerup', () => (dragA = null));
    let rep = null;
    const holdBtn = (b, dv) => {
      const startH = (e) => { e.preventDefault(); turn(dv); clearInterval(rep); let n = 0; rep = setInterval(() => turn(dv * (++n > 8 ? 2 : 1)), 90); };
      b.addEventListener('pointerdown', startH); ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => b.addEventListener(ev, () => clearInterval(rep)));
    };
    holdBtn(m.querySelector('[data-k=l]'), 1); holdBtn(m.querySelector('[data-k=r]'), -1);
    m.querySelector('[data-k=lock]').onclick = lock;
    const key = (e) => { if (e.code === 'ArrowLeft' || e.code === 'KeyA') turn(1); else if (e.code === 'ArrowRight' || e.code === 'KeyD') turn(-1); else if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); lock(); } };
    addEventListener('keydown', key);
    m._onClose = () => { removeEventListener('keydown', key); clearInterval(rep); };
    m.querySelector('[data-k=quit]').onclick = () => S.close();
    m._turn = turn; m._lock = lock; m._set = (v) => { cur = v; draw(); };
    draw();
  }
  function cracked(kind) {
    if (kind === 'safe1') { st.safe1 = true; marks.safe1.visible = false; st.loot += 60; updLoot(); S.toast('💰 +60 – תכשיטי המלכה!', 2000); objective(); return; }
    st.vault = true; marks.vault.visible = false; vaultDoor.rotation.z = 0; st.check.copy(at(3, 18.5)); st.checkYaw = Math.PI;
    reveal();
  }

  // ---------- הגילוי בכספת + בחירה ----------
  function reveal() {
    st.phase = 'reveal';
    const m = S.modal(`<h2>🗺️ מה שהמלך הסתיר</h2>
      <p>הכספת מלאה בזהב. אבל באמצע, על שולחן אבן, מונחת מפה ענקית.</p>
      <canvas class="hs-map" width="520" height="300"></canvas>
      <div class="sk-say">מתחת לארמון יש <b>עיר שלמה</b> של מנהרות, רחובות ומבצרים. במערות שלה מחכה <b>צבא סודי</b> של אלפי חיילים. על המפה, בכתב ידו של המלך: <b>"בירח המלא – יוצאים לכבוש."</b></div>
      <h3>מה תעשה?</h3>
      <button class="btn" data-k="gold">💰 לברוח עם הזהב <small>האזעקה תופעל – רוץ לפרצה בחומה</small></button>
      <button class="btn" data-k="king">⚔️ לעצור את המלך <small>השבת את מסוף הצבא בחדר הכס</small></button>`);
    drawMap(m.querySelector('canvas'));
    m.querySelector('[data-k=gold]').onclick = () => { S.close(); begin('escape'); };
    m.querySelector('[data-k=king]').onclick = () => { S.close(); begin('king'); };
  }
  function drawMap(cv) {
    const g = cv.getContext('2d'), w = cv.width, h = cv.height;
    g.fillStyle = '#e8d6a8'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#8a6a3a'; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12);
    g.strokeStyle = '#6a4a2a'; g.lineWidth = 3;
    let seed = 7; const R = () => ((seed = seed * 16807 % 2147483647) / 2147483647);
    for (let i = 0; i < 26; i++) { g.beginPath(); const x = 30 + R() * (w - 60), y = 30 + R() * (h - 60); g.moveTo(x, y); g.lineTo(x + (R() - 0.5) * 220, y + (R() - 0.5) * 120); g.stroke(); }
    for (let i = 0; i < 18; i++) { g.fillStyle = '#7a5a34'; g.fillRect(30 + R() * (w - 80), 30 + R() * (h - 70), 18 + R() * 26, 12 + R() * 18); }
    g.fillStyle = '#c9a44a'; g.fillRect(w / 2 - 40, 20, 80, 36); g.fillStyle = '#3a2a10'; g.font = '700 16px Rubik'; g.textAlign = 'center'; g.fillText('👑 הארמון', w / 2, 44);
    g.fillStyle = '#b3262a';
    for (let i = 0; i < 60; i++) { const x = 60 + R() * 160 + (i % 2) * 260, y = 150 + R() * 110; g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); }
    g.fillStyle = '#3a2a10'; g.font = '900 20px Rubik'; g.fillText('עיר הצללים', w / 2, h / 2 + 10);
    g.font = '700 14px Rubik'; g.fillStyle = '#8a1a1a'; g.fillText('⚔️ צבא', 140, 290); g.fillText('⚔️ צבא', 400, 290);
  }
  function begin(path) {
    st.choice = path; st.alarm = true; st.timer = path === 'escape' ? 75 : 90; st.check.copy(at(3, 18.5)); st.checkYaw = Math.PI;
    st.phase = path; st.meter = 0;
    if (path === 'escape') {
      marks.exit.visible = true; for (const l of loots) if (!l.taken && l.k === 'pile') take(l, true);
      S.toast('🚨 האזעקה הופעלה! רוץ לפרצה בחומה בדרום-מערב!', 3000);
    } else {
      marks.console.visible = true; S.toast('🚨 המלך יודע שאתה כאן! לחדר הכס – השבת את מסוף הצבא!', 3000);
    }
    alarmL.intensity = 20;
    for (const g of guards) { g.state = 'alert'; }
    if (st.camsOff && path === 'escape') { /* המצלמות נשארות כבויות – הוגן */ }
    objective();
  }

  // ---------- התקדמות ומטרה ----------
  function objective() {
    const ph = st.phase;
    let t = '';
    if (ph === 'sneak') {
      if (!st.inHall) t = '🌙 התגנב דרך הגן אל דלת הארמון';
      else if (!st.gateOpen) t = '💻 מצא את מסוף השער באוצר (אגף מערבי) ופרוץ אותו';
      else t = '🏦 שער הכספת פתוח – היכנס דרך אגף האבטחה ופרוץ את הכספת הגדולה';
      if (!st.camsOff && st.inHall) t += ' · 📹 טיפ: מסוף המצלמות באגף המזרחי';
    } else if (ph === 'escape') t = `🚨 ברח לפרצה בחומה! ⏱ ${Math.ceil(st.timer)}`;
    else if (ph === 'king') t = `⚔️ השבת את מסוף הצבא בחדר הכס! ⏱ ${Math.ceil(st.timer)}`;
    S.top(t); updLoot();
  }
  const progress = () => saveStory('heist', { pct: Math.round(100 * ((st.inHall ? 1 : 0) + (st.gateOpen ? 1 : 0) + (st.camsOff ? 1 : 0) + (st.safe1 ? 1 : 0) + (st.vault ? 2 : 0)) / 8) });

  // ---------- תפיסה ----------
  function caught(why) {
    st.caught++; st.meter = 0; buzz(200); beep(110, 0.5, 'sawtooth', 0.06);
    const m = S.modal(`<h2>🚨 נתפסת!</h2><p style="text-align:center">${why}</p>
      <p class="sk-muted" style="text-align:center">השלל והפריצות נשמרים. חוזרים לנקודת השמירה האחרונה.</p>
      <button class="btn" data-k="retry">🔁 נסה שוב</button><button class="btn" data-k="exit">→ חזרה לעלילות</button>`);
    m.querySelector('[data-k=retry]').onclick = () => {
      S.P.pos.copy(st.check); S.P.vel.set(0, 0, 0); S.P.yaw = st.checkYaw; S.camSnap = true;
      if (st.phase !== 'sneak') st.timer = st.choice === 'escape' ? 75 : 90;
      resetGuards(); S.close(); objective();
    };
    m.querySelector('[data-k=exit]').onclick = () => S.exit();
  }

  // ---------- סיומים ----------
  function finale(kind) {
    st.phase = 'end'; alarmL.intensity = 0; alarmEl.style.opacity = 0;
    const stars = st.caught === 0 ? 3 : st.caught <= 2 ? 2 : 1;
    const bonus = kind === 'escape' ? 150 : 100;
    const coins = st.paid ? 0 : st.loot + bonus;
    if (!st.paid) { addCoins(coins, 'heist'); st.paid = true; }
    const rec = saveStory('heist', { done: true, best: stars, pct: 100, endings: [kind] });
    const txt = kind === 'escape'
      ? { h: '💰 סוף א׳: עשיר... ושקט', p: 'קפצת דרך הפרצה עם שקים של זהב, ונעלמת בלילה. אתה עשיר. אבל שבוע אחרי זה, בירח המלא, נפתחו שערי המנהרות, והצבא הסודי יצא מתחת לארמון. לפעמים אתה עוד חושב: מה היה קורה אם...' }
      : { h: '⚔️ סוף ב׳: גיבור הממלכה', p: 'המסוף כבה. שערי המנהרות ננעלו, והצבא הסודי נשאר בתוך ההרים. בבוקר מצאו השליחים את המפה על השולחן של המועצה. המלך נעצר, ותושבי "עיר הצללים" יצאו לאור השמש בפעם הראשונה. לקחת רק קצת זהב, אבל את הסיפור הזה ישירו עליך עוד שנים.' };
    const m = S.modal(`<h2>${txt.h}</h2><div class="hs-stars">${'⭐'.repeat(stars)}${'☆'.repeat(3 - stars)}</div><p>${txt.p}</p>
      <div class="sk-muted" style="text-align:center">💰 שלל ${st.loot} · 🚨 נתפסת ${st.caught} פעמים · סופים שגילית: ${(rec.endings || []).length}/2${(rec.endings || []).length < 2 ? ' – נסה את הבחירה השנייה!' : ' 🏅'}</div>
      <div style="text-align:center;font-size:20px;color:#ffd54a;font-weight:900">🪙 +${coins}</div>
      <button class="btn" data-k="again">🔁 שחק שוב</button><button class="btn" data-k="exit">→ חזרה לעלילות</button>`);
    m.querySelector('[data-k=again]').onclick = () => S.exit(true);
    m.querySelector('[data-k=exit]').onclick = () => S.exit();
    S.top('');
  }
  S.onExit = () => style.remove();

  function take(l, silent = false) {
    l.taken = true; l.m.visible = false; st.loot += l.v; st.lootN++; updLoot();
    if (!silent) { beep(1320, 0.08, 'triangle'); setTimeout(() => beep(1760, 0.1, 'triangle'), 70); S.toast(`💰 +${l.v}`, 900); }
  }

  // ---------- פתיחה ----------
  function intro() {
    const prev = getStory('heist');
    const m = S.modal(`<h2>👑 ארמון הזהב</h2>
      <p>המלך הכי עשיר בממלכה מסתיר משהו בכספת שלו. הלילה אתה נכנס לארמון.</p>
      <div class="sk-say">👁️ הימנע מ<b>חרוטי הראייה</b> של השומרים והמצלמות. מד העין מתמלא כשרואים אותך.<br>
      🏃 ריצה עושה רעש · 💻 פרוץ <b>מסופים</b> · 🔐 פתח <b>כספות</b> עם החוגה · 💰 אסוף זהב</div>
      ${prev?.endings?.length ? `<div class="sk-muted" style="text-align:center">סופים שגילית: ${prev.endings.length}/2 · שיא: ${'⭐'.repeat(prev.best || 0)}</div>` : ''}
      <button class="btn" data-k="go">🥷 להתחיל</button>`);
    m.querySelector('[data-k=go]').onclick = () => { S.close(); S.start(); objective(); };
  }

  // ---------- לולאה ----------
  const _eye = new V3(), _pc = new V3(), _ph = new V3();
  function sees(from, yaw, half, range, P) {
    const dx = P.x - from.x, dz = P.z - from.z, d = Math.hypot(dx, dz);
    if (d > range || d < 0.01) return 0;
    if (Math.abs(angDiff(yaw, Math.atan2(dx, dz))) > half) return 0;
    _pc.set(P.x, P.y + 1.1, P.z); _ph.set(P.x, P.y + 1.6, P.z);
    if (W.blocked(from, _pc) && W.blocked(from, _ph)) return 0;
    return 1 - (d / range) * 0.6;
  }
  function updateGuard(g, dt, P) {
    const n = g.n, alert = g.state === 'alert';
    const sp = alert ? (st.phase === 'sneak' ? 3 : 2.7) : 1.5;
    let target = null, moving = false;
    if (g.sus && g.susT > 0) { // שמע רעש: עוצר ומסתכל
      g.susT -= dt; n.face(g.sus, dt, 5);
      if (g.susT <= 0) g.sus = null;
    } else if (alert && (g.seeing || st.phase !== 'sneak') && Math.hypot(P.x - n.pos.x, P.z - n.pos.z) < (g.seeing ? 14 : 9)) {
      target = P; // רודף
    } else {
      target = g.route[g.wp];
      if (g.wait > 0) { g.wait -= dt; target = null; n.yaw += Math.sin(S.t * 1.3 + g.i) * dt * 0.8; }
      else if (Math.hypot(target.x - n.pos.x, target.z - n.pos.z) < 0.3) { g.wp = (g.wp + 1) % g.route.length; g.wait = alert ? 0.2 : rnd(0.8, 1.8); target = null; }
    }
    if (target) {
      const dx = target.x - n.pos.x, dz = target.z - n.pos.z, d = Math.hypot(dx, dz);
      if (d > 0.05) {
        n.pos.x += dx / d * Math.min(d, sp * dt); n.pos.z += dz / d * Math.min(d, sp * dt);
        n.yaw += angDiff(n.yaw, Math.atan2(dx, dz)) * (1 - Math.exp(-7 * dt)); moving = true;
        if (target === P) W.collide(n.pos, 0.3);
      }
    }
    n.update(dt, moving ? sp / 6.2 : 0);
    _eye.set(n.pos.x, 1.6, n.pos.z);
    const range = alert ? G_RANGE * 1.25 : G_RANGE;
    const s = sees(_eye, n.yaw, G_HALF, range, P);
    g.seeing = s > 0;
    // שמיעה: ריצה קרובה
    const dd = Math.hypot(P.x - n.pos.x, P.z - n.pos.z);
    if (!g.seeing && S.P.run && dd < 5.5 && !g.sus && g.state === 'patrol') { g.sus = P.clone(); g.susT = 1.8; }
    if (dd < 0.9 && st.phase !== 'end') return 99; // נגע בך
    updateFan(g.fan, n.pos, n.yaw, G_HALF, range);
    g.fan.material.color.set(g.seeing ? '#ff4a3b' : g.sus ? '#ffa03a' : alert ? '#ff7a5a' : '#ffe066');
    g.fan.material.opacity = g.seeing ? 0.45 : 0.28;
    return s;
  }

  const H = {
    active: true, S, st, guards, cams, loots, hack, crack, begin, finale,
    update(dt) {
      dt = Math.min(dt, 0.05);
      if (!S.active) { H.active = false; return; }
      S.P.frozen = st.phase === 'reveal' || st.phase === 'end';
      S.P.maxSpeed = 1;
      S.update(dt);
      const P = S.P.pos, t = S.t;
      fill.position.set(P.x + (camera.position.x - P.x) * 0.4, P.y + 2.4, P.z + (camera.position.z - P.z) * 0.4);
      for (const l of loots) if (!l.taken) { l.m.rotation.y += dt * 1.5; l.m.position.y = l.base + Math.sin(t * 2 + l.v) * 0.05; if (Math.hypot(l.m.position.x - P.x, l.m.position.z - P.z) < 1 && st.phase !== 'end') take(l); }
      for (const k in marks) if (marks[k].visible) marks[k].material.opacity = 0.6 + Math.sin(t * 4) * 0.3;
      if (st.vault) vaultDoor.rotation.z = Math.min(vaultDoor.rotation.z + dt, 1.4), vaultDoor.position.x = vaultP.x - Math.min(1.6, vaultDoor.rotation.z);
      if (st.alarm && st.phase !== 'end') { const a = (Math.sin(t * 8) + 1) / 2; alarmEl.style.opacity = 0.25 + a * 0.45; alarmL.intensity = 6 + a * 18; }
      if (S.busy || st.phase === 'reveal' || st.phase === 'end') return;
      // נקודת שמירה: כניסה לארמון
      if (!st.inHall && P.z < CZ(14.6)) { st.inHall = true; st.check.copy(at(14, 11.5)); st.checkYaw = Math.PI; S.toast('🏰 בתוך הארמון! (נקודת שמירה)', 1800); objective(); progress(); }
      // שומרים ומצלמות
      let rate = 0, touched = false;
      for (const g of guards) {
        if (g.throne && st.phase === 'escape') { g.n.update(dt, 0); g.fan.visible = false; continue; }
        g.fan.visible = true;
        const s = updateGuard(g, dt, P);
        if (s === 99) touched = true; else rate += s * 1.7;
      }
      for (const c of cams) {
        c.t += dt; c.cur = c.yaw + Math.sin(c.t * 0.6) * c.sweep; c.g.rotation.y = c.cur;
        c.led.visible = st.camsOff || Math.sin(t * 6) > 0;
        if (st.camsOff) { c.seeing = false; continue; }
        const s = sees(c.p, c.cur, C_HALF, C_RANGE, P);
        c.seeing = s > 0; rate += s * 1.3;
        updateFan(c.fan, c.p, c.cur, C_HALF, C_RANGE, 0.07);
        c.fan.material.color.set(c.seeing ? '#ff4a3b' : '#8fd0ff'); c.fan.material.opacity = c.seeing ? 0.42 : 0.24;
      }
      if (rate > 0) st.meter += rate * dt * (S.P.run ? 1.3 : 1);
      else st.meter = Math.max(0, st.meter - dt * 0.3);
      if (st.meter > 0.35) for (const g of guards) if (g.seeing && g.state === 'patrol') g.state = 'alert';
      if (st.meter <= 0.05 && st.phase === 'sneak') for (const g of guards) if (g.state === 'alert' && !g.seeing) { g.state = 'patrol'; }
      S.meter(st.meter);
      eyeEl.textContent = st.meter > 0.6 ? '🚨' : st.meter > 0.05 ? '👁️' : '🌙';
      if (touched) return caught('שומר תפס אותך ביד.');
      if (st.meter >= 1) return caught(guards.some((g) => g.seeing) ? 'שומר ראה אותך והזעיק עזרה.' : 'מצלמה צילמה אותך, והשומרים הגיעו.');
      // סיומים בזמן
      if (st.phase === 'escape' || st.phase === 'king') {
        st.timer -= dt; objective();
        if (st.timer <= 0) return caught(st.phase === 'escape' ? 'הזמן נגמר – השערים ננעלו.' : 'הזמן נגמר – הצבא כבר יצא לדרך.');
        if (st.phase === 'escape' && Math.hypot(P.x - exitP.x, P.z - exitP.z) < 1.8) return finale('escape');
      }
    },
  };
  intro();
  updLoot();
  return H;
}

export const startHeist = replayable(createHeist);

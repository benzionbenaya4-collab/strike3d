// מצב קרב: כולם נגד כולם. קופצים מהמטוס מעל העיר, צונחים, אוספים תיבות (נשקים) ומטבעות.
// לבד נגד בוטים (בלי רשת) או חדר אונליין בקוד (PeerJS / BroadcastChannel לבדיקה). המארח מריץ את net/sim.js.
//
//   startBattle(scene, camera, ui, back, renderer, { onCoin, skin })
//   battleHooks.onCoin = (n) => ...   // סוכן החנות מחבר כאן את הארנק (store.js). נקרא רק על מטבע שאני אספתי.
//   וגם: window.dispatchEvent(new CustomEvent('s3d:coin', { detail: { n } }))
import * as THREE from 'three';
import { buildArena } from '../world/arena.js';
import { buildJet } from '../models/jet.js';
import { buildCharacter } from '../models/character.js';
import { buildWeapon } from '../models/weapons.js';
import { buildKnife } from '../models/knife.js';
import { weapon as W, RARITY } from '../data/weapons.js';
import { createControls, isTouch } from '../core/controls.js';
import { createHud } from '../core/hud.js';
import { Sim, stepMove, newBody, makeWorld, jetAt, segBox, ST, PHASES, PI, RULES, BOT_LV, BOT_NAMES, AUTO, RELOAD, SPREAD, KICK, WALK, RUN, PR } from '../net/sim.js';
import { createHost, joinHost, makeRoomCode, normalizeCode } from '../net/transport.js';
import { hostRoom, joinRoom, cleanName } from '../net/room.js';

export const battleHooks = { onCoin: null };

const V3 = THREE.Vector3;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const rnd = (a, b) => a + Math.random() * (b - a);
const ease = (t) => t * t * (3 - 2 * t);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lerpAng = (a, b, k) => a + ((((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * k);
const nowS = () => performance.now() / 1000;
const LS = { get(k, d) { try { return localStorage.getItem(k) ?? d; } catch (_) { return d; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} } };
const SNAP_HZ = 20, INPUT_HZ = 30, INTERP = 0.1;
const MAX_PLAYERS = 8;
const ERR_HE = {
  unavailable: 'אין חיבור לשרת החדרים (PeerJS). כנראה שהרשת כאן חוסמת אותו – אפשר לשחק לבד נגד בוטים.',
  'not-found': 'לא נמצא חדר עם הקוד הזה. בדקו את הקוד ושהמארח עדיין בלובי.',
  taken: 'הקוד תפוס, מנסים קוד אחר…', full: 'החדר מלא (8 שחקנים).', closed: 'החדר סגור כרגע.',
  timeout: 'החיבור לקח יותר מדי זמן. נסו שוב.', 'host-left': 'המארח עזב את החדר.', kick: 'הוצאת מהחדר.',
};

const CSS = `
.s3b { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; padding:16px; pointer-events:auto;
  background:linear-gradient(180deg,#0b0d1288,#0b0d12cc); overflow:auto; }
.s3b-card { width:min(560px,100%); max-height:100%; overflow:auto; background:#151922ee; border:1px solid #2a3142; border-radius:18px; padding:18px;
  display:flex; flex-direction:column; gap:10px; align-items:stretch; }
.s3b-card h2 { margin:0; font-size:28px; font-weight:900; text-align:center; }
.s3b-card .btn { width:100%; } .s3b-card .btn:disabled { opacity:.45; cursor:default; }
.s3b-sub { color:#8b95a7; font-size:13px; text-align:center; line-height:1.5; }
.s3b-row { display:flex; gap:8px; flex-wrap:wrap; justify-content:center; align-items:center; }
.s3b-row .btn { width:auto; flex:1; }
.s3b-in { flex:1; min-width:0; padding:12px 14px; border-radius:12px; border:1px solid #2a3142; background:#0b0d12; color:#eef2f8; font:700 18px Rubik; }
.s3b-in.code { direction:ltr; text-align:center; letter-spacing:2px; text-transform:uppercase; }
.s3b-lbl { color:#8b95a7; font-size:13px; }
.s3b-err { color:#ff7a5a; font-size:14px; text-align:center; min-height:1em; line-height:1.5; }
.s3b-code { direction:ltr; text-align:center; font:900 clamp(30px,9vw,44px) Rubik; letter-spacing:3px; color:#ffb020; background:#0b0d12; border-radius:14px; padding:8px; }
.s3b-list { display:flex; flex-direction:column; gap:4px; }
.s3b-list div { display:flex; justify-content:space-between; background:#0b0d12; border-radius:10px; padding:7px 12px; font-size:15px; }
.s3b-list small { color:#8b95a7; }
.s3b-tbl { width:100%; border-collapse:collapse; font-size:14px; text-align:center; }
.s3b-tbl th { color:#8b95a7; font-weight:400; padding:4px; } .s3b-tbl td { padding:6px 4px; border-top:1px solid #2a3142; }
.s3b-tbl tr.me td { color:#ffb020; font-weight:700; } .s3b-tbl tr.dead td { opacity:.55; }
.s3b-feed { position:absolute; top:max(12px, env(safe-area-inset-top)); inset-inline-start:12px; display:flex; flex-direction:column; gap:4px; align-items:flex-start;
  pointer-events:none; font:600 13px Rubik; direction:rtl; max-width:46vw; }
.s3b-feed div { background:#151922c8; border:1px solid #2a3142; border-radius:8px; padding:3px 9px; transition:opacity .5s; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%; }
.s3b-feed b.me { color:#ffb020; } .s3b-feed i { font-style:normal; color:#8b95a7; }
.s3b-tools { position:absolute; top:max(10px, env(safe-area-inset-top)); left:10px; display:flex; gap:6px; pointer-events:auto; }
.s3b-board { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); width:min(520px,92vw); background:#151922ee; border:1px solid #2a3142;
  border-radius:16px; padding:12px; pointer-events:none; display:none; }
.s3b-board.on { display:block; }
.s3b-big { position:absolute; left:50%; top:62%; transform:translateX(-50%); text-align:center; pointer-events:none; font:900 22px Rubik; text-shadow:0 2px 8px #000;
  white-space:nowrap; }
.s3b-big small { display:block; font:600 14px Rubik; color:#d5dbe6; }
@media (pointer: coarse) { .s3b-feed { top:max(110px, env(safe-area-inset-top)); } .s3b-big { top:30%; } }
`;

// ---------- מודלים קטנים: מצנח, תיבה, מטבע, תג שם ----------
function stripeTex(a, b) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 8;
  const g = c.getContext('2d'); for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? a : b; g.fillRect(i * 16, 0, 16, 8); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function makeChute(color) {
  const g = new THREE.Group();
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(2.3, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2.7),
    new THREE.MeshStandardMaterial({ map: stripeTex(color, '#f2efe6'), side: THREE.DoubleSide, roughness: 0.8 }));
  canopy.scale.set(1, 0.55, 0.8); canopy.position.y = 4.1; g.add(canopy);
  const pts = [];
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; pts.push(Math.sign(Math.cos(a)) * 0.18, 1.45, 0, Math.cos(a) * 1.2 * 2.3 * 0.8, 4.1 + 0.55 * 2.3 * 0.42, Math.sin(a) * 2.3 * 0.8 * 0.8); }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: '#2b2b2b' })));
  g.visible = false; return g;
}
function makeChest() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: '#5a3ea8', roughness: 0.55, metalness: 0.2 });
  const trim = new THREE.MeshStandardMaterial({ color: '#ffc531', metalness: 0.8, roughness: 0.3, emissive: '#7a5200', emissiveIntensity: 0.4 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.55, 0.65), wood); body.position.y = 0.28; g.add(body);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 1.0, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateX(Math.PI / 2), wood); lid.position.y = 0.55; g.add(lid);
  for (const x of [-0.42, 0.42]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.6, 0.68), trim); b.position.set(x, 0.3, 0); g.add(b); }
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 0.06), trim); lock.position.set(0, 0.5, 0.34); g.add(lock);
  const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.9, 0.05, 20), new THREE.MeshBasicMaterial({ color: '#b48dff', transparent: true, opacity: 0.45, depthWrite: false }));
  glow.position.y = 0.03; g.add(glow); g.userData.glow = glow;
  return g;
}
const TIER = { easy: '#ffd54a', medium: '#ffae2b', hard: '#ff5bd8' };
function makeTag(text, color = '#ffffff') {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d'); g.font = '700 34px Rubik, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 6; g.strokeStyle = '#000a'; g.strokeText(text, 128, 34); g.fillStyle = color; g.fillText(text, 128, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, fog: false }));
  s.scale.set(1.6, 0.4, 1); s.position.y = 2.3; return s;
}

export function startBattle(scene, camera, ui, back, renderer, opts = {}) {
  const touch = isTouch();
  // ---------- סצנה ----------
  const saved = { bg: scene.background, fog: scene.fog, fov: camera.fov, near: camera.near, far: camera.far, pr: renderer?.getPixelRatio(), lights: [] };
  scene.children.forEach((o) => { if (o.isLight && o.visible) { saved.lights.push(o); o.visible = false; } });
  const root = new THREE.Group(); root.name = 'battle'; scene.add(root);
  const arena = buildArena(); root.add(arena);
  const A = arena.userData, Wd = makeWorld(A);
  scene.background = A.background; scene.fog = A.fog;
  camera.fov = 70; camera.near = 0.05; camera.far = 500; camera.updateProjectionMatrix();
  if (renderer && touch) renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);

  const jet = buildJet(); jet.visible = false; root.add(jet);
  const chestMeshes = A.chestSpots.map((c) => { const m = makeChest(); m.position.copy(c.pos); m.rotation.y = c.rotY; root.add(m); return m; });
  const coinGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.07, 18).rotateX(Math.PI / 2);
  const coinMeshes = A.coinSpots.map((c) => {
    const m = new THREE.Mesh(coinGeo, new THREE.MeshStandardMaterial({ color: TIER[c.tier], emissive: TIER[c.tier], emissiveIntensity: 0.55, metalness: 0.85, roughness: 0.3 }));
    m.position.copy(c.pos); m.scale.setScalar(c.tier === 'hard' ? 1.5 : 1.1); root.add(m); return m;
  });
  const flashLight = new THREE.PointLight('#ffc060', 0, 7, 2); root.add(flashLight);

  // ---------- אפקטים (כמו באימון) ----------
  const fxMat = (color) => new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const flashMat = fxMat('#ffcf6e'), flashGeo = new THREE.PlaneGeometry(0.32, 0.32);
  const flashes = Array.from({ length: 10 }, () => {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(flashGeo, flashMat); m.rotation.set(i === 0 ? 0 : Math.PI / 2, i === 2 ? Math.PI / 2 : 0, 0); g.add(m); }
    g.visible = false; root.add(g); return { g, life: 0 };
  });
  const tracerGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, -0.5);
  const tracers = Array.from({ length: 40 }, () => { const m = new THREE.Mesh(tracerGeo, fxMat('#ffd88a')); m.visible = false; root.add(m); return { m, a: new V3(), b: new V3(), dir: new V3(), L: 0, age: 0, life: 0 }; });
  const puffGeo = new THREE.SphereGeometry(1, 6, 4);
  const puffs = Array.from({ length: 24 }, () => { const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color: '#d9cfb8', transparent: true, depthWrite: false })); m.visible = false; root.add(m); return { m, age: 0, life: 0, size: 0.08 }; });
  let fi = 0, ti = 0, pi = 0;
  const flash = (at, mine) => { const f = flashes[fi++ % flashes.length]; f.g.position.copy(at); f.g.rotation.set(rnd(0, 3), rnd(0, 3), rnd(0, 3)); f.g.scale.setScalar(rnd(0.7, 1.2)); f.g.visible = true; f.life = 0.05; if (mine) { flashLight.position.copy(at); flashLight.intensity = 6; } };
  const tracer = (a, b, color = '#ffd88a') => { const t = tracers[ti++ % tracers.length]; t.a.copy(a); t.b.copy(b); t.dir.subVectors(b, a); t.L = t.dir.length(); t.dir.divideScalar(t.L || 1); t.age = 0; t.life = t.L / 260 + 0.04; t.m.material.color.set(color); t.m.visible = true; };
  const puff = (at, color = '#d9cfb8', size = 0.08) => { const p = puffs[pi++ % puffs.length]; p.m.position.copy(at); p.m.material.color.set(color); p.size = size; p.age = 0; p.life = 0.3; p.m.visible = true; };
  const _h = new V3(), _tl = new V3();
  function updateFx(dt) {
    for (const f of flashes) if (f.g.visible && (f.life -= dt) <= 0) f.g.visible = false;
    flashLight.intensity = Math.max(0, flashLight.intensity - dt * 120);
    for (const t of tracers) {
      if (!t.m.visible) continue;
      if ((t.age += dt) >= t.life) { t.m.visible = false; continue; }
      const head = Math.min(t.L, t.age * 260), tail = Math.max(0, head - 5);
      _h.copy(t.a).addScaledVector(t.dir, head); _tl.copy(t.a).addScaledVector(t.dir, tail);
      t.m.position.copy(_h); t.m.lookAt(_tl); t.m.scale.set(0.022, 0.022, Math.max(0.05, head - tail));
    }
    for (const p of puffs) {
      if (!p.m.visible) continue;
      const k = (p.age += dt) / p.life; if (k >= 1) { p.m.visible = false; continue; }
      p.m.scale.setScalar(p.size * (1 + k * 2)); p.m.material.opacity = 0.8 * (1 - k);
    }
  }

  // ---------- מצב ----------
  const S = {
    role: null, kind: LS.get('s3d.net.kind', 'peer'), code: null, room: null, sim: null, myId: 'h',
    name: cleanName(LS.get('s3d.net.name', 'שחקן ' + Math.floor(rnd(10, 99)))), skin: opts.skin || 'default',
    roster: new Map(), cfg: { rule: 'lms', level: 'medium', bots: 5 },
    match: null, inMatch: false, phase: 'wait', phaseT: 0, tl: 0, winner: null, coins: '', chests: '',
    snaps: [], offset: null, renderT: 0, pending: [], snapT: 0, inT: 0, busy: false, err: '',
  };
  const T = { active: true, S };
  const myRow = { hp: 100, st: 'spec', ammo: 0, w3: '', kills: 0, deaths: 0, coins: 0, rl: 0 };
  const look = { yaw: 0, pitch: -0.1 };
  const G = { w: 1, ammo: { pistol: W('pistol').mag }, cd: 0, reloadT: 0, bloom: 0, kick: 0, aim: 0, lastShot: 0, w3: '' };
  const pred = newBody(); pred.st = 'spec';
  let predHist = [], predQ = 0, myJc = 0, corr = new V3(), stMismatchT = 0, predDropT = -9;
  let ctl = null, hud = null, feedEl = null, boardEl = null, bigEl = null, tools = null, boardOn = false, paused = false;
  const layer = document.createElement('div'); layer.style.cssText = 'position:absolute;inset:0;pointer-events:none';
  ui.innerHTML = ''; ui.appendChild(layer);
  let screenEl = null;
  const setScreen = (html) => {
    screenEl?.remove(); screenEl = null; if (!html) return null;
    screenEl = document.createElement('div'); screenEl.className = 's3b'; screenEl.innerHTML = html; ui.appendChild(screenEl); return screenEl;
  };
  const nameOf = (id) => S.roster.get(id)?.name || id || '?';

  // ---------- דמויות ----------
  const avatars = new Map();
  function avatarFor(id) {
    let a = avatars.get(id); if (a) return a;
    const info = S.roster.get(id) || {};
    const skin = info.skin || 'default';
    const rig = buildCharacter({ skin }); root.add(rig.root);
    const chute = makeChute(['#d8442f', '#2f7bd8', '#3fb35c', '#e0a51f', '#8e44d8'][avatars.size % 5]); rig.root.add(chute);
    let tag = null;
    if (id !== S.myId) { tag = makeTag((info.bot ? '🤖 ' : '') + (info.name || id), info.bot ? '#ffd0c4' : '#ffffff'); rig.root.add(tag); }
    a = { id, rig, an: rig.anim, skin, models: {}, wid: null, chute, tag, st: null, deadT: 0, pos: new V3(), prev: new V3(), yaw: 0, yawPrev: 0, pitch: 0, aim: 0, spd: 0 };
    avatars.set(id, a); return a;
  }
  function dropAvatar(id) {
    const a = avatars.get(id); if (!a) return;
    root.remove(a.rig.root); avatars.delete(id);
  }
  function setAvatarWeapon(a, wid) {
    if (a.wid === wid || !wid) return;
    a.wid = wid;
    a.models[wid] ||= wid === 'knife' ? buildKnife(a.skin) : buildWeapon(wid, a.skin);
    a.rig.setWeapon(a.models[wid], wid);
  }
  const muzzleOf = (a, out) => {
    const m = a.models[a.wid]; a.rig.root.updateMatrixWorld(true);
    return m?.userData.muzzle ? m.localToWorld(out.copy(m.userData.muzzle)) : out.copy(a.pos).setY(a.pos.y + 1.4);
  };

  // ---------- תצוגה: רשימת שחקנים לפריים הזה ----------
  // { id, x,y,z, yaw, pitch, st, wid, aim, spd }
  const view = new Map();
  function viewFromSim() {
    view.clear();
    for (const p of S.sim.players.values()) view.set(p.id, { id: p.id, x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw, pitch: p.pitch, st: p.st, wid: p.slots[p.w], aim: p.aim > 0.5, spd: p.spd });
  }
  function viewFromSnaps() {
    view.clear();
    const sn = S.snaps; if (!sn.length) return;
    const rt = S.renderT;
    let b = sn.length - 1; while (b > 0 && sn[b - 1].tm > rt) b--;
    const B = sn[b], Aa = b > 0 ? sn[b - 1] : B;
    const k = B.tm > Aa.tm ? clamp((rt - Aa.tm) / (B.tm - Aa.tm), 0, 1) : 1;
    for (const [id, r] of B.rows) {
      const a = Aa.rows.get(id) || r;
      view.set(id, { id, x: a[PI.x] + (r[PI.x] - a[PI.x]) * k, y: a[PI.y] + (r[PI.y] - a[PI.y]) * k, z: a[PI.z] + (r[PI.z] - a[PI.z]) * k,
        yaw: lerpAng(a[PI.yaw], r[PI.yaw], k), pitch: r[PI.pitch], st: ST[r[PI.st]], wid: r[PI.wid], aim: !!r[PI.aim], spd: r[PI.spd] });
    }
  }

  // ---------- רשת: מארח ----------
  function rosterList() { return [...S.roster].map(([id, r]) => ({ id, name: r.name, skin: r.skin, bot: !!r.bot })); }
  function sendRoster() { S.room?.broadcast({ t: 'roster', list: rosterList(), cfg: S.cfg }); }
  const humans = () => [...S.roster.values()].filter((r) => !r.bot).length;

  function setupHostSim() {
    S.sim = new Sim(A, { rule: S.cfg.rule, level: S.cfg.level });
    S.roster.clear(); S.roster.set(S.myId, { name: S.name, skin: S.skin, bot: false });
    S.sim.addPlayer({ id: S.myId, name: S.name, skin: S.skin });
  }
  function syncBots() {
    const sim = S.sim;
    for (const [id, r] of [...S.roster]) if (r.bot) { S.roster.delete(id); sim.players.delete(id); dropAvatar(id); }
    const n = Math.max(0, Math.min(S.cfg.bots, MAX_PLAYERS - humans()));
    const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
    for (let i = 0; i < n; i++) {
      const id = 'b' + (i + 1), skin = ['default', 'camo', 'default', 'camo', 'ice', 'lava'][i % 6];
      S.roster.set(id, { name: names[i % names.length], skin, bot: true });
      sim.addPlayer({ id, name: names[i % names.length], skin, bot: true });
    }
  }
  async function hostOnline() {
    if (S.busy) return; S.busy = true; S.err = ''; drawMenu();
    let tr = null, code = null;
    for (let i = 0; i < 4 && !tr; i++) {
      code = makeRoomCode();
      try { tr = await createHost(S.kind, code); } catch (e) { if (e.code !== 'taken') { S.busy = false; S.err = ERR_HE[e.code] || e.message; drawMenu(); return; } }
    }
    S.busy = false;
    if (!tr) { S.err = ERR_HE.taken; drawMenu(); return; }
    S.role = 'host'; S.code = code; S.tr = tr; S.myId = 'h';
    setupHostSim();
    S.room = hostRoom(tr, {
      max: MAX_PLAYERS, count: humans,
      onJoin(pid, info) {
        S.roster.set(pid, { ...info, bot: false });
        if (S.roster.size > MAX_PLAYERS) { const bot = [...S.roster].reverse().find(([, r]) => r.bot); if (bot) { S.roster.delete(bot[0]); S.sim.players.delete(bot[0]); dropAvatar(bot[0]); } }
        S.sim.addPlayer({ id: pid, name: info.name, skin: info.skin });
        sendRoster();
        if (S.inMatch) S.room.send(pid, S.sim.matchInfo());
        feed(`➕ <b>${esc(info.name)}</b> הצטרף`);
        if (!S.inMatch) drawLobby();
      },
      onLeave(pid) {
        const n = nameOf(pid); S.roster.delete(pid); S.sim.removePlayer(pid); dropAvatar(pid); sendRoster();
        feed(`➖ <b>${esc(n)}</b> יצא`);
        if (!S.inMatch) drawLobby();
      },
      onMsg(pid, m) {
        if (m.t === 'in') S.sim.setInput(pid, m);
        else if (m.t === 'shot') S.sim.shot(pid, m);
        else if (m.t === 'rl') S.sim.reload(pid);
      },
    });
    drawLobby();
  }
  function hostStart() {
    if (S.role === 'host' || S.role === 'off') {
      S.sim.cfg.rule = S.cfg.rule; S.sim.cfg.level = S.cfg.level;
      syncBots();
      const info = S.sim.start();
      S.room?.broadcast({ t: 'roster', list: rosterList(), cfg: S.cfg });
      S.room?.broadcast(info);
      beginMatch(info);
    }
  }
  function hostToLobby() {
    S.sim.phase = 'wait'; for (const p of S.sim.players.values()) p.st = 'spec';
    S.room?.broadcast({ t: 'lobby' });
    endMatchView(); drawLobby();
  }

  // ---------- רשת: לקוח ----------
  async function joinOnline(raw) {
    const code = normalizeCode(raw);
    if (!code) { S.err = 'קוד לא תקין. דוגמה: TIGER-482'; drawMenu(); return; }
    if (S.busy) return; S.busy = true; S.err = ''; drawMenu();
    try {
      const tr = await joinHost(S.kind, code);
      const room = await joinRoom(tr, { name: S.name, skin: S.skin }, { onMsg: clientMsg, onLost: (why) => lostHost(why) });
      S.role = 'client'; S.code = code; S.tr = tr; S.room = room; S.myId = room.id; S.busy = false;
      LS.set('s3d.net.last', code);
      drawLobby();
    } catch (e) { S.busy = false; S.err = ERR_HE[e.code] || e.message; drawMenu(); }
  }
  function clientMsg(m) {
    if (m.t === 'roster') {
      S.roster.clear(); for (const r of m.list) S.roster.set(r.id, r);
      S.cfg = { ...S.cfg, ...m.cfg };
      for (const id of [...avatars.keys()]) if (!S.roster.has(id)) dropAvatar(id);
      if (!S.inMatch) drawLobby();
    } else if (m.t === 'start') { S.snaps = []; beginMatch(m); }
    else if (m.t === 's') onSnapshot(m);
    else if (m.t === 'lobby') { endMatchView(); drawLobby(); }
  }
  function lostHost(why) {
    if (!T.active) return;
    S.room = null; S.tr = null; S.role = null;
    endMatchView();
    S.err = ERR_HE[why] || why; drawMenu();
  }
  function onSnapshot(s) {
    const rows = new Map(); for (const r of s.P) rows.set(r[PI.id], r);
    const est = s.tm - nowS();
    if (S.offset === null || Math.abs(est - S.offset) > 1) S.offset = est; else S.offset += (est - S.offset) * 0.1;
    S.snaps.push({ tm: s.tm, rows }); if (S.snaps.length > 40) S.snaps.shift();
    S.phase = PHASES[s.ph]; S.phaseT = s.pt; S.tl = s.tl; S.winner = s.win; S.coins = s.C; S.chests = s.K;
    const me = rows.get(S.myId);
    if (me) { applyMyRow(me); reconcile(me); }
    handleEvents(s.E || []);
  }
  function applyMyRow(r) {
    myRow.hp = r[PI.hp]; myRow.st = ST[r[PI.st]]; myRow.ammo = r[PI.ammo]; myRow.w3 = r[PI.w3]; myRow.kills = r[PI.kills]; myRow.deaths = r[PI.deaths]; myRow.coins = r[PI.coins]; myRow.rl = r[PI.rl];
  }
  const _err = new V3();
  function reconcile(r) {
    const sst = ST[r[PI.st]];
    const hard = ['jet', 'dead', 'spec'];
    if (sst === 'jet' && pred.st !== 'jet' && nowS() - predDropT < 1.5) return; // קפצתי, המארח עוד לא קיבל
    if (sst !== pred.st && (hard.includes(sst) || hard.includes(pred.st))) {
      pred.st = sst; pred.pos.set(r[PI.x], r[PI.y], r[PI.z]); pred.vel.set(0, 0, 0); pred.vy = 0; predHist = []; corr.set(0, 0, 0);
      if (sst === 'air') look.yaw = r[PI.yaw];
      return;
    }
    if (sst !== pred.st) { if ((stMismatchT += 1 / SNAP_HZ) > 0.5) { pred.st = sst; stMismatchT = 0; } } else stMismatchT = 0;
    if (hard.includes(pred.st)) return;
    const ack = r[PI.ack];
    let i = predHist.findIndex((h) => h.q >= ack);
    if (i < 0) return;
    const h = predHist[i];
    _err.set(r[PI.x] - h.x, r[PI.y] - h.y, r[PI.z] - h.z);
    const e = _err.length();
    if (e > 3) { pred.pos.add(_err); for (let j = i; j < predHist.length; j++) { predHist[j].x += _err.x; predHist[j].y += _err.y; predHist[j].z += _err.z; } corr.set(0, 0, 0); }
    else if (e > 0.06) { _err.multiplyScalar(0.5); corr.add(_err); for (let j = i + 1; j < predHist.length; j++) { predHist[j].x += _err.x; predHist[j].y += _err.y; predHist[j].z += _err.z; } }
    predHist.splice(0, i + 1);
  }

  // ---------- אירועים (משותף) ----------
  const _ep = new V3(), _mz = new V3();
  function handleEvents(E) {
    for (const e of E) {
      if (e.e === 'f') {
        if (e.a === S.myId) continue; // את היריות שלי כבר ציירתי
        const a = avatars.get(e.a); if (!a) continue;
        a.an.trigger(e.w === 'knife' ? 'slash' : 'shoot');
        if (e.w === 'knife' || e.x === undefined) continue;
        muzzleOf(a, _mz); flash(_mz, false); _ep.set(e.x, e.y, e.z); tracer(_mz, _ep, '#ff9a7a');
        if (_ep.distanceTo(camera.position) < 60) puff(_ep);
      } else if (e.e === 'h') {
        if (e.a === S.myId) hud?.hit({ head: !!e.h, kill: !!e.k });
        if (e.v === S.myId && hud) {
          const me = myPos(), fx = Math.sin(look.yaw), fz = Math.cos(look.yaw), dx = e.sx - me.x, dz = e.sz - me.z;
          hud.hurt(Math.atan2(dx * -fz + dz * fx, dx * fx + dz * fz));
        }
        const v = avatars.get(e.v); if (v) puff(_ep.copy(v.pos).setY(v.pos.y + (e.h ? 1.62 : 1.1)), '#b3262a', 0.06);
      } else if (e.e === 'k') {
        const me = (id) => (id === S.myId ? ' class="me"' : '');
        feed(`<b${me(e.a)}>${esc(nameOf(e.a))}</b> <i>${e.h ? '🎯' : ''}${esc(W(e.w)?.he || '')}</i> <b${me(e.v)}>${esc(nameOf(e.v))}</b>`);
        if (e.a === S.myId) hud?.toast(e.h ? '💀 חיסול בראש!' : '✔️ חיסול', 1000);
        if (e.v === S.myId) { hud?.toast('💀 נפלת', 1500); G.reloadT = 0; }
      } else if (e.e === 'c') {
        if (e.a === S.myId) { hud?.toast(`🪙 +${e.n}`, 900); giveCoin(e.n); }
      } else if (e.e === 'x') {
        if (e.a === S.myId) { const w = W(e.w); hud?.toast(`📦 ${w.he} · ${RARITY[w.rarity].he}`, 1500); G.ammo[e.w] = w.mag; G.w = 2; G.w3 = e.w; G.reloadT = 0; G.cd = 0.3; }
      } else if (e.e === 'j') feed(`➕ <b>${esc(nameOf(e.a))}</b> הצטרף`);
      else if (e.e === 'end') showResults();
    }
  }
  function giveCoin(n) {
    try { opts.onCoin?.(n); } catch (e) { console.error(e); }
    try { battleHooks.onCoin?.(n); } catch (e) { console.error(e); }
    dispatchEvent(new CustomEvent('s3d:coin', { detail: { n } }));
  }
  function feed(html) {
    if (!feedEl) return;
    const d = document.createElement('div'); d.innerHTML = html; feedEl.prepend(d);
    while (feedEl.children.length > 5) feedEl.lastChild.remove();
    setTimeout(() => { d.style.opacity = 0; setTimeout(() => d.remove(), 600); }, 5000);
  }

  // ---------- התחלה/סוף סיבוב ----------
  function beginMatch(info) {
    S.match = info; S.inMatch = true; S.phase = 'jet'; S.winner = null; paused = false; boardOn = false;
    S.cfg.rule = info.rule; S.cfg.level = info.level;
    if (S.role === 'client') { S.offset = info.tm - nowS(); pred.st = 'jet'; predHist = []; corr.set(0, 0, 0); S.renderT = info.tm - INTERP; }
    G.w = 1; G.w3 = ''; G.ammo = { pistol: W('pistol').mag }; G.reloadT = 0; G.cd = 0; G.bloom = 0; G.kick = 0;
    jetAt(info.jet, 0, _ep); const [tx, , tz] = info.jet.to; look.yaw = Math.atan2(tx - info.jet.from[0], tz - info.jet.from[2]) + Math.PI * 0.75; look.pitch = 0.25;
    setScreen(null);
    if (!hud) {
      layer.innerHTML = '';
      hud = createHud(layer);
      ctl = createControls({ ui: layer, canvas: renderer?.domElement || document.querySelector('canvas') });
      feedEl = document.createElement('div'); feedEl.className = 's3b-feed'; layer.appendChild(feedEl);
      boardEl = document.createElement('div'); boardEl.className = 's3b-board'; layer.appendChild(boardEl);
      bigEl = document.createElement('div'); bigEl.className = 's3b-big'; layer.appendChild(bigEl);
      tools = document.createElement('div'); tools.className = 's3b-tools';
      tools.innerHTML = `<button class="chip" data-t="pause">II</button><button class="chip" data-t="board">🏆</button>`;
      layer.appendChild(tools);
      tools.querySelector('[data-t=pause]').onclick = () => pauseMenu(true);
      tools.querySelector('[data-t=board]').onclick = () => { boardOn = !boardOn; };
    }
    ctl.enabled = true; ctl.lock();
    hud.toast(info.rule === 'lms' ? '👑 האחרון שנשאר מנצח!' : `♻️ ${RULES.dm.kills} חיסולים מנצחים`, 2200);
  }
  function endMatchView() {
    S.inMatch = false; S.match = null; S.phase = 'wait'; paused = false;
    ctl?.dispose(); ctl = null; hud?.dispose(); hud = null; layer.innerHTML = ''; feedEl = boardEl = bigEl = tools = null;
    for (const id of [...avatars.keys()]) dropAvatar(id);
    jet.visible = false; setScreen(null);
    if (document.pointerLockElement) document.exitPointerLock();
  }
  function pauseMenu(on) {
    if (!S.inMatch || S.phase === 'end') return;
    paused = on;
    if (!on) { setScreen(null); ctl.enabled = true; ctl.lock(); return; }
    ctl.enabled = false; ctl.fireHeld = false;
    if (document.pointerLockElement) document.exitPointerLock();
    const s = setScreen(`<div class="s3b-card"><h2>⏸ תפריט</h2>
      <div class="s3b-sub">${S.role === 'off' ? 'המשחק ממשיך ברקע' : 'הקרב ממשיך ברקע – שאר השחקנים עדיין משחקים'}</div>
      <button class="btn" id="pr">▶️ המשך</button>
      ${S.role !== 'client' ? '<button class="btn" id="pa">🔁 התחל סיבוב מחדש</button>' : ''}
      <button class="btn" id="pq">🚪 צא מהקרב</button></div>`);
    s.querySelector('#pr').onclick = () => pauseMenu(false);
    s.querySelector('#pa')?.addEventListener('click', () => { paused = false; hostStart(); });
    s.querySelector('#pq').onclick = leave;
  }
  function boardHTML() {
    let rows = [];
    if (S.sim) rows = [...S.sim.players.values()].map((p) => ({ id: p.id, k: p.kills, d: p.deaths, c: p.coins, dead: p.st === 'dead' || p.st === 'spec' }));
    else { const sn = S.snaps[S.snaps.length - 1]; if (sn) rows = [...sn.rows.values()].map((r) => ({ id: r[PI.id], k: r[PI.kills], d: r[PI.deaths], c: r[PI.coins], dead: r[PI.st] >= 4 })); }
    rows.sort((a, b) => b.k - a.k || a.d - b.d);
    return `<table class="s3b-tbl"><tr><th>#</th><th>שחקן</th><th>⚔️ חיסולים</th><th>💀 מוות</th><th>🪙</th></tr>
      ${rows.map((r, i) => { const info = S.roster.get(r.id) || {}; return `<tr class="${r.id === S.myId ? 'me' : ''} ${r.dead && S.phase !== 'end' ? 'dead' : ''}"><td>${i + 1}</td><td>${info.bot ? '🤖 ' : ''}${esc(info.name || r.id)}</td><td>${r.k}</td><td>${r.d}</td><td>${r.c}</td></tr>`; }).join('')}</table>`;
  }
  function showResults() {
    if (!S.inMatch) return;
    paused = false; boardOn = false;
    if (ctl) { ctl.enabled = false; ctl.fireHeld = false; }
    if (document.pointerLockElement) document.exitPointerLock();
    const w = S.winner, title = w === S.myId ? '🏆 ניצחת!' : w ? `👑 ${esc(nameOf(w))} ניצח` : '⏱ נגמר הזמן';
    const s = setScreen(`<div class="s3b-card"><h2>${title}</h2>
      <div class="s3b-sub">${RULES[S.cfg.rule].icon} ${RULES[S.cfg.rule].he}${S.code ? ` · חדר <b dir="ltr">${S.code}</b>` : ''}</div>
      ${boardHTML()}
      ${S.role === 'client' ? '<div class="s3b-sub">⏳ מחכים שהמארח יתחיל סיבוב נוסף…</div>' : '<button class="btn" id="ra">🔁 סיבוב נוסף</button>'}
      ${S.role === 'host' ? '<button class="btn" id="rl">🏠 חזרה ללובי</button>' : ''}
      ${S.role === 'off' ? '<button class="btn" id="rs">⚙️ שינוי הגדרות</button>' : ''}
      <button class="btn" id="rq">🚪 יציאה</button></div>`);
    s.querySelector('#ra')?.addEventListener('click', hostStart);
    s.querySelector('#rl')?.addEventListener('click', hostToLobby);
    s.querySelector('#rs')?.addEventListener('click', () => { endMatchView(); drawOffline(); });
    s.querySelector('#rq').onclick = leave;
  }
  function leave() {
    S.room?.close(); S.room = null; S.tr = null;
    endMatchView(); S.sim = null; S.role = null; S.code = null; S.roster.clear(); S.snaps = [];
    drawMenu();
  }

  // ---------- מסכים ----------
  const chips = (key, list, cur, dis = false) => list.map(([v, label]) => `<button class="chip ${String(cur) === String(v) ? 'on' : ''}" data-${key}="${v}" ${dis ? 'disabled' : ''}>${label}</button>`).join('');
  function drawMenu() {
    if (S.inMatch) return;
    const prefill = normalizeCode(new URLSearchParams(location.search).get('room') || '') || '';
    const s = setScreen(`<div class="s3b-card">
      <h2>⚔️ קרב</h2>
      <div class="s3b-sub">קופצים מהמטוס, צונחים לעיר, אוספים תיבות ומטבעות – וכולם נגד כולם</div>
      <div class="s3b-row"><span class="s3b-lbl">שם</span><input class="s3b-in" id="nm" maxlength="14" value="${esc(S.name)}"></div>
      <button class="btn" data-a="off">🤖 לבד נגד בוטים <small>עובד גם בלי אינטרנט</small></button>
      <button class="btn" data-a="host" ${S.busy ? 'disabled' : ''}>🌐 צור חדר <small>מקבלים קוד לחברים</small></button>
      <div class="s3b-row"><input class="s3b-in code" id="code" placeholder="TIGER-482" maxlength="12" value="${esc(prefill)}">
        <button class="btn" data-a="join" ${S.busy ? 'disabled' : ''}>🔑 הצטרף</button></div>
      <div class="s3b-row"><span class="s3b-lbl">חיבור:</span>${chips('net', [['peer', '🌍 אינטרנט'], ['bc', '🧪 אותו דפדפן (בדיקה)']], S.kind)}</div>
      <div class="s3b-err">${S.busy ? '⏳ מתחבר…' : esc(S.err)}</div>
      <button class="btn" data-a="back">→ חזרה לתפריט</button></div>`);
    const nm = s.querySelector('#nm');
    nm.onchange = nm.oninput = () => { S.name = cleanName(nm.value); LS.set('s3d.net.name', S.name); };
    s.querySelector('[data-a=off]').onclick = drawOffline;
    s.querySelector('[data-a=host]').onclick = hostOnline;
    s.querySelector('[data-a=join]').onclick = () => joinOnline(s.querySelector('#code').value);
    s.querySelector('#code').onkeydown = (e) => { if (e.key === 'Enter') joinOnline(e.target.value); };
    s.querySelector('[data-a=back]').onclick = exit;
    s.querySelectorAll('[data-net]').forEach((b) => (b.onclick = () => { S.kind = b.dataset.net; LS.set('s3d.net.kind', S.kind); drawMenu(); }));
  }
  function settingsHTML(isHost, minBots) {
    const dis = !isHost;
    return `<div class="s3b-row">${chips('rule', Object.entries(RULES).map(([k, r]) => [k, `${r.icon} ${r.he}`]), S.cfg.rule, dis)}</div>
      <div class="s3b-row"><span class="s3b-lbl">🤖 בוטים</span>${chips('bots', [0, 1, 3, 5, 7].filter((n) => n >= minBots).map((n) => [n, n]), S.cfg.bots, dis)}</div>
      <div class="s3b-row"><span class="s3b-lbl">רמה</span>${chips('lv', Object.entries(BOT_LV).map(([k, l]) => [k, l.he]), S.cfg.level, dis)}</div>`;
  }
  function bindSettings(s, redraw) {
    s.querySelectorAll('[data-rule]').forEach((b) => (b.onclick = () => { S.cfg.rule = b.dataset.rule; sendRoster(); redraw(); }));
    s.querySelectorAll('[data-bots]').forEach((b) => (b.onclick = () => { S.cfg.bots = +b.dataset.bots; sendRoster(); redraw(); }));
    s.querySelectorAll('[data-lv]').forEach((b) => (b.onclick = () => { S.cfg.level = b.dataset.lv; sendRoster(); redraw(); }));
  }
  function drawOffline() {
    S.role = 'off'; S.myId = 'h'; S.code = null;
    if (S.cfg.bots < 1) S.cfg.bots = 5;
    const s = setScreen(`<div class="s3b-card"><h2>🤖 לבד נגד בוטים</h2>
      <div class="s3b-sub">${RULES[S.cfg.rule].he === RULES.lms.he ? 'אין חזרה לחיים – האחרון שנשאר מנצח' : `חוזרים לחיים אחרי ${RULES.dm.respawn} שניות · ${RULES.dm.kills} חיסולים או ${RULES.dm.time / 60} דקות`}</div>
      ${settingsHTML(true, 1)}
      <button class="btn" id="go">🪂 צא לקרב</button>
      <div class="s3b-sub">${touch ? 'ג׳ויסטיק = תנועה · גרירה = כיוון · ⤒ = קפיצה מהמטוס / מצנח' : 'רווח = קפיצה מהמטוס / פתיחת מצנח · WASD · עכבר · קליק ירי · R · 1/2/3 · Tab = טבלה · Esc'}</div>
      <button class="btn" id="bk">→ חזרה</button></div>`);
    bindSettings(s, drawOffline);
    s.querySelector('#go').onclick = () => { setupHostSim(); hostStart(); };
    s.querySelector('#bk').onclick = () => { S.role = null; drawMenu(); };
  }
  function drawLobby() {
    if (S.inMatch) return;
    const isHost = S.role === 'host';
    const list = rosterList();
    const total = isHost ? humans() + Math.min(S.cfg.bots, MAX_PLAYERS - humans()) : list.length;
    const link = `${location.origin}${location.pathname}?room=${S.code}`;
    const s = setScreen(`<div class="s3b-card"><h2>🌐 חדר</h2>
      <div class="s3b-code" id="cd">${S.code}</div>
      <div class="s3b-row"><button class="chip" id="cp">📋 העתק קוד וקישור</button><span class="s3b-lbl">${S.kind === 'bc' ? '🧪 בדיקה מקומית (אותו דפדפן)' : '🌍 PeerJS'}</span></div>
      <div class="s3b-lbl">שחקנים (${humans()}/${MAX_PLAYERS})</div>
      <div class="s3b-list">${list.filter((r) => !r.bot).map((r) => `<div><span>${r.id === S.myId ? '⭐ ' : ''}${esc(r.name)}</span><small>${r.id === 'h' ? 'מארח' : ''}</small></div>`).join('')}</div>
      ${settingsHTML(isHost, 0)}
      ${isHost ? `<button class="btn" id="go" ${total < 2 ? 'disabled' : ''}>🪂 התחל קרב <small>${total} משתתפים</small></button>
        ${total < 2 ? '<div class="s3b-sub">צריך לפחות 2 משתתפים – הזמינו חבר או הוסיפו בוטים</div>' : ''}`
        : '<div class="s3b-sub">⏳ מחכים שהמארח יתחיל…</div>'}
      <button class="btn" id="lv">🚪 ${isHost ? 'סגור חדר' : 'צא מהחדר'}</button></div>`);
    if (isHost) bindSettings(s, drawLobby);
    s.querySelector('#go')?.addEventListener('click', hostStart);
    s.querySelector('#lv').onclick = leave;
    s.querySelector('#cp').onclick = () => { navigator.clipboard?.writeText(`${S.code}\n${link}`).then(() => (s.querySelector('#cp').textContent = '✔️ הועתק'), () => {}); };
  }

  // ---------- קלט מקומי ----------
  const slots = () => ['knife', 'pistol', G.w3 || null];
  const myState = () => (S.role === 'client' ? pred.st : myRow.st);
  const myPos = () => (S.role === 'client' ? pred.pos : S.sim?.players.get(S.myId)?.pos || pred.pos);
  const mySpeed = () => (S.role === 'client' ? pred.spd : S.sim?.players.get(S.myId)?.spd || 0);
  const myGround = () => (S.role === 'client' ? pred.ground : S.sim?.players.get(S.myId)?.ground);
  function equip(i) {
    const sl = slots(); if (!sl[i] || i === G.w) return;
    G.w = i; G.reloadT = 0; G.cd = Math.max(G.cd, 0.3);
  }
  function reload() {
    const wid = slots()[G.w], wd = W(wid);
    if (!wd?.mag || G.reloadT > 0 || (G.ammo[wid] ?? 0) >= wd.mag) return;
    G.reloadT = RELOAD[wid] || 1.3; avatars.get(S.myId)?.an.trigger('reload');
    if (S.role === 'client') S.room?.send({ t: 'rl' }); else S.sim?.reload(S.myId);
  }
  function spreadNow(wid) {
    const k = wid === 'sniper' && G.aim > 0.6 ? 0.15 : 1 - G.aim * 0.45;
    return (SPREAD[wid] + G.bloom + clamp(mySpeed() / RUN, 0, 1) * 0.025 + (myGround() ? 0 : 0.04)) * k;
  }
  const ray = { o: new V3(), d: new V3() };
  const _f = new V3(), _r = new V3(), _u = new V3(), _end = new V3(), _bb = new THREE.Box3();
  function fire(pressed) {
    const wid = slots()[G.w]; if (!wid) return;
    const st = myState();
    if ((st !== 'ground' && st !== 'chute') || myRow.hp <= 0 || S.phase === 'end') return;
    if (G.cd > 0 || G.reloadT > 0) return;
    if (!pressed && !AUTO.has(wid)) return;
    const wd = W(wid);
    if (wd.mag && (G.ammo[wid] ?? 0) <= 0) { reload(); return; }
    G.cd = 60 / wd.rpm; G.lastShot = nowS();
    if (wd.mag) G.ammo[wid]--;
    const me = avatars.get(S.myId);
    camera.getWorldDirection(_f); _r.crossVectors(_f, camera.up).normalize(); _u.crossVectors(_r, _f);
    const sp = wid === 'knife' ? 0 : spreadNow(wid), a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * sp;
    ray.d.copy(_f).addScaledVector(_r, Math.cos(a) * rr).addScaledVector(_u, Math.sin(a) * rr).normalize();
    ray.o.copy(camera.position);
    const msg = { t: 'shot', o: [ray.o.x, ray.o.y, ray.o.z].map((v) => +v.toFixed(3)), d: [ray.d.x, ray.d.y, ray.d.z].map((v) => +v.toFixed(4)), w: wid,
      rt: S.role === 'client' ? +S.renderT.toFixed(3) : S.sim.time };
    if (S.role === 'client') S.room?.send(msg); else S.sim.shot(S.myId, msg);
    if (!me) return;
    me.an.trigger(wid === 'knife' ? 'slash' : 'shoot');
    if (wid === 'knife') return;
    // תצוגה מקומית מיידית: נותב עד הקיר/הדמות הקרובה
    const mp = myPos(), near = camera.position.distanceTo(_end.copy(mp).setY(mp.y + 1.5)) * 0.9;
    let t = Wd.rayBoxes(_end.copy(ray.o).addScaledVector(ray.d, near), ray.d, wd.range) + near;
    for (const [id, v] of view) {
      if (id === S.myId || v.st === 'jet' || v.st === 'dead' || v.st === 'spec') continue;
      _bb.min.set(v.x - 0.3, v.y, v.z - 0.3); _bb.max.set(v.x + 0.3, v.y + 1.8, v.z + 0.3);
      const tb = segBox(ray.o, ray.d, t, _bb); if (tb > near && tb < t) t = tb;
    }
    t = Math.min(t, wd.range + near);
    _end.copy(ray.o).addScaledVector(ray.d, t);
    muzzleOf(me, _mz); flash(_mz, true); tracer(_mz, _end);
    if (t < wd.range + near - 0.1) puff(_end);
    const kk = KICK[wid] * rnd(0.8, 1.2); look.pitch += kk; G.kick += kk; look.yaw += (Math.random() - 0.5) * KICK[wid] * 0.6;
    G.bloom = Math.min(0.05, G.bloom + (AUTO.has(wid) ? 0.006 : 0.012));
    if (wd.mag && G.ammo[wid] === 0) reload();
  }

  function readInput(dt) {
    const live = ctl && ctl.enabled && !paused;
    if (live) {
      const l = ctl.lookDelta(), sens = 1 - G.aim * 0.4 - (G.aim > 0.6 && slots()[G.w] === 'sniper' ? 0.45 : 0);
      look.yaw -= l.x * sens; look.pitch = clamp(look.pitch + l.y * sens, -1.25, 1.2);
      if (ctl.take('slot1')) equip(0); if (ctl.take('slot2')) equip(1); if (ctl.take('slot3')) equip(2);
      if (ctl.take('switch')) { const sl = slots(); let i = G.w; do { i = (i + 1) % 3; } while (!sl[i]); equip(i); }
      if (ctl.take('reload')) reload();
      if (ctl.take('jump')) myJc++;
      if (ctl.take('pause')) pauseMenu(true);
      G.cd -= dt;
      const pressed = ctl.take('fire');
      if (pressed || ctl.fireHeld) fire(pressed);
      G.aim += ((ctl.aimHeld ? 1 : 0) - G.aim) * (1 - Math.exp(-12 * dt));
    } else { G.cd -= dt; G.aim *= 0.8; }
    if (G.reloadT > 0 && (G.reloadT -= dt) <= 0) { G.reloadT = 0; const wid = slots()[G.w]; if (W(wid)?.mag) G.ammo[wid] = W(wid).mag; }
    G.bloom = Math.max(0, G.bloom - dt * 0.06);
    if (G.kick > 0) { const rc = Math.min(G.kick, G.kick * 7 * dt + 0.0004); look.pitch -= rc; G.kick -= rc; }
    const mv = live ? ctl.move : { x: 0, y: 0 };
    return { mx: +mv.x.toFixed(3), my: +mv.y.toFixed(3), sp: live && ctl.sprint ? 1 : 0, jc: myJc, aim: +G.aim.toFixed(2), fire: live && ctl.fireHeld ? 1 : 0,
      yaw: +look.yaw.toFixed(4), pitch: +look.pitch.toFixed(4), w: G.w };
  }
  // סנכרון מצב הנשק המקומי מהמארח (תחמושת, נשק מתיבה)
  function syncGun() {
    if (myRow.w3 !== G.w3) { G.w3 = myRow.w3; if (G.w3) { G.ammo[G.w3] = W(G.w3).mag; G.w = 2; } else if (G.w === 2) G.w = 1; }
    if (myRow.st === 'dead' || myRow.st === 'jet') { G.ammo.pistol = W('pistol').mag; if (myRow.st === 'jet') { G.w = 1; } }
    const wid = slots()[G.w];
    if (W(wid)?.mag && !G.reloadT && !myRow.rl && nowS() - G.lastShot > 0.5 && Math.abs((G.ammo[wid] ?? 0) - myRow.ammo) > 1) G.ammo[wid] = myRow.ammo;
  }

  // ---------- לולאה ----------
  const _jp = new V3(), _cam = new V3(), _piv = new V3(), _dir = new V3(), _aimPt = new V3(), _tmp = new V3();
  function hostClock() { return S.role === 'client' ? nowS() + (S.offset ?? 0) : S.sim?.time ?? 0; }
  function jetTime() { return S.match ? hostClock() - S.match.jt : 0; }

  function netTick(dt) {
    if (S.role === 'host' || S.role === 'off') {
      if (!S.sim) return;
      if (S.inMatch) S.sim.step(dt);
      const ev = S.sim.drain();
      if (S.inMatch) {
        const me = S.sim.players.get(S.myId);
        if (me) {
          myRow.hp = me.hp; myRow.st = me.st; myRow.w3 = me.slots[2] || ''; myRow.ammo = me.ammo[me.slots[me.w]] ?? 0; myRow.rl = me.reloadT > 0 ? 1 : 0;
          myRow.kills = me.kills; myRow.deaths = me.deaths; myRow.coins = me.coins;
        }
        S.phase = S.sim.phase; S.phaseT = S.sim.phaseT; S.tl = Math.ceil(S.sim.timeLeft()); S.winner = S.sim.winner;
        S.coins = S.sim.coins.map((c) => (c.up ? 1 : 0)).join(''); S.chests = S.sim.chests.map((c) => (c.up ? 1 : 0)).join('');
      }
      if (S.role === 'host') {
        S.pending.push(...ev);
        if ((S.snapT += dt) >= 1 / SNAP_HZ && S.inMatch && S.room) { S.snapT = 0; S.room.broadcast(S.sim.snapshot(S.pending)); S.pending = []; }
        else if (!S.inMatch) S.pending = [];
      }
      handleEvents(ev);
    } else if (S.role === 'client' && S.inMatch) {
      S.renderT = hostClock() - INTERP;
    }
  }

  function updateLocal(dt) {
    const inp = readInput(dt);
    if (S.role === 'client') {
      if (S.phase === 'jet' && pred.st === 'jet') jetAt(S.match.jet, jetTime(), _jp);
      const wasJet = pred.st === 'jet';
      stepMove(pred, inp, dt, Wd, pred.st === 'jet' && S.match ? _jp : null);
      if (wasJet && pred.st === 'air') predDropT = nowS();
      if (corr.lengthSq() > 1e-6) { const k = 1 - Math.exp(-10 * dt); _tmp.copy(corr).multiplyScalar(k); pred.pos.add(_tmp); corr.sub(_tmp); }
      inp.q = ++predQ; predHist.push({ q: predQ, x: pred.pos.x, y: pred.pos.y, z: pred.pos.z }); if (predHist.length > 240) predHist.shift();
      if ((S.inT += dt) >= 1 / INPUT_HZ) { S.inT = 0; S.room?.send({ t: 'in', ...inp }); }
    } else S.sim?.setInput(S.myId, inp);
    syncGun();
  }

  function updateAvatars(dt) {
    for (const id of [...avatars.keys()]) if (!view.has(id) && !(id === S.myId && S.inMatch)) dropAvatar(id);
    for (const v of view.values()) {
      if (!S.roster.has(v.id) && S.role === 'client') continue;
      const a = avatarFor(v.id);
      const mine = v.id === S.myId;
      if (mine && S.role === 'client') { v.x = pred.pos.x; v.y = pred.pos.y; v.z = pred.pos.z; v.st = pred.st === 'jet' || pred.st === 'dead' || pred.st === 'spec' ? myRow.st : pred.st; v.spd = pred.spd; }
      if (mine) { v.yaw = look.yaw; v.pitch = look.pitch; v.wid = slots()[G.w]; v.aim = G.aim > 0.5; }
      if (v.st !== a.st) { if (v.st === 'dead') a.deadT = 0; a.st = v.st; }
      a.prev.copy(a.pos); a.pos.set(v.x, v.y, v.z);
      const vis = v.st !== 'jet' && v.st !== 'spec' && !(v.st === 'dead' && a.deadT > 4);
      a.rig.root.visible = vis;
      if (!vis) continue;
      setAvatarWeapon(a, v.wid);
      a.chute.visible = v.st === 'chute';
      if (a.tag) a.tag.visible = v.st !== 'dead';
      const R = a.rig.root;
      R.position.copy(a.pos);
      if (v.st === 'dead') {
        a.deadT += dt; const k = ease(Math.min(1, a.deadT / 0.6));
        R.rotation.set(-k * Math.PI / 2 * 0.95, v.yaw, 0, 'YXZ'); R.position.y += k * 0.15;
        a.an.update(dt, { speed: 0, pitch: 0, yawRate: 0 });
        continue;
      }
      R.rotation.set(v.st === 'air' ? 1.15 : 0, v.yaw, 0, 'YXZ');
      const yawRate = (v.yaw - a.yawPrev) / Math.max(dt, 1e-3); a.yawPrev = v.yaw;
      const sp = v.st === 'ground' ? v.spd : 0;
      const s = sp <= WALK ? (sp / WALK) * 0.5 : 0.5 + clamp((sp - WALK) / (RUN - WALK), 0, 1) * 0.5;
      a.an.update(dt, { speed: s, pitch: v.pitch, yawRate: mine ? yawRate : 0, aiming: v.aim, aimPoint: mine && v.st !== 'air' ? _aimPt : null });
    }
  }

  function updateWorldBits(dt, t) {
    for (let i = 0; i < coinMeshes.length; i++) { const m = coinMeshes[i]; m.visible = S.inMatch ? S.coins[i] !== '0' : true; m.rotation.y = t * 2.2 + i; m.position.y = A.coinSpots[i].pos.y + Math.sin(t * 2 + i) * 0.08; }
    for (let i = 0; i < chestMeshes.length; i++) { const m = chestMeshes[i]; m.visible = S.inMatch ? S.chests[i] !== '0' : true; m.userData.glow.material.opacity = 0.3 + Math.sin(t * 3 + i) * 0.15; }
    jet.visible = S.inMatch && S.match && (S.phase === 'jet' || jetTime() * S.match.jet.speed < 260);
    if (jet.visible) {
      const k = jetAt(S.match.jet, jetTime(), jet.position);
      const [fx, fy, fz] = S.match.jet.from, [tx, ty, tz] = S.match.jet.to;
      jet.rotation.set(-Math.asin((ty - fy) / Math.hypot(tx - fx, ty - fy, tz - fz)), Math.atan2(tx - fx, tz - fz), Math.sin(k * Math.PI * 2) * 0.2, 'YXZ');
      jet.userData.update?.(dt);
      if (k >= 1) jet.position.addScaledVector(_tmp.set(tx - fx, 0, tz - fz).normalize(), (jetTime() * S.match.jet.speed) - Math.hypot(tx - fx, ty - fy, tz - fz));
    }
  }

  let orbit = 0;
  function updateCamera(dt) {
    if (!S.inMatch) { // לובי: סיבוב מעל העיר
      orbit += dt * 0.08;
      camera.position.set(Math.sin(orbit) * 62, 34, Math.cos(orbit) * 62); camera.lookAt(0, 4, 0);
      if (camera.fov !== 55) { camera.fov = 55; camera.updateProjectionMatrix(); }
      return;
    }
    const st = myState(), wid = slots()[G.w];
    const cp = Math.cos(look.pitch);
    _dir.set(Math.sin(look.yaw) * cp, Math.sin(look.pitch), Math.cos(look.yaw) * cp);
    let fov = 70;
    if (st === 'jet') {
      _piv.copy(jet.position);
      _dir.set(Math.sin(look.yaw) * Math.cos(clamp(look.pitch, -0.3, 0.9)), Math.sin(clamp(look.pitch, -0.3, 0.9)), Math.cos(look.yaw) * Math.cos(clamp(look.pitch, -0.3, 0.9)));
      camera.position.copy(_piv).addScaledVector(_dir, -24); camera.lookAt(_piv);
    } else if (st === 'dead' || st === 'spec') {
      let tgt = myPos();
      if (st === 'spec' || (S.cfg.rule === 'lms' && avatars.get(S.myId)?.deadT > 3)) { const o = [...view.values()].find((v) => v.id !== S.myId && (v.st === 'ground' || v.st === 'chute' || v.st === 'air')); if (o) tgt = _tmp.set(o.x, o.y, o.z); }
      orbit += dt * 0.25;
      _piv.set(tgt.x, tgt.y + 1.5, tgt.z);
      camera.position.set(_piv.x + Math.sin(orbit) * 6, _piv.y + 4, _piv.z + Math.cos(orbit) * 6); camera.lookAt(_piv);
    } else {
      const mp = myPos(), fx = Math.sin(look.yaw), fz = Math.cos(look.yaw);
      const air = st === 'air' || st === 'chute';
      const side = air ? 0.6 : 1.05 - G.aim * 0.3, dist = air ? 5 : 3.0 - G.aim * 0.9;
      _piv.set(mp.x - fz * side, mp.y + (air ? 2.2 : 1.85), mp.z + fx * side);
      _cam.copy(_dir).negate();
      let t = Wd.rayBoxes(_piv, _cam, dist + 0.25);
      t = Math.max(0.3, Math.min(dist, t - 0.25));
      camera.position.copy(_piv).addScaledVector(_cam, t);
      if (camera.position.y < 0.2) camera.position.y = 0.2;
      camera.lookAt(_cam.copy(camera.position).add(_dir));
      fov = 70 - G.aim * 18;
      if (wid === 'sniper' && G.aim > 0.6) fov = 70 / 4;
    }
    _aimPt.copy(camera.position).addScaledVector(_dir, 60);
    if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = fov; camera.updateProjectionMatrix(); }
  }

  function updateHud() {
    if (!hud) return;
    const st = myState(), wid = slots()[G.w], wd = W(wid);
    hud.setAmmo(wd.mag ? G.ammo[wid] ?? 0 : 0, wd.mag, G.reloadT > 0);
    hud.setHp(myRow.hp);
    hud.setWeapons(slots().filter(Boolean).map((x) => W(x)), slots().filter(Boolean).indexOf(wid));
    hud.setReticle(st === 'jet' || st === 'dead' || st === 'spec' ? 'knife' : wid);
    hud.scope(wid === 'sniper' && G.aim > 0.6 && st === 'ground');
    const focal = innerHeight / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    hud.spread(wid === 'knife' ? 0 : spreadNow(wid) * focal);
    const alive = [...view.values()].filter((v) => v.st !== 'dead' && v.st !== 'spec').length;
    const rule = S.cfg.rule;
    const mm = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    hud.setTop(S.phase === 'end' ? '🏁 הסיבוב נגמר' : rule === 'lms' ? `👑 נשארו ${alive} · ⚔️ ${myRow.kills} · 🪙 ${myRow.coins}` : `♻️ ⏱ ${mm(S.tl)} · ⚔️ ${myRow.kills}/${RULES.dm.kills} · 🪙 ${myRow.coins}`);
    const jumpKey = touch ? '⤒ קפיצה' : 'רווח';
    let big = '';
    if (st === 'jet') big = `✈️ לחצו ${jumpKey} כדי לקפוץ<small>אפשר לגרור/להזיז עכבר כדי להסתכל</small>`;
    else if (st === 'air') big = `🪂 נפילה חופשית<small>${jumpKey} = פתיחת מצנח · המצנח נפתח לבד קרוב לקרקע</small>`;
    else if (st === 'dead') big = rule === 'dm' ? '💀 נפלת · חוזרים לקרב בעוד רגע…' : '💀 הודחת · צופים בשאר השחקנים';
    else if (st === 'spec') big = '👀 צופה – תצטרפו בסיבוב הבא';
    if (bigEl && bigEl.dataset.k !== big) { bigEl.dataset.k = big; bigEl.innerHTML = big; }
    if (boardEl) { const on = boardOn || !!keys.tab; boardEl.classList.toggle('on', on); if (on) boardEl.innerHTML = boardHTML(); }
  }

  // Tab = טבלת ניקוד
  const keys = {};
  const kd = (e) => { if (e.code === 'Tab' && S.inMatch) { keys.tab = true; e.preventDefault(); } };
  const ku = (e) => { if (e.code === 'Tab') keys.tab = false; };
  addEventListener('keydown', kd); addEventListener('keyup', ku);
  // לשונית מוסתרת: המארח ממשיך להריץ את העולם ולשלוח (rAF נעצר ברקע)
  let lastHidden = nowS();
  const hiddenIv = setInterval(() => {
    const t = nowS(), dt = t - lastHidden; lastHidden = t;
    if (document.hidden && T.active && (S.role === 'host' || S.role === 'client')) { if (S.role === 'host' && S.inMatch) S.sim.setInput(S.myId, { mx: 0, my: 0, jc: myJc, yaw: look.yaw, pitch: look.pitch, w: G.w }); netTick(Math.min(dt, 0.25)); }
  }, 100);

  let clockT = 0;
  T.update = (dtReal) => {
    // טלפון איטי: מחלקים פריים ארוך לצעדים קטנים (עד רבע שנייה), כדי שהעולם לא יאט והפיזיקה לא "תקפוץ"
    const total = Math.min(dtReal, 0.25), n = Math.max(1, Math.ceil(total / 0.05 - 1e-6)), dt = total / n;
    clockT += total;
    for (let i = 0; i < n; i++) { if (S.inMatch) updateLocal(dt); netTick(dt); }
    if (S.role === 'client') viewFromSnaps(); else if (S.sim && S.inMatch) viewFromSim(); else view.clear();
    updateWorldBits(total, clockT);
    updateCamera(total);
    updateAvatars(total);
    updateFx(total);
    updateHud();
  };

  function exit() {
    S.room?.close(); S.room = null;
    endMatchView(); setScreen(null);
    clearInterval(hiddenIv); removeEventListener('keydown', kd); removeEventListener('keyup', ku);
    scene.remove(root); style.remove();
    root.traverse((o) => { o.geometry?.dispose?.(); });
    saved.lights.forEach((l) => (l.visible = true));
    scene.background = saved.bg; scene.fog = saved.fog;
    camera.fov = saved.fov; camera.near = saved.near; camera.far = saved.far; camera.updateProjectionMatrix();
    if (renderer && saved.pr) renderer.setPixelRatio(saved.pr);
    ui.innerHTML = '';
    T.active = false; back();
  }

  // ממשק לבדיקות (Playwright) ולמפקד
  Object.assign(T, {
    exit, leave, view, avatars, pred, myRow, look, G,
    offline(cfg = {}) { Object.assign(S.cfg, cfg); S.role = 'off'; S.myId = 'h'; setupHostSim(); hostStart(); },
    host(kind = 'bc') { S.kind = kind; return hostOnline(); },
    join(code, kind = 'bc') { S.kind = kind; return joinOnline(code); },
    start: hostStart, toLobby: hostToLobby,
    jump() { myJc++; },
    fire() { G.cd = 0; fire(true); },
    aimAt(p) { _tmp.subVectors(p, camera.position); look.yaw = Math.atan2(_tmp.x, _tmp.z); look.pitch = Math.atan2(_tmp.y, Math.hypot(_tmp.x, _tmp.z)); },
  });
  Object.defineProperty(T, 'sim', { get: () => S.sim });
  drawMenu();
  return T;
}

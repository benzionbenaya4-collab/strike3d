// מצב לבד: 👹 המתחזה. מפלצת מתחפשת לאחד מ-24 האזרחים בעיר. שעה במשחק (≈12 דקות אמיתיות) לפני שהיא משתלטת.
// צופים, רושמים רמזים במחברת, ויורים רק במי שבטוחים בו: יריה באזרח תמים = הפסד מיידי. תפסת → נחשף → קרב בוס.
// startImposter(scene, camera, ui, back, renderer) → { active, update(dt), ... (כלי בדיקה) }
import * as THREE from 'three';
import { buildCharacter } from '../models/character.js';
import { buildKnife } from '../models/knife.js';
import { buildWeapon } from '../models/weapons.js';
import { weapon as W } from '../data/weapons.js';
import { createControls, isTouch } from '../core/controls.js';
import { createHud } from '../core/hud.js';
import { makeWorld, stepMove, newBody } from '../net/sim.js';
import { addCoins, getLoadout } from '../store.js';
import { buildTown } from '../world/town/town.js';
import { buildCitizen, randomLook, addHitBoxes, relaxArms } from '../world/town/citizen.js';
import { buildMonster, monsterHitBoxes } from '../world/town/monster.js';
import { buildDog, buildCat } from '../world/town/animals.js';
import { buildFood, FOOD, NORMAL_FOOD, WEIRD_FOOD, makeBubble, makeShadow } from '../world/town/props.js';
import { NAMES, ROLES, TELLS, TELL_IDS, DIFF } from '../world/town/people.js';

const V3 = THREE.Vector3;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const k = Math.floor(Math.random() * (i + 1)); [a[i], a[k]] = [a[k], a[i]]; } return a; };
const ease = (t) => t * t * (3 - 2 * t);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const turn = (cur, to, k, dt) => cur + wrap(to - cur) * (1 - Math.exp(-k * dt));

const TOTAL = 12 * 60;        // שניות אמיתיות לשעה במשחק
const CITIZENS = 24;
const LOADOUT = ['pistol', 'rifle', 'knife'];
const SPREAD = { knife: 0, pistol: 0.004, rifle: 0.006 };
const KICK = { pistol: 0.022, rifle: 0.011 };
const RELOAD_T = 1.3;

const CSS = `
.s3i { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; padding:16px; pointer-events:auto;
  background:linear-gradient(180deg,#0b0d12aa,#0b0d12dd); overflow:auto; }
.s3i-card { width:min(560px,100%); max-height:100%; overflow:auto; background:#151922ee; border:1px solid #2a3142; border-radius:18px; padding:18px;
  display:flex; flex-direction:column; gap:10px; align-items:stretch; }
.s3i-card h2 { margin:0; font-size:30px; font-weight:900; text-align:center; }
.s3i-card .btn { width:100%; }
.s3i-story { color:#c9d1dd; font-size:14px; line-height:1.65; text-align:center; }
.s3i-help { color:#8b95a7; font-size:12px; line-height:1.6; text-align:center; }
.s3i-tells { display:flex; flex-wrap:wrap; gap:6px; justify-content:center; }
.s3i-tells span { background:#0b0d12; border:1px solid #2a3142; border-radius:999px; padding:4px 10px; font-size:13px; }
.s3i-hudbtn { position:absolute; top:max(10px, env(safe-area-inset-top)); pointer-events:auto; z-index:5; }
.s3i-nbbtn { left:56px; }
@media (max-width:640px), (pointer: coarse) { .s3i-nbbtn { left:auto; right:12px; top:max(112px, env(safe-area-inset-top)); } }
.s3i-target { position:absolute; left:50%; top:calc(50% + 34px); transform:translateX(-50%); background:#0b0d12bb; border-radius:10px;
  padding:4px 10px; font-size:13px; white-space:nowrap; pointer-events:none; display:none; }
.s3i-boss { width:min(360px,70vw); height:12px; background:#2a1010; border-radius:6px; overflow:hidden; margin-top:4px; }
.s3i-boss i { display:block; height:100%; background:linear-gradient(90deg,#7dff4a,#2ecc71); transition:width .15s; }
.s3i-nb { position:absolute; inset:0; z-index:20; pointer-events:auto; display:flex; align-items:center; justify-content:center; padding:12px;
  background:#05060acc; }
.s3i-book { width:min(760px,100%); max-height:100%; display:flex; flex-direction:column; background:#efe6cf; color:#2a2418; border-radius:16px;
  box-shadow:0 10px 40px #000a; overflow:hidden; font-family:Rubik, sans-serif; }
.s3i-book header { display:flex; align-items:center; gap:8px; padding:12px 14px; background:#d9caa3; }
.s3i-book header h3 { margin:0; flex:1; font-size:20px; }
.s3i-book .x { background:#2a2418; color:#efe6cf; border:0; border-radius:10px; padding:8px 12px; font:700 14px Rubik; cursor:pointer; }
.s3i-list { overflow:auto; padding:10px; display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:8px; }
.s3i-p { background:#fbf6e8; border:1px solid #d6c9a6; border-radius:12px; padding:8px; display:flex; flex-direction:column; gap:6px; }
.s3i-p.sus { border-color:#c0392b; box-shadow:0 0 0 2px #c0392b55; }
.s3i-p.ok { opacity:.6; }
.s3i-p .top { display:flex; align-items:center; gap:6px; }
.s3i-p .sw { width:22px; height:22px; border-radius:6px; flex:none; border:1px solid #0003; }
.s3i-p .nm { flex:1; font-weight:700; font-size:14px; line-height:1.2; } .s3i-p .nm small { display:block; font-weight:400; color:#7a6d52; font-size:12px; }
.s3i-p button.m { border:1px solid #bfae86; background:#fff; border-radius:8px; padding:3px 7px; cursor:pointer; font-size:14px; }
.s3i-p button.m.on { background:#2a2418; color:#fff; }
.s3i-p .clues { display:flex; flex-wrap:wrap; gap:4px; }
.s3i-p .clues span { background:#f3d9a4; border-radius:999px; padding:2px 8px; font-size:12px; }
.s3i-p textarea { width:100%; min-height:34px; resize:vertical; border:1px solid #d6c9a6; border-radius:8px; background:#fffdf6; font:13px Rubik; padding:4px 6px; color:#2a2418; }
.s3i-p.here { outline:3px solid #ffb020; }
.s3i-flash { position:absolute; inset:0; pointer-events:none; z-index:15; opacity:0; transition:opacity .5s; }
.s3i-doom { position:absolute; inset:0; z-index:16; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; pointer-events:none;
  text-align:center; padding:16px; background:radial-gradient(ellipse at center, #00000000 30%, #3a0000cc 100%); animation:s3iIn .5s ease-out; }
.s3i-doom h1 { margin:0; font-size:clamp(32px,8vw,64px); font-weight:900; color:#ff3b30; text-shadow:0 0 30px #ff000088, 0 4px 0 #000; letter-spacing:1px; }
.s3i-doom p { margin:0; font-size:18px; color:#fff; text-shadow:0 2px 6px #000; }
@keyframes s3iIn { from { opacity:0; transform:scale(1.15); } to { opacity:1; transform:none; } }
@media (max-width:520px) { .s3i-list { grid-template-columns:1fr; } }
`;

export function startImposter(scene, camera, ui, back, renderer) {
  const touch = isTouch();
  const saved = { bg: scene.background, fog: scene.fog, fov: camera.fov, near: camera.near, far: camera.far, pr: renderer?.getPixelRatio(), lights: [] };
  scene.children.forEach((o) => { if (o.isLight && o.visible) { saved.lights.push(o); o.visible = false; } });
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  camera.fov = 70; camera.near = 0.05; camera.far = 500; camera.updateProjectionMatrix();
  if (renderer && touch) renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));

  const root = new THREE.Group(); root.name = 'imposter'; scene.add(root);
  const T = buildTown(); root.add(T.group);
  const A = T.A, nav = T.nav, PL = T.places;
  scene.background = new THREE.Color('#0b0d12'); scene.fog = A.fog;
  const Wd = makeWorld(A);
  const actors = new THREE.Group(); root.add(actors);
  const fxg = new THREE.Group(); root.add(fxg);

  // ---------- שחקן ----------
  const rig = buildCharacter({ skin: getLoadout()?.outfit || 'default' }); root.add(rig.root);
  const an = rig.anim;
  const models = { pistol: buildWeapon('pistol', 'default'), rifle: buildWeapon('rifle', 'default'), knife: buildKnife('default') };
  const P = Object.assign(newBody(), { st: 'ground', hp: 100, w: 0, ammo: { pistol: 12, rifle: 30 }, reloadT: 0, cd: 0, bloom: 0, yawPrev: 0, aim: 0, kick: 0, jc: 0 });
  function equip(i) { if (i === P.w && an.weapon) return; P.w = i; const id = LOADOUT[i]; an.setWeapon(models[id], id); P.reloadT = 0; P.cd = 0.35; }

  // ---------- מצב ----------
  const st = { mode: 'lobby', diff: 'medium', time: 0, total: TOTAL, paused: false, t: 0, shots: 0, cine: null, result: null, night: 0, runId: 0, book: false, lobbyT: 0 };
  let citizens = [], dogs = [], cats = [], imp = null, boss = null, hud = null, ctl = null;
  let hitList = [], hitDirty = true;
  const layer = document.createElement('div'); layer.style.cssText = 'position:absolute;inset:0;pointer-events:none'; ui.appendChild(layer);
  const screen = document.createElement('div'); screen.style.cssText = 'position:absolute;inset:0;pointer-events:none'; ui.appendChild(screen);
  const setScreen = (html) => { screen.innerHTML = html || ''; screen.style.pointerEvents = html ? 'auto' : 'none'; return screen; };
  let tgtEl = null, flashEl = null;

  // ---------- אזרחים ----------
  function clearActors() {
    for (const c of citizens) { actors.remove(c.rig.root); fxg.remove(c.shadow); fxg.remove(c.bubble); fxg.remove(c.markS); }
    for (const a of [...dogs, ...cats]) { actors.remove(a.root); fxg.remove(a.bubble); }
    if (boss) { actors.remove(boss.rig.root); boss = null; }
    citizens = []; dogs = []; cats = []; imp = null; hitDirty = true;
  }

  function makeCitizens(diff, withImposter) {
    clearActors();
    const D = DIFF[diff];
    const herringRoles = ROLES.filter((r) => r.herring);
    const others = shuffle(ROLES.filter((r) => !r.herring));
    const roles = shuffle([...herringRoles, ...others.slice(0, CITIZENS - herringRoles.length)]);
    const used = { m: new Set(), f: new Set() };
    const activeHerrings = new Set(shuffle(herringRoles.map((r) => r.id)).slice(0, D.herrings));
    roles.forEach((role, i) => {
      const g = used.m.size === used.f.size ? (Math.random() < 0.5 ? 'f' : 'm') : used.m.size < used.f.size ? 'm' : 'f'; // חצי-חצי → שמות לא חוזרים
      const name = shuffle(NAMES[g].filter((n) => !used[g].has(n)))[0]; used[g].add(name);
      const look = randomLook(Math.random, { gender: g, ...role.look });
      const r = buildCitizen(look);
      const c = {
        i, name, role, roleHe: role.he[g === 'f' ? 1 : 0], g, rig: r, an: r.anim, look,
        pos: r.root.position, yaw: Math.random() * 6.28, state: 'idle', path: [], act: { kind: 'idle', until: rnd(0.5, 4), face: null },
        walk: (role.speed || rnd(1.15, 1.5)), imposter: false, tells: new Set(), quirks: new Set(),
        food: null, eatT: 0, bite: 0, tw: { twitch: rnd(4, 9), owl: rnd(10, 20), twitchT: 0, owlT: 0, look: 0 },
        clues: [], seen: {}, mark: 0, notes: '', alive: true, fall: 0, flee: false, v: 0, sit: 0,
      };
      if (role.herring && activeHerrings.has(role.id)) c.quirks.add(role.herring);
      r.root.userData.cit = c;
      const sp = nav.randomPoint(Math.random, new V3(0, 0, 0), 30);
      c.pos.copy(sp); r.root.rotation.y = c.yaw;
      c.hit = addHitBoxes(r, c); c.kind = 'citizen';
      c.shadow = makeShadow(); fxg.add(c.shadow);
      c.bubble = makeBubble(); fxg.add(c.bubble);
      c.markS = makeBubble(); c.markS.scale.set(0.4, 0.3, 1); fxg.add(c.markS);
      actors.add(r.root); citizens.push(c);
    });
    if (withImposter) {
      const pool = citizens.filter((c) => !c.quirks.size && !c.role.herring && c.look.age !== 'kid');
      imp = pick(pool);
      imp.imposter = true;
      const base = shuffle(['limp', 'twitch', 'owl']).slice(0, 1);
      const rest = shuffle(TELL_IDS.filter((t) => !base.includes(t)));
      for (const t of [...base, ...rest].slice(0, D.tells)) imp.tells.add(t);
      if (imp.tells.has('noblink')) imp.rig.j.head.userData.eyes = null; // ה-Animator לא ימצמץ
      if (imp.tells.has('limp')) imp.walk = 1.0;
    }
    // חיות
    const dogC = [['#a06a3a', '#e8d2b0'], ['#2d2d2d', '#bbbbbb'], ['#d9b26a', '#f3e5c0']];
    for (let i = 0; i < 3; i++) {
      const d = buildDog(...dogC[i]);
      const a = { ...d, kind: 'dog', pos: d.root.position, yaw: 0, home: PL.square[i * 3].pos.clone(), path: [], wait: rnd(0, 3), mode: 'idle', target: null, cool: rnd(0, 5), bubble: makeBubble() };
      a.pos.copy(nav.randomPoint(Math.random, a.home, 6)); a.bubble.scale.set(0.45, 0.34, 1);
      actors.add(d.root); fxg.add(a.bubble); dogs.push(a);
    }
    const catSpots = [PL.benches[0], PL.benches[3], PL.cafe[1], PL.stalls[1], PL.parks[2]];
    const catC = [['#555', '#ddd'], ['#e67e22', '#f5deb3'], ['#111', '#fff'], ['#9e9e9e', '#eee']];
    for (let i = 0; i < 4; i++) {
      const k = buildCat(...catC[i]);
      const sp = catSpots[i].pos ? catSpots[i].pos : catSpots[i].buyer;
      const a = { ...k, kind: 'cat', pos: k.root.position, yaw: rnd(0, 6), home: sp.clone(), path: [], wait: 0, mode: 'idle', flee: 0, cool: 0, bubble: makeBubble() };
      a.pos.copy(nav.nearestFree(sp.x + 1.2, sp.z + 1.2)); a.bubble.scale.set(0.45, 0.34, 1);
      actors.add(k.root); fxg.add(a.bubble); cats.push(a);
    }
    hitDirty = true;
  }

  // ---------- שגרה ----------
  const phase = () => clamp(st.time / st.total, 0, 1);
  function placeFor(c, kind) {
    const R = c.role;
    switch (kind) {
      case 'work':
        if (R.work === 'stall') { const s = PL.stalls[R.slot]; return { pos: s.seller, face: s.face, act: 'work' }; }
        if (R.work === 'cafe') { const s = pick(PL.cafe); return { pos: s.pos, face: s.face, act: 'work' }; }
        if (R.work === 'park') { const s = pick(PL.parks); return { pos: nav.randomPoint(Math.random, s.pos, 3), face: s.face, act: 'work' }; }
        if (R.work === 'bench') return placeFor(c, 'bench');
        if (R.work === 'square') { const s = pick(PL.square); return { pos: s.pos, face: s.face, act: c.quirks.has('sky') ? 'stare' : c.quirks.has('twitch') ? 'dance' : 'chat' }; }
        if (R.work === 'lamp') { const s = pick(PL.lamps); return { pos: s.pos, face: s.face, act: 'chat' }; }
        if (R.work === 'home') { const s = pick(PL.doors); return { pos: s.pos, face: s.face, act: 'idle' }; }
        if (R.work === 'patrol' || R.work === 'jog') return { pos: nav.randomPoint(), face: null, act: 'pass' };
        return { pos: nav.randomPoint(), face: null, act: 'pass' };
      case 'eat': {
        const opts = [...PL.stalls.map((s) => ({ pos: s.buyer, face: s.faceBuyer })), ...PL.cafe, ...PL.benches];
        const s = pick(opts); return { pos: s.pos, face: s.face, act: 'eat' };
      }
      case 'bench': { const b = pick(PL.benches); return { pos: b.pos, face: b.face, act: 'sit', bench: b }; }
      case 'chat': { const s = pick(PL.square); return { pos: nav.randomPoint(Math.random, s.pos, 1.5), face: s.face, act: 'chat' }; }
      case 'park': { const s = pick(PL.parks); return { pos: nav.randomPoint(Math.random, s.pos, 3), face: s.face, act: 'idle' }; }
      case 'lamp': { const s = pick(PL.lamps); return { pos: s.pos, face: s.face, act: 'idle' }; }
      case 'home': { const s = pick(PL.doors); return { pos: s.pos, face: s.face, act: 'idle' }; }
      case 'stare': return { pos: nav.randomPoint(Math.random, c.pos, 8), face: null, act: 'stare' };
      default: return { pos: nav.randomPoint(Math.random, c.pos, 18), face: null, act: 'pass' };
    }
  }
  function chooseNext(c) {
    const p = phase(), night = st.night;
    const w = {
      work: (c.role.work === 'stroll' ? 0 : 5) * (1 - night * 0.6),
      eat: 1.6 + (c.imposter && c.tells.has('eat') ? 2.4 * DIFF[st.diff].freq : 0),
      stroll: 1.6, chat: 1.2, bench: 1, park: 0.8 * (1 - night), lamp: night * 2.5, home: night * 1.2 + (p > 0.9 ? 1 : 0),
      stare: (c.imposter && c.tells.has('sky') ? 1.4 * DIFF[st.diff].freq : 0) + (c.quirks.has('sky') ? 1.5 + night * 3 : 0),
    };
    if (c.role.work === 'jog' || c.role.work === 'patrol') { w.stroll += 3; w.work = 0; }
    let sum = 0; for (const k in w) sum += w[k];
    let r = Math.random() * sum, kind = 'stroll';
    for (const k in w) { r -= w[k]; if (r <= 0) { kind = k; break; } }
    if (c.last === kind && kind !== 'work') kind = 'stroll';
    c.last = kind;
    const pl = placeFor(c, kind);
    goTo(c, pl);
  }
  // תקציב A* לפריים – כדי שעשרים אזרחים שבורחים יחד לא יתקעו פריים
  let pathBudget = 4;
  function plan(c, to) {
    if (pathBudget > 0) { pathBudget--; c.path = nav.path(c.pos, to); c.want = null; }
    else { c.path = []; c.want = to.clone(); }
  }
  function goTo(c, pl) {
    plan(c, pl.pos);
    c.state = 'walk'; c.plan = pl; c.sit = 0;
  }
  function fleeFrom(c, from) {
    const doors = PL.doors.map((d) => d.pos).sort((a, b) => b.distanceToSquared(from) - a.distanceToSquared(from));
    plan(c, doors[Math.floor(Math.random() * 4)]);
  }
  const DUR = { work: [25, 45], eat: [10, 14], chat: [10, 20], sit: [15, 28], idle: [8, 18], stare: [7, 11], dance: [10, 18], pass: [0.5, 2.5] };
  function arrive(c) {
    const pl = c.plan || { act: 'idle' };
    c.state = 'act';
    c.act = { kind: pl.act, until: st.t + rnd(...(DUR[pl.act] || DUR.idle)), face: pl.face, bench: pl.bench };
    if (pl.act === 'eat') startEat(c);
    if (pl.act === 'sit' && pl.bench) { const b = pl.bench; c.seat = b.pos.clone().addScaledVector(new V3(Math.sin(b.face), 0, Math.cos(b.face)), -0.55); }
    if (pl.act === 'stare') c.act.face = c.yaw;
    if (pl.act === 'chat' && Math.random() < 0.5) say(c, pick(['💬', '😂', '👋', '☕', '🙂']), 2.5);
  }
  function startEat(c) {
    const weird = c.imposter && c.tells.has('eat');
    const id = weird ? pick(WEIRD_FOOD) : pick(NORMAL_FOOD);
    stopEat(c);
    c.food = { id, mesh: buildFood(id) }; c.rig.hand.add(c.food.mesh); c.eatT = 0; c.bite = 1.2;
    if (nearPlayer(c, 26)) say(c, FOOD[id].icon, 3);
  }
  function stopEat(c) { if (c.food) { c.rig.hand.remove(c.food.mesh); c.food = null; } }
  function say(c, text, secs, opts) { c.bubble.show(text, secs, st.t, opts); }

  // ---------- תצפית ורמזים ----------
  const _p = new V3(), _q = new V3();
  const nearPlayer = (c, d) => c.pos.distanceTo(P.pos) < d;
  function inView(c, maxD = 30) {
    if (!(st.mode === 'play')) return false;
    _p.copy(c.pos); _p.y += 1.5 * c.look.height;
    if (_p.distanceTo(camera.position) > maxD) return false;
    _q.copy(_p).project(camera);
    if (_q.z > 1 || Math.abs(_q.x) > 0.95 || Math.abs(_q.y) > 0.95) return false;
    return !Wd.blocked(camera.position, _p);
  }
  function witness(c, tell, extra = '', needView = true) {
    if (needView && !inView(c)) return false;
    const D = DIFF[st.diff];
    const key = tell + extra;
    const e = c.clues.find((x) => x.key === key);
    if (e) { e.n++; e.at = clockStr(); return true; }
    const text = tell === 'eat' ? `אכל ${extra} ${FOOD[extra]?.icon || ''}`.replace(` ${extra} `, ` ${FOOD[extra]?.he || extra} `)
      : tell === 'animals' ? (extra === 'cat' ? 'חתול ברח 🐈' : 'כלב נבח 🐕') : TELLS[tell].text;
    c.clues.push({ key, tell, text, icon: TELLS[tell].icon, at: clockStr(), n: 1 });
    if (D.auto === 'toast') hud?.toast(`👁️ ${c.name}: ${text}`, 2200);
    else if (D.auto === 'hint') hud?.toast('📓 רמז חדש נרשם במחברת', 1400);
    if (st.book) renderBook();
    return true;
  }
  const has = (c, t) => (c.imposter && c.tells.has(t)) || c.quirks.has(t);

  // ---------- עדכון אזרח ----------
  const _d = new V3();
  function updateCitizen(c, dt) {
    const j = c.rig.j;
    if (!c.alive) { // נפל
      c.fall = Math.min(1, c.fall + dt * 2.2);
      c.rig.root.rotation.set(-ease(c.fall) * Math.PI / 2, c.yaw, 0, 'YXZ');
      c.an.update(dt, { speed: 0 }); return;
    }
    let speed = 0;
    if (c.want && pathBudget > 0) plan(c, c.want);
    if (c.flee && !c.path.length && !c.want && !c.hiding) fleeFrom(c, boss ? boss.pos : imp ? imp.pos : P.pos);
    if (c.state === 'walk' || c.flee) {
      const wp = c.path[0];
      if (!wp) { if (c.flee) { if (!c.want) c.hiding = true; } else if (!c.want) arrive(c); }
      else {
        _d.subVectors(wp, c.pos).setY(0); const d = _d.length();
        if (d < 0.3) c.path.shift();
        else {
          const sp = c.flee ? 3.6 : c.walk;
          c.yaw = turn(c.yaw, Math.atan2(_d.x, _d.z), 8, dt);
          const k = Math.max(0, Math.cos(wrap(Math.atan2(_d.x, _d.z) - c.yaw)));
          c.pos.addScaledVector(_d.divideScalar(d), sp * dt * (0.25 + 0.75 * k));
          speed = sp;
        }
      }
    } else if (c.state === 'act') {
      if (c.act.face != null) c.yaw = turn(c.yaw, c.act.face, 4, dt);
      if (st.t > c.act.until) { stopEat(c); c.sit = 0; if (st.mode !== 'lobby' || Math.random() < 0.7) chooseNext(c); else c.act.until = st.t + 3; }
    } else if (st.t > c.act.until) chooseNext(c);
    c.v = speed;
    // ישיבה על ספסל
    const sitting = c.state === 'act' && c.act.kind === 'sit';
    c.sit = clamp(c.sit + (sitting ? dt : -dt) * 2.5, 0, 1);
    if (c.sit > 0 && c.seat) c.pos.lerp(c.seat, sitting ? 1 - Math.exp(-4 * dt) : 0);
    c.rig.root.position.copy(c.pos); c.rig.root.rotation.set(0, c.yaw, 0);
    const far = c.pos.distanceToSquared(camera.position) > 70 * 70;
    c.rig.root.visible = !far;
    if (far) return;

    const as = speed <= 2 ? speed * 0.2 : 0.4 + (speed - 2) * 0.15;
    c.an.update(dt, { speed: as, pitch: 0, yawRate: 0 });
    relaxArms(j, clamp(as * 2, 0, 1));
    const walking = speed > 0.1, ph = c.an.phase;
    // --- שינויי תנועה (Animator overrides) ---
    if (has(c, 'limp') && walking) {
      const old = c.quirks.has('limp');
      j.thighL.rotation.x *= old ? 0.6 : 0.3;
      j.shinL.rotation.x = old ? j.shinL.rotation.x * 0.5 : 0.04;
      j.footL.rotation.x = old ? 0 : 0.35;                       // גורר את הרגל
      j.hips.position.y -= Math.max(0, Math.sin(ph)) * (old ? 0.03 : 0.07);
      j.hips.rotation.z += Math.sin(ph) * (old ? 0.05 : 0.12);
      j.spine.rotation.z += Math.sin(ph) * (old ? 0.04 : 0.1);
      if (old) { j.spine.rotation.x += 0.25; j.upperArmL.rotation.x = -0.35; j.foreArmL.rotation.x = -0.4; }
      if (c.imposter) { c.limpSeen = (c.limpSeen || 0) + (inView(c, 26) ? dt : 0); if (c.limpSeen > 2) { witness(c, 'limp', '', false); c.limpSeen = -30; } }
      else if (old && inView(c, 22)) { c.limpSeen = (c.limpSeen || 0) + dt; if (c.limpSeen > 2.5) { witness(c, 'limp', '', false); c.limpSeen = -60; } }
    }
    const freq = c.imposter ? DIFF[st.diff].freq : 0.8;
    if (has(c, 'twitch')) {
      if ((c.tw.twitch -= dt * freq) < 0) { c.tw.twitch = c.quirks.has('twitch') ? rnd(2, 5) : rnd(5, 12); c.tw.twitchT = 0.32; c.tw.side = Math.random() < 0.5 ? 1 : -1; if (!c.quirks.has('twitch') || c.act.kind === 'dance') witness(c, 'twitch'); }
      if (c.tw.twitchT > 0) {
        c.tw.twitchT -= dt; const k = Math.sin((1 - c.tw.twitchT / 0.32) * Math.PI);
        j.neck.rotation.z += 0.75 * k * c.tw.side; j.upperArmR.rotation.z -= 1.1 * k; j.chest.rotation.y += 0.45 * k * c.tw.side; j.foreArmL.rotation.x -= 1.2 * k;
      }
    }
    if (c.imposter && c.tells.has('owl')) {
      if ((c.tw.owl -= dt * freq) < 0) { c.tw.owl = rnd(16, 32); c.tw.owlT = 1.5; witness(c, 'owl'); }
      if (c.tw.owlT > 0) {
        c.tw.owlT -= dt; const e = 1.5 - c.tw.owlT;
        const a = e < 0.3 ? ease(e / 0.3) : e < 1.4 ? 1 : Math.max(0, 1 - (e - 1.4) / 0.06);
        j.neck.rotation.y += Math.PI * a; j.neck.rotation.x = j.neck.rotation.x * (1 - a);
      }
    }
    if (c.state === 'act' && c.act.kind === 'stare') {
      j.neck.rotation.x = -0.8; j.head.rotation.x = -0.45; j.neck.rotation.y = 0;
      if (c.quirks.has('sky')) { j.upperArmR.rotation.x = -2.4; j.foreArmR.rotation.x = -0.1; }
      if (!c.stareSeen || st.t - c.stareSeen > 25) { if (witness(c, 'sky')) c.stareSeen = st.t; }
    }
    if (c.state === 'act' && c.act.kind === 'dance') {
      const t = st.t * 7;
      j.upperArmL.rotation.z = 0.6 + Math.sin(t) * 0.5; j.upperArmR.rotation.z = -0.6 - Math.sin(t + 1) * 0.5;
      j.foreArmL.rotation.x = -1.2; j.foreArmR.rotation.x = -1.2; j.hips.position.y -= Math.abs(Math.sin(t)) * 0.05;
    }
    if (c.state === 'act' && c.act.kind === 'work' && c.role.work === 'stall') { j.upperArmR.rotation.x = -0.6 + Math.sin(st.t * 2 + c.i) * 0.3; j.foreArmR.rotation.x = -0.8; }
    if (c.sit > 0) {
      const s = ease(c.sit);
      for (const side of ['L', 'R']) { j['thigh' + side].rotation.x = THREE.MathUtils.lerp(j['thigh' + side].rotation.x, -1.5, s); j['shin' + side].rotation.x = THREE.MathUtils.lerp(j['shin' + side].rotation.x, 1.5, s); j['foot' + side].rotation.x *= 1 - s; }
      j.hips.position.y = THREE.MathUtils.lerp(j.hips.position.y, 0.5 / c.look.height + 0.08, s);
    }
    // אכילה
    if (c.food) {
      c.bite -= dt;
      if (c.bite < 0) { c.bite = rnd(1.8, 2.8); c.eatT = 0.9; if (FOOD[c.food.id].weird) witness(c, 'eat', c.food.id); }
      const up = c.eatT > 0 ? Math.sin((1 - (c.eatT -= dt) / 0.9) * Math.PI) : 0;
      j.upperArmR.rotation.x = -0.5 - up * 0.9; j.upperArmR.rotation.z = -0.1 - up * 0.25; j.foreArmR.rotation.x = -1.2 - up * 0.9;
      if (c.imposter) j.neck.rotation.x += up * 0.2;
    }
    // לא ממצמץ: קרוב ומסתכל לו בפנים
    if (c.imposter && c.tells.has('noblink') && st.mode === 'play' && nearPlayer(c, 7.5)) {
      _d.subVectors(camera.position, c.pos).setY(0).normalize();
      if (_d.x * Math.sin(c.yaw) + _d.z * Math.cos(c.yaw) > 0.35 && inView(c, 9)) {
        c.stareAt = (c.stareAt || 0) + dt;
        if (c.stareAt > 3) { witness(c, 'noblink', '', false); c.stareAt = -20; }
      }
    }
  }

  // ---------- צללים ----------
  function updateShadow(c, info) {
    const sh = c.shadow;
    if (!c.rig.root.visible || !c.alive) { sh.visible = false; return; }
    sh.visible = true;
    const x = c.pos.x, z = c.pos.z, h = 1.75 * c.look.height;
    const night = info.night;
    let dx, dz, len, op;
    const evil = c.imposter && c.tells.has('shadow') && night > 0.55 && st.mode === 'play';
    if (night < 0.5) {
      dx = -info.sunDir.x; dz = -info.sunDir.z; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
      len = clamp(h / Math.tan(Math.max(0.12, info.elev)), 0.6, 7); op = 0.38 * (1 - night * 2);
    } else {
      let best = null, bd = 17;
      for (const l of T.lamps) { const d = Math.hypot(x - l.x, z - l.z); if (d < bd) { bd = d; best = l; } }
      if (best) { dx = (x - best.x) / (bd || 1); dz = (z - best.z) / (bd || 1); len = clamp(bd * 0.45, 0.9, 6); op = 0.55 * (1 - bd / 18); }
      else { dx = 0.55; dz = 0.6; len = 1.4; op = 0.3; }
      op = Math.max(op, 0.22) * (night - 0.4) * 1.7;
    }
    if (evil) {
      dx = -dx; dz = -dz; len = Math.max(len * 1.6, 3.2); op = Math.max(op, 0.6);
      const wob = Math.sin(st.t * 2.3) * 0.5; const cs = Math.cos(wob), sn = Math.sin(wob);
      [dx, dz] = [dx * cs - dz * sn, dx * sn + dz * cs];
      if (!c.shadowSeen || st.t - c.shadowSeen > 40) { if (inView(c, 24)) { witness(c, 'shadow', '', false); c.shadowSeen = st.t; } }
    }
    sh.setMonster(evil);
    sh.aim(x, z, dx, dz, len, clamp(op, 0, 0.7), evil ? 2.2 : 1);
  }

  // ---------- חיות ----------
  function updateAnimal(a, dt) {
    let speed = 0;
    a.cool -= dt;
    if (a.kind === 'dog') {
      // נובח על המתחזה (או על הדוור, רמז תמים)
      if (a.mode !== 'bark' && a.cool < 0 && st.mode === 'play') {
        const tgt = citizens.find((c) => c.alive && (has(c, 'animals')) && c.pos.distanceTo(a.pos) < (c.imposter ? 12 : 7));
        if (tgt && (tgt.imposter || Math.random() < 0.35)) { a.mode = 'bark'; a.target = tgt; a.until = st.t + rnd(4, 7); a.path = []; }
        else a.cool = 2;
      }
      if (a.mode === 'bark') {
        const t = a.target; _d.subVectors(t.pos, a.pos).setY(0); const d = _d.length();
        a.yaw = turn(a.yaw, Math.atan2(_d.x, _d.z), 6, dt);
        if (d > 3) { a.pos.addScaledVector(_d.divideScalar(d), 3.2 * dt); speed = 1.5; }
        else if (Math.random() < dt * 1.2) { a.bubble.show('🐕 הב!', 1.2, st.t); if (inView(a.target, 30) || inViewPt(a.pos)) witness(t, 'animals', 'dog', false); }
        if (st.t > a.until || !t.alive) { a.mode = 'idle'; a.cool = rnd(8, 14); a.wait = 1; }
        a.update(dt, speed, d > 3 ? 'run' : 'bark');
      }
    } else if (st.mode === 'play' && a.mode !== 'flee') {
      const tgt = citizens.find((c) => c.alive && c.imposter && c.tells.has('animals') && c.pos.distanceTo(a.pos) < 8);
      const scared = tgt || (P.pos.distanceTo(a.pos) < 1.6 && Math.random() < dt * 3);
      if (scared) {
        a.mode = 'flee'; a.until = st.t + 3.5;
        _d.subVectors(a.pos, (tgt ? tgt.pos : P.pos)).setY(0).normalize();
        a.fleeDir = _d.clone(); a.bubble.show(tgt ? '🙀' : '😾', 1.5, st.t);
        if (tgt && (inViewPt(a.pos) || inView(tgt, 30))) witness(tgt, 'animals', 'cat', false);
      }
    }
    if (a.mode === 'flee') {
      a.yaw = turn(a.yaw, Math.atan2(a.fleeDir.x, a.fleeDir.z), 10, dt);
      const nx = a.pos.x + a.fleeDir.x * 5 * dt, nz = a.pos.z + a.fleeDir.z * 5 * dt;
      if (nav.walkable(nx, nz)) { a.pos.x = nx; a.pos.z = nz; } else a.fleeDir.set(-a.fleeDir.z, 0, a.fleeDir.x);
      speed = 2.2;
      if (st.t > a.until) { a.mode = 'idle'; a.wait = rnd(2, 5); }
      a.update(dt, speed, 'run');
    } else if (a.mode === 'idle' || a.mode === 'walk') {
      if (a.mode === 'idle' && (a.wait -= dt) < 0) { a.path = nav.path(a.pos, nav.randomPoint(Math.random, a.home, a.kind === 'cat' ? 3 : 8)); a.mode = 'walk'; }
      if (a.mode === 'walk') {
        const wp = a.path[0];
        if (!wp) { a.mode = 'idle'; a.wait = rnd(2, a.kind === 'cat' ? 10 : 5); }
        else {
          _d.subVectors(wp, a.pos).setY(0); const d = _d.length();
          if (d < 0.25) a.path.shift();
          else { a.yaw = turn(a.yaw, Math.atan2(_d.x, _d.z), 6, dt); const sp = a.kind === 'cat' ? 0.9 : 1.4; a.pos.addScaledVector(_d.divideScalar(d), sp * dt); speed = sp * 0.8; }
        }
      }
      a.update(dt, speed, speed > 0 ? 'walk' : 'idle');
    }
    a.root.rotation.y = a.yaw;
    a.bubble.position.set(a.pos.x, a.kind === 'dog' ? 1.05 : 0.75, a.pos.z);
    if (a.bubble.visible && st.t > a.bubble.userData.until) a.bubble.visible = false;
  }
  function inViewPt(p) {
    if (p.distanceTo(camera.position) > 26) return false;
    _q.copy(p).project(camera);
    return _q.z <= 1 && Math.abs(_q.x) < 0.95 && Math.abs(_q.y) < 0.95 && !Wd.blocked(camera.position, _p.copy(p).setY(p.y + 0.4));
  }

  // הפרדה בין אזרחים + דחיפת השחקן
  function separate() {
    const n = citizens.length;
    for (let a = 0; a < n; a++) {
      const A1 = citizens[a]; if (!A1.alive || A1.sit > 0.5) continue;
      for (let b = a + 1; b < n; b++) {
        const B1 = citizens[b]; if (!B1.alive || B1.sit > 0.5) continue;
        const dx = A1.pos.x - B1.pos.x, dz = A1.pos.z - B1.pos.z, d2 = dx * dx + dz * dz;
        if (d2 < 0.36 && d2 > 1e-6) { const d = Math.sqrt(d2), k = (0.6 - d) / d * 0.5; A1.pos.x += dx * k; A1.pos.z += dz * k; B1.pos.x -= dx * k; B1.pos.z -= dz * k; }
      }
      const dx = P.pos.x - A1.pos.x, dz = P.pos.z - A1.pos.z, d2 = dx * dx + dz * dz;
      if (d2 < 0.42 && d2 > 1e-6 && P.pos.y < 1) { const d = Math.sqrt(d2), k = (0.65 - d) / d; P.pos.x += dx * k; P.pos.z += dz * k; }
    }
  }

  // ---------- שעון ----------
  function clockStr() {
    const left = Math.max(0, 60 * (1 - st.time / st.total));
    const m = Math.floor(left), s = Math.floor((left - m) * 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  // ---------- אפקטים ----------
  const flashGeo = new THREE.PlaneGeometry(0.3, 0.3);
  const flashMat = new THREE.MeshBasicMaterial({ color: '#ffcf6e', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const flashes = Array.from({ length: 6 }, () => { const g = new THREE.Group(); for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(flashGeo, flashMat); m.rotation.set(i ? Math.PI / 2 : 0, i === 2 ? Math.PI / 2 : 0, 0); g.add(m); } g.visible = false; fxg.add(g); return { g, life: 0 }; });
  const tracerGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, -0.5);
  const tracers = Array.from({ length: 20 }, () => { const m = new THREE.Mesh(tracerGeo, new THREE.MeshBasicMaterial({ color: '#ffd88a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); m.visible = false; fxg.add(m); return { m, a: new V3(), dir: new V3(), L: 0, age: 0, life: 0 }; });
  const puffGeo = new THREE.SphereGeometry(1, 6, 4);
  const puffs = Array.from({ length: 16 }, () => { const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color: '#ddd', transparent: true, depthWrite: false })); m.visible = false; fxg.add(m); return { m, age: 0, life: 0, size: 0.1 }; });
  const flashLight = new THREE.PointLight('#ffc060', 0, 6, 2); root.add(flashLight);
  let fi = 0, ti = 0, pi = 0;
  const flash = (at) => { const f = flashes[fi++ % flashes.length]; f.g.position.copy(at); f.g.rotation.set(rnd(0, 3), rnd(0, 3), rnd(0, 3)); f.g.visible = true; f.life = 0.05; flashLight.position.copy(at); flashLight.intensity = 6; };
  const tracer = (a, b, color = '#ffd88a') => { const t = tracers[ti++ % tracers.length]; t.a.copy(a); t.dir.subVectors(b, a); t.L = t.dir.length(); t.dir.divideScalar(t.L || 1); t.age = 0; t.life = t.L / 260 + 0.04; t.m.material.color.set(color); t.m.visible = true; };
  const puff = (at, color = '#ddd', size = 0.08, life = 0.3) => { const p = puffs[pi++ % puffs.length]; p.m.position.copy(at); p.m.material.color.set(color); p.size = size; p.age = 0; p.life = life; p.m.visible = true; };
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
    for (const p of puffs) { if (!p.m.visible) continue; p.age += dt; const k = p.age / p.life; if (k >= 1) { p.m.visible = false; continue; } p.m.scale.setScalar(p.size * (1 + k * 2)); p.m.material.opacity = 0.8 * (1 - k); }
  }

  // ---------- ירי ----------
  const ray = new THREE.Raycaster(), _f = new V3(), _r = new V3(), _u = new V3(), _dd = new V3(), _m = new V3(), _end = new V3(), _aimPt = new V3();
  function getHitList() {
    if (!hitDirty) return hitList;
    hitList = [];
    for (const c of citizens) if (c.alive) hitList.push(...c.hit);
    if (boss?.alive) hitList.push(...boss.hit);
    hitDirty = false; return hitList;
  }
  const spreadNow = () => (SPREAD[LOADOUT[P.w]] + P.bloom + clamp(P.spd / 6.5, 0, 1) * 0.025 + (P.ground ? 0 : 0.04)) * (1 - P.aim * 0.45);
  const muzzleOf = (model, out) => (model.userData.muzzle ? model.localToWorld(out.copy(model.userData.muzzle)) : model.getWorldPosition(out));
  function fire(exact = false) {
    const id = LOADOUT[P.w];
    if (id === 'knife') return melee();
    if (P.reloadT > 0) return;
    if (P.ammo[id] <= 0) { reload(); return; }
    P.ammo[id]--; P.cd = 60 / W(id).rpm; st.shots++;
    an.trigger('shoot');
    camera.getWorldDirection(_f); _r.crossVectors(_f, camera.up).normalize(); _u.crossVectors(_r, _f);
    const sp = exact ? 0 : spreadNow(), a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * sp;
    _dd.copy(_f).addScaledVector(_r, Math.cos(a) * rr).addScaledVector(_u, Math.sin(a) * rr).normalize();
    const near = camera.position.distanceTo(_m.copy(P.pos).setY(P.pos.y + 1.5)) * 0.9;
    const far = Math.min(W(id).range + near, Wd.rayBoxes(camera.position, _dd, W(id).range + near));
    ray.set(camera.position, _dd); ray.near = near; ray.far = far;
    const hit = ray.intersectObjects(getHitList(), false)[0];
    _end.copy(camera.position).addScaledVector(_dd, hit ? hit.distance : far);
    if (hit?.object.userData.ent) { puff(hit.point, '#b3262a', 0.06); struck(hit.object.userData.ent, hit.object.userData.zone, id); }
    else if (far < W(id).range + near - 0.01) puff(_end);
    rig.root.updateMatrixWorld(true);
    muzzleOf(models[id], _m); flash(_m); tracer(_m, _end);
    const kk = KICK[id] * rnd(0.8, 1.2); P.pitch += kk; P.kick += kk; P.yaw += (Math.random() - 0.5) * KICK[id] * 0.6;
    P.bloom = Math.min(0.05, P.bloom + (id === 'rifle' ? 0.006 : 0.012));
    if (P.ammo[id] === 0) reload();
  }
  function melee() {
    P.cd = 60 / W('knife').rpm; an.trigger('slash'); st.shots++;
    const reach = 2.3; camera.getWorldDirection(_dd);
    _m.copy(P.pos); _m.y += 1.4;
    ray.set(camera.position, _dd); ray.near = 0; ray.far = camera.position.distanceTo(_m) + reach;
    const hit = ray.intersectObjects(getHitList(), false).find((h) => h.object.userData.ent && h.point.distanceTo(_m) < reach);
    if (hit) { puff(hit.point, '#b3262a', 0.05); struck(hit.object.userData.ent, hit.object.userData.zone, 'knife'); return; }
    if (boss?.alive && boss.pos.distanceTo(P.pos) < reach + 0.8) struck(boss, 'body', 'knife');
  }
  function reload() { const id = LOADOUT[P.w]; if (id === 'knife' || P.reloadT > 0 || P.ammo[id] >= W(id).mag) return; P.reloadT = RELOAD_T; an.trigger('reload'); }

  /** פגיעה במישהו: אזרח תמים → הפסד; המתחזה → חשיפה; המפלצת → נזק */
  function struck(ent, zone, id) {
    if (ent.kind === 'citizen') {
      if (st.mode !== 'play' && st.mode !== 'boss') return;
      if (ent.imposter && st.mode === 'play') { hud?.hit({ head: zone === 'head', kill: true }); return reveal(); }
      if (!ent.imposter) return wrongTarget(ent);
      return;
    }
    if (ent.kind === 'monster' && ent.alive && st.mode === 'boss') {
      const wd = W(id), head = zone === 'head';
      ent.hp -= wd.dmg * (head ? wd.head : 1); ent.flinch = 0.12;
      hud?.hit({ head, kill: ent.hp <= 0 });
      if (ent.hp <= 0) bossDie();
    }
  }

  // ---------- חשיפה + בוס ----------
  function reveal() {
    st.mode = 'reveal'; st.revealT = 0;
    const c = imp; c.state = 'act'; c.act = { kind: 'idle', until: Infinity, face: Math.atan2(P.pos.x - c.pos.x, P.pos.z - c.pos.z) }; stopEat(c);
    say(c, '👹', 2.5, { bg: '#2a0a0aee' });
    for (const o of citizens) if (o !== c) { o.flee = true; o.hiding = false; o.path = []; stopEat(o); o.state = 'walk'; if (Math.random() < 0.5) say(o, pick(['😱', '🏃', '😨']), 2); }
    hud?.toast('😨 משהו קורה לו…', 1400);
  }
  function spawnBoss() {
    const c = imp, D = DIFF[st.diff];
    const m = buildMonster();
    const b = { kind: 'monster', rig: m, an: m.anim, pos: m.root.position, yaw: c.yaw, hp: D.boss, max: D.boss, alive: true, state: 'intro', t: 0, cd: 1, spitCd: 4, leapCd: 6, flinch: 0, grow: 0, path: [], pathT: 0, speed: D.monsterSpeed, dmg: D.bossDmg };
    b.pos.copy(c.pos); b.hit = monsterHitBoxes(m, b);
    actors.add(m.root); boss = b;
    c.rig.root.visible = false; c.alive = false; c.gone = true; c.shadow.visible = false; c.bubble.visible = false; hitDirty = true;
    flashScreen('#ffffff', 0.9);
    hud?.toast('👹 המתחזה נחשף! תילחם!', 1800);
    st.mode = 'boss';
  }
  const spits = Array.from({ length: 6 }, () => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: '#7dff4a', fog: false }));
    m.visible = false; fxg.add(m); return { m, vel: new V3(), life: 0 };
  });
  let si = 0;
  function bossSpit(b) {
    const s = spits[si++ % spits.length];
    s.m.position.copy(b.pos).setY(b.pos.y + 2.6);
    _d.copy(P.pos).setY(P.pos.y + 1.2).addScaledVector(P.vel, 0.4).sub(s.m.position).normalize();
    s.vel.copy(_d).multiplyScalar(15); s.life = 3; s.m.visible = true;
  }
  function updateSpits(dt) {
    for (const s of spits) {
      if (!s.m.visible) continue;
      s.life -= dt;
      const step = s.vel.length() * dt; _d.copy(s.vel).normalize();
      const t = Wd.rayBoxes(s.m.position, _d, step);
      s.m.position.addScaledVector(_d, Math.min(step, t));
      if (t < step || s.life <= 0 || s.m.position.y < 0) { puff(s.m.position, '#7dff4a', 0.25, 0.5); s.m.visible = false; continue; }
      if (s.m.position.distanceTo(_m.copy(P.pos).setY(P.pos.y + 1)) < 0.85) { hurtPlayer(12 * boss.dmg, s.m.position); puff(s.m.position, '#7dff4a', 0.3, 0.5); s.m.visible = false; }
    }
  }
  function hurtPlayer(n, from) {
    if (P.hp <= 0 || st.mode !== 'boss') return;
    P.hp -= n;
    const ang = Math.atan2(from.x - P.pos.x, from.z - P.pos.z) - P.yaw;
    hud?.hurt(-ang); shake = Math.max(shake, 0.25);
    if (P.hp <= 0) { P.hp = 0; lose('dead'); }
  }
  let shake = 0;
  function updateBoss(dt) {
    const b = boss; if (!b) return;
    const m = b.rig, j = m.j;
    b.t += dt; b.cd -= dt; b.spitCd -= dt; b.leapCd -= dt; b.flinch -= dt;
    b.grow = Math.min(1, b.grow + dt * 1.6);
    m.root.scale.setScalar(1.8 * (0.35 + 0.65 * ease(b.grow)));
    let speed = 0;
    _d.subVectors(P.pos, b.pos).setY(0); const dist = _d.length();
    const face = Math.atan2(_d.x, _d.z);
    const rage = b.hp < b.max * 0.5 ? 1 : 0;
    if (!b.alive) {
      b.deadT += dt; m.root.rotation.x = -ease(Math.min(1, b.deadT / 1.2)) * 1.4;
      m.root.position.y = -Math.max(0, b.deadT - 1.5) * 0.8;
      m.anim.update(dt, { speed: 0 }); m.update(dt, b.t, 0); return;
    }
    if (st.mode !== 'boss' && st.mode !== 'won') { // סצנת סיום: עומד ושואג
      b.yaw = turn(b.yaw, face, 2, dt); m.root.position.copy(b.pos); m.root.rotation.set(0, b.yaw, 0);
      m.anim.update(dt, { speed: 0 }); j.neck.rotation.x = -0.5; j.upperArmL.rotation.z = 1.2; j.upperArmR.rotation.z = -1.2; j.spine.rotation.x += 0.35; m.update(dt, b.t, 1); return;
    }
    if (b.state === 'intro') {
      b.yaw = turn(b.yaw, face, 3, dt); shake = Math.max(shake, 0.15);
      if (b.t > 2.2) { b.state = 'chase'; b.cd = 1; }
    } else if (b.state === 'chase') {
      b.yaw = turn(b.yaw, face, 5, dt);
      const sp = b.speed * (1 + rage * 0.25);
      // ניווט: ישר אם יש קו ראייה, אחרת מסלול
      if (nav.los(b.pos.x, b.pos.z, P.pos.x, P.pos.z) || dist < 3) { b.path = []; if (dist > 2.2) { b.pos.addScaledVector(_d.divideScalar(dist || 1), sp * dt); speed = sp; } }
      else {
        if ((b.pathT -= dt) < 0 || !b.path.length) { b.path = nav.path(b.pos, P.pos); b.pathT = 1; }
        const wp = b.path[0];
        if (wp) { const w = _q.subVectors(wp, b.pos).setY(0); const d = w.length(); if (d < 0.5) b.path.shift(); else { b.yaw = turn(b.yaw, Math.atan2(w.x, w.z), 6, dt); b.pos.addScaledVector(w.divideScalar(d), sp * dt); speed = sp; } }
      }
      if (dist < 2.8 && b.cd <= 0) { b.state = 'swipe'; b.st0 = b.t; b.didHit = false; b.an.trigger('shoot'); }
      else if (dist > 8 && b.spitCd <= 0 && !Wd.blocked(_m.copy(b.pos).setY(2.4), _q.copy(P.pos).setY(P.pos.y + 1.2))) { b.state = 'spit'; b.st0 = b.t; b.didHit = false; }
      else if (dist > 6 && dist < 18 && b.leapCd <= 0) { b.state = 'leap'; b.st0 = b.t; b.from = b.pos.clone(); b.to = nav.nearestFree(P.pos.x, P.pos.z); b.didHit = false; }
    } else if (b.state === 'swipe') {
      b.yaw = turn(b.yaw, face, 6, dt);
      const e = b.t - b.st0;
      if (e > 0.25 && !b.didHit) { b.didHit = true; if (dist < 3.3) hurtPlayer(18 * b.dmg, b.pos); }
      if (e > 0.7) { b.state = 'chase'; b.cd = rage ? 0.8 : 1.3; }
    } else if (b.state === 'spit') {
      b.yaw = turn(b.yaw, face, 6, dt);
      const e = b.t - b.st0;
      if (e > 0.45 && !b.didHit) { b.didHit = true; bossSpit(b); if (rage) setTimeout(() => boss?.alive && st.mode === 'boss' && bossSpit(boss), 250); }
      if (e > 0.8) { b.state = 'chase'; b.spitCd = rnd(3, 5); }
    } else if (b.state === 'leap') {
      const e = (b.t - b.st0) / 1.0;
      b.pos.lerpVectors(b.from, b.to, ease(Math.min(1, e)));
      b.pos.y = Math.sin(Math.min(1, e) * Math.PI) * 4.5;
      b.yaw = turn(b.yaw, Math.atan2(b.to.x - b.from.x, b.to.z - b.from.z), 8, dt);
      if (e >= 1) {
        b.pos.y = 0; shake = Math.max(shake, 0.5); puff(_m.copy(b.pos).setY(0.3), '#9a8a70', 1.2, 0.6);
        if (P.pos.distanceTo(b.pos) < 3.5) hurtPlayer(25 * b.dmg, b.pos);
        b.state = 'chase'; b.leapCd = rnd(7, 11); b.cd = 0.6;
      }
    }
    if (b.state !== 'leap') { Wd.collide(b.pos, 0.7, 3); const lim = A.half - 1.5; b.pos.x = clamp(b.pos.x, -lim, lim); b.pos.z = clamp(b.pos.z, -lim, lim); }
    m.root.position.copy(b.pos); m.root.rotation.set(b.flinch > 0 ? -0.12 : 0, b.yaw, 0);
    const as = speed > 0 ? 0.75 : 0;
    m.anim.update(dt, { speed: as });
    if (b.state === 'intro' || b.state === 'spit') { j.neck.rotation.x = -0.5; j.upperArmL.rotation.z = 1.2; j.upperArmR.rotation.z = -1.2; }
    if (b.state === 'leap') { j.upperArmL.rotation.x = -2.6; j.upperArmR.rotation.x = -2.6; }
    j.spine.rotation.x += 0.35; // כפוף
    m.update(dt, b.t, b.state === 'intro' || b.state === 'spit' ? 1 : rage * 0.4);
  }
  function bossDie() {
    const b = boss; b.alive = false; b.deadT = 0; hitDirty = true;
    st.mode = 'won'; hud?.toast('💥 המפלצת הובסה!', 1800);
    for (const c of citizens) if (!c.gone) { c.flee = false; c.hiding = false; c.path = []; c.state = 'act'; c.act = { kind: 'idle', until: st.t + 8, face: Math.atan2(b.pos.x - c.pos.x, b.pos.z - c.pos.z) }; say(c, pick(['🎉', '👏', '🥳', '❤️']), 4); }
    later(() => win(), 2600);
  }

  // ---------- סיומים ----------
  const later = (fn, ms) => { const id = st.runId; setTimeout(() => { if (R.active && st.runId === id) fn(); }, ms); };
  function flashScreen(color, op = 0.8) {
    if (!flashEl) return;
    flashEl.style.transition = 'none'; flashEl.style.background = color; flashEl.style.opacity = op; void flashEl.offsetWidth;
    flashEl.style.transition = 'opacity .9s'; flashEl.style.opacity = 0;
  }
  const was = (c) => (c.g === 'f' ? 'הייתה' : 'היה');
  function tellList(c) { return [...c.tells].map((t) => `<span>${TELLS[t].icon} ${TELLS[t].text}</span>`).join(''); }
  function wrongTarget(c) {
    st.mode = 'cine'; st.runId++; const id = st.runId;
    c.alive = false; c.fall = 0; hitDirty = true; stopEat(c);
    flashScreen('#ff0000', 0.75);
    ctlOff();
    const doom = document.createElement('div'); doom.className = 's3i-doom';
    doom.innerHTML = `<h1>❌ ירית בחף מפשע!</h1><p>${c.name} (${c.roleHe}) ${c.g === 'f' ? 'הייתה בת אדם רגילה' : 'היה בן אדם רגיל'}…</p>`;
    layer.appendChild(doom);
    for (const o of citizens) if (o !== c && !o.imposter) { o.flee = true; o.hiding = false; o.path = []; stopEat(o); o.state = 'walk'; }
    st.cine = { target: c.pos.clone(), t: 0, a: P.yaw + Math.PI };
    setTimeout(() => {
      if (st.runId !== id || !R.active) return;
      doom.innerHTML = `<h1>😈 המתחזה צוחק</h1><p>${imp.name} (${imp.roleHe}) – זה היה המתחזה.</p>`;
      monsterForm(imp); st.cine = { target: imp.pos.clone(), t: 0, a: Math.atan2(camera.position.x - imp.pos.x, camera.position.z - imp.pos.z) };
    }, 2200);
    setTimeout(() => { if (st.runId === id && R.active) { doom.remove(); lose('wrong', c, true); } }, 5200);
  }
  function monsterForm(c) {
    if (boss) return;
    const m = buildMonster(); m.root.position.copy(c.pos); m.root.rotation.y = c.yaw; actors.add(m.root);
    boss = { kind: 'monster', rig: m, an: m.anim, pos: m.root.position, yaw: c.yaw, hp: 1, max: 1, alive: true, state: 'intro', t: 0, cd: 9, spitCd: 99, leapCd: 99, flinch: 0, grow: 0, path: [], hit: [] };
    c.rig.root.visible = false; c.shadow.visible = false; c.gone = true;
  }
  function timeUp() {
    st.mode = 'cine'; st.runId++; const id = st.runId;
    ctlOff();
    const doom = document.createElement('div'); doom.className = 's3i-doom';
    doom.innerHTML = `<h1>⏰ 00:00</h1><p>המתחזה משתלט על העיר…</p>`; layer.appendChild(doom);
    monsterForm(imp); st.blood = 0;
    for (const o of citizens) if (!o.imposter) { o.flee = true; o.hiding = false; o.path = []; stopEat(o); o.state = 'walk'; say(o, '😱', 3); }
    st.cine = { target: imp.pos.clone(), t: 0, a: 0 };
    setTimeout(() => { if (st.runId === id && R.active) { doom.remove(); lose('time', null, true); } }, 4200);
  }
  function lose(why, victim = null, already = false) {
    if (st.mode === 'over') return;
    if (!already) st.runId++;
    st.mode = 'over'; ctlOff();
    const title = why === 'wrong' ? '❌ ירית באזרח תמים' : why === 'time' ? '👹 המתחזה השתלט על העיר' : '💀 המפלצת ניצחה';
    const sub = why === 'wrong' ? `${victim.name} (${victim.roleHe}) לא ${was(victim)} המתחזה. הפסד מיידי.` : why === 'time' ? 'נגמרה השעה. העיר שלו עכשיו.' : 'נפלת בקרב מול הצורה האמיתית.';
    st.result = { win: false, why, victim: victim?.name || null, imposter: imp?.name };
    const s = setScreen(`<div class="s3i"><div class="s3i-card">
      <h2 style="color:#ff5a4a">${title}</h2>
      <div class="s3i-story">${sub}</div>
      <div class="s3i-story">המתחזה היה: <b>${imp.name}</b> · ${imp.roleHe}</div>
      <div class="s3i-tells">${tellList(imp)}</div>
      <button class="btn" id="ia">🔁 נסה שוב (${DIFF[st.diff].he})</button><button class="btn" id="il">🎚️ שנה רמה</button><button class="btn" id="im">→ חזרה</button>
    </div></div>`);
    s.querySelector('#ia').onclick = () => begin(st.diff);
    s.querySelector('#il').onclick = lobby;
    s.querySelector('#im').onclick = exit;
  }
  function win() {
    st.mode = 'over'; ctlOff();
    const D = DIFF[st.diff];
    const minsLeft = Math.max(0, 60 * (1 - st.time / st.total));
    const coins = D.coins + Math.round(minsLeft * 2) + (P.hp >= 70 ? 20 : 0);
    addCoins(coins, 'imposter');
    st.result = { win: true, coins, imposter: imp.name };
    const s = setScreen(`<div class="s3i"><div class="s3i-card">
      <h2>🏆 הצלת את העיר!</h2>
      <div class="s3i-story">${imp.name} (${imp.roleHe}) ${was(imp)} המתחזה – והמפלצת הובסה.<br>נשארו ⏰ <b>${clockStr()}</b> · רמה: ${D.he}</div>
      <div class="s3i-tells">${tellList(imp)}</div>
      <div style="text-align:center;font-size:22px"><b style="color:#ffd54a">🪙 +${coins}</b></div>
      <button class="btn" id="ia">🔁 משחק חדש</button><button class="btn" id="il">🎚️ שנה רמה</button><button class="btn" id="im">→ חזרה</button>
    </div></div>`);
    s.querySelector('#ia').onclick = () => begin(st.diff);
    s.querySelector('#il').onclick = lobby;
    s.querySelector('#im').onclick = exit;
  }

  // ---------- מחברת ----------
  let bookEl = null, bookFocus = null;
  function openBook(focus = null) {
    if (st.mode !== 'play' && st.mode !== 'boss') return;
    st.book = true; bookFocus = focus;
    if (ctl) { ctl.enabled = false; ctl.fireHeld = false; ctl.aimHeld = false; }
    if (document.pointerLockElement) document.exitPointerLock();
    bookEl = document.createElement('div'); bookEl.className = 's3i-nb'; layer.appendChild(bookEl);
    renderBook();
  }
  function closeBook() {
    st.book = false; bookEl?.remove(); bookEl = null;
    if (ctl && (st.mode === 'play' || st.mode === 'boss')) { ctl.enabled = true; ctl.lock(); }
  }
  function renderBook() {
    if (!bookEl) return;
    const list = [...citizens].filter((c) => !c.gone).sort((a, b) => (b.mark === 1) - (a.mark === 1) || b.clues.length - a.clues.length || a.name.localeCompare(b.name, 'he'));
    const sus = citizens.filter((c) => c.mark === 1).length;
    bookEl.innerHTML = `<div class="s3i-book"><header><h3>📓 מחברת רמזים · ⏰ ${clockStr()} · חשודים: ${sus}</h3><button class="x" id="nbx">✕ סגור</button></header>
      <div class="s3i-list">${list.map((c) => `<div class="s3i-p ${c.mark === 1 ? 'sus' : c.mark === 2 ? 'ok' : ''} ${c === bookFocus ? 'here' : ''}" data-i="${c.i}">
        <div class="top"><span class="sw" style="background:${c.look.jacket || c.look.shirt}"></span><span class="nm">${c.name}<small>${c.roleHe}</small></span>
          <button class="m ${c.mark === 1 ? 'on' : ''}" data-m="1" title="חשוד">🤔</button><button class="m ${c.mark === 2 ? 'on' : ''}" data-m="2" title="נקי">✔️</button></div>
        ${c.clues.length ? `<div class="clues">${c.clues.map((e) => `<span title="${e.at}">${e.icon} ${e.text}${e.n > 1 ? ` ×${e.n}` : ''}</span>`).join('')}</div>` : ''}
        <textarea placeholder="הערות…" data-n="${c.i}">${c.notes.replace(/</g, '&lt;')}</textarea></div>`).join('')}</div></div>`;
    bookEl.querySelector('#nbx').onclick = closeBook;
    bookEl.querySelectorAll('[data-m]').forEach((b) => (b.onclick = () => { const c = citizens[+b.closest('[data-i]').dataset.i]; const m = +b.dataset.m; c.mark = c.mark === m ? 0 : m; renderBook(); }));
    bookEl.querySelectorAll('textarea').forEach((t) => {
      t.oninput = () => { citizens[+t.dataset.n].notes = t.value; };
      t.onkeydown = (e) => e.stopPropagation();
    });
    if (bookFocus) bookEl.querySelector('.here')?.scrollIntoView({ block: 'center' });
  }

  // ---------- זרימה ----------
  function ctlOff() {
    if (st.book) { st.book = false; bookEl?.remove(); bookEl = null; }
    if (ctl) { ctl.enabled = false; ctl.fireHeld = false; }
    if (document.pointerLockElement) document.exitPointerLock();
  }
  function disposeRun() {
    ctl?.dispose(); ctl = null; hud?.dispose(); hud = null; layer.innerHTML = ''; tgtEl = null; flashEl = null; bookEl = null; st.book = false;
    for (const s of spits) s.m.visible = false;
  }
  function resetPlayer() {
    P.pos.copy(nav.nearestFree(3, -11)); P.vel.set(0, 0, 0); P.vy = 0; P.yaw = P.yawPrev = 0; P.pitch = -0.05; P.hp = 100; P.st = 'ground';
    P.ammo.pistol = W('pistol').mag; P.ammo.rifle = W('rifle').mag; P.reloadT = 0; P.bloom = 0; P.kick = 0; P.jc = 0; P.inJc = 0;
    P.w = -1; equip(0);
  }
  function lobby() {
    st.runId++; st.mode = 'lobby'; disposeRun();
    st.time = st.total * 0.15; st.t = 0;
    makeCitizens(st.diff, false); resetPlayer();
    citizens.forEach((c) => chooseNext(c));
    const s = setScreen(`<div class="s3i"><div class="s3i-card">
      <h2>👹 המתחזה</h2>
      <div class="s3i-story">מפלצת התחפשה לאחד מ־${CITIZENS} האנשים בעיר. יש לך <b>שעה</b> (בערך 12 דקות) לגלות מי זה – לפני שהיא משתלטת.<br>
        צפה, רשום במחברת, ויְרה רק כשאתה בטוח. <b style="color:#ff6b5a">יריה במישהו אחר = הפסד מיידי.</b></div>
      <div class="s3i-tells">${TELL_IDS.map((t) => `<span>${TELLS[t].icon} ${TELLS[t].text}</span>`).join('')}</div>
      <button class="btn" data-d="easy">🟢 קל <small>6 רמזים, המחברת מספרת לך</small></button>
      <button class="btn" data-d="medium">🟠 בינוני <small>4 רמזים, יש הסחות</small></button>
      <button class="btn" data-d="hard">🔴 קשה <small>3 רמזים, הרבה הסחות</small></button>
      <div class="s3i-help">${touch ? 'ג׳ויסטיק = תנועה · גרירה = מבט · 📓 = מחברת · ירי רק כשבטוחים'
        : 'WASD תנועה · עכבר מבט · קליק ימני = זום · N = מחברת · E = סמן חשוד · 1/2/3 נשק · Esc הפסקה'}</div>
      <button class="btn" id="iback">→ חזרה לתפריט</button></div></div>`);
    s.querySelectorAll('[data-d]').forEach((b) => (b.onclick = () => begin(b.dataset.d)));
    s.querySelector('#iback').onclick = exit;
  }
  function begin(diff) {
    st.runId++; disposeRun(); setScreen(null);
    st.diff = diff; st.mode = 'play'; st.time = 0; st.t = 0; st.shots = 0; st.paused = false; st.result = null; st.cine = null; st.blood = 0;
    makeCitizens(diff, true); resetPlayer();
    citizens.forEach((c) => { c.act.until = st.t + rnd(0, 3); });
    hud = createHud(layer);
    ctl = createControls({ ui: layer, canvas: renderer?.domElement || document.querySelector('canvas') });
    const pb = document.createElement('button'); pb.className = 'chip s3i-hudbtn'; pb.style.left = '10px'; pb.textContent = 'II'; pb.onclick = () => pause(true); layer.appendChild(pb);
    const nb = document.createElement('button'); nb.className = 'chip s3i-hudbtn s3i-nbbtn'; nb.textContent = '📓 מחברת'; nb.onclick = () => (st.book ? closeBook() : openBook(target)); layer.appendChild(nb);
    tgtEl = document.createElement('div'); tgtEl.className = 's3i-target'; layer.appendChild(tgtEl);
    flashEl = document.createElement('div'); flashEl.className = 's3i-flash'; layer.appendChild(flashEl);
    ctl.lock();
    hud.toast(`👹 מישהו כאן לא אנושי… רמה: ${DIFF[diff].he}`, 2600);
  }
  function pause(on) {
    if (st.mode !== 'play' && st.mode !== 'boss') return;
    if (st.book) closeBook();
    st.paused = on;
    if (!on) { setScreen(null); ctl.enabled = true; ctl.lock(); return; }
    ctl.enabled = false; ctl.fireHeld = false;
    if (document.pointerLockElement) document.exitPointerLock();
    const s = setScreen(`<div class="s3i"><div class="s3i-card"><h2>⏸ הפסקה</h2><div class="s3i-story">⏰ ${clockStr()} נותרו</div>
      <button class="btn" id="pr">▶️ המשך</button><button class="btn" id="pa">🔁 משחק חדש</button><button class="btn" id="pl">🎚️ לובי</button></div></div>`);
    s.querySelector('#pr').onclick = () => pause(false);
    s.querySelector('#pa').onclick = () => begin(st.diff);
    s.querySelector('#pl').onclick = lobby;
  }
  function exit() {
    st.runId++; disposeRun(); setScreen(null); clearActors(); removeEventListener('keydown', onKey);
    scene.remove(root); style.remove(); layer.remove(); screen.remove();
    saved.lights.forEach((l) => (l.visible = true));
    scene.background = saved.bg; scene.fog = saved.fog;
    camera.fov = saved.fov; camera.near = saved.near; camera.far = saved.far; camera.updateProjectionMatrix();
    if (renderer && saved.pr) renderer.setPixelRatio(saved.pr);
    R.active = false; back();
  }

  // ---------- שחקן ----------
  let target = null;
  const _cam = new V3(), _piv = new V3(), _dir = new V3();
  const inp = { mx: 0, my: 0, sp: false, jc: 0, aim: 0, fire: false, yaw: 0, pitch: 0 };
  function updatePlayer(dt) {
    const id = LOADOUT[P.w];
    const live = ctl && ctl.enabled && !st.paused && (st.mode === 'play' || st.mode === 'boss' || st.mode === 'reveal' || st.mode === 'won');
    if (live) {
      const l = ctl.lookDelta(); const sens = 1 - P.aim * 0.5;
      P.yaw -= l.x * sens; P.pitch = clamp(P.pitch + l.y * sens, -1.2, 1.2);
      if (ctl.take('slot1')) equip(0); if (ctl.take('slot2')) equip(1); if (ctl.take('slot3')) equip(2);
      if (ctl.take('switch')) equip((P.w + 1) % LOADOUT.length);
      if (ctl.take('reload')) reload();
      if (ctl.take('jump')) P.inJc++;
      if (ctl.take('pause')) pause(true);
      P.cd -= dt;
      const pressed = ctl.take('fire');
      if (P.cd <= 0 && (pressed || (ctl.fireHeld && (id === 'rifle' || id === 'knife')))) fire();
      P.aim += ((ctl.aimHeld ? 1 : 0) - P.aim) * (1 - Math.exp(-12 * dt));
    } else ctl?.lookDelta();
    if (P.reloadT > 0) { P.reloadT -= dt; if (P.reloadT <= 0) { P.reloadT = 0; P.ammo[id] = W(id).mag; } }
    P.bloom = Math.max(0, P.bloom - dt * 0.06);
    const mv = live ? ctl.move : { x: 0, y: 0 };
    inp.mx = mv.x; inp.my = mv.y; inp.sp = live && ctl.sprint; inp.jc = P.inJc || 0; inp.aim = P.aim; inp.fire = live && ctl.fireHeld; inp.yaw = P.yaw; inp.pitch = P.pitch;
    if (st.mode !== 'cine' && st.mode !== 'over' && st.mode !== 'lobby') stepMove(P, inp, dt, Wd);
    if (P.kick > 0) { const rc = Math.min(P.kick, P.kick * 7 * dt + 0.0004); P.pitch -= rc; P.kick -= rc; }
    rig.root.position.copy(P.pos); rig.root.rotation.set(0, P.yaw, 0);
    const yawRate = (P.yaw - P.yawPrev) / Math.max(dt, 1e-3); P.yawPrev = P.yaw;
    const s = P.spd <= 4.2 ? (P.spd / 4.2) * 0.5 : 0.5 + clamp((P.spd - 4.2) / 2.3, 0, 1) * 0.5;
    if (st.mode === 'cine' || st.mode === 'over' || st.mode === 'lobby') { an.update(dt, { speed: 0 }); return; }
    // מצלמה מעל הכתף
    const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw), cp = Math.cos(P.pitch);
    _dir.set(fx * cp, Math.sin(P.pitch), fz * cp);
    const side = 1.05 - P.aim * 0.35, dist = 3.0 - P.aim * 1.2;
    _piv.set(P.pos.x - fz * side, P.pos.y + 1.85, P.pos.z + fx * side);
    _cam.copy(_dir).negate();
    let t = Wd.rayBoxes(_piv, _cam, dist + 0.25); t = Math.max(0.3, Math.min(dist, t - 0.25));
    camera.position.copy(_piv).addScaledVector(_cam, t);
    if (shake > 0) { camera.position.x += (Math.random() - 0.5) * shake * 0.4; camera.position.y += (Math.random() - 0.5) * shake * 0.4; shake = Math.max(0, shake - dt); }
    camera.lookAt(_cam.copy(camera.position).add(_dir));
    _aimPt.copy(camera.position).addScaledVector(_dir, 60);
    an.update(dt, { speed: s, pitch: P.pitch, yawRate, aiming: P.aim > 0.5, aimPoint: _aimPt });
    const fov = 70 - P.aim * 30;
    if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = fov; camera.updateProjectionMatrix(); }
    if (hud) {
      hud.setAmmo(id === 'knife' ? 0 : P.ammo[id], id === 'knife' ? 0 : W(id).mag, P.reloadT > 0);
      hud.setHp(P.hp); hud.setWeapons(LOADOUT.map((x) => W(x)), P.w); hud.setReticle(id);
      const focal = innerHeight / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      hud.spread(id === 'knife' ? 0 : spreadNow() * focal);
    }
  }
  // מי במרכז הכוונת
  function updateTarget() {
    target = null;
    if (st.mode !== 'play') { if (tgtEl) tgtEl.style.display = 'none'; return; }
    camera.getWorldDirection(_dd);
    const far = Wd.rayBoxes(camera.position, _dd, 45);
    ray.set(camera.position, _dd); ray.near = 0.5; ray.far = far;
    const h = ray.intersectObjects(getHitList(), false)[0];
    target = h?.object.userData.ent?.kind === 'citizen' ? h.object.userData.ent : null;
    if (tgtEl) {
      if (target) { tgtEl.style.display = 'block'; tgtEl.innerHTML = `👤 ${target.name} · ${target.roleHe}${target.mark === 1 ? ' · 🤔 חשוד' : target.mark === 2 ? ' · ✔️ נקי' : ''}${touch ? '' : ' <small style="color:#8b95a7">[E] חשוד · [N] מחברת</small>'}`; }
      else tgtEl.style.display = 'none';
    }
  }
  const onKey = (e) => {
    if (!R.active || e.repeat) return;
    if (e.target?.tagName === 'TEXTAREA' || e.target?.tagName === 'INPUT') return;
    if (e.code === 'KeyN' || e.code === 'Tab') { e.preventDefault(); st.book ? closeBook() : openBook(target); }
    if (e.code === 'KeyE' && target && st.mode === 'play' && !st.book) { target.mark = target.mark === 1 ? 0 : 1; hud?.toast(target.mark ? `🤔 ${target.name} סומן כחשוד` : `${target.name} – הסימון הוסר`, 1000); }
    if (e.code === 'Escape' && st.book) { e.stopImmediatePropagation(); closeBook(); } // לא לפתוח גם הפסקה
  };
  addEventListener('keydown', onKey);

  // ---------- לולאה ----------
  const R = {
    active: true, st, P, get citizens() { return citizens; }, get imposter() { return imp; }, get boss() { return boss; }, get dogs() { return dogs; }, get cats() { return cats; },
    get hud() { return hud; }, get ctl() { return ctl; }, town: T,
    begin, lobby, exit, openBook, closeBook, reveal, clockStr,
    aimAt(p) { _dd.subVectors(p, camera.position); P.yaw = Math.atan2(_dd.x, _dd.z); P.pitch = Math.atan2(_dd.y, Math.hypot(_dd.x, _dd.z)); },
    fire(exact = true) { P.cd = 0; fire(exact); },
    /** בדיקה: מצב השחקן מול אזרח ויורה בו */
    shoot(c) {
      c.state = 'act'; c.act = { kind: 'idle', until: st.t + 5, face: null }; c.path = [];
      const tgt = new V3(c.pos.x, 1.0 * c.look.height, c.pos.z);
      for (let k = 0; k < 40; k++) { // מחפשים עמדה שממנה הקרן מהמצלמה פוגעת קודם כל ב-c
        const a = c.yaw + k * 0.79, r = 3.5 + (k % 4);
        const x = c.pos.x + Math.sin(a) * r, z = c.pos.z + Math.cos(a) * r;
        if (!nav.walkable(x, z)) continue;
        P.pos.set(x, 0, z); P.vel.set(0, 0, 0);
        for (let i = 0; i < 14; i++) { R.aimAt(tgt); updatePlayer(0.016); }
        camera.updateMatrixWorld(); actors.updateMatrixWorld(true);
        camera.getWorldDirection(_dd);
        ray.set(camera.position, _dd); ray.near = 0.5; ray.far = Wd.rayBoxes(camera.position, _dd, 40);
        const h = ray.intersectObjects(getHitList(), false)[0];
        if (h?.object.userData.ent === c) { P.cd = 0; fire(true); return true; }
      }
      return false;
    },
    setTime(sec) { st.time = sec; },
    update(dt) {
      if (!R.active) return;
      dt = Math.min(dt, 0.05);
      if (st.paused) return;
      st.t += dt; pathBudget = 4;
      if (st.mode === 'play') {
        st.time += dt;
        if (st.time >= st.total) { st.time = st.total; timeUp(); }
      }
      const info = T.setDaylight(st.mode === 'lobby' ? 0.15 : phase(), st.blood || 0);
      st.night = info.night;
      if (st.mode === 'cine' && imp?.gone) st.blood = Math.min(1, (st.blood || 0) + dt * 0.5);
      updatePlayer(dt);
      for (const c of citizens) if (!c.gone) updateCitizen(c, dt);
      separate();
      for (const c of citizens) {
        if (c.gone) continue;
        if (c.alive && c.sit < 0.5) Wd.collide(c.pos, 0.28);
        updateShadow(c, info);
        const hy = (1.95 + (c.look.hat ? 0.12 : 0)) * c.look.height;
        c.bubble.position.set(c.pos.x, c.pos.y + hy + 0.25, c.pos.z);
        if (c.bubble.visible && st.t > c.bubble.userData.until) c.bubble.visible = false;
        c.markS.visible = c.mark === 1 && c.alive && st.mode === 'play' && !c.bubble.visible;
        if (c.markS.visible) { if (c.markS.userData.k !== 1) { c.markS.show('🤔', 1e9, 0, { bg: '#c0392bdd', fg: '#fff' }); c.markS.userData.k = 1; } c.markS.position.set(c.pos.x, c.pos.y + hy + 0.2, c.pos.z); }
      }
      for (const a of [...dogs, ...cats]) updateAnimal(a, dt);
      if (boss) updateBoss(dt);
      updateSpits(dt);
      updateFx(dt);
      if (st.mode === 'reveal') {
        st.revealT += dt;
        const c = imp, k = Math.min(1, st.revealT / 1.4);
        c.rig.root.position.x += (Math.random() - 0.5) * 0.12 * k; c.rig.root.position.z += (Math.random() - 0.5) * 0.12 * k;
        c.rig.root.scale.setScalar(c.look.height * (1 + k * 0.25)); c.rig.j.neck.rotation.y = Math.sin(st.t * 40) * k * 0.6;
        if (st.revealT > 1.5) spawnBoss();
      }
      updateTarget();
      // מצלמה קולנועית
      if ((st.mode === 'cine' || st.mode === 'over' || st.mode === 'won') && st.cine) {
        st.cine.t += dt; st.cine.a += dt * 0.25;
        const tg = boss && imp?.gone ? boss.pos : st.cine.target, r = boss && imp?.gone ? 8.5 : 4.5;
        camera.position.set(tg.x + Math.sin(st.cine.a) * r, (boss && imp?.gone ? 3.6 : 2.2), tg.z + Math.cos(st.cine.a) * r);
        camera.lookAt(tg.x, boss && imp?.gone ? 2.4 : 0.8, tg.z);
        if (camera.fov !== 60) { camera.fov = 60; camera.updateProjectionMatrix(); }
      }
      if (st.mode === 'lobby') {
        st.lobbyT += dt; const a = st.lobbyT * 0.06;
        camera.position.set(Math.sin(a) * 12, 5.5, Math.cos(a) * 12); camera.lookAt(0, 1.2, 0);
      }
      // HUD עליון
      if (hud) {
        const icon = st.night > 0.6 ? '🌙' : phase() > 0.3 ? '🌆' : '☀️';
        if (st.mode === 'play' || st.mode === 'reveal') {
          const left = 60 * (1 - st.time / st.total);
          hud.setTop(`<b style="font-size:20px;${left < 10 ? 'color:#ff5a3b' : ''}">⏰ ${clockStr()}</b> ${icon} · מצא את המתחזה`);
        } else if (st.mode === 'boss' && boss) {
          hud.setTop(`👹 ${imp.name} – הצורה האמיתית<div class="s3i-boss"><i style="width:${(100 * Math.max(0, boss.hp) / boss.max).toFixed(1)}%"></i></div>`);
        } else if (st.mode === 'won') hud.setTop('🏆 ניצחון!');
        else hud.setTop('');
      }
    },
  };
  lobby();
  return R;
}

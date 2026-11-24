// ערכת עלילות משותפת (בלש + שוד + מצב לבד): במה (רקע/ערפל/תאורה ושחזור), עולם של תיבות עם התנגשות וקו ראייה,
// שחקן בגוף שלישי (buildCharacter + Animator) עם מצלמה מעל הכתף, נקודות פעולה ("E / 🖐"), חלונות דיאלוג, HUD קל,
// והתקדמות עלילות ב-localStorage.
//
// API עיקרי:
//   const S = createSession({ scene, camera, ui, renderer, back, sky, fog:[color,near,far], dim, skin, exposure })
//   S.root / S.world (תיבות) / S.P (שחקן: pos,yaw,pitch,...) / S.ctl / S.hud
//   S.spot({ pos, r, label, use, on }) – נקודת פעולה. S.modal(html) / S.close(). S.toast / S.top / S.objective
//   S.start() – יוצר שליטה ונועל עכבר. S.update(dt) – תנועה, מצלמה, נקודות. S.exit() – ניקוי ושחזור + back().
//   getStory(id) / saveStory(id, patch) – התקדמות: localStorage['s3d.story.v1'] = { [id]: { done, best, pct, endings:[], at } }
import * as THREE from 'three';
import { buildCharacter } from '../models/character.js';
import { createControls, isTouch } from '../core/controls.js';

export const V3 = THREE.Vector3;
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const rnd = (a, b) => a + Math.random() * (b - a);
export const ease = (t) => t * t * (3 - 2 * t);
export const angDiff = (a, b) => ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
const GRAV = 16, JUMP = 5.6, WALK = 3.4, RUN = 6.2, PR = 0.33;

// ---------- התקדמות ----------
const STORY_KEY = 's3d.story.v1';
const loadAll = () => { try { return JSON.parse(localStorage.getItem(STORY_KEY)) || {}; } catch (_) { return {}; } };
export const getStory = (id) => loadAll()[id] || null;
export function saveStory(id, patch) {
  const all = loadAll(); const cur = all[id] || {};
  const next = { ...cur, ...patch, at: Date.now() };
  if (patch.best != null) next.best = Math.max(cur.best || 0, patch.best);
  if (patch.pct != null) next.pct = Math.max(cur.pct || 0, patch.pct);
  if (patch.done) next.done = true; else if (cur.done) next.done = true;
  if (patch.endings) next.endings = [...new Set([...(cur.endings || []), ...patch.endings])];
  all[id] = next;
  try { localStorage.setItem(STORY_KEY, JSON.stringify(all)); } catch (_) {}
  return next;
}

// ---------- גאומטריה ----------
export function segBox(o, d, maxT, b) {
  let t0 = 0, t1 = maxT;
  for (const k of ['x', 'y', 'z']) {
    if (Math.abs(d[k]) < 1e-9) { if (o[k] < b.min[k] || o[k] > b.max[k]) return Infinity; continue; }
    let a = (b.min[k] - o[k]) / d[k], c = (b.max[k] - o[k]) / d[k];
    if (a > c) { const s = a; a = c; c = s; }
    if (a > t0) t0 = a; if (c < t1) t1 = c; if (t0 > t1) return Infinity;
  }
  return t0;
}
/** UV לפי מטרים בכל פאה של BoxGeometry (טקסטורה חוזרת בלי מתיחה) */
export function boxUV(g, w, h, d, unit = 1) {
  const uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, uv.getX(k) * dims[f][0] / unit, uv.getY(k) * dims[f][1] / unit); }
  return g;
}
export function canvasTex(w, h, draw, rep = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep);
  t.anisotropy = 4; return t;
}

/** עולם של תיבות: add() מוסיף רשת + תיבת התנגשות. collide/groundAt/blocked/ray */
export function boxWorld(group) {
  const boxes = [], geos = [];
  const W = {
    boxes, group,
    add(x, z, w, h, d, mat, y0 = 0, { collide = true, sight = true, uv = 0 } = {}) {
      const g = new THREE.BoxGeometry(w, h, d); if (uv) boxUV(g, w, h, d, uv); geos.push(g);
      const m = new THREE.Mesh(g, mat); m.position.set(x, y0 + h / 2, z); group.add(m);
      if (collide) boxes.push({ min: new V3(x - w / 2, y0, z - d / 2), max: new V3(x + w / 2, y0 + h, z + d / 2), sight, mesh: m });
      return m;
    },
    solid(x, z, w, h, d, y0 = 0, sight = true) { const b = { min: new V3(x - w / 2, y0, z - d / 2), max: new V3(x + w / 2, y0 + h, z + d / 2), sight }; boxes.push(b); return b; },
    remove(mesh) { const i = boxes.findIndex((b) => b.mesh === mesh); if (i >= 0) boxes.splice(i, 1); if (mesh) mesh.visible = false; },
    collide(pos, r, h = 1.75) {
      for (const b of boxes) {
        if (b.off || pos.y >= b.max.y - 0.05 || pos.y + h <= b.min.y) continue;
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
    },
    groundAt(pos, r) {
      let g = 0;
      for (const b of boxes) if (!b.off && pos.x > b.min.x - r * 0.5 && pos.x < b.max.x + r * 0.5 && pos.z > b.min.z - r * 0.5 && pos.z < b.max.z + r * 0.5 && pos.y >= b.max.y - 0.3) g = Math.max(g, b.max.y);
      return g;
    },
    blocked(a, b) {
      _sd.subVectors(b, a); const L = _sd.length(); if (L < 1e-6) return false; _sd.divideScalar(L);
      for (const bx of boxes) if (!bx.off && bx.sight && segBox(a, _sd, L, bx) < L) return true;
      return false;
    },
    ray(o, d, maxT) { let t = maxT; for (const b of boxes) if (!b.off && b.sight) t = Math.min(t, segBox(o, d, t, b)); return t; },
    dispose() { geos.forEach((g) => g.dispose()); },
  };
  return W;
}
const _sd = new V3();

/** דמות NPC: outfit = אובייקט צבעים חלקי (מפתחות BASE ב-character.js) */
export function makeNpc(parent, outfit, x, z, yaw = 0) {
  const rig = buildCharacter({ skin: outfit });
  rig.root.position.set(x, 0, z); rig.root.rotation.y = yaw; parent.add(rig.root);
  const n = { rig, pos: rig.root.position, yaw, speed: 0, yawPrev: yaw, t: Math.random() * 10 };
  n.update = (dt, speed = 0, pitch = 0) => {
    rig.root.rotation.y = n.yaw;
    const yr = (n.yaw - n.yawPrev) / Math.max(dt, 1e-3); n.yawPrev = n.yaw;
    rig.anim.update(dt, { speed, pitch, yawRate: yr });
  };
  n.face = (p, dt = 1, k = 8) => { const want = Math.atan2(p.x - n.pos.x, p.z - n.pos.z); n.yaw += angDiff(n.yaw, want) * (1 - Math.exp(-k * dt)); };
  return n;
}

// ---------- CSS ----------
const CSS = `
.sk { position:absolute; inset:0; pointer-events:none; font-family:Rubik,sans-serif; color:#eef2f8; }
.sk * { box-sizing:border-box; }
.sk-ctl { position:absolute; inset:0; }
.sk-hud { position:absolute; inset:0; pointer-events:none; }
.sk-top { position:absolute; top:max(10px, env(safe-area-inset-top)); left:50%; transform:translateX(-50%); max-width:calc(100% - 140px);
  background:#0b0d12bb; border:1px solid #2a3142; border-radius:12px; padding:7px 12px; font-size:14px; text-align:center; line-height:1.4; }
.sk-btns { position:absolute; top:max(10px, env(safe-area-inset-top)); left:10px; display:flex; flex-direction:column; gap:6px; }
.sk-btns .chip, .sk-tbtn { pointer-events:auto; }
.sk-chip { padding:7px 11px; border-radius:999px; border:1px solid #2a3142; background:#151922dd; color:#eef2f8; font:700 14px Rubik; cursor:pointer; }
.sk-chip.on { border-color:#ffb020; color:#ffb020; }
.sk-prompt { position:absolute; left:50%; bottom:max(28%, 150px); transform:translateX(-50%); background:#0b0d12cc; border:1px solid #ffb02088;
  border-radius:12px; padding:8px 14px; font-weight:700; font-size:15px; white-space:nowrap; display:none; }
.sk-prompt kbd { background:#ffb020; color:#111; border-radius:6px; padding:1px 7px; margin-inline-end:6px; font:900 13px Rubik; }
.sk-toast { position:absolute; left:50%; top:22%; transform:translateX(-50%); background:#151922ee; border:1px solid #2a3142; border-radius:12px;
  padding:9px 16px; font-weight:700; opacity:0; transition:opacity .25s; text-align:center; max-width:90%; }
.sk-modal { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; padding:14px; pointer-events:auto;
  background:linear-gradient(180deg,#05070bcc,#05070bee); overflow:auto; }
.sk-card { width:min(560px,100%); max-height:100%; overflow:auto; background:#151922f2; border:1px solid #2a3142; border-radius:18px; padding:16px;
  display:flex; flex-direction:column; gap:10px; }
.sk-card h2 { margin:0; font-size:24px; font-weight:900; text-align:center; }
.sk-card h3 { margin:4px 0 0; font-size:16px; color:#ffb020; }
.sk-card p { margin:0; line-height:1.6; font-size:15px; }
.sk-card .btn { width:100%; font-size:16px; }
.sk-row { display:flex; gap:8px; flex-wrap:wrap; justify-content:center; }
.sk-muted { color:#8b95a7; font-size:13px; line-height:1.5; }
.sk-say { background:#0b0d12; border-radius:12px; padding:10px 12px; line-height:1.6; font-size:15px; border-inline-start:4px solid #ffb020; }
.sk-who { display:flex; align-items:center; gap:10px; }
.sk-who .f { font-size:40px; width:56px; height:56px; display:flex; align-items:center; justify-content:center; background:#0b0d12; border-radius:14px; flex:none; }
.sk-who b { font-size:18px; } .sk-who small { display:block; color:#8b95a7; font-weight:400; }
.sk-opt { text-align:start; padding:10px 12px; border-radius:12px; border:1px solid #2a3142; background:#1b2030; color:#eef2f8; font:600 15px Rubik; cursor:pointer; }
.sk-opt:hover, .sk-opt.on { border-color:#ffb020; } .sk-opt.done { opacity:.55; }
.sk-opt.on { background:#2a2410; }
.sk-meter { position:absolute; top:max(54px, calc(env(safe-area-inset-top) + 44px)); left:50%; transform:translateX(-50%); width:160px; height:10px;
  background:#0b0d12bb; border:1px solid #2a3142; border-radius:6px; overflow:hidden; display:none; }
.sk-meter i { display:block; height:100%; width:0; background:linear-gradient(90deg,#ffd54a,#ff4a3b); }
.sk-act { position:absolute; inset-inline-start:calc(22px + env(safe-area-inset-right)); bottom:118px; width:92px; height:92px; border-radius:50%;
  border:2px solid #ffb020; background:#151922cc; color:#fff; font:800 13px Rubik; display:none; flex-direction:column; align-items:center; justify-content:center; pointer-events:auto; touch-action:none; }
.sk-act span { font-size:26px; line-height:1; }
@media (max-width:520px) { .sk-top { font-size:12px; max-width:calc(100% - 110px); } .sk-meter { top:max(76px, calc(env(safe-area-inset-top) + 66px)); } .sk-card { padding:12px; } .sk-card h2 { font-size:20px; } }
`;

/**
 * מפגש משחק (מצב עלילה). opts: sky, fog [color, near, far], dim (עוצמת האורות של main), skin, exposure, start {x,z,yaw}
 */
export function createSession({ scene, camera, ui, renderer, back, sky = '#0b0d12', fog = null, dim = 1, skin = 'default', exposure = null, start = { x: 0, z: 0, yaw: 0 } }) {
  const touch = isTouch();
  const saved = { bg: scene.background, fog: scene.fog, env: scene.environment, fov: camera.fov, near: camera.near, far: camera.far,
    pr: renderer?.getPixelRatio(), exp: renderer?.toneMappingExposure, lights: [] };
  scene.background = new THREE.Color(sky);
  scene.fog = fog ? new THREE.Fog(fog[0], fog[1], fog[2]) : null;
  scene.environment = null;
  for (const o of scene.children) if (o.isLight) { saved.lights.push([o, o.intensity]); o.intensity *= dim; }
  camera.fov = 66; camera.near = 0.05; camera.far = 260; camera.updateProjectionMatrix();
  if (renderer && touch) renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  if (renderer && exposure != null) renderer.toneMappingExposure = exposure;
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);

  const root = new THREE.Group(); root.name = 'story'; scene.add(root);
  const worldG = new THREE.Group(); root.add(worldG);
  const world = boxWorld(worldG);

  // ---------- שחקן ----------
  const rig = buildCharacter({ skin }); root.add(rig.root);
  const P = { pos: new V3(start.x, 0, start.z), vel: new V3(), vy: 0, ground: true, yaw: start.yaw, pitch: -0.12, yawPrev: start.yaw, speed: 0, run: false, frozen: false, maxSpeed: 1 };

  // ---------- UI ----------
  ui.innerHTML = '';
  const el = document.createElement('div'); el.className = 'sk'; ui.appendChild(el);
  el.innerHTML = `<div class="sk-ctl"></div><div class="sk-hud"><div class="sk-top" style="display:none"></div><div class="sk-btns"></div>
    <div class="sk-meter"><i></i></div><div class="sk-prompt"></div><div class="sk-toast"></div><div class="sk-act"><span>🖐</span>פעולה</div></div>`;
  const $ = (s) => el.querySelector(s);
  const ctlLayer = $('.sk-ctl'), hudEl = $('.sk-hud'), topEl = $('.sk-top'), btnsEl = $('.sk-btns'), promptEl = $('.sk-prompt'), toastEl = $('.sk-toast'), actEl = $('.sk-act');
  const meterEl = $('.sk-meter'), meterI = $('.sk-meter i');
  let modalEl = null, toastT = 0, ctl = null;
  const keys = new Set(), off = [];
  const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); off.push(() => t.removeEventListener(ev, fn, o)); };
  const press = (name) => { if (!S.busy) keys.add(name); };
  on(window, 'keydown', (e) => {
    if (e.repeat) return;
    const k = { KeyE: 'act', Enter: 'act', KeyF: 'tool', KeyB: 'board', Tab: 'board', KeyM: 'board' }[e.code];
    if (k) { press(k); if (e.code === 'Tab') e.preventDefault(); }
  });
  // נעילת עכבר שמגיעה באיחור, אחרי שכבר נפתח חלון חדש: משחררים אותה כדי שאפשר יהיה ללחוץ על הכפתורים
  on(document, 'pointerlockchange', () => { if (document.pointerLockElement && S.busy) document.exitPointerLock?.(); });
  on(actEl, 'touchstart', (e) => { e.preventDefault(); press('act'); }, { passive: false });
  on(actEl, 'mousedown', (e) => { e.preventDefault(); press('act'); });
  const take = (k) => { if (keys.has(k)) { keys.delete(k); return true; } return false; };

  const spots = [];
  let near = null;

  const S = {
    root, world, worldG, P, rig, touch, el, hud: hudEl, busy: false, paused: false, active: true, t: 0, spots,
    get ctl() { return ctl; },
    take,
    press,
    top(html) { topEl.innerHTML = html || ''; topEl.style.display = html ? '' : 'none'; },
    toast(text, ms = 1800) { toastEl.innerHTML = text; toastEl.style.opacity = 1; clearTimeout(toastT); toastT = setTimeout(() => (toastEl.style.opacity = 0), ms); },
    meter(v) { if (v == null) { meterEl.style.display = 'none'; return; } meterEl.style.display = 'block'; meterI.style.width = clamp(v, 0, 1) * 100 + '%'; },
    /** כפתור HUD (פינה). מחזיר את האלמנט */
    button(label, fn, keyHint = '') {
      const b = document.createElement('button'); b.className = 'sk-chip'; b.innerHTML = label + (keyHint && !touch ? ` <small style="color:#8b95a7">${keyHint}</small>` : '');
      b.onclick = (e) => { e.stopPropagation(); if (!S.busy) fn(); }; b.style.pointerEvents = 'auto';
      btnsEl.appendChild(b); return b;
    },
    spot(s) { s.r = s.r || 1.6; spots.push(s); return s; },
    modal(html, { onClose = null } = {}) {
      if (modalEl) modalEl.remove();
      S.busy = true; keys.clear();
      if (ctl) { ctl.enabled = false; ctl.fireHeld = false; ctl.move.x = ctl.move.y = 0; }
      if (document.pointerLockElement) document.exitPointerLock?.();
      modalEl = document.createElement('div'); modalEl.className = 'sk-modal'; modalEl.innerHTML = `<div class="sk-card">${html}</div>`;
      modalEl._onClose = onClose;
      el.appendChild(modalEl); return modalEl;
    },
    close(lock = true) {
      const f = modalEl?._onClose; modalEl?.remove(); modalEl = null; S.busy = false; keys.clear();
      if (ctl) { ctl.enabled = true; ctl.lookDelta(); ctl.take('fire'); ctl.take('pause'); ctl.take('switch'); if (lock) setTimeout(() => { if (!S.busy && S.active) ctl?.lock(); }, 0); }
      f?.();
    },
    get modalEl() { return modalEl; },
    start() {
      ctl?.dispose();
      ctl = createControls({ ui: ctlLayer, canvas: renderer?.domElement || document.querySelector('canvas') });
      if (ctl.layer) { // כפתורי מגע: ירי = פעולה, החלפה = כלי, טעינה מוסתרת
        const f = ctl.layer.querySelector('[data-b=fire]'), r = ctl.layer.querySelector('[data-b=reload]'), sw = ctl.layer.querySelector('[data-b=switch]');
        if (f) f.style.transform = 'translate(-9999px)';
        if (r) r.style.transform = 'translate(-9999px)';
        if (sw) { if (S.toolLabel) sw.innerHTML = S.toolLabel; else sw.style.transform = 'translate(-9999px)'; }
        actEl.style.display = 'flex';
      }
      ctl.lock();
    },
    pauseMenu(extra = '') {
      const m = S.modal(`<h2>⏸ הפסקה</h2>${extra}<button class="btn" data-k="go">▶️ המשך</button>
        <button class="btn" data-k="restart">🔁 התחל מחדש</button><button class="btn" data-k="exit">→ יציאה לעלילות</button>
        <div class="sk-muted" style="text-align:center">${touch ? 'ג׳ויסטיק = תנועה · גרירה = מבט · 🖐 = פעולה' : 'WASD תנועה · Shift ריצה · עכבר מבט · E / קליק = פעולה · F = כלי · B = לוח · Esc = הפסקה'}</div>`);
      m.querySelector('[data-k=go]').onclick = () => S.close();
      m.querySelector('[data-k=restart]').onclick = () => S.exit(true);
      m.querySelector('[data-k=exit]').onclick = () => S.exit();
    },
    /** עדכון שחקן + מצלמה + נקודות. מחזיר true אם התקבלה פעולה על נקודה */
    update(dt) {
      dt = Math.min(dt, 0.05); S.t += dt;
      if (ctl && !S.busy) {
        if (ctl.take('pause')) { S.pauseMenu(S.pauseExtra?.() || ''); }
        if (ctl.take('fire')) press('act');
        if (ctl.take('switch')) press('tool');
      }
      const live = ctl && !S.busy && !P.frozen;
      if (live) {
        const l = ctl.lookDelta();
        P.yaw -= l.x; P.pitch = clamp(P.pitch + l.y, -0.9, 0.7);
        if (ctl.take('jump') && P.ground) { P.vy = JUMP; P.ground = false; }
      } else if (ctl) ctl.lookDelta();
      const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw);
      const mv = live ? ctl.move : { x: 0, y: 0 };
      P.run = !!(live && ctl.sprint && Math.hypot(mv.x, mv.y) > 0.3);
      const max = (P.run ? RUN : WALK) * P.maxSpeed;
      _w.set(-fz * mv.x + fx * mv.y, 0, fx * mv.x + fz * mv.y).multiplyScalar(max);
      P.vel.lerp(_w, 1 - Math.exp(-(P.ground ? 11 : 3) * dt));
      P.pos.addScaledVector(P.vel, dt);
      P.vy -= GRAV * dt; P.pos.y += P.vy * dt;
      const g = world.groundAt(P.pos, PR);
      if (P.pos.y <= g) { P.pos.y = g; P.vy = 0; P.ground = true; } else if (P.pos.y > g + 0.05) P.ground = false;
      world.collide(P.pos, PR);
      if (S.bounds) { P.pos.x = clamp(P.pos.x, S.bounds[0], S.bounds[1]); P.pos.z = clamp(P.pos.z, S.bounds[2], S.bounds[3]); }
      P.speed = Math.hypot(P.vel.x, P.vel.z);
      // דמות: פונה לכיוון התנועה (או המבט)
      rig.root.position.copy(P.pos);
      let face = P.yaw;
      if (P.speed > 0.4) face = Math.atan2(P.vel.x, P.vel.z);
      P.bodyYaw = (P.bodyYaw ?? P.yaw) + angDiff(P.bodyYaw ?? P.yaw, face) * (1 - Math.exp(-10 * dt));
      rig.root.rotation.set(0, P.bodyYaw, 0);
      const yr = (P.bodyYaw - P.yawPrev) / Math.max(dt, 1e-3); P.yawPrev = P.bodyYaw;
      const s = P.speed <= WALK ? (P.speed / WALK) * 0.5 : 0.5 + clamp((P.speed - WALK) / (RUN - WALK), 0, 1) * 0.5;
      rig.anim.update(dt, { speed: s, pitch: 0, yawRate: yr });
      // מצלמה מאחורי הכתף
      if (!S.camHold) {
        const cp = Math.cos(P.pitch);
        _dir.set(fx * cp, Math.sin(P.pitch), fz * cp);
        const side = 0.75, dist = S.camDist || 3.4;
        _piv.set(P.pos.x - fz * side, P.pos.y + 1.75, P.pos.z + fx * side);
        _cam.copy(_dir).negate();
        let t = world.ray(_piv, _cam, dist + 0.25); t = Math.max(0.3, Math.min(dist, t - 0.25));
        _cpos.copy(_piv).addScaledVector(_cam, t); if (_cpos.y < 0.25) _cpos.y = 0.25;
        camera.position.lerp(_cpos, S.camSnap ? 1 : 1 - Math.exp(-18 * dt)); S.camSnap = false;
        camera.lookAt(_cam.copy(camera.position).add(_dir));
      }
      // נקודות פעולה: הקרובה ביותר שמולך
      near = null; let bd = Infinity;
      if (!S.busy) for (const sp of spots) {
        if (sp.on && !sp.on()) continue;
        const dx = sp.pos.x - P.pos.x, dz = sp.pos.z - P.pos.z, d = Math.hypot(dx, dz);
        if (d > sp.r) continue;
        const front = d < 0.8 ? 1 : (dx * fx + dz * fz) / d;
        const score = d - front * 0.6;
        if (front > -0.2 && score < bd) { bd = score; near = sp; }
      }
      const label = near ? (typeof near.label === 'function' ? near.label() : near.label) : '';
      if (label !== S._lastLabel) { S._lastLabel = label; promptEl.innerHTML = label ? `<kbd>${touch ? '🖐' : 'E'}</kbd>${label}` : ''; promptEl.style.display = label ? 'block' : 'none'; }
      actEl.style.borderColor = near ? '#ffb020' : '#2a3142';
      const acted = take('act');
      if (acted && near && !S.busy) { near.use(near); return true; }
      return false;
    },
    get near() { return near; },
    exit(again = false) {
      if (!S.active) return;
      S.active = false;
      off.forEach((f) => f()); ctl?.dispose(); clearTimeout(toastT);
      S.onExit?.();
      root.traverse((o) => { if (o.isMesh || o.isLine || o.isPoints || o.isLineSegments) { o.geometry?.dispose(); } });
      world.dispose();
      scene.remove(root); style.remove(); el.remove();
      scene.background = saved.bg; scene.fog = saved.fog; scene.environment = saved.env;
      for (const [l, i] of saved.lights) l.intensity = i;
      camera.fov = saved.fov; camera.near = saved.near; camera.far = saved.far; camera.updateProjectionMatrix();
      if (renderer && saved.pr) renderer.setPixelRatio(saved.pr);
      if (renderer && saved.exp != null) renderer.toneMappingExposure = saved.exp;
      back(again);
    },
  };
  return S;
}
const _w = new V3(), _dir = new V3(), _piv = new V3(), _cam = new V3(), _cpos = new V3();

/** צפצוף קטן (WebAudio) – שקט אם אין תמיכה */
let AC = null;
export function beep(freq = 660, dur = 0.06, type = 'square', vol = 0.05) {
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type; o.frequency.value = freq; g.gain.value = vol;
    g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + dur);
    o.connect(g).connect(AC.destination); o.start(); o.stop(AC.currentTime + dur);
  } catch (_) {}
}
export const buzz = (ms = 20) => { try { navigator.vibrate?.(ms); } catch (_) {} };

/** כרטיס דמות לדיאלוג */
export const whoHtml = (face, name, role) => `<div class="sk-who"><div class="f">${face}</div><div><b>${name}</b><small>${role}</small></div></div>`;

/** עוטף מצב עלילה כך ש"שחק שוב" בונה אותו מחדש: create(scene,camera,ui,back(again),renderer) → מופע עם update */
export function replayable(create) {
  return (scene, camera, ui, back, renderer) => {
    let cur = null;
    const R = { active: true, get cur() { return cur; }, update(dt) { if (cur?.active) cur.update(dt); } };
    const run = () => { cur = create(scene, camera, ui, (again) => { if (again) run(); else { R.active = false; back(); } }, renderer); };
    run();
    return R;
  };
}

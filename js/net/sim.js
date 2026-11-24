// סימולציית הקרב – רצה אצל המארח בלבד (host-authoritative). אין בה רינדור: רק מיקומים, נזק, תיבות, מטבעות ובוטים.
// stepMove() משותף גם ללקוח (חיזוי תנועה) כדי ששני הצדדים יזיזו את השחקן באותה פיזיקה.
//
//   const sim = new Sim(arena.userData, { rule: 'lms'|'dm', level: 'easy'|'medium'|'hard' });
//   sim.addPlayer({ id, name, skin, bot })   sim.removePlayer(id)
//   sim.start()                    → מתחיל סיבוב: כולם במטוס
//   sim.setInput(id, inp)          inp = { q, mx, my, sp, jc, aim, fire, yaw, pitch, w }
//   sim.shot(id, { o:[x,y,z], d:[x,y,z], w, rt })   sim.reload(id)
//   sim.step(dt)   sim.drain() → אירועים   sim.snapshot() → הודעת 's'
import * as THREE from 'three';
import { weapon as W, RARITY } from '../data/weapons.js';

const V3 = THREE.Vector3;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const rnd = (a, b) => a + Math.random() * (b - a);
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;

export const G = 16, JUMP = 6.2, WALK = 4.2, RUN = 6.5, PR = 0.35;
export const ST = ['jet', 'air', 'chute', 'ground', 'dead', 'spec'];
export const PHASES = ['wait', 'jet', 'fight', 'end'];
export const RULES = {
  lms: { he: 'האחרון שנשאר', icon: '👑' },
  dm:  { he: 'חזרה לחיים', icon: '♻️', kills: 10, time: 300, respawn: 4 },
};
export const BOT_LV = {
  easy:   { he: 'קל',     acc: 0.2,  react: 0.9,  rof: 1.3,  burst: 1, dmgK: 0.45, speed: 0.8 },
  medium: { he: 'בינוני', acc: 0.3,  react: 0.55, rof: 1.0,  burst: 2, dmgK: 0.6,  speed: 0.9 },
  hard:   { he: 'קשה',    acc: 0.42, react: 0.3,  rof: 0.8,  burst: 3, dmgK: 0.75, speed: 1.0 },
};
export const BOT_NAMES = ['נץ', 'זאב', 'צפע', 'ברק', 'רעם', 'סופה', 'להב', 'עקרב', 'שועל', 'נמר'];
export const CHEST_POOL = ['rifle', 'smg', 'shotgun', 'sniper', 'plasma'];
export const AUTO = new Set(['knife', 'rifle', 'smg', 'plasma']);
export const RELOAD = { pistol: 1.2, rifle: 1.4, smg: 1.3, shotgun: 1.9, sniper: 2.1, plasma: 1.5 };
export const SPREAD = { knife: 0, pistol: 0.004, rifle: 0.006, smg: 0.009, shotgun: 0.045, sniper: 0.0015, plasma: 0.005 };
export const KICK = { knife: 0, pistol: 0.022, rifle: 0.011, smg: 0.008, shotgun: 0.05, sniper: 0.06, plasma: 0.009 };
export const JET = { alt: 60, speed: 30 };
const CHUTE_AT = 22, KNIFE_REACH = 2.3, COIN_RESPAWN = 25, CHEST_RESPAWN = 40;
const HEAD_Y = 1.62, HEAD_R = 0.17, BODY_H = 1.45, BODY_R = 0.3;

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
function segSphere(o, d, maxT, c, r) {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z, cc = ox * ox + oy * oy + oz * oz - r * r, h = b * b - cc;
  if (h < 0) return Infinity;
  const t = -b - Math.sqrt(h);
  return t >= 0 && t <= maxT ? t : Infinity;
}

/** עולם פיזיקלי מתוך arena.userData */
export function makeWorld(A) {
  const boxes = A.colliders;
  const half = A.half;
  const rayBoxes = (o, d, maxT) => { let t = maxT; for (const b of boxes) { const s = segBox(o, d, t, b); if (s < t) t = s; } return t; };
  const _d = new V3();
  const blocked = (a, b) => {
    _d.subVectors(b, a); const L = _d.length(); if (L < 1e-6) return false; _d.divideScalar(L);
    for (const bx of boxes) if (segBox(a, _d, L, bx) < L) return true;
    return false;
  };
  // הקרקע הכי גבוהה מתחת, שאפשר לנחות עליה (top ≤ prevY + 0.3 = עליית מדרגה)
  const groundAt = (pos, r, prevY) => {
    let g = 0;
    for (const b of boxes) {
      if (b.max.y > prevY + 0.3 || b.max.y <= g) continue;
      if (pos.x > b.min.x - r * 0.5 && pos.x < b.max.x + r * 0.5 && pos.z > b.min.z - r * 0.5 && pos.z < b.max.z + r * 0.5) g = b.max.y;
    }
    return g;
  };
  const collide = (pos, r, h = 1.75) => {
    for (const b of boxes) {
      if (pos.y >= b.max.y - 0.05 || pos.y + h <= b.min.y) continue;
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
  };
  return { boxes, half, ladders: A.ladders || [], rayBoxes, blocked, groundAt, collide };
}

/** מסלול המטוס: מעבר ישר מעל הזירה */
export function jetPath(half, rand = Math.random) {
  const a = rand() * Math.PI * 2, r = half * 1.9, off = (rand() - 0.5) * half * 0.6;
  const dx = Math.cos(a), dz = Math.sin(a), nx = -dz, nz = dx;
  return { from: [-dx * r + nx * off, JET.alt, -dz * r + nz * off], to: [dx * r + nx * off, JET.alt, dz * r + nz * off], speed: JET.speed };
}
/** מיקום המטוס בזמן t מתחילת המעבר. מחזיר progress 0..1 */
export function jetAt(path, t, out) {
  const [fx, fy, fz] = path.from, [tx, ty, tz] = path.to;
  const len = Math.hypot(tx - fx, ty - fy, tz - fz), k = clamp((t * path.speed) / len, 0, 1);
  out.set(fx + (tx - fx) * k, fy + (ty - fy) * k, fz + (tz - fz) * k);
  return k;
}

// ---------- תנועה (משותף למארח ולחיזוי בלקוח) ----------
export function newBody() {
  return { pos: new V3(), vel: new V3(), vy: 0, ground: true, yaw: 0, pitch: 0, st: 'jet', spd: 0, airT: 0, jc: 0, climb: false };
}
const _w = new V3();
export function dropFromJet(p) { p.st = 'air'; p.vel.set(0, 0, 0); p.vy = -2; p.airT = 0; p.pos.y -= 3; }
/** inp: { mx, my, sp, jc, aim, fire, yaw, pitch } – jc = מונה קפיצות (כל עלייה = לחיצה) */
export function stepMove(p, inp, dt, Wd, jetPos = null) {
  if (inp) { p.yaw = inp.yaw ?? p.yaw; p.pitch = inp.pitch ?? p.pitch; }
  const jumped = inp && inp.jc > p.jc; if (inp) p.jc = Math.max(p.jc, inp.jc | 0);
  if (p.st === 'jet') {
    if (jetPos) p.pos.copy(jetPos);
    if (jumped && jetPos) dropFromJet(p);
    return;
  }
  if (p.st === 'dead' || p.st === 'spec') return;
  const prevY = p.pos.y;
  const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
  const mx = inp?.mx || 0, my = inp?.my || 0;
  _w.set(-fz * mx + fx * my, 0, fx * mx + fz * my);
  if (p.st === 'air') {
    p.airT += dt;
    _w.multiplyScalar(9); p.vel.lerp(_w, 1 - Math.exp(-1.5 * dt));
    p.vy = Math.max(-22, p.vy - G * dt);
    const below = Wd.groundAt(p.pos, PR, p.pos.y);
    if ((jumped && p.airT > 0.4) || p.pos.y - below < CHUTE_AT) p.st = 'chute';
  } else if (p.st === 'chute') {
    _w.multiplyScalar(6.5); p.vel.lerp(_w, 1 - Math.exp(-2 * dt));
    p.vy += (-3.4 - p.vy) * (1 - Math.exp(-3 * dt));
  } else {
    const aim = inp?.aim || 0;
    const sprint = inp?.sp && my > 0.3 && !inp.fire && aim < 0.3;
    const max = (sprint ? RUN : WALK) * (1 - aim * 0.4);
    _w.multiplyScalar(max);
    p.vel.lerp(_w, 1 - Math.exp(-(p.ground ? 12 : 3) * dt));
    // סולמות: קרוב לסולם + לוחץ קדימה = מטפסים
    p.climb = false;
    for (const L of Wd.ladders) {
      if (Math.hypot(p.pos.x - L.pos.x, p.pos.z - L.pos.z) < 0.85 && my > 0.3 && p.pos.y < L.top + 0.05) {
        p.climb = true; p.vy = 0; p.pos.y += 3.2 * dt; p.vel.multiplyScalar(0.2);
        if (p.pos.y >= L.top) { p.pos.y = L.top + 0.55; p.pos.x -= L.normal.x * 1.1; p.pos.z -= L.normal.z * 1.1; p.climb = false; }
        break;
      }
    }
    if (!p.climb) {
      if (jumped && p.ground) { p.vy = JUMP; p.ground = false; }
      p.vy -= G * dt;
    }
  }
  p.pos.addScaledVector(p.vel, dt);
  if (!p.climb) p.pos.y += p.vy * dt;
  const lim = Wd.half - 0.8;
  p.pos.x = clamp(p.pos.x, -lim, lim); p.pos.z = clamp(p.pos.z, -lim, lim);
  const g = Wd.groundAt(p.pos, PR, Math.max(prevY, p.pos.y));
  if (p.pos.y <= g) {
    p.pos.y = g; p.vy = 0; p.ground = true;
    if (p.st === 'air' || p.st === 'chute') { p.st = 'ground'; p.vel.multiplyScalar(0.3); }
  } else if (p.pos.y > g + 0.05) p.ground = false;
  Wd.collide(p.pos, PR);
  p.spd = Math.hypot(p.vel.x, p.vel.z);
}

/** בחירת נשק מתיבה לפי משקלי נדירות */
export function rollChest(rand = Math.random) {
  const pool = CHEST_POOL.map((id) => [id, RARITY[W(id).rarity].weight]);
  let s = pool.reduce((a, [, w]) => a + w, 0) * rand();
  for (const [id, w] of pool) if ((s -= w) <= 0) return id;
  return pool[0][0];
}

// ---------- הסימולציה ----------
export class Sim {
  constructor(A, cfg = {}) {
    this.A = A; this.Wd = makeWorld(A);
    this.cfg = { rule: 'lms', level: 'medium', ...cfg };
    this.players = new Map();
    this.time = 0; this.phase = 'wait'; this.phaseT = 0; this.round = 0;
    this.events = []; this.jet = null; this.jetPos = new V3(); this.jetK = 0;
    this.coins = A.coinSpots.map((c, i) => ({ i, pos: c.pos, value: c.value, tier: c.tier, up: true, t: 0 }));
    this.chests = A.chestSpots.map((c, i) => ({ i, pos: c.pos, up: true, t: 0 }));
    this.winner = null; this.startCount = 0;
  }
  ev(e) { this.events.push(e); }
  drain() { const e = this.events; this.events = []; return e; }

  addPlayer({ id, name, skin = 'default', bot = false }) {
    const p = Object.assign(newBody(), {
      id, name, skin, bot, hp: 100, slots: ['knife', 'pistol', null], w: 1, ammo: {}, reloadT: 0, cd: 0,
      kills: 0, deaths: 0, coins: 0, respawnT: 0, inp: null, ack: 0, hist: [], aim: 0, fireHeld: false, deadT: 0,
    });
    this.refill(p);
    if (this.phase === 'wait' || this.phase === 'end') p.st = 'spec';
    else if (this.cfg.rule === 'dm' || this.phase === 'jet') this.spawn(p, this.phase === 'jet');
    else p.st = 'spec';
    if (bot) this.initBot(p);
    this.players.set(id, p);
    if (this.phase !== 'wait') this.ev({ e: 'j', a: id });
    return p;
  }
  removePlayer(id) { if (this.players.delete(id)) this.ev({ e: 'l', a: id }); }
  refill(p) { for (const id of p.slots) if (id && W(id).mag) p.ammo[id] = W(id).mag; }

  /** inJet: מתחילים במטוס. אחרת (חזרה לחיים): צונחים מעל נקודת לידה */
  spawn(p, inJet) {
    p.hp = 100; p.slots = ['knife', 'pistol', null]; p.w = 1; p.reloadT = 0; p.cd = 0; this.refill(p);
    p.vel.set(0, 0, 0); p.vy = 0; p.airT = 0; p.hist.length = 0;
    if (inJet) { p.st = 'jet'; p.pos.copy(this.jetPos); }
    else {
      const sp = this.A.spawnPoints[Math.floor(Math.random() * this.A.spawnPoints.length)];
      p.st = 'air'; p.pos.set(sp.pos.x, 34, sp.pos.z); p.yaw = sp.rotY; p.vy = -4;
    }
    if (p.bot) this.initBot(p);
  }

  start() {
    this.round++; this.phase = 'jet'; this.phaseT = 0; this.winner = null;
    this.jet = jetPath(this.Wd.half);
    jetAt(this.jet, 0, this.jetPos);
    for (const c of this.coins) { c.up = true; c.t = 0; }
    for (const c of this.chests) { c.up = true; c.t = 0; }
    for (const p of this.players.values()) { p.kills = p.deaths = 0; this.spawn(p, true); }
    this.startCount = this.players.size;
    return this.matchInfo();
  }
  matchInfo() { return { t: 'start', round: this.round, rule: this.cfg.rule, level: this.cfg.level, jet: this.jet, tm: this.time, jt: this.time - this.phaseT }; }

  setInput(id, inp) {
    const p = this.players.get(id); if (!p || !inp) return;
    p.inp = inp; if (inp.q) p.ack = Math.max(p.ack, inp.q);
    p.aim = clamp(+inp.aim || 0, 0, 1); p.fireHeld = !!inp.fire;
    const w = inp.w | 0; if (w >= 0 && w < 3 && p.slots[w] && w !== p.w) { p.w = w; p.reloadT = 0; p.cd = Math.max(p.cd, 0.3); }
  }
  reload(id) {
    const p = this.players.get(id); if (!p) return;
    const wid = p.slots[p.w]; if (!wid || !W(wid).mag || p.reloadT > 0 || p.ammo[wid] >= W(wid).mag) return;
    p.reloadT = RELOAD[wid] || 1.3;
  }
  canShoot(p) { return (p.st === 'ground' || p.st === 'chute') && p.hp > 0 && this.phase !== 'end'; }

  /** ירייה מבקשה של שחקן (או של המארח עצמו). o = מקור הקרן (מצלמה), d = כיוון, rt = זמן התצוגה אצל היורה (לפיצוי השהיה) */
  shot(id, { o, d, w, rt }) {
    const p = this.players.get(id);
    if (!p || !this.canShoot(p) || !Array.isArray(o) || !Array.isArray(d)) return;
    const slot = p.slots.indexOf(w); if (slot < 0) return;
    if (slot !== p.w) { p.w = slot; p.reloadT = 0; }
    if (p.cd > 0.03 || p.reloadT > 0) return;
    const wd = W(w);
    if (wd.mag) { if ((p.ammo[w] | 0) <= 0) return; p.ammo[w]--; }
    p.cd = (60 / wd.rpm) * 0.85;
    const O = new V3(o[0], o[1], o[2]), D = new V3(d[0], d[1], d[2]).normalize();
    if (O.distanceTo(p.pos) > 6) O.copy(p.pos).y += 1.6; // לא סומכים על מקור רחוק
    const t = clamp(typeof rt === 'number' ? rt : this.time, this.time - 0.6, this.time);
    if (w === 'knife') return this.melee(p, D);
    const near = Math.max(0, O.distanceTo(_v.copy(p.pos).setY(p.pos.y + 1.5)) * 0.9);
    const pellets = wd.pellets || 1;
    let endFx = null;
    for (let k = 0; k < pellets; k++) {
      const dir = pellets > 1 ? _dir.copy(D).add(_v.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(SPREAD.shotgun)).normalize() : D;
      const hit = this.trace(p, O, dir, near, wd.range + near, t);
      if (hit.who) this.damage(p, hit.who, w, hit.head);
      if (!endFx) endFx = hit.end;
    }
    if (endFx) this.ev({ e: 'f', a: id, w, x: r2(endFx.x), y: r2(endFx.y), z: r2(endFx.z) });
  }
  /** קרן מול העולם ומול גופי השחקנים (בזמן t) */
  trace(shooter, O, D, near, far, t) {
    const tw = this.Wd.rayBoxes(_o.copy(O).addScaledVector(D, near), D, far - near) + near;
    let best = tw, who = null, head = false;
    for (const q of this.players.values()) {
      if (q === shooter || q.hp <= 0 || q.st === 'jet' || q.st === 'dead' || q.st === 'spec') continue;
      const P = this.posAt(q, t, _q);
      const th = segSphere(O, D, best, _c.set(P.x, P.y + HEAD_Y, P.z), HEAD_R);
      if (th > near && th < best) { best = th; who = q; head = true; }
      _bx.min.set(P.x - BODY_R, P.y, P.z - BODY_R); _bx.max.set(P.x + BODY_R, P.y + BODY_H, P.z + BODY_R);
      const tb = segBox(O, D, best, _bx);
      if (tb > near && tb < best) { best = tb; who = q; head = false; }
    }
    return { who, head, end: new V3().copy(O).addScaledVector(D, Math.min(best, far)) };
  }
  melee(p, D) {
    _v.copy(p.pos).y += 1.2;
    let best = null, bd = KNIFE_REACH;
    for (const q of this.players.values()) {
      if (q === p || q.hp <= 0 || (q.st !== 'ground' && q.st !== 'chute')) continue;
      _q.subVectors(q.pos, p.pos); const dy = Math.abs(_q.y); _q.y = 0; const d = _q.length();
      if (d < bd && dy < 1.5 && (d < 0.6 || (_q.x * D.x + _q.z * D.z) / (d * Math.hypot(D.x, D.z) || 1) > 0.6)) { bd = d; best = q; }
    }
    this.ev({ e: 'f', a: p.id, w: 'knife' });
    if (best) this.damage(p, best, 'knife', false);
  }
  posAt(q, t, out) {
    const h = q.hist;
    if (!h.length || t >= h[h.length - 1][0]) return out.copy(q.pos);
    for (let i = h.length - 1; i > 0; i--) {
      const a = h[i - 1], b = h[i];
      if (t >= a[0]) { const k = (t - a[0]) / Math.max(1e-4, b[0] - a[0]); return out.set(a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k); }
    }
    return out.set(h[0][1], h[0][2], h[0][3]);
  }
  damage(from, to, w, head) {
    if (to.hp <= 0 || this.phase === 'end') return;
    const wd = W(w);
    let dmg = wd.dmg * (head ? wd.head : 1);
    if (from.bot) dmg *= BOT_LV[this.cfg.level].dmgK;
    to.hp = Math.max(0, to.hp - dmg);
    const kill = to.hp <= 0;
    this.ev({ e: 'h', a: from.id, v: to.id, h: head ? 1 : 0, k: kill ? 1 : 0, sx: r2(from.pos.x), sz: r2(from.pos.z) });
    if (to.bot && !kill) { to.ai.seeT = Math.max(to.ai.seeT, BOT_LV[this.cfg.level].react); to.ai.target = from.id; to.ai.flinch = 0.15; }
    if (kill) {
      to.st = 'dead'; to.deadT = 0; to.deaths++; from.kills++;
      to.respawnT = RULES[this.cfg.rule].respawn || 0;
      this.ev({ e: 'k', a: from.id, v: to.id, w, h: head ? 1 : 0 });
    }
  }

  // ---------- בוטים ----------
  initBot(p) {
    p.ai = { dropAt: rnd(0.15, 0.85), land: null, thinkT: 0, target: null, seeT: 0, lostT: 0, goal: null, strafe: 1, strafeT: 1,
      fireT: rnd(0.4, 1.2), burst: 0, burstT: 0, stuckT: 0, last: new V3(1e9, 0, 0), flinch: 0, jc: p.jc || 0, los: false, losHead: false };
  }
  botInput(p, dt) {
    const ai = p.ai, L = BOT_LV[this.cfg.level], Wd = this.Wd;
    const inp = { mx: 0, my: 0, sp: 0, jc: ai.jc, aim: 0, fire: 0, yaw: p.yaw, pitch: 0 };
    const steer = (tx, tz, speedK = 1) => {
      const dx = tx - p.pos.x, dz = tz - p.pos.z, d = Math.hypot(dx, dz) || 1;
      const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
      inp.mx = ((-dx * fz + dz * fx) / d) * speedK; inp.my = ((dx * fx + dz * fz) / d) * speedK;
      return d;
    };
    const faceTo = (tx, tz, k = 8) => {
      const want = Math.atan2(tx - p.pos.x, tz - p.pos.z);
      const dy = ((want - p.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      p.yaw += dy * (1 - Math.exp(-k * dt)); inp.yaw = p.yaw; return Math.abs(dy);
    };
    if (p.st === 'jet') { if (this.jetK >= ai.dropAt) inp.jc = ++ai.jc; return inp; }
    if (p.st === 'air' || p.st === 'chute') {
      if (!ai.land) { const s = Math.random() < 0.5 ? this.chests[Math.floor(Math.random() * this.chests.length)].pos : this.A.spawnPoints[Math.floor(Math.random() * 8)].pos; ai.land = s.clone().add(new V3(rnd(-3, 3), 0, rnd(-3, 3))); }
      faceTo(ai.land.x, ai.land.z, 3); steer(ai.land.x, ai.land.z, Math.min(1, Math.hypot(ai.land.x - p.pos.x, ai.land.z - p.pos.z) / 6));
      return inp;
    }
    if (p.st !== 'ground') return inp;
    ai.land = null;
    // חשיבה 4 פעמים בשנייה: יעד גלוי הכי קרוב
    ai.thinkT -= dt;
    if (ai.thinkT <= 0) {
      ai.thinkT = 0.25;
      _e.copy(p.pos).y += 1.55;
      let best = null, bd = 48;
      for (const q of this.players.values()) {
        if (q === p || q.hp <= 0 || (q.st !== 'ground' && q.st !== 'chute')) continue;
        const d = q.pos.distanceTo(p.pos);
        if (d > bd && ai.target !== q.id) continue;
        _c.copy(q.pos).y += 1.25; const body = !Wd.blocked(_e, _c);
        _q.copy(q.pos).y += 1.6; const vis = body || !Wd.blocked(_e, _q);
        if (vis && (d < bd || ai.target === q.id)) { bd = d; best = q; ai.losHead = !body; }
      }
      if (best) { if (ai.target !== best.id) ai.seeT = Math.min(ai.seeT, 0.1); ai.target = best.id; ai.los = true; ai.lostT = 0; }
      else { ai.los = false; }
      // נתקע? יעד חדש
      if (p.pos.distanceTo(ai.last) < 0.25 && !ai.los) { ai.stuckT += 0.25; if (ai.stuckT > 1.2) { ai.goal = null; ai.stuckT = 0; inp.jc = ++ai.jc; } } else ai.stuckT = 0;
      ai.last.copy(p.pos);
    }
    const tg = ai.target && this.players.get(ai.target);
    const go = this.phase === 'fight' || this.phase === 'jet';
    if (ai.los && tg && tg.hp > 0 && go) {
      ai.seeT += dt;
      const dist = tg.pos.distanceTo(p.pos);
      const dy = faceTo(tg.pos.x, tg.pos.z, 10);
      inp.pitch = Math.atan2(tg.pos.y - p.pos.y, dist);
      ai.strafeT -= dt; if (ai.strafeT <= 0) { ai.strafe *= -1; ai.strafeT = rnd(0.6, 1.8); }
      inp.mx = ai.strafe * 0.8 * L.speed;
      const wid = p.slots[p.w], range = W(wid).range;
      if (wid === 'knife' || dist > Math.min(range * 0.7, 30)) inp.my = 0.9 * L.speed; else if (dist < 6 && wid !== 'shotgun') inp.my = -0.6;
      if (ai.flinch > 0) { ai.flinch -= dt; inp.mx *= 0.3; inp.my *= 0.3; }
      inp.aim = 1;
      // ירי
      ai.fireT -= dt;
      if (ai.seeT > L.react && dy < 0.4 && dist < range) {
        if (ai.burst > 0) { ai.burstT -= dt; if (ai.burstT <= 0) { this.botShot(p, tg, dist); ai.burst--; ai.burstT = Math.max(0.12, 60 / W(wid).rpm); } }
        else if (ai.fireT <= 0) { ai.burst = wid === 'sniper' || wid === 'shotgun' ? 1 : L.burst; ai.burstT = 0; ai.fireT = L.rof * rnd(0.8, 1.3) * (wid === 'sniper' ? 1.8 : 1); }
      }
    } else {
      ai.seeT = Math.max(0, ai.seeT - dt * 1.5);
      if (tg && tg.hp > 0 && tg.st === 'ground' && (ai.lostT += dt) < 6) ai.goal = tg.pos.clone();
      if (!ai.goal || ai.goal.distanceTo(p.pos) < 1.2) {
        const chest = !p.slots[2] && this.nearest(this.chests.filter((c) => c.up), p.pos, 60);
        const coin = this.nearest(this.coins.filter((c) => c.up && c.pos.y < 1.5), p.pos, 18);
        const sp = this.A.spawnPoints[Math.floor(Math.random() * 8)].pos;
        ai.goal = (chest?.pos || coin?.pos || new V3(rnd(-30, 30), 0, rnd(-30, 30)).lerp(sp, 0.3)).clone().setY(0);
        ai.lostT = 0; if (!chest && !coin) ai.target = null;
      }
      faceTo(ai.goal.x, ai.goal.z, 6); steer(ai.goal.x, ai.goal.z, L.speed);
      inp.sp = 1;
    }
    // הפרדה בין שחקנים
    for (const q of this.players.values()) if (q !== p && q.hp > 0 && q.st === 'ground') {
      const dx = p.pos.x - q.pos.x, dz = p.pos.z - q.pos.z, d2 = dx * dx + dz * dz;
      if (d2 < 1.2 && d2 > 1e-4) { const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw); inp.mx += ((-dx * fz + dz * fx) / d2) * 0.3; inp.my += ((dx * fx + dz * fz) / d2) * 0.3; }
    }
    p.fireHeld = false; p.aim = inp.aim;
    return inp;
  }
  nearest(list, pos, max) { let b = null, bd = max; for (const c of list) { const d = c.pos.distanceTo(pos); if (d < bd) { bd = d; b = c; } } return b; }
  botShot(p, tg, dist) {
    const wid = p.slots[p.w], wd = W(wid), L = BOT_LV[this.cfg.level];
    if (wid === 'knife') { if (dist < KNIFE_REACH) { this.ev({ e: 'f', a: p.id, w: wid }); this.damage(p, tg, wid, false); } return; }
    const moving = tg.spd > 2.5 ? 0.7 : 1, air = tg.st === 'chute' ? 0.6 : 1;
    const pr = L.acc * clamp(1.3 - dist / (wd.range * 0.5 + 10), 0.3, 1.2) * moving * air * (wid === 'sniper' ? 1.4 : 1);
    const hit = Math.random() < pr, head = hit && Math.random() < 0.15;
    _v.copy(tg.pos).y += head ? HEAD_Y : 1.1;
    if (!hit) _v.add(_dir.set(rnd(-1, 1), rnd(-0.5, 0.9), rnd(-1, 1)).normalize().multiplyScalar(rnd(0.6, 1.6)));
    this.ev({ e: 'f', a: p.id, w: wid, x: r2(_v.x), y: r2(_v.y), z: r2(_v.z) });
    if (hit) for (let k = 0; k < (wd.pellets ? 4 : 1); k++) this.damage(p, tg, wid, head);
  }

  // ---------- צעד ----------
  step(dt) {
    dt = Math.min(dt, 0.05);
    this.time += dt; this.phaseT += dt;
    if (this.phase === 'jet') {
      this.jetK = jetAt(this.jet, this.phaseT, this.jetPos);
      if (this.jetK >= 0.97) for (const p of this.players.values()) if (p.st === 'jet') { p.pos.copy(this.jetPos); dropFromJet(p); }
      if (this.jetK >= 1) { this.phase = 'fight'; this.phaseT = 0; }
    }
    const rule = RULES[this.cfg.rule];
    for (const p of this.players.values()) {
      if (p.st === 'dead') {
        p.deadT += dt;
        if (rule.respawn && this.phase === 'fight' && (p.respawnT -= dt) <= 0) this.spawn(p, false);
        continue;
      }
      const inp = p.bot ? this.botInput(p, dt) : p.inp;
      stepMove(p, inp, dt, this.Wd, this.phase === 'jet' ? this.jetPos : null);
      if (p.st === 'jet' && this.phase !== 'jet') { p.st = 'air'; p.airT = 1; }
      p.cd = Math.max(0, p.cd - dt);
      if (p.reloadT > 0 && (p.reloadT -= dt) <= 0) { p.reloadT = 0; const wid = p.slots[p.w]; if (W(wid)?.mag) p.ammo[wid] = W(wid).mag; }
      // היסטוריה לפיצוי השהיה (30 פעמים בשנייה, שנייה אחורה)
      const h = p.hist, last = h[h.length - 1];
      if (!last || this.time - last[0] > 0.033) { h.push([this.time, p.pos.x, p.pos.y, p.pos.z]); if (h.length > 36) h.shift(); }
      if (p.st === 'ground' || p.st === 'chute') this.pickups(p);
    }
    for (const c of this.coins) if (!c.up && (c.t -= dt) <= 0) c.up = true;
    for (const c of this.chests) if (!c.up && (c.t -= dt) <= 0) c.up = true;
    this.checkEnd(dt);
  }
  pickups(p) {
    for (const c of this.coins) {
      if (!c.up) continue;
      const dx = c.pos.x - p.pos.x, dy = c.pos.y - (p.pos.y + 0.7), dz = c.pos.z - p.pos.z;
      if (dx * dx + dy * dy + dz * dz < 1.3) { c.up = false; c.t = COIN_RESPAWN; p.coins += c.value; this.ev({ e: 'c', a: p.id, i: c.i, n: c.value }); }
    }
    for (const c of this.chests) {
      if (!c.up) continue;
      const dx = c.pos.x - p.pos.x, dz = c.pos.z - p.pos.z;
      if (dx * dx + dz * dz < 1.6 * 1.6 && Math.abs(c.pos.y - p.pos.y) < 1.5) {
        c.up = false; c.t = CHEST_RESPAWN;
        const w = rollChest();
        p.slots[2] = w; p.ammo[w] = W(w).mag; p.w = 2; p.reloadT = 0; p.cd = 0.3;
        this.ev({ e: 'x', a: p.id, i: c.i, w });
      }
    }
  }
  checkEnd() {
    if (this.phase !== 'fight') return;
    const list = [...this.players.values()];
    if (this.cfg.rule === 'lms') {
      const alive = list.filter((p) => p.st !== 'dead' && p.st !== 'spec');
      if (this.startCount >= 2 && alive.length <= 1) this.end(alive[0]?.id || null);
    } else {
      const R = RULES.dm, top = list.reduce((a, p) => (!a || p.kills > a.kills ? p : a), null);
      if (top && top.kills >= R.kills) this.end(top.id);
      else if (this.phaseT >= R.time) this.end(top?.id || null);
    }
  }
  end(winner) {
    this.phase = 'end'; this.phaseT = 0; this.winner = winner;
    this.ev({ e: 'end', a: winner });
  }
  timeLeft() { return this.cfg.rule === 'dm' && this.phase === 'fight' ? Math.max(0, RULES.dm.time - this.phaseT) : 0; }
  alive() { let n = 0; for (const p of this.players.values()) if (p.st !== 'dead' && p.st !== 'spec') n++; return n; }

  /** מצב לשליחה ללקוחות. P = שורה לכל שחקן (ראה PI) */
  snapshot(events = []) {
    const P = [];
    for (const p of this.players.values()) {
      const wid = p.slots[p.w];
      P.push([p.id, r2(p.pos.x), r2(p.pos.y), r2(p.pos.z), r3(p.yaw), r3(p.pitch), Math.ceil(p.hp), ST.indexOf(p.st), wid,
        p.aim > 0.5 ? 1 : 0, p.ack, p.ammo[wid] ?? 0, p.slots[2] || '', p.kills, p.deaths, p.coins, p.reloadT > 0 ? 1 : 0, r2(p.spd), p.w]);
    }
    return {
      t: 's', tm: r3(this.time), ph: PHASES.indexOf(this.phase), pt: r2(this.phaseT), tl: Math.ceil(this.timeLeft()), win: this.winner,
      C: this.coins.map((c) => (c.up ? 1 : 0)).join(''), K: this.chests.map((c) => (c.up ? 1 : 0)).join(''), P, E: events,
    };
  }
}
// אינדקסים בשורת שחקן בתמונת מצב
export const PI = { id: 0, x: 1, y: 2, z: 3, yaw: 4, pitch: 5, hp: 6, st: 7, wid: 8, aim: 9, ack: 10, ammo: 11, w3: 12, kills: 13, deaths: 14, coins: 15, rl: 16, spd: 17, w: 18 };

const _v = new V3(), _o = new V3(), _q = new V3(), _c = new V3(), _e = new V3(), _dir = new V3(), _bx = new THREE.Box3();

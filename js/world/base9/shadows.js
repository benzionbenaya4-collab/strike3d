// בסיס 9 – הצללים: חיילי הניסוי שהפכו לצל. זזים רק בחושך, קופאים באור, נסוגים אם מאירים עליהם מספיק זמן.
// createShadows(parent, { isLit(pos), blocked(a,b), collide(pos,r), spots })
//   .spawn(chapter, count)  .update(dt, player)  .hitRay(o, d, maxT) → { s, t } | null  .damage(s, n)  .clear()  .list
// מצבים: lurk (מחכה בבית), stalk (מתקרב בחושך), frozen (באור), flee (בורח ונעלם), attack, dead.
import * as THREE from 'three';

const V3 = THREE.Vector3;
const rnd = (a, b) => a + Math.random() * (b - a);

let GEO = null;
function geos() {
  if (GEO) return GEO;
  GEO = {
    body: new THREE.CapsuleGeometry(0.28, 0.9, 4, 10),
    head: new THREE.SphereGeometry(0.2, 10, 8),
    arm: new THREE.CapsuleGeometry(0.07, 0.75, 3, 6),
    wisp: new THREE.ConeGeometry(0.32, 0.8, 7, 1, true),
    eye: new THREE.SphereGeometry(0.035, 6, 4),
  };
  return GEO;
}

export function createShadows(parent, env) {
  const g = geos();
  const root = new THREE.Group(); root.name = 'shadows'; parent.add(root);
  const list = [];
  const eyeMat = new THREE.MeshBasicMaterial({ color: '#ffe8e0', fog: false });
  const _to = new V3(), _mv = new V3(), _a = new V3(), _b = new V3(), _oc = new V3();

  function make(x, z) {
    const mat = new THREE.MeshBasicMaterial({ color: '#020203', transparent: true, opacity: 0.92, depthWrite: true });
    const m = new THREE.Group();
    const body = new THREE.Mesh(g.body, mat); body.position.y = 1.05; body.scale.set(1, 1.08, 0.75); m.add(body);
    const head = new THREE.Mesh(g.head, mat); head.position.y = 1.86; m.add(head);
    const arms = [-1, 1].map((s) => { const a = new THREE.Mesh(g.arm, mat); a.position.set(s * 0.36, 1.2, 0.05); a.rotation.z = s * 0.15; m.add(a); return a; });
    const wisp = new THREE.Mesh(g.wisp, mat); wisp.position.y = 0.35; wisp.rotation.x = Math.PI; m.add(wisp);
    const eyes = [-1, 1].map((s) => { const e = new THREE.Mesh(g.eye, eyeMat); e.position.set(s * 0.07, 1.9, 0.17); m.add(e); return e; });
    m.position.set(x, 0, z); root.add(m);
    const s = { m, mat, body, head, arms, wisp, eyes, home: new V3(x, 0, z), pos: new V3(x, 0, z), yaw: 0, state: 'lurk', t: 0, litT: 0, hp: 3, alive: true,
      fade: 1, cool: 0, seen: false, ph: Math.random() * 10, speed: rnd(1.9, 2.5), aggro: rnd(12, 17) };
    list.push(s); return s;
  }

  function clear() { for (const s of list) { root.remove(s.m); s.mat.dispose(); } list.length = 0; }

  function spawn(chapter, count) {
    clear();
    const spots = [...(env.spots[chapter] || [])].sort(() => Math.random() - 0.5);
    for (let i = 0; i < Math.min(count, spots.length); i++) make(spots[i][0], spots[i][1]);
  }

  // צל באור: בתוך אזור מואר (מנורות/אש) או בקונוס הפנס
  function litBy(s, P) {
    _a.copy(s.pos).y += 1.2;
    if (env.isLit(_a)) return 'zone';
    if (!P.lightOn) return null;
    _to.subVectors(_a, P.lightPos); const d = _to.length();
    if (d > P.lightRange) return null;
    _to.divideScalar(d);
    if (_to.dot(P.lightDir) < P.lightCos) return null;
    if (env.blocked(P.lightPos, _a)) return null;
    return 'beam';
  }

  function update(dt, P) {
    let near = Infinity, events = [];
    for (const s of list) {
      s.t += dt; s.cool = Math.max(0, s.cool - dt);
      if (!s.alive) { s.fade -= dt * 1.5; s.m.scale.setScalar(Math.max(0.01, s.fade)); s.mat.opacity = Math.max(0, s.fade) * 0.9; if (s.fade <= 0) s.m.visible = false; continue; }
      const lit = litBy(s, P);
      _to.subVectors(P.pos, s.pos).setY(0); const dist = _to.length(); _to.divideScalar(dist || 1);
      if (s.state !== 'flee' && s.fade > 0.5) near = Math.min(near, dist);

      if (lit && s.state !== 'flee') {
        if (s.state !== 'frozen') { s.state = 'frozen'; if (!s.seen && dist < 14) { s.seen = true; events.push({ type: 'first', s }); } }
        s.litT += dt * (lit === 'zone' ? 2.2 : 1);
        if (s.litT > 1.6) { s.state = 'flee'; s.t = 0; events.push({ type: 'burn', s }); }
      } else if (s.state === 'frozen') { s.state = 'stalk'; s.litT = Math.max(0, s.litT - 0.4); }
      if (!lit) s.litT = Math.max(0, s.litT - dt * 0.3);

      _mv.set(0, 0, 0);
      if (s.state === 'lurk') {
        // נדנוד במקום, מתעורר כשהשחקן קרוב (יותר מהר כשהפנס כבוי)
        const aggro = s.aggro * (P.lightOn ? 1 : 1.35);
        if (dist < aggro && P.alive) { s.state = 'stalk'; if (Math.random() < 0.6) events.push({ type: 'whisper', s }); }
      } else if (s.state === 'stalk') {
        if (!P.alive || dist > 30) s.state = 'lurk';
        _mv.copy(_to).multiplyScalar(s.speed * (P.lightOn ? 1 : 1.4));
        // לא נכנס לאזור מואר
        _b.copy(s.pos).addScaledVector(_mv, 0.35); _b.y = 1.2;
        if (env.isLit(_b)) _mv.set(-_to.z, 0, _to.x).multiplyScalar(s.speed * 0.6 * (Math.sin(s.ph) > 0 ? 1 : -1));
        if (dist < 1.15 && s.cool <= 0 && P.alive) { s.state = 'attack'; s.t = 0; }
      } else if (s.state === 'attack') {
        if (s.t > 0.35) { events.push({ type: 'hit', s, dmg: 25 }); s.state = 'flee'; s.t = 0; s.cool = 3; }
        _mv.copy(_to).multiplyScalar(1.5);
      } else if (s.state === 'flee') {
        _mv.copy(_to).multiplyScalar(-4.5);
        s.fade = Math.max(0, s.fade - dt * 0.9);
        if (s.fade <= 0) { // חוזר לבית ומחכה בחושך
          if (s.t > 5 + Math.random() * 4) {
            const far = env.spots[P.chapter].filter(([x, z]) => Math.hypot(x - P.pos.x, z - P.pos.z) > 10);
            const sp = far.length ? far[Math.floor(Math.random() * far.length)] : [s.home.x, s.home.z];
            s.pos.set(sp[0], 0, sp[1]); s.home.copy(s.pos); s.state = 'lurk'; s.litT = 0; s.fade = 0.01;
          }
        }
      }
      if (s.state === 'lurk' && s.fade < 1) s.fade = Math.min(1, s.fade + dt * 0.6);

      if (s.state !== 'frozen') { s.pos.addScaledVector(_mv, dt); env.collide(s.pos, 0.3); }
      const hs = _mv.length();
      if (hs > 0.1 && s.state !== 'flee') s.yaw = Math.atan2(_mv.x, _mv.z); else if (s.state === 'frozen' || s.state === 'lurk') s.yaw = Math.atan2(_to.x, _to.z);

      // מראה: רועד באור, מתנפח בחושך, זרועות מתנדנדות
      const shake = s.state === 'frozen' ? 0.05 * (1 + s.litT) : 0;
      s.m.position.set(s.pos.x + (Math.random() - 0.5) * shake, 0, s.pos.z + (Math.random() - 0.5) * shake);
      s.m.rotation.y = s.yaw;
      const k = s.t * (s.state === 'stalk' ? 7 : 2) + s.ph;
      s.arms[0].rotation.x = Math.sin(k) * 0.5 - (s.state === 'attack' ? 1.4 : 0.3);
      s.arms[1].rotation.x = -Math.sin(k) * 0.5 - (s.state === 'attack' ? 1.4 : 0.3);
      s.body.position.y = 1.05 + Math.sin(k * 0.5) * 0.04;
      s.wisp.scale.set(1 + Math.sin(k * 1.3) * 0.15, 1 + Math.sin(k * 0.9) * 0.2, 1);
      s.head.rotation.z = Math.sin(s.t * 1.7) * 0.25;
      const vis = s.fade * (s.state === 'frozen' ? 0.95 - Math.min(0.5, s.litT * 0.25) : 0.9);
      s.mat.opacity = vis; s.m.visible = vis > 0.02;
      const eyeOn = s.state !== 'flee' && (s.state !== 'frozen' || Math.sin(s.t * 40) > 0);
      s.eyes.forEach((e) => (e.visible = eyeOn && s.fade > 0.3));
    }
    return { near, events };
  }

  // פגיעת קרן: כדור בגובה החזה/ראש
  function hitRay(o, d, maxT) {
    let best = null;
    for (const s of list) {
      if (!s.alive || s.fade < 0.3) continue;
      for (const [y, r] of [[1.1, 0.42], [1.85, 0.25]]) {
        _oc.set(s.pos.x - o.x, y - o.y, s.pos.z - o.z);
        const tc = _oc.dot(d); if (tc < 0 || tc > maxT) continue;
        const d2 = _oc.lengthSq() - tc * tc; if (d2 > r * r) continue;
        const t = tc - Math.sqrt(r * r - d2);
        if (!best || t < best.t) best = { s, t, head: y > 1.5 };
      }
    }
    return best;
  }
  function damage(s, n) {
    s.hp -= n; s.litT += 0.6;
    if (s.hp <= 0) { s.alive = false; s.fade = 1; return true; }
    s.state = 'flee'; s.t = 0; return false;
  }

  return { root, list, spawn, update, hitRay, damage, clear, dispose() { clear(); root.removeFromParent(); eyeMat.dispose(); } };
}

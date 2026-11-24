// אביזרי העיר: דוכני שוק, ספסלים, שולחנות בית קפה, אוכל (רגיל ומוזר), בועות אימוג׳י וצללים מזויפים.
import * as THREE from 'three';
import { mergeStatic } from './batch.js';

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o });

// ---------- אוכל ----------
// רגיל: מה שאנשים אוכלים. מוזר: מה שהמתחזה אוכל.
export const FOOD = {
  apple:    { he: 'תפוח', icon: '🍎', weird: false },
  sandwich: { he: 'כריך', icon: '🥪', weird: false },
  icecream: { he: 'גלידה', icon: '🍦', weird: false },
  banana:   { he: 'בננה', icon: '🍌', weird: false },
  pita:     { he: 'פיתה', icon: '🥙', weird: false },
  bulb:     { he: 'נורה', icon: '💡', weird: true },
  rock:     { he: 'אבן', icon: '🪨', weird: true },
  soap:     { he: 'סבון', icon: '🧼', weird: true },
  shoe:     { he: 'נעל', icon: '👟', weird: true },
  candle:   { he: 'נר', icon: '🕯️', weird: true },
};
export const NORMAL_FOOD = Object.keys(FOOD).filter((k) => !FOOD[k].weird);
export const WEIRD_FOOD = Object.keys(FOOD).filter((k) => FOOD[k].weird);

export function buildFood(id) {
  const g = new THREE.Group(); g.name = 'food:' + id;
  const add = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
  switch (id) {
    case 'apple': add(new THREE.SphereGeometry(0.04, 10, 8), std('#c0392b', { roughness: 0.4 })); add(new THREE.CylinderGeometry(0.004, 0.004, 0.02), std('#4a3020'), 0, 0.045); break;
    case 'sandwich': add(new THREE.BoxGeometry(0.1, 0.02, 0.08), std('#e8c48a'), 0, -0.015); add(new THREE.BoxGeometry(0.1, 0.012, 0.08), std('#5cb85c'), 0, 0); add(new THREE.BoxGeometry(0.1, 0.02, 0.08), std('#e8c48a'), 0, 0.015); break;
    case 'icecream': add(new THREE.ConeGeometry(0.03, 0.09, 8).rotateX(Math.PI), std('#d9a066'), 0, -0.03); add(new THREE.SphereGeometry(0.035, 8, 6), std('#f8c8dc', { roughness: 0.5 }), 0, 0.025); break;
    case 'banana': add(new THREE.TorusGeometry(0.06, 0.016, 6, 10, Math.PI * 0.8), std('#f4d03f', { roughness: 0.5 })); break;
    case 'pita': add(new THREE.SphereGeometry(0.06, 10, 6).scale(1, 0.45, 0.8), std('#e0b070')); break;
    case 'bulb': add(new THREE.SphereGeometry(0.04, 10, 8), new THREE.MeshBasicMaterial({ color: '#fff6a0' }), 0, 0.02); add(new THREE.CylinderGeometry(0.018, 0.018, 0.035, 8), std('#9aa0a6', { metalness: 0.7, roughness: 0.3 }), 0, -0.025); break;
    case 'rock': add(new THREE.DodecahedronGeometry(0.045), std('#7f8c8d', { flatShading: true })); break;
    case 'soap': add(new THREE.BoxGeometry(0.08, 0.035, 0.05), std('#7fd3f5', { roughness: 0.2 })); break;
    case 'shoe': add(new THREE.BoxGeometry(0.06, 0.05, 0.13), std('#e8e8e8'), 0, 0, 0); add(new THREE.BoxGeometry(0.065, 0.015, 0.135), std('#c0392b'), 0, -0.03, 0); break;
    case 'candle': add(new THREE.CylinderGeometry(0.018, 0.018, 0.1, 8), std('#f5f0e0')); add(new THREE.SphereGeometry(0.01, 6, 4).scale(1, 2, 1), new THREE.MeshBasicMaterial({ color: '#ffb020' }), 0, 0.065); break;
  }
  return g;
}

// ---------- בועת אימוג׳י (Sprite) ----------
const bubbleCache = new Map();
export function bubbleTexture(text, { bg = '#ffffffee', fg = '#111', w = 128, h = 96 } = {}) {
  const key = text + bg + fg;
  if (bubbleCache.has(key)) return bubbleCache.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
  x.fillStyle = bg; x.beginPath(); x.roundRect(6, 6, w - 12, h - 30, 22); x.fill();
  x.beginPath(); x.moveTo(w / 2 - 12, h - 25); x.lineTo(w / 2, h - 6); x.lineTo(w / 2 + 12, h - 25); x.fill();
  x.fillStyle = fg; x.font = `${text.length > 3 ? 30 : 44}px sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, w / 2, (h - 24) / 2 + 4);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; bubbleCache.set(key, t);
  return t;
}
export function makeBubble() {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: bubbleTexture('…'), depthTest: true, transparent: true, fog: false }));
  s.scale.set(0.55, 0.41, 1); s.visible = false; s.userData.until = 0;
  s.show = (text, secs, now, opts) => { s.material.map = bubbleTexture(text, opts); s.material.needsUpdate = true; s.visible = true; s.userData.until = now + secs; };
  return s;
}

// ---------- צללים מזויפים (מישור עם צללית) ----------
function silhouette(monster) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128; const x = c.getContext('2d');
  x.fillStyle = '#000';
  if (!monster) {
    x.beginPath(); x.ellipse(32, 112, 9, 9, 0, 0, 7); x.fill();      // ראש (רחוק מהרגליים)
    x.fillRect(20, 62, 24, 42);                                       // גוף
    x.fillRect(12, 66, 6, 34); x.fillRect(46, 66, 6, 34);            // ידיים
    x.fillRect(22, 8, 8, 56); x.fillRect(34, 8, 8, 56);              // רגליים
  } else {
    x.beginPath(); x.ellipse(32, 104, 14, 11, 0, 0, 7); x.fill();
    x.beginPath(); x.moveTo(20, 108); x.lineTo(8, 126); x.lineTo(24, 112); x.fill();   // קרניים
    x.beginPath(); x.moveTo(44, 108); x.lineTo(56, 126); x.lineTo(40, 112); x.fill();
    x.beginPath(); x.moveTo(6, 96); x.lineTo(58, 96); x.lineTo(46, 52); x.lineTo(18, 52); x.fill(); // כתפיים רחבות
    for (const s of [-1, 1]) { x.beginPath(); x.moveTo(32 + s * 24, 94); x.lineTo(32 + s * 31, 50); x.lineTo(32 + s * 27, 40); x.lineTo(32 + s * 20, 88); x.fill(); } // זרועות + טפרים
    for (let i = 0; i < 4; i++) { x.beginPath(); x.moveTo(24 + i * 5, 70); x.quadraticCurveTo(4 + i * 18, 40, 10 + i * 14, 30); x.lineTo(14 + i * 14, 32); x.quadraticCurveTo(10 + i * 18, 44, 28 + i * 5, 70); x.fill(); } // מחושים
    x.fillRect(22, 8, 8, 46); x.fillRect(34, 8, 8, 46);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
let SH = null;
export function makeShadow() {
  SH ||= {
    geo: new THREE.PlaneGeometry(0.75, 1).translate(0, 0.5, 0).rotateX(-Math.PI / 2), // משתרע לאורך -Z
    human: silhouette(false), monster: silhouette(true),
  };
  const mat = new THREE.MeshBasicMaterial({ map: SH.human, color: '#000', transparent: true, opacity: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, fog: true });
  const m = new THREE.Mesh(SH.geo, mat); m.position.y = 0.025; m.renderOrder = 1;
  m.setMonster = (on) => { const t = on ? SH.monster : SH.human; if (mat.map !== t) { mat.map = t; mat.needsUpdate = true; } };
  /** dir = כיוון הצל על הקרקע (מנורמל), len = אורך במטרים */
  m.aim = (x, z, dx, dz, len, opacity, width = 1) => { m.position.x = x; m.position.z = z; m.rotation.y = Math.atan2(-dx, -dz); m.scale.set(width, 1, len); mat.opacity = opacity; };
  return m;
}

// ---------- רהוט עירוני ----------
/** buildProps(colliders) → { group, stalls:[{pos, face}], benches:[{pos, face}], cafe:[{pos, face}] } ; מוסיף colliders */
export function buildProps(colliders) {
  const group = new THREE.Group(); group.name = 'town-props';
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const col = (cx, cz, sx, sy, sz) => { const b = new THREE.Box3(V(cx - sx / 2, 0, cz - sz / 2), V(cx + sx / 2, sy, cz + sz / 2)); b.kind = 'prop'; colliders.push(b); };
  const wood = std('#8d6e4f'), metal = std('#3a3f47', { metalness: 0.5, roughness: 0.5 });
  const AW = ['#c0392b', '#2e86c1', '#27ae60', '#e67e22'];
  const stalls = [], benches = [], cafe = [];
  // דוכן: שולחן + 4 עמודים + גגון מפוספס + סחורה. face = הכיוון שהמוכר מסתכל אליו
  const stall = (x, z, rot, i) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; group.add(g);
    const t = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 0.9).translate(0, 0.45, 0), wood); g.add(t);
    for (const [px, pz] of [[-1.05, -0.4], [1.05, -0.4], [-1.05, 0.4], [1.05, 0.4]]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.3).translate(0, 1.15, 0), metal); p.position.set(px, 0, pz); g.add(p); }
    for (let k = 0; k < 5; k++) { const a = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.05, 1.3), std(k % 2 ? '#f5f5f0' : AW[i % 4])); a.position.set(-0.92 + k * 0.46, 2.3, 0.1); a.rotation.x = 0.15; g.add(a); }
    const goods = ['#c0392b', '#f4d03f', '#27ae60', '#e67e22'];
    for (let k = 0; k < 8; k++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), std(goods[(k + i) % 4], { roughness: 0.5 })); s.position.set(-0.85 + (k % 4) * 0.55 + (k > 3 ? 0.2 : 0), 0.95, k > 3 ? 0.15 : -0.15); g.add(s); }
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const along = Math.abs(sn) > 0.5;
    col(x, z, along ? 0.9 : 2.2, 1, along ? 2.2 : 0.9);
    // המוכר עומד מאחורי הדוכן (−Z מקומי), הקונה מלפנים (+Z מקומי)
    stalls.push({ seller: V(x - sn * 0.9, 0, z - cs * 0.9), buyer: V(x + sn * 1.1, 0, z + cs * 1.1), face: rot, faceBuyer: rot + Math.PI });
  };
  stall(11.5, -6.2, 0, 0); stall(15.5, -6.2, 0, 1); stall(-11.5, 6.6, Math.PI, 2); stall(-15.5, 6.6, Math.PI, 3);
  // ספסלים בכיכר
  const bench = (x, z, rot) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; group.add(g);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.45).translate(0, 0.45, 0), wood); g.add(seat);
    const backr = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, 0.06).translate(0, 0.75, -0.2), wood); g.add(backr);
    for (const px of [-0.7, 0.7]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.4).translate(0, 0.225, 0), metal); l.position.x = px; g.add(l); }
    const along = Math.abs(Math.sin(rot)) > 0.5;
    col(x, z, along ? 0.5 : 1.6, 0.5, along ? 1.6 : 0.5);
    benches.push({ pos: V(x + Math.sin(rot) * 0.7, 0, z + Math.cos(rot) * 0.7), face: rot });
  };
  bench(0, 4.6, 0); bench(0, -4.6, Math.PI); bench(4.6, 0, Math.PI / 2); bench(-4.6, 0, -Math.PI / 2);
  bench(-3.5, 15, Math.PI / 2); bench(3.5, -16, -Math.PI / 2);
  // בית קפה: שולחנות עגולים + שמשיות
  const table = (x, z, c) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); group.add(g);
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 14).translate(0, 0.75, 0), std('#ecf0f1')));
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 6).translate(0, 1.1, 0), metal));
    g.add(new THREE.Mesh(new THREE.ConeGeometry(1.1, 0.4, 8).translate(0, 2.25, 0), std(c)));
    col(x, z, 0.8, 0.8, 0.8);
    for (const a of [0.4, 2.6]) cafe.push({ pos: V(x + Math.sin(a) * 0.8, 0, z + Math.cos(a) * 0.8), face: a + Math.PI });
  };
  table(-12, 2.5, '#e84393'); table(-15, 2.2, '#00b894'); table(-18, 2.8, '#fdcb6e');
  mergeStatic(group); // כל הרהוט = draw call אחד
  return { group, stalls, benches, cafe };
}

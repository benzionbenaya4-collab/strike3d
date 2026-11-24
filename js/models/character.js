// דמות השחקן – לפי refs/player-*.jpg: שיער פרוע אנימה, מסכה, קפוצ'ון עם ברדס, אפוד טקטי עם כיסים,
// מכנסי דגמ"ח עם כיסי צד, נעליים גבוהות עם סוליה עבה.
// בנוי על השלד של core/anim.js (makeRig – אותם מפרקים ומידות), כך שה-Animator עובד כמו שהוא.
// ביצועים: כל החלקים של כל מפרק מאוחדים לרשת אחת לכל סוג חומר (צבע = vertex colors) → ~40 draw calls לדמות.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeRig, Animator, DIM } from '../core/anim.js';
import { skin as skinById } from '../data/skins.js';
import { buildKnife } from './knife.js';

// ---------- פלטות ----------
// צבעים "אמיתיים" לדמות הבסיסית + פלטה לכל סקין מ-data/skins.js. glow = פסים זוהרים (או null).
const BASE = {
  hoodie: '#6a7486', hoodieDk: '#4d5566', vest: '#6f7a4a', pouch: '#5f6a3e', strap: '#24262b', metal: '#a9afb8',
  pants: '#a8966f', pantsDk: '#857555', boots: '#4a3a2c', sole: '#d8d2c4', lace: '#c9b99a',
  skin: '#eec4a0', hair: '#2a2633', hairHi: '#433d5c', mask: '#1c1d22', glove: '#26282d', eye: '#3c6e9e', glow: null,
};
const OUTFITS = {
  default: {},
  camo:   { hoodie: '#4f5a36', hoodieDk: '#3c4429', vest: '#6b5f3f', pouch: '#5a4f33', pants: '#5c6a3e', pantsDk: '#44502e', boots: '#3b3324', sole: '#5b5140', eye: '#5d7b3a' },
  neon:   { hoodie: '#17191f', hoodieDk: '#0e0f13', vest: '#1f2229', pouch: '#262a33', pants: '#1c1e24', pantsDk: '#121318', boots: '#101114', sole: '#1c1e24', lace: '#22f0ff', hair: '#101820', hairHi: '#22f0ff', eye: '#22f0ff', glow: '#22f0ff' },
  ice:    { hoodie: '#dff3ff', hoodieDk: '#a9d6f0', vest: '#5aa7d6', pouch: '#4b93c2', pants: '#9fc6dd', pantsDk: '#7fa9c2', boots: '#2d4f66', sole: '#eaf7ff', hair: '#cfefff', hairHi: '#ffffff', mask: '#2d4f66', eye: '#7fe7ff', glow: '#9ff3ff' },
  lava:   { hoodie: '#2a1410', hoodieDk: '#1a0b08', vest: '#3a1c12', pouch: '#4a2416', pants: '#231210', pantsDk: '#140805', boots: '#140805', sole: '#2a1410', lace: '#ff5a1f', hair: '#1a0c08', hairHi: '#ff5a1f', eye: '#ff7a2f', glow: '#ff5a1f' },
  gold:   { hoodie: '#f1ead8', hoodieDk: '#d6ccb2', vest: '#e8b93a', pouch: '#c99a26', strap: '#5a3b0c', metal: '#ffd45a', pants: '#3a2a12', pantsDk: '#2a1e0c', boots: '#5a3b0c', sole: '#e8b93a', lace: '#ffd45a', hair: '#e8b93a', hairHi: '#fff0a8', eye: '#b8860b' },
  galaxy: { hoodie: '#2b1450', hoodieDk: '#1b0b36', vest: '#3a1f6b', pouch: '#4a2a85', pants: '#1a0f33', pantsDk: '#0d0820', boots: '#0d0820', sole: '#3a1f6b', lace: '#c77dff', hair: '#1a0f33', hairHi: '#c77dff', mask: '#0d0820', eye: '#c77dff', glow: '#c77dff' },
};

/** skin: מזהה מ-data/skins.js, אובייקט סקין משם, או אובייקט צבעים חלקי (מפתחות של BASE). */
export function outfitFor(skin = 'default') {
  if (skin && typeof skin === 'object' && !skin.id) return { ...BASE, ...skin };
  const s = typeof skin === 'string' ? skinById(skin) : skin;
  if (OUTFITS[s.id]) return { ...BASE, ...OUTFITS[s.id] };
  // סקין חדש שלא מוגדר כאן – נגזר מצבעי הנשק a/b/glow
  return { ...BASE, vest: s.a, pouch: s.a, hoodie: s.b, hoodieDk: s.b, boots: s.b, hairHi: s.glow || BASE.hairHi, eye: s.glow || BASE.eye, glow: s.glow };
}

// ---------- בניית גאומטריה ----------
const _c = new THREE.Color();
const rnd = (seed) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646; // אקראי קבוע (אותה דמות בכל פעם)

function makeBuilder(C) {
  const parts = new Map(); // bone -> { cloth:[], hard:[], glow:[] }
  const E = new THREE.Euler(), Qt = new THREE.Quaternion(), M = new THREE.Matrix4(), P = new THREE.Vector3(), S = new THREE.Vector3();
  function put(bone, geo, color, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1], q = null, kind = 'cloth' } = {}) {
    if (!geo.index) indexed(geo);
    M.compose(P.set(...p), q || Qt.setFromEuler(E.set(...r)), S.set(...s));
    geo.applyMatrix4(M);
    _c.set(C[color] || color).convertSRGBToLinear();
    const n = geo.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (!parts.has(bone)) parts.set(bone, { cloth: [], hard: [], glow: [] });
    parts.get(bone)[kind].push(geo);
  }
  function bake(mats) {
    for (const [bone, kinds] of parts) for (const k in kinds) {
      if (!kinds[k].length) continue;
      const g = mergeGeometries(kinds[k], false);
      kinds[k].forEach((x) => x.dispose());
      const m = new THREE.Mesh(g, mats[k]); m.name = bone.name + '_' + k; m.castShadow = true;
      bone.add(m);
    }
  }
  return { put, bake };
}

// גאומטריות בסיס – עגולות ככל האפשר (lathe / קפסולות / קופסאות מעוגלות)
const indexed = (g) => { const n = g.attributes.position.count; g.setIndex([...Array(n).keys()]); return g; };
const rbox = (w, h, d, r = 0.012) => new RoundedBoxGeometry(w, h, d, 1, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
const cyl = (rt, rb, h, seg = 12) => new THREE.CylinderGeometry(rt, rb, h, seg, 1);
const sph = (r, ws = 12, hs = 8, ...a) => new THREE.SphereGeometry(r, ws, hs, ...a);
const cone = (r, h, seg = 5) => new THREE.ConeGeometry(r, h, seg, 1);
const ring = (R, t, rs = 6, ts = 14, arc = Math.PI * 2) => new THREE.TorusGeometry(R, t, rs, ts, arc);
const cap = (r, len, seg = 8) => new THREE.CapsuleGeometry(r, len, 3, seg);
/** פרופיל [[רדיוס, גובה], …] מלמטה למעלה → גוף סיבוב (בגדים רחבים, קפלים, שרוולים) */
const lathe = (pts, seg = 14) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
const UP = new THREE.Vector3(0, 1, 0);

/**
 * buildCharacter({ pose, skin, weapon })
 * pose: 'unarmed' | 'pistol' | 'rifle' | 'knife' (אחרים לפי holdType) · skin: מזהה סקין · weapon: מודל נשק (אופציונלי;
 * לסכין נבנה אוטומטית). מחזיר rig = { root, j, anim, outfit, setWeapon(model, id) } – root להוסיף לסצנה, anim.update(dt, …) בכל פריים.
 */
export function buildCharacter({ pose = 'unarmed', skin = 'default', weapon = null } = {}) {
  const C = outfitFor(skin);
  const rig = makeRig(); const j = rig.j;
  const B = makeBuilder(C); const put = B.put;
  const glowK = C.glow ? 'glow' : 'hard';
  const R = rnd(7);

  // ===== אגן: מכנסיים, חגורה, כיסי חגורה =====
  put(j.hips, sph(1, 14, 10), 'pants', { p: [0, -0.01, 0], s: [0.15, 0.12, 0.105] });
  put(j.hips, lathe([[0.158, 0.045], [0.162, 0.065], [0.158, 0.085]], 18), 'strap', { s: [1, 1, 0.7] });
  put(j.hips, rbox(0.058, 0.04, 0.02, 0.006), 'metal', { p: [0, 0.065, 0.113], kind: 'hard' });
  put(j.hips, rbox(0.034, 0.022, 0.024, 0.004), 'strap', { p: [0, 0.065, 0.116] });
  for (const sx of [1, -1]) {
    put(j.hips, rbox(0.05, 0.085, 0.085, 0.014), 'pouch', { p: [sx * 0.158, 0.035, 0.04], r: [0, sx * 0.4, 0] });
    put(j.hips, rbox(0.056, 0.03, 0.09, 0.01), 'vest', { p: [sx * 0.16, 0.08, 0.04], r: [0, sx * 0.4, 0] });
    put(j.hips, rbox(0.05, 0.075, 0.07, 0.014), 'pouch', { p: [sx * 0.125, 0.04, -0.09], r: [0, -sx * 0.5, 0] });
  }
  if (C.glow) put(j.hips, cyl(0.164, 0.164, 0.006, 18), 'glow', { p: [0, 0.086, 0], s: [1, 1, 0.71], kind: 'glow' });

  // ===== בטן: קפוצ'ון רחב, שוליים מצולעים, כיס קנגורו =====
  put(j.spine, lathe([[0.158, 0.0], [0.152, 0.06], [0.148, 0.13], [0.155, 0.2], [0.16, 0.25]], 18), 'hoodie', { s: [1.06, 1, 0.72] });
  put(j.spine, lathe([[0.152, -0.035], [0.166, -0.025], [0.162, -0.01], [0.167, 0.0], [0.158, 0.012]], 18), 'hoodieDk', { s: [1, 1, 0.7] });
  put(j.spine, rbox(0.22, 0.11, 0.022, 0.012), 'hoodie', { p: [0, 0.075, 0.104], r: [-0.06, 0, 0] }); // כיס קנגורו
  for (const sx of [1, -1]) put(j.spine, rbox(0.012, 0.08, 0.026, 0.004), 'hoodieDk', { p: [sx * 0.104, 0.07, 0.104], r: [-0.06, 0, sx * 0.35] }); // פתחי הכיס
  put(j.spine, rbox(0.21, 0.01, 0.024, 0.004), 'hoodieDk', { p: [0, 0.128, 0.102] });

  // ===== חזה: קפוצ'ון, כתפיים, אפוד, כיסים, ברדס =====
  put(j.chest, lathe([[0.158, -0.02], [0.164, 0.08], [0.17, 0.16], [0.168, 0.215], [0.14, 0.262], [0.09, 0.288], [0.05, 0.296]], 18), 'hoodie', { s: [1.08, 1, 0.68] });
  for (const sx of [1, -1]) put(j.chest, sph(0.08, 12, 8), 'hoodie', { p: [sx * 0.172, 0.2, 0], s: [1, 0.95, 1] });
  // אפוד (chest rig): לוח קדמי + אחורי מעוגלים, חגורת צד
  put(j.chest, rbox(0.27, 0.17, 0.045, 0.018), 'vest', { p: [0, 0.095, 0.105], r: [-0.04, 0, 0] });
  put(j.chest, rbox(0.27, 0.2, 0.04, 0.018), 'vest', { p: [0, 0.11, -0.105] });
  put(j.chest, lathe([[0.172, -0.02], [0.176, 0.02], [0.176, 0.07], [0.172, 0.09]], 18), 'vest', { s: [1, 1, 0.7] });
  for (const y of [0.15, 0.172]) put(j.chest, rbox(0.25, 0.007, 0.006, 0.002), 'strap', { p: [0, y, 0.129] }); // MOLLE
  // כתפיות: קשת מעל הכתף מלפנים לאחור
  for (const sx of [1, -1]) {
    put(j.chest, ring(0.105, 0.01, 4, 12, Math.PI), 'vest', { p: [sx * 0.095, 0.18, 0], r: [0, Math.PI / 2, 0], s: [1, 1, 2.6] });
    for (const a of [0.45, 0.75]) put(j.chest, rbox(0.054, 0.007, 0.012, 0.002), 'strap', { p: [sx * 0.095, 0.18 + Math.sin(a) * 0.105, Math.cos(a) * 0.105 + 0.006] });
  }
  // 4 כיסי מחסניות + דשים + לחצנים
  for (let i = 0; i < 4; i++) {
    const x = -0.093 + i * 0.062;
    put(j.chest, rbox(0.056, 0.09, 0.046, 0.012), 'pouch', { p: [x, 0.06, 0.145] });
    put(j.chest, rbox(0.06, 0.028, 0.052, 0.01), 'vest', { p: [x, 0.103, 0.146] });
    put(j.chest, cyl(0.006, 0.006, 0.004, 8), 'metal', { p: [x, 0.098, 0.173], r: [Math.PI / 2, 0, 0], kind: 'hard' });
  }
  put(j.chest, rbox(0.042, 0.06, 0.032, 0.01), 'pouch', { p: [0.095, 0.215, 0.125], r: [-0.55, 0, 0] }); // כיס קשר
  put(j.chest, cyl(0.004, 0.004, 0.08, 5), 'strap', { p: [0.108, 0.27, 0.115], r: [-0.4, 0, 0] });       // אנטנה
  if (C.glow) for (const sx of [1, -1]) put(j.chest, rbox(0.006, 0.15, 0.006, 0.002), 'glow', { p: [sx * 0.13, 0.095, 0.129], kind: 'glow' });
  // ברדס מקופל מאחורי הצוואר (צווארון עבה + ברדס תלוי על הגב)
  put(j.chest, ring(0.08, 0.034, 8, 18), 'hoodie', { p: [0, 0.282, -0.01], r: [Math.PI / 2 - 0.25, 0, 0], s: [1.1, 1.12, 1] });
  for (const sx of [1, -1]) put(j.chest, sph(0.06, 10, 8), 'hoodie', { p: [sx * 0.07, 0.3, -0.08], s: [1, 0.8, 0.9] }); // קפלי ברדס
  put(j.chest, sph(0.065, 10, 8), 'hoodie', { p: [0, 0.31, -0.1], s: [1.2, 0.85, 0.9] });
  put(j.chest, sph(0.14, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), 'hoodie', { p: [0, 0.255, -0.13], r: [-2.05, 0, 0], s: [0.95, 0.85, 0.62] });
  put(j.chest, sph(0.12, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.6), 'hoodieDk', { p: [0, 0.266, -0.128], r: [-2.05, 0, 0], s: [0.9, 0.78, 0.52] });
  // שרוכי ברדס תלויים מעל האפוד
  for (const sx of [1, -1]) {
    put(j.chest, cyl(0.0042, 0.0042, 0.1, 5), C.glow ? 'glow' : 'sole', { p: [sx * 0.03, 0.225, 0.132], r: [0.12, 0, sx * 0.06], kind: glowK });
    put(j.chest, cyl(0.0065, 0.0065, 0.016, 6), 'metal', { p: [sx * 0.033, 0.172, 0.138], kind: 'hard' });
  }

  // ===== צוואר: מסכת צוואר =====
  put(j.neck, lathe([[0.066, -0.03], [0.056, 0.02], [0.052, 0.07], [0.054, 0.1]], 14), 'mask', { kind: 'hard' });

  // ===== ראש =====
  const HY = 0.1; // מרכז הראש
  put(j.head, sph(0.11, 18, 14), 'skin', { p: [0, HY, 0], s: [0.9, 1.05, 1] });
  put(j.head, sph(0.08, 12, 8), 'skin', { p: [0, HY - 0.045, 0.02], s: [0.95, 0.8, 1] }); // לסת צרה
  for (const sx of [1, -1]) put(j.head, sph(0.024, 8, 6), 'skin', { p: [sx * 0.098, HY - 0.005, -0.008], s: [0.5, 1, 0.8] }); // אוזניים
  // מסכה: מכסה אף ופה עד ממש מתחת לעיניים, ממשיכה לצוואר
  put(j.head, sph(0.1135, 20, 12, -Math.PI * 0.06, Math.PI * 1.12, Math.PI * 0.475, Math.PI * 0.5), 'mask', { p: [0, HY, 0.003], s: [0.92, 1.06, 1.04], kind: 'hard' });
  put(j.head, sph(0.084, 14, 8), 'mask', { p: [0, HY - 0.048, 0.024], s: [0.97, 0.82, 1.03], kind: 'hard' });
  // גבות כועסות
  for (const sx of [1, -1]) put(j.head, rbox(0.044, 0.011, 0.012, 0.004), 'mask', { p: [sx * 0.042, HY + 0.045, 0.103], r: [0, sx * 0.35, sx * 0.3], kind: 'hard' });
  // שיער: כיפה נפוחה + חלק אחורי
  put(j.head, sph(0.136, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.44), 'hair', { p: [0, HY + 0.014, -0.01], s: [1.0, 1.05, 1.06] });
  put(j.head, sph(0.132, 14, 8, Math.PI, Math.PI, 0, Math.PI * 0.74), 'hair', { p: [0, HY + 0.006, -0.014], s: [0.98, 1, 1.05] });
  // קווצות: צינור מתחדד לאורך עקומה רכה – יוצא מהקרקפת, מתעגל ונופל הצידה ולמטה (כמו ברפרנס)
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const lock = (base, out, fall, len, r, color = 'hair') => {
    const b = V3(...base), o = V3(...out).normalize(), f = V3(...fall).normalize();
    const pts = [b.clone()];
    for (let k = 1; k <= 3; k++) { // כיוון מתחלף בהדרגה מ"החוצה" ל"נופל", עם גל קטן
      const t = k / 3, d = o.clone().lerp(f, t * t).normalize();
      const w = V3(-d.z, 0, d.x).multiplyScalar(Math.sin(k * 2.1 + b.x * 40) * 0.12 * len);
      pts.push(pts[k - 1].clone().addScaledVector(d, len / 3).add(w));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const TS = 6, RS = 5, g = new THREE.TubeGeometry(curve, TS, r, RS, false);
    const pos = g.attributes.position, c = V3(0, 0, 0), v = V3(0, 0, 0);
    for (let i = 0; i <= TS; i++) {
      curve.getPointAt(i / TS, c);
      const k = 1 - 0.9 * (i / TS) ** 1.8; // מתחדד לקצה
      for (let jj = 0; jj <= RS; jj++) { const n = i * (RS + 1) + jj; v.fromBufferAttribute(pos, n).sub(c).multiplyScalar(k).add(c); pos.setXYZ(n, v.x, v.y, v.z); }
    }
    g.computeVertexNormals();
    put(j.head, g, color, { p: [0, HY, 0] });
  };
  // כתר: קווצות שעולות החוצה ונופלות לצדדים/אחורה – נפח גדול
  for (let row = 0; row < 3; row++) {
    const n = [9, 10, 7][row], el = [0.55, 0.95, 1.3][row];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + row * 0.3 + R() * 0.25;
      const sx = Math.sin(a), cz = Math.cos(a);
      if (row < 2 && cz > 0.55) continue; // החזית – פוני בנפרד
      const sr = Math.sin(el) * 0.12, y = Math.cos(el) * 0.125 + 0.01;
      const base = [sx * sr, y + 0.005, cz * sr - 0.01];
      lock(base, [sx * 0.7, 1.2 - row * 0.25, cz * 0.7 - 0.25], [sx * 1.0 + 0.9 + (R() - 0.5) * 0.5, -0.1 - row * 0.2, cz * 0.7 - 0.4], 0.09 + R() * 0.045, 0.036 + R() * 0.01, (i + row) % 3 ? 'hair' : 'hairHi');
    }
  }
  // קווצות גבוהות ופרועות בקודקוד, נוטות לצד אחד
  for (let i = 0; i < 6; i++) { const x = -0.05 + i * 0.02; lock([x, 0.125, -0.03 + R() * 0.04], [0.3 + x * 3, 1.6, -0.2 + R() * 0.3], [1.2, 0.1, 0.2 - R() * 0.6], 0.12 + R() * 0.05, 0.038, i % 2 ? 'hair' : 'hairHi'); }
  // קווצות עליונות שמתהפכות קדימה מעל המצח
  for (const x of [-0.06, -0.02, 0.025, 0.065]) lock([x * 0.8, 0.12, 0.0], [x * 4, 1, 0.6], [0.6 + x * 4, -0.3, 1], 0.11 + R() * 0.03, 0.038, x > 0 ? 'hair' : 'hairHi');
  // פוני: נופל קדימה ולמטה על המצח ועל העיניים, גורף הצידה (רווחים מול העיניים)
  const BANG = [[-0.088, 0.1], [-0.062, 0.09], [-0.02, 0.105], [0.008, 0.115], [0.055, 0.085], [0.08, 0.1], [0.1, 0.09]];
  BANG.forEach(([x, len], i) => lock([x * 0.85, 0.085, 0.07 - Math.abs(x) * 0.3], [x * 2, 0.4, 1], [0.35 + x * 2, -1, 0.45], len, 0.03, i % 2 ? 'hair' : 'hairHi'));
  // פאות ועורף – נופלים למטה
  for (const sx of [1, -1]) for (let i = 0; i < 3; i++) lock([sx * 0.1, 0.04, 0.045 - i * 0.05], [sx, 0.3, 0.2], [sx * 0.7, -0.8, 0.15 - i * 0.2], 0.075, 0.03, i === 1 ? 'hairHi' : 'hair');
  for (let i = 0; i < 6; i++) { const a = -0.9 + i * 0.36; lock([Math.sin(a) * 0.08, 0.02, -0.1], [Math.sin(a) * 0.5, 0.1, -1], [Math.sin(a) * 0.6, -0.7, -0.6], 0.08 + R() * 0.02, 0.034); }
  // עיניים אנימה (רשת נפרדת לכל עין – בשביל מצמוץ): לבן + אישון + ריס עליון
  const eyeMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  j.head.userData.eyes = [1, -1].map((sx) => {
    const parts = [];
    const add = (g, color, p, s = [1, 1, 1]) => { g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion(), new THREE.Vector3(...s))); _c.set(color).convertSRGBToLinear(); const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([_c.r, _c.g, _c.b], i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.deleteAttribute('uv'); g.deleteAttribute('normal'); parts.push(g); };
    add(new THREE.CircleGeometry(0.019, 6), '#f4f6fa', [0, 0, 0], [1.35, 0.5, 1]); // עין צרה וחדה (משושה פחוס)
    add(new THREE.CircleGeometry(0.0105, 12), C.eye, [-sx * 0.003, -0.0015, 0.0015], [0.85, 0.85, 1]);
    add(new THREE.CircleGeometry(0.005, 8), '#0b0c10', [-sx * 0.003, -0.0015, 0.0025], [0.8, 1, 1]);
    add(new THREE.CircleGeometry(0.0024, 6), '#ffffff', [-sx * 0.006, 0.002, 0.0035]);
    { const l = new THREE.PlaneGeometry(0.056, 0.0075); l.rotateZ(sx * 0.16); add(l, '#101114', [sx * 0.002, 0.0085, 0.004]); } // ריס עליון עבה ומשופע
    add(new THREE.PlaneGeometry(0.03, 0.003), '#101114', [-sx * 0.006, -0.0095, 0.004]);
    const e = new THREE.Mesh(mergeGeometries(parts), eyeMat);
    e.position.set(sx * 0.04, HY + 0.024, 0.1); e.rotation.set(-0.08, sx * 0.38, -sx * 0.12);
    j.head.add(e); return e;
  });

  // ===== ידיים: שרוולים רחבים מקומטים, חפת מצולע, רצועת יד, כפפה בלי אצבעות =====
  for (const s of ['L', 'R']) {
    const sx = s === 'L' ? 1 : -1;
    const U = j['upperArm' + s], F = j['foreArm' + s], H = j['hand' + s];
    put(U, lathe([[0.062, -0.29], [0.068, -0.26], [0.072, -0.2], [0.07, -0.14], [0.074, -0.08], [0.068, 0.0], [0.05, 0.04]], 12), 'hoodie', { s: [1.12, 1, 1.12] });
    put(U, rbox(0.006, 0.2, 0.01, 0.002), 'hoodieDk', { p: [sx * 0.08, -0.13, 0] }); // תפר
    put(F, lathe([[0.058, -0.125], [0.068, -0.112], [0.063, -0.095], [0.071, -0.075], [0.064, -0.055], [0.07, -0.03], [0.064, 0.0], [0.058, 0.03]], 12), 'hoodie', { s: [1.1, 1, 1.1] });
    put(F, lathe([[0.04, -0.17], [0.054, -0.165], [0.058, -0.158], [0.055, -0.15], [0.058, -0.142], [0.055, -0.134], [0.058, -0.126], [0.052, -0.118]], 12), 'hoodieDk'); // חפת מצולע
    put(F, lathe([[0.033, -0.262], [0.035, -0.235], [0.04, -0.19], [0.042, -0.16]], 10), 'skin');
    put(F, cyl(0.039, 0.038, 0.024, 10), 'strap', { p: [0, -0.235, 0] }); // רצועת יד
    if (C.glow) put(F, cyl(0.041, 0.041, 0.006, 10), 'glow', { p: [0, -0.235, 0], kind: 'glow' });
    // אגרוף גדול (קו המפרקים לאורך Z, גב היד החוצה = sx·X): כפפה בלי אצבעות – אצבעות חשופות מעבר למפרקים
    put(H, rbox(0.056, 0.066, 0.092, 0.017), 'glove', { p: [0, -0.042, 0], kind: 'hard' });
    put(H, rbox(0.018, 0.024, 0.094, 0.008), 'glove', { p: [sx * 0.025, -0.07, 0], kind: 'hard' });
    put(H, rbox(0.054, 0.012, 0.094, 0.004), 'glove', { p: [0, -0.076, 0], kind: 'hard' }); // שפת הכפפה
    put(H, rbox(0.05, 0.036, 0.088, 0.013), 'skin', { p: [-sx * 0.004, -0.098, 0] });
    put(H, cap(0.014, 0.03, 6), 'skin', { p: [-sx * 0.018, -0.058, 0.05], r: [0.35, 0, 0] });
  }

  // ===== רגליים: דגמ"ח רחב, כיסי צד, רתמת ירך, מגני ברכיים, קפלים בקרסול, נעלי סניקר־בוט =====
  for (const s of ['L', 'R']) {
    const sx = s === 'L' ? 1 : -1;
    const T = j['thigh' + s], S = j['shin' + s], Ft = j['foot' + s];
    put(T, lathe([[0.078, -0.47], [0.084, -0.42], [0.09, -0.3], [0.094, -0.18], [0.098, -0.07], [0.098, 0.0], [0.085, 0.04]], 14), 'pants', { s: [1.12, 1, 1.12] });
    put(T, rbox(0.006, 0.36, 0.01, 0.002), 'pantsDk', { p: [sx * 0.091, -0.22, 0] });
    put(T, rbox(0.032, 0.12, 0.105, 0.012), 'pants', { p: [sx * 0.105, -0.275, 0.005] }); // כיס דגמ"ח
    put(T, rbox(0.036, 0.034, 0.11, 0.01), 'pantsDk', { p: [sx * 0.107, -0.222, 0.005] });
    if (s === 'R') { // רתמת ירך עם כיס
      for (const y of [-0.1, -0.23]) put(T, ring(0.106, 0.007, 4, 16), 'strap', { p: [0, y, 0], r: [Math.PI / 2, 0, 0] });
      put(T, rbox(0.024, 0.2, 0.095, 0.01), 'vest', { p: [-0.114, -0.14, 0] });
      put(T, rbox(0.05, 0.1, 0.085, 0.015), 'pouch', { p: [-0.135, -0.15, 0] });
      put(T, rbox(0.054, 0.03, 0.09, 0.01), 'vest', { p: [-0.137, -0.103, 0] });
      put(T, rbox(0.012, 0.18, 0.012, 0.004), 'strap', { p: [-0.06, 0.05, 0.06], r: [0, 0, 0.15] }); // רצועה לחגורה
    }
    // שוק רחבה עם קפלים שנאספים מעל הנעל
    put(S, lathe([[0.072, -0.36], [0.088, -0.345], [0.079, -0.325], [0.09, -0.305], [0.08, -0.285], [0.087, -0.262], [0.078, -0.232], [0.075, -0.15], [0.077, -0.06], [0.08, 0.0], [0.07, 0.04]], 14), 'pants', { s: [1.14, 1, 1.14] });
    // מגן ברך מעוגל
    put(S, rbox(0.1, 0.11, 0.034, 0.014), 'pantsDk', { p: [0, -0.02, 0.08], r: [0.08, 0, 0] });
    put(S, rbox(0.075, 0.07, 0.012, 0.006), C.glow ? 'glow' : 'pouch', { p: [0, -0.02, 0.098], r: [0.08, 0, 0], kind: C.glow ? 'glow' : 'cloth' });
    // שרוול הנעל + ריפוד + רצועה
    put(S, lathe([[0.078, -0.43], [0.076, -0.39], [0.072, -0.36], [0.074, -0.345]], 14), 'boots', { s: [1.15, 1, 1.15], p: [0, 0, 0.004], kind: 'hard' });
    put(S, ring(0.083, 0.012, 6, 14), 'boots', { p: [0, -0.345, 0.004], r: [Math.PI / 2, 0, 0], kind: 'hard' });
    put(S, cyl(0.09, 0.09, 0.022, 14), 'strap', { p: [0, -0.375, 0.004] });
    put(S, rbox(0.02, 0.022, 0.008, 0.003), 'metal', { p: [sx * 0.05, -0.375, 0.076], kind: 'hard' });
    // כף רגל: גוף מעוגל, אף, לשונית, שרוכים, סוליה עבה בהירה עם פס
    put(Ft, rbox(0.112, 0.085, 0.2, 0.032), 'boots', { s: [1.25, 1.2, 1.15], p: [0, 0.018, 0.035], kind: 'hard' });
    put(Ft, sph(0.06, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), 'boots', { p: [0, -0.005, 0.13], s: [1.18, 0.75, 1.2], kind: 'hard' });
    put(Ft, rbox(0.06, 0.05, 0.03, 0.01), 'boots', { s: [1.25, 1.2, 1.15], p: [0, 0.055, 0.045], r: [0.4, 0, 0], kind: 'hard' });
    for (let i = 0; i < 4; i++) for (const sx of [1, -1]) put(Ft, rbox(0.05, 0.007, 0.011, 0.003), C.glow ? C.glow : 'lace', { p: [0, 0.066 - i * 0.007, 0.1 + i * 0.016], r: [0.6, 0, sx * 0.4] }); // שרוכים בהצלבה
    put(Ft, rbox(0.122, 0.05, 0.27, 0.016), 'sole', { s: [1.25, 1.2, 1.15], p: [0, -0.018, 0.045], kind: 'hard' });
    put(Ft, rbox(0.134, 0.03, 0.29, 0.012), 'sole', { s: [1.25, 1.2, 1.15], p: [0, -0.048, 0.045], kind: 'hard' }); // סוליה עבה, מתרחבת מעט למטה
    put(Ft, rbox(0.134, 0.008, 0.288, 0.004), 'strap', { s: [1.25, 1.2, 1.15], p: [0, -0.036, 0.045], kind: 'hard' });
    put(Ft, rbox(0.12, 0.04, 0.05, 0.015), 'boots', { s: [1.25, 1.2, 1.15], p: [0, 0.0, -0.07], kind: 'hard' }); // עקב
  }

  // חומרים: בד מט, קשיח מבריק־למחצה, זוהר
  const mats = {
    cloth: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.02 }),
    hard: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.15 }),
    glow: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, emissive: C.glow || '#000', emissiveIntensity: 1.4 }),
  };
  B.bake(mats);

  rig.outfit = C;
  rig.pose = pose;
  rig.anim = new Animator(rig);
  rig.setWeapon = (model, id) => { rig.anim.setWeapon(model, model ? id : null); rig.weapon = model; };
  if (weapon) rig.setWeapon(weapon, pose === 'unarmed' ? weapon.userData?.weaponId : pose);
  else if (pose === 'knife') rig.setWeapon(buildKnife(typeof skin === 'string' ? skin : 'default'), 'knife');
  return rig;
}

/**
 * הכנה לקובץ GLB עתידי: טוען GLB ומצמיד את החלקים שלו לאותו שלד, כך שה-Animator ממשיך לעבוד.
 * חוזה: לכל node ב-GLB שהשם שלו הוא שם מפרק (hips, spine, chest, neck, head, upperArmL, foreArmL, handL, …, thighR, shinR, footR)
 * – הרשתות שמתחתיו עוברות למפרק הזה, במיקום יחסי למפרק (יחידה = מטר, פנים ל-+Z, Y למעלה).
 * keepProcedural=false מסתיר את הגוף הפרוצדורלי. אם אין שום מפרק מוכר – כל הסצנה נצמדת ל-root (בלי אנימציה של איברים).
 */
export async function loadCharacterGLB(url, { skin = 'default', pose = 'unarmed', keepProcedural = false } = {}) {
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const gltf = await new GLTFLoader().loadAsync(url);
  const rig = buildCharacter({ skin, pose });
  if (!keepProcedural) rig.root.traverse((o) => { if (o.isMesh && !rig.j.head.userData.eyes.includes(o)) o.visible = false; });
  let matched = 0;
  gltf.scene.updateMatrixWorld(true);
  for (const name of Object.keys(rig.j)) {
    const node = gltf.scene.getObjectByName(name);
    if (!node) continue;
    matched++;
    for (const child of [...node.children]) if (!rig.j[child.name]) rig.j[name].add(child);
  }
  if (!matched) rig.root.add(gltf.scene);
  rig.glb = gltf;
  return rig;
}

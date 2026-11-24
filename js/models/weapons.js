// נשקים פרוצדורליים – כל הנשקים חוץ מסכין (models/knife.js).
// חוזה (כמו tempRifle ב-modes/animlab.js): ציר +X = קדימה (קנה), Y למעלה, יחידה = מטר.
// userData: gripPoint (יד ימין, ראש האחיזה), supportPoint (יד שמאל, צד ‎-Z = שמאל הדמות),
//           magPoint (מחסנית / טעינה), muzzle (פתח הקנה), length, weaponId, skin.
// אופציונלי: sightPoint (נקודת עין לכיוון), scope (לצלף), animate(t) (פעימת זוהר).
import * as THREE from 'three';
import { skin as getSkin } from '../data/skins.js';
import { buildKnife } from './knife.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------- חומרים לפי סקין ----------
function makeMats(s) {
  const gold = s.id === 'gold', ice = s.id === 'ice';
  const em = s.glow ? { emissive: s.glow, emissiveIntensity: 0.025 } : {};
  const std = (color, metalness, roughness, extra = {}) => new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra });
  return {
    glowColor: s.glow,
    body: std(s.a, gold ? 0.95 : ice ? 0.35 : 0.6, gold ? 0.22 : ice ? 0.18 : 0.42, em),          // מתכת גוף (צבע הסקין)
    poly: std(s.b, gold ? 0.5 : 0.12, gold ? 0.45 : 0.78),                                          // פולימר / ריהוט
    dark: std('#1c1e22', 0.55, 0.5),                                                                 // חלקים שחורים
    steel: std(gold ? '#f3d27a' : '#a2a9b2', 0.92, 0.28),                                            // קנה, ברגים
    hole: new THREE.MeshBasicMaterial({ color: '#050506' }),                                          // פתחים
    rubber: std('#121315', 0, 0.95),
    glass: std('#123247', 0.9, 0.05, { emissive: '#0b3a58', emissiveIntensity: 0.35 }),
    glow: s.glow ? new THREE.MeshBasicMaterial({ color: s.glow }) : null,
  };
}

// ---------- עוזרי גאומטריה ----------
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
/** גליל לאורך X: rBack בצד ‎-X, rFront בצד ‎+X */
function cylX(rBack, rFront, len, seg = 14, open = false) {
  const g = new THREE.CylinderGeometry(rFront, rBack, len, seg, 1, open);
  g.rotateZ(-Math.PI / 2);
  return g;
}
const cylY = (r, len, seg = 12) => new THREE.CylinderGeometry(r, r, len, seg);
const cylZ = (r, len, seg = 12) => { const g = new THREE.CylinderGeometry(r, r, len, seg); g.rotateX(Math.PI / 2); return g; };
const ringX = (r, tube, seg = 18) => { const g = new THREE.TorusGeometry(r, tube, 6, seg); g.rotateY(Math.PI / 2); return g; };

/** פרופיל צד (נקודות [x,y], אפשר גם {q:[cx,cy,x,y]} לעיקול) מושחל לעובי depth סביב z=0 */
function profile(points, depth, { bevel = 0.0015, holes = [] } = {}) {
  const toShape = (pts, sh) => {
    pts.forEach((p, i) => {
      if (p.q) sh.quadraticCurveTo(p.q[0], p.q[1], p.q[2], p.q[3]);
      else if (i === 0) sh.moveTo(p[0], p[1]);
      else sh.lineTo(p[0], p[1]);
    });
    return sh;
  };
  const sh = toShape(points, new THREE.Shape());
  for (const h of holes) sh.holes.push(toShape(h, new THREE.Path()));
  const d = Math.max(0.0005, depth - bevel * 2);
  const g = new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 1, curveSegments: 8 });
  g.translate(0, 0, -d / 2);
  return g;
}

function kit(g, M) {
  const add = (geo, m, x = 0, y = 0, z = 0, rz = 0, rx = 0, ry = 0) => {
    const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); g.add(o); return o;
  };
  // זוהר רק בסקינים זוהרים
  const glow = (geo, x, y, z, rz = 0) => (M.glow ? add(geo, M.glow, x, y, z, rz) : null);
  // פס זוהר משני הצדדים
  const glowSides = (w, h, x, y, z) => { if (M.glow) for (const s of [1, -1]) add(box(w, h, 0.0012), M.glow, x, y, z * s); };
  // מסילת פיקטיני: בסיס + צלעות
  const rail = (x0, x1, y, w = 0.022, m = M.dark) => {
    add(box(x1 - x0, 0.006, w), m, (x0 + x1) / 2, y, 0);
    for (let x = x0 + 0.006; x < x1 - 0.004; x += 0.01) add(box(0.005, 0.005, w + 0.002), m, x, y + 0.005, 0);
  };
  // משמר הדק + הדק
  const trigger = (x, y, M2 = M.dark, r = 0.024) => {
    add(profile([[0, 0], [r * 1.5, 0], [r * 1.5, -0.004], { q: [r * 1.5, -r, r * 0.7, -r] }, [-0.002, -r], [-0.002, -r + 0.005], [r * 0.7, -r + 0.005], { q: [r * 1.5 - 0.005, -r + 0.005, r * 1.5 - 0.005, -0.004] }, [r * 1.5 - 0.005, 0], [0, 0]], 0.008, { bevel: 0.001 }), M2, x - 0.002, y, 0);
    add(profile([[0, 0], [0.004, 0], { q: [0.008, -0.01, 0.002, -0.017] }, [0, -0.017], { q: [0.004, -0.009, 0, 0] }], 0.005, { bevel: 0.0008 }), M.steel, x + r * 0.55, y, 0);
  };
  return { add, glow, glowSides, rail, trigger };
}

function finish(g, id, s, ud) {
  g.name = id;
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData = { weaponId: id, skin: s.id, ...ud };
  return g;
}

// =====================================================================
// אקדח – חצי־אוטומטי עם שקופית משוננת, מסילה ופס זוהר
// =====================================================================
function buildPistol(s) {
  const g = new THREE.Group(), M = makeMats(s);
  const { add, glowSides, trigger } = kit(g, M);
  // שקופית: חזית משופעת
  add(profile([[-0.045, 0.004], [0.152, 0.004], [0.158, 0.012], [0.158, 0.031], [0.148, 0.038], [-0.035, 0.038], [-0.045, 0.03]], 0.026, { bevel: 0.002 }), M.body, 0, 0, 0);
  // שינון אחורי + קדמי
  for (let i = 0; i < 7; i++) add(box(0.0022, 0.022, 0.0275), M.dark, -0.036 + i * 0.006, 0.021, 0);
  for (let i = 0; i < 4; i++) add(box(0.0022, 0.016, 0.0275), M.dark, 0.118 + i * 0.006, 0.024, 0);
  // חלון פליטה + קנה נראה
  add(box(0.04, 0.003, 0.016), M.hole, 0.045, 0.0385, 0.0);
  add(box(0.036, 0.004, 0.012), M.steel, 0.045, 0.0372, 0.0);
  // כוונות
  add(box(0.008, 0.007, 0.004), M.dark, 0.148, 0.042, 0);
  add(box(0.008, 0.007, 0.018), M.dark, -0.03, 0.042, 0);
  add(box(0.003, 0.003, 0.003), M.glow || M.steel, 0.148, 0.045, 0);
  // קנה + לוע
  add(cylX(0.0072, 0.0072, 0.01, 14), M.steel, 0.159, 0.022, 0);
  add(cylX(0.0045, 0.0045, 0.002, 12), M.hole, 0.165, 0.022, 0);
  // מסגרת + מסילה תחתונה
  add(profile([[-0.04, 0.005], [0.15, 0.005], [0.15, -0.006], [0.115, -0.012], [0.03, -0.012], [-0.018, -0.006], [-0.04, -0.004]], 0.024, { bevel: 0.0015 }), M.poly, 0, 0, 0);
  for (let i = 0; i < 3; i++) add(box(0.005, 0.004, 0.026), M.dark, 0.1 + i * 0.012, -0.012, 0);
  trigger(0.03, -0.006, M.poly, 0.022);
  // אחיזה נטויה עם בליטת אגודל
  add(profile([[-0.044, 0.0], [0.018, -0.006], [0.012, -0.03], { q: [0.018, -0.045, 0.008, -0.06] }, [0.002, -0.092], [-0.04, -0.092], [-0.048, -0.04], { q: [-0.056, -0.012, -0.044, 0.0] }], 0.03, { bevel: 0.003 }), M.poly, 0, 0, 0);
  // מרקם אחיזה
  for (let i = 0; i < 5; i++) {
    const y = -0.028 - i * 0.012;
    for (const z of [0.0162, -0.0162]) add(box(0.034, 0.006, 0.001), M.dark, -0.018 + y * 0.18, y, z, 0.18);
  }
  // בסיס מחסנית + נוקר
  add(box(0.046, 0.007, 0.032), M.dark, -0.019, -0.095, 0, 0.18);
  add(box(0.01, 0.012, 0.012), M.dark, -0.047, 0.03, 0);
  add(cylZ(0.003, 0.031, 8), M.steel, 0.07, -0.002, 0); // פין
  glowSides(0.12, 0.0025, 0.055, 0.012, 0.0131);
  return finish(g, 'pistol', s, {
    length: 0.21,
    gripPoint: V(-0.016, -0.008, 0), supportPoint: V(-0.006, -0.042, -0.026),
    magPoint: V(-0.022, -0.095, 0), muzzle: V(0.166, 0.022, 0), sightPoint: V(-0.03, 0.046, 0),
  });
}

// =====================================================================
// רובה סער – מקלט עליון/תחתון, מגן יד מתומן, כוונת השתקפות, מחסנית מעוקלת
// =====================================================================
function buildRifle(s) {
  const g = new THREE.Group(), M = makeMats(s);
  const { add, glow, glowSides, rail, trigger } = kit(g, M);
  // מקלט עליון
  add(profile([[-0.1, 0.01], [0.16, 0.01], [0.16, 0.058], [-0.1, 0.058]], 0.036, { bevel: 0.003 }), M.body, 0, 0, 0);
  add(box(0.05, 0.016, 0.002), M.hole, 0.03, 0.034, 0.0185);        // חלון פליטה
  add(box(0.054, 0.02, 0.003), M.dark, 0.03, 0.036, 0.0195);        // מכסה
  add(cylZ(0.006, 0.014, 10), M.dark, -0.02, 0.04, 0.022);          // מסייע
  add(box(0.03, 0.008, 0.03), M.dark, -0.1, 0.055, 0);              // ידית דריכה
  // מקלט תחתון + בית מחסנית
  add(profile([[-0.085, 0.012], [0.12, 0.012], [0.12, -0.006], [0.095, -0.03], [0.045, -0.03], [0.04, -0.012], [-0.05, -0.012], [-0.085, -0.002]], 0.032, { bevel: 0.002 }), M.body, 0, 0, 0);
  trigger(0.018, -0.012);
  add(box(0.012, 0.004, 0.034), M.steel, -0.03, 0.0, 0);            // בורר
  // מסילה עליונה לכל האורך
  rail(-0.1, 0.42, 0.062);
  // מגן יד מתומן עם חריצים
  const hg = add(cylX(0.028, 0.028, 0.28, 8), M.poly, 0.3, 0.036, 0); hg.rotation.x = Math.PI / 8;
  for (let i = 0; i < 5; i++) for (const z of [1, -1]) add(box(0.028, 0.008, 0.002), M.hole, 0.2 + i * 0.045, 0.034, z * 0.0262);
  add(box(0.26, 0.004, 0.002), M.dark, 0.3, 0.012, -0.022);
  glowSides(0.24, 0.003, 0.3, 0.05, 0.0262);
  // קנה, בלוק גז, מעצור לוע
  add(cylX(0.0095, 0.0085, 0.16, 14), M.steel, 0.52, 0.036, 0);
  add(box(0.018, 0.022, 0.024), M.dark, 0.47, 0.034, 0);
  add(cylX(0.013, 0.013, 0.05, 12), M.dark, 0.625, 0.036, 0);
  for (let i = 0; i < 3; i++) add(box(0.006, 0.004, 0.028), M.hole, 0.612 + i * 0.012, 0.048, 0);
  add(cylX(0.006, 0.006, 0.002, 10), M.hole, 0.651, 0.036, 0);
  // כוונת קדמית מתקפלת + אחורית
  add(profile([[0, 0], [0.018, 0], [0.012, 0.022], [0.004, 0.022]], 0.006, { bevel: 0.0008 }), M.dark, 0.39, 0.067, 0);
  add(box(0.016, 0.016, 0.02), M.dark, -0.085, 0.074, 0);
  // כוונת השתקפות (רד־דוט)
  add(box(0.05, 0.012, 0.026), M.dark, 0.07, 0.073, 0);
  add(cylX(0.019, 0.021, 0.07, 16, true), M.dark, 0.07, 0.098, 0);
  add(cylX(0.017, 0.017, 0.002, 16), M.glass, 0.05, 0.098, 0);
  add(new THREE.SphereGeometry(0.0018, 6, 4), new THREE.MeshBasicMaterial({ color: s.glow || '#ff2a2a' }), 0.09, 0.098, 0);
  add(cylY(0.006, 0.01, 10), M.dark, 0.075, 0.12, 0);              // כפתור כיוון
  // קת מתכווננת + צינור
  add(cylX(0.014, 0.014, 0.16, 14), M.dark, -0.17, 0.04, 0);
  add(profile([[-0.33, 0.06], [-0.2, 0.055], [-0.18, 0.03], [-0.2, 0.012], [-0.29, -0.01], [-0.33, -0.03]], 0.034, { bevel: 0.003 }), M.poly, 0, 0, 0);
  add(box(0.012, 0.096, 0.036), M.rubber, -0.336, 0.015, 0, -0.04); // רפידה
  add(box(0.06, 0.008, 0.0365), M.dark, -0.25, 0.048, 0);           // משענת לחי
  glow(box(0.1, 0.003, 0.0355), -0.26, 0.034, 0);
  // אחיזת אקדח
  add(profile([[-0.032, -0.008], [0.0, -0.008], [0.004, -0.03], [-0.008, -0.1], [-0.042, -0.1], [-0.044, -0.06], [-0.038, -0.03]], 0.028, { bevel: 0.003 }), M.poly, 0, 0, 0);
  for (let i = 0; i < 3; i++) add(box(0.004, 0.012, 0.029), M.dark, -0.004 - i * 0.002, -0.04 - i * 0.017, 0, 0.2); // חריצי אצבעות
  // מחסנית מעוקלת
  add(profile([[0.046, -0.02], [0.094, -0.02], { q: [0.1, -0.1, 0.13, -0.17] }, [0.09, -0.185], { q: [0.058, -0.11, 0.046, -0.02] }], 0.024, { bevel: 0.002 }), M.dark, 0, 0, 0);
  for (let i = 0; i < 3; i++) for (const z of [1, -1]) add(box(0.03, 0.0025, 0.001), M.poly, 0.075 + i * 0.012, -0.06 - i * 0.03, z * 0.0123, 0.4);
  add(box(0.05, 0.008, 0.028), M.poly, 0.11, -0.178, 0, 0.35);
  return finish(g, 'rifle', s, {
    length: 0.99,
    gripPoint: V(-0.02, -0.014, 0), supportPoint: V(0.21, 0.02, -0.026),
    magPoint: V(0.085, -0.12, 0), muzzle: V(0.652, 0.036, 0), sightPoint: V(0.03, 0.098, 0),
  });
}

// =====================================================================
// תת־מקלע – קומפקטי, מאפיין עתידני, משתיק, אחיזה קדמית, קת תיל מתקפלת
// =====================================================================
function buildSmg(s) {
  const g = new THREE.Group(), M = makeMats(s);
  const { add, glow, glowSides, rail, trigger } = kit(g, M);
  // גוף זוויתי
  add(profile([[-0.09, 0.0], [0.2, 0.0], [0.23, 0.02], [0.23, 0.05], [0.19, 0.066], [-0.07, 0.066], [-0.09, 0.05]], 0.042, { bevel: 0.003 }), M.body, 0, 0, 0);
  // פאנל תחתון בצבע משני + פתחי אוורור
  add(profile([[-0.06, 0.002], [0.2, 0.002], [0.22, 0.018], [0.05, 0.018], [-0.06, 0.012]], 0.0445, { bevel: 0.001 }), M.poly, 0, 0, 0);
  for (let i = 0; i < 4; i++) for (const z of [1, -1]) add(box(0.012, 0.022, 0.002), M.hole, 0.12 + i * 0.022, 0.042, z * 0.0222, -0.35);
  glowSides(0.2, 0.003, 0.07, 0.03, 0.0224);
  add(box(0.04, 0.012, 0.002), M.hole, 0.0, 0.048, 0.0225);        // חלון פליטה
  rail(-0.06, 0.18, 0.07, 0.02);
  // כוונת הולוגרפית קטנה
  add(box(0.05, 0.006, 0.026), M.dark, 0.06, 0.081, 0);
  for (const z of [0.012, -0.012]) add(box(0.04, 0.028, 0.004), M.dark, 0.06, 0.098, z);
  add(box(0.04, 0.004, 0.028), M.dark, 0.06, 0.113, 0);
  add(box(0.002, 0.024, 0.022), M.glass, 0.06, 0.098, 0);
  add(new THREE.SphereGeometry(0.0016, 6, 4), new THREE.MeshBasicMaterial({ color: s.glow || '#ff3030' }), 0.061, 0.098, 0);
  // משתיק
  add(cylX(0.019, 0.019, 0.17, 18), M.dark, 0.315, 0.034, 0);
  for (let i = 0; i < 4; i++) add(ringX(0.019, 0.0018), M.poly, 0.25 + i * 0.04, 0.034, 0);
  add(cylX(0.012, 0.012, 0.002, 12), M.hole, 0.401, 0.034, 0);
  glow(ringX(0.0195, 0.0015), 0.392, 0.034, 0);
  // אחיזה + הדק
  trigger(0.012, 0.0);
  add(profile([[-0.034, 0.002], [0.0, 0.002], [0.005, -0.02], [-0.006, -0.095], [-0.04, -0.095], [-0.04, -0.05], [-0.04, -0.02]], 0.028, { bevel: 0.003 }), M.poly, 0, 0, 0);
  // מחסנית ישרה לפני ההדק
  add(box(0.03, 0.15, 0.022), M.dark, 0.085, -0.07, 0, -0.08);
  add(box(0.036, 0.01, 0.026), M.poly, 0.091, -0.145, 0, -0.08);
  for (let i = 0; i < 3; i++) add(cylZ(0.0025, 0.0225, 8), M.steel, 0.083 + i * 0.0015, -0.05 - i * 0.025, 0);
  // אחיזה קדמית אנכית (יד שמאל)
  add(cylY(0.013, 0.085, 12), M.poly, 0.175, -0.04, 0);
  for (let i = 0; i < 3; i++) add(new THREE.TorusGeometry(0.0132, 0.0016, 5, 14), M.dark, 0.175, -0.025 - i * 0.02, 0, 0, Math.PI / 2);
  add(box(0.03, 0.006, 0.03), M.dark, 0.175, 0.0, 0);
  // קת תיל מתקפלת
  for (const z of [0.012, -0.012]) add(cylX(0.004, 0.004, 0.2, 8), M.steel, -0.19, 0.035, z);
  add(cylZ(0.0045, 0.03, 8), M.steel, -0.29, 0.035, 0);
  add(box(0.01, 0.07, 0.034), M.rubber, -0.295, 0.02, 0);
  add(box(0.02, 0.03, 0.03), M.dark, -0.09, 0.035, 0);
  return finish(g, 'smg', s, {
    length: 0.7,
    gripPoint: V(-0.02, -0.006, 0), supportPoint: V(0.175, -0.03, -0.012),
    magPoint: V(0.086, -0.13, 0), muzzle: V(0.402, 0.034, 0), sightPoint: V(0.04, 0.098, 0),
  });
}

// =====================================================================
// שוטגן – משאבה, צינור מחסנית, מחזיק כדורים בצד, קת מלאה
// =====================================================================
function buildShotgun(s) {
  const g = new THREE.Group(), M = makeMats(s);
  const { add, glow, glowSides, rail, trigger } = kit(g, M);
  // מקלט
  add(profile([[-0.06, -0.012], [0.15, -0.012], [0.16, 0.0], [0.16, 0.05], [-0.045, 0.058], [-0.06, 0.05]], 0.038, { bevel: 0.003 }), M.body, 0, 0, 0);
  add(box(0.06, 0.018, 0.002), M.hole, 0.06, 0.03, 0.0195);
  rail(-0.04, 0.14, 0.06, 0.018);
  trigger(0.005, -0.012);
  add(box(0.08, 0.004, 0.02), M.hole, 0.06, -0.0135, 0);             // פתח טעינה
  // מחזיק כדורים בצד ימין (+Z)
  add(box(0.075, 0.034, 0.006), M.dark, 0.05, 0.02, 0.022);
  for (let i = 0; i < 4; i++) {
    const x = 0.022 + i * 0.019;
    add(cylY(0.0075, 0.04, 10), new THREE.MeshStandardMaterial({ color: '#b3261e', roughness: 0.6 }), x, 0.02, 0.031);
    add(cylY(0.0078, 0.01, 10), M.steel, x, -0.004, 0.031).material = new THREE.MeshStandardMaterial({ color: '#c9a14a', metalness: 0.9, roughness: 0.3 });
  }
  // קנה + צינור מחסנית
  add(cylX(0.0125, 0.0125, 0.58, 16), M.steel, 0.44, 0.034, 0);
  add(cylX(0.0108, 0.0108, 0.48, 14), M.dark, 0.39, 0.004, 0);
  add(cylX(0.012, 0.012, 0.02, 14), M.body, 0.635, 0.004, 0);        // פקק צינור
  add(box(0.02, 0.04, 0.018), M.dark, 0.6, 0.019, 0);                 // חבק
  add(cylX(0.0145, 0.0145, 0.03, 16), M.dark, 0.715, 0.034, 0);       // צוק
  add(cylX(0.009, 0.009, 0.002, 12), M.hole, 0.731, 0.034, 0);
  // צלע אוורור עליונה + כוונת חרוז
  add(box(0.52, 0.004, 0.008), M.dark, 0.43, 0.051, 0);
  for (let i = 0; i < 12; i++) add(box(0.004, 0.006, 0.006), M.dark, 0.19 + i * 0.044, 0.047, 0);
  add(new THREE.SphereGeometry(0.003, 8, 6), M.glow || M.steel, 0.69, 0.056, 0);
  // משאבה עם חריצים
  add(cylX(0.022, 0.022, 0.16, 14), M.poly, 0.28, 0.008, 0).scale.set(1, 1, 0.9);
  for (let i = 0; i < 6; i++) add(ringX(0.0212, 0.0022, 16), M.dark, 0.22 + i * 0.024, 0.008, 0).scale.set(1, 1, 0.9);
  glowSides(0.13, 0.003, 0.28, 0.008, 0.0205);
  // קת מלאה עם אחיזת אקדח
  add(profile([[-0.06, 0.05], [-0.1, 0.044], [-0.34, 0.03], [-0.36, 0.032], [-0.36, -0.066], [-0.33, -0.066], [-0.16, -0.018], { q: [-0.11, -0.016, -0.09, -0.085] }, [-0.058, -0.088], [-0.035, -0.012], [-0.06, -0.012]], 0.034, { bevel: 0.004 }), M.poly, 0, 0, 0);
  add(box(0.018, 0.104, 0.036), M.rubber, -0.368, -0.017, 0);
  glow(box(0.2, 0.003, 0.0365), -0.22, 0.012, 0, 0.07);
  add(cylZ(0.006, 0.038, 10), M.steel, -0.25, -0.01, 0);             // נקודת רצועה
  return finish(g, 'shotgun', s, {
    length: 1.11,
    gripPoint: V(-0.058, -0.03, 0), supportPoint: V(0.27, 0.0, -0.022),
    magPoint: V(0.06, -0.02, 0), muzzle: V(0.732, 0.034, 0), sightPoint: V(0.0, 0.06, 0),
  });
}

// =====================================================================
// צלף – בורג, שלדה מנוקבת, קנה מחורץ, מעצור לוע, כוונת טלסקופית, דו־רגל מקופלת
// =====================================================================
function buildSniper(s) {
  const g = new THREE.Group(), M = makeMats(s);
  const { add, glow, glowSides, rail, trigger } = kit(g, M);
  // מקלט עגול + בורג
  add(cylX(0.019, 0.019, 0.22, 18), M.body, 0.03, 0.035, 0);
  add(box(0.22, 0.02, 0.036), M.body, 0.03, 0.02, 0);
  add(box(0.05, 0.014, 0.002), M.hole, 0.04, 0.04, 0.019);
  add(cylX(0.011, 0.011, 0.04, 12), M.steel, -0.09, 0.035, 0);       // גוף הבורג מאחור
  const bolt = add(cylZ(0.0045, 0.05, 8), M.steel, -0.06, 0.03, 0.035); bolt.rotation.x = Math.PI / 2 - 0.5;
  add(new THREE.SphereGeometry(0.0095, 10, 8), M.dark, -0.06, 0.012, 0.056);   // ידית בורג
  rail(-0.1, 0.2, 0.06, 0.02);
  // שלדה (צ׳אסי) עם חורים וקת מתכווננת
  add(profile([
    [-0.08, 0.008], [0.42, 0.008], [0.42, -0.03], [0.14, -0.03], [0.12, -0.02], [0.03, -0.02],
    [0.02, -0.012], [-0.04, -0.012], [-0.06, -0.03], [-0.1, -0.03], [-0.3, -0.02], [-0.3, 0.044], [-0.1, 0.03],
  ], 0.04, { bevel: 0.003, holes: [
    [[0.18, -0.002], [0.38, -0.002], [0.38, -0.022], [0.18, -0.022]],
    [[-0.27, 0.025], [-0.15, 0.02], [-0.15, -0.012], [-0.27, -0.008]],
  ] }), M.poly, 0, 0, 0);
  add(box(0.13, 0.016, 0.042), M.dark, -0.21, 0.054, 0);             // משענת לחי
  add(cylY(0.004, 0.03, 8), M.steel, -0.18, 0.035, 0);
  add(cylY(0.004, 0.03, 8), M.steel, -0.24, 0.035, 0);
  add(profile([[-0.3, 0.07], [-0.33, 0.07], [-0.34, -0.09], [-0.3, -0.09], [-0.3, -0.02], [-0.31, 0.0], [-0.3, 0.02]], 0.04, { bevel: 0.003 }), M.dark, 0, 0, 0);
  add(box(0.012, 0.16, 0.042), M.rubber, -0.344, -0.01, 0);
  add(box(0.03, 0.06, 0.02), M.dark, -0.3, -0.1, 0);                 // מונופוד
  glowSides(0.33, 0.003, 0.25, -0.012, 0.0201);
  // אחיזה + הדק + מחסנית קופסה
  trigger(-0.01, -0.012);
  add(profile([[-0.06, -0.012], [-0.03, -0.012], [-0.03, -0.03], [-0.045, -0.105], [-0.08, -0.105], [-0.078, -0.06], [-0.07, -0.03]], 0.03, { bevel: 0.003 }), M.poly, 0, 0, 0);
  add(box(0.07, 0.06, 0.026), M.dark, 0.075, -0.045, 0);
  add(box(0.074, 0.008, 0.03), M.body, 0.075, -0.077, 0);
  // קנה כבד מחורץ
  add(cylX(0.014, 0.011, 0.56, 16), M.steel, 0.42, 0.035, 0);
  for (let i = 0; i < 6; i++) add(box(0.3, 0.0025, 0.0025), M.dark, 0.36, 0.035 + Math.sin(i) * 0.0125, Math.cos(i) * 0.0125);
  // מעצור לוע גדול
  add(box(0.07, 0.026, 0.036), M.dark, 0.735, 0.035, 0);
  for (let i = 0; i < 3; i++) for (const z of [1, -1]) add(box(0.01, 0.018, 0.002), M.hole, 0.714 + i * 0.02, 0.035, z * 0.0182);
  add(cylX(0.007, 0.007, 0.002, 12), M.hole, 0.771, 0.035, 0);
  glow(box(0.002, 0.026, 0.037), 0.77, 0.035, 0);
  // דו־רגל מקופלת מתחת לחזית
  add(box(0.03, 0.018, 0.03), M.dark, 0.4, -0.04, 0);
  for (const z of [0.01, -0.01]) add(cylX(0.004, 0.004, 0.18, 8), M.dark, 0.31, -0.05, z);
  for (const z of [0.01, -0.01]) add(new THREE.SphereGeometry(0.006, 8, 6), M.rubber, 0.22, -0.05, z);
  // כוונת טלסקופית
  const sy = 0.105;
  for (const x of [-0.04, 0.12]) { add(box(0.022, 0.03, 0.026), M.dark, x, 0.08, 0); add(ringX(0.0175, 0.0035, 18), M.dark, x, sy, 0); }
  add(cylX(0.016, 0.016, 0.24, 20), M.body, 0.04, sy, 0);
  add(cylX(0.016, 0.027, 0.05, 20), M.body, 0.185, sy, 0);           // חרוט קדמי
  add(cylX(0.027, 0.027, 0.04, 20), M.body, 0.23, sy, 0);            // פעמון עדשה
  add(ringX(0.027, 0.0025, 20), M.dark, 0.25, sy, 0);
  add(cylX(0.016, 0.021, 0.035, 20), M.body, -0.095, sy, 0);         // עינית
  add(cylX(0.021, 0.021, 0.04, 20), M.rubber, -0.13, sy, 0);
  add(cylX(0.024, 0.024, 0.002, 20), M.glass, 0.251, sy, 0);
  add(cylX(0.018, 0.018, 0.002, 20), M.glass, -0.151, sy, 0);
  add(cylY(0.0085, 0.022, 14), M.dark, 0.04, sy + 0.022, 0);          // צריח גובה
  add(cylZ(0.0085, 0.022, 14), M.dark, 0.04, sy, 0.022);              // צריח רוח
  add(cylZ(0.006, 0.016, 12), M.dark, 0.04, sy, -0.02);               // מיקוד
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; add(box(0.0016, 0.022, 0.0016), M.steel, 0.04 + Math.cos(a) * 0.0088, sy + 0.022, Math.sin(a) * 0.0088); }
  glow(ringX(0.0272, 0.0016, 20), 0.21, sy, 0);
  glow(ringX(0.0212, 0.0012, 20), -0.11, sy, 0);
  return finish(g, 'sniper', s, {
    length: 1.12,
    gripPoint: V(-0.065, -0.026, 0), supportPoint: V(0.16, -0.012, -0.024),
    magPoint: V(0.075, -0.075, 0), muzzle: V(0.772, 0.035, 0),
    sightPoint: V(-0.17, sy, 0),
    scope: { eye: V(-0.17, sy, 0), axis: V(1, 0, 0), zoom: 4, lensFront: V(0.252, sy, 0) },
  });
}

// =====================================================================
// רימון – גוף מחולק, ידית (spoon), נצרה עם טבעת
// =====================================================================
function buildGrenade(s) {
  const g = new THREE.Group(), M = makeMats(s);
  const { add, glow } = kit(g, M);
  const r = 0.033;
  const body = add(new THREE.SphereGeometry(r, 20, 16), M.body, 0, 0, 0); body.scale.set(1, 1.18, 1);
  // חריצים: אופקיים ואנכיים
  for (let i = -2; i <= 2; i++) {
    const y = i * 0.0125, rr = r * Math.sqrt(1 - (y / (r * 1.18)) ** 2);
    add(new THREE.TorusGeometry(rr, 0.0017, 5, 24), M.poly, 0, y, 0, 0, Math.PI / 2);
  }
  for (let i = 0; i < 4; i++) {
    const t = add(new THREE.TorusGeometry(r, 0.0017, 5, 24), M.poly, 0, 0, 0, 0, 0, (i / 4) * Math.PI);
    t.scale.set(1, 1.18, 1);
  }
  // פסי זוהר בין החריצים (סקינים זוהרים)
  if (M.glow) for (const y of [-0.019, 0.019]) {
    const rr = r * Math.sqrt(1 - (y / (r * 1.18)) ** 2) + 0.0004;
    glow(new THREE.TorusGeometry(rr, 0.0012, 5, 24), 0, y, 0).rotation.x = Math.PI / 2;
  }
  // ראש מרעום
  add(cylY(0.012, 0.012, 14), M.dark, 0, r * 1.18 + 0.002, 0);
  add(cylY(0.0145, 0.012, 14), M.steel, 0, r * 1.18 + 0.014, 0);
  add(cylZ(0.004, 0.034, 8), M.steel, 0.006, r * 1.18 + 0.016, 0);
  // ידית (spoon) לאורך הצד
  add(profile([[-0.004, 0.058], [0.022, 0.058], [0.026, 0.05], { q: [0.04, 0.03, 0.038, -0.01] }, [0.033, -0.022], [0.028, -0.022], [0.033, -0.01], { q: [0.035, 0.028, 0.02, 0.052] }, [-0.004, 0.052]], 0.012, { bevel: 0.0008 }), M.steel, 0, 0, 0);
  // נצרה + טבעת (צד שמאל, -Z)
  add(cylZ(0.0012, 0.03, 6), M.steel, 0.006, r * 1.18 + 0.016, -0.02);
  const ring = add(new THREE.TorusGeometry(0.012, 0.0016, 6, 20), M.steel, 0.008, r * 1.18 + 0.01, -0.038, 0, 0.3, 0);
  void ring;
  // תווית
  add(box(0.0005, 0.012, 0.03), M.glow || M.dark, r + 0.0001, -0.004, 0).visible = true;
  const top = r * 1.18;
  return finish(g, 'grenade', s, {
    length: 0.1,
    gripPoint: V(-0.01, 0.045, 0.004), supportPoint: V(0.008, top + 0.01, -0.038),
    magPoint: V(0.008, top + 0.01, -0.038), muzzle: V(0, 0, 0),
    pinPoint: V(0.008, top + 0.01, -0.038), radius: r,
  });
}

// =====================================================================
// רובה פלזמה – בולפאפ עתידני, תא אנרגיה זוהר, סלילים, פולט כפול
// =====================================================================
function buildPlasma(s) {
  const g = new THREE.Group(), M = makeMats(s);
  const { add } = kit(g, M);
  const gc = s.glow || '#38f6ff';
  const glowM = new THREE.MeshBasicMaterial({ color: gc });
  const coreM = new THREE.MeshBasicMaterial({ color: new THREE.Color(gc).lerp(new THREE.Color('#ffffff'), 0.55) });
  const cellM = new THREE.MeshStandardMaterial({ color: gc, emissive: gc, emissiveIntensity: 0.6, transparent: true, opacity: 0.45, roughness: 0.1, metalness: 0 });
  const shell = s.id === 'default' ? new THREE.MeshStandardMaterial({ color: '#d9dee6', metalness: 0.3, roughness: 0.35 }) : M.body;
  // גוף עליון זורם
  add(profile([
    [-0.3, 0.0], [-0.28, 0.05], [-0.1, 0.07], { q: [0.08, 0.085, 0.22, 0.06] }, [0.3, 0.045], [0.32, 0.02],
    [0.3, -0.005], [0.12, -0.012], [-0.05, -0.012], [-0.3, -0.03],
  ], 0.05, { bevel: 0.005 }), shell, 0, 0, 0);
  // פאנלים כהים בצדדים + פסי זוהר
  for (const z of [1, -1]) {
    add(profile([[-0.24, 0.005], [-0.1, 0.045], [0.2, 0.04], [0.26, 0.02], [0.2, 0.005]], 0.004, { bevel: 0.0008 }), M.poly, 0, 0, z * 0.026);
    add(box(0.36, 0.003, 0.002), glowM, 0.0, 0.025, z * 0.0285);
    add(box(0.08, 0.003, 0.002), glowM, -0.2, 0.012, z * 0.0285, 0.2);
    for (let i = 0; i < 4; i++) add(box(0.004, 0.012, 0.002), glowM, 0.12 + i * 0.018, 0.015, z * 0.0285);
  }
  // סנפירי קירור עליונים
  for (let i = 0; i < 7; i++) add(profile([[0, 0], [0.012, 0], [0.006, 0.016], [-0.002, 0.016]], 0.034, { bevel: 0.0008 }), M.poly, -0.08 + i * 0.026, 0.07 - Math.max(0, i - 3) * 0.004, 0);
  // כוונת הולוגרפית
  add(box(0.06, 0.008, 0.02), M.poly, 0.12, 0.08, 0);
  add(box(0.006, 0.035, 0.026), M.poly, 0.14, 0.1, 0);
  const holo = add(box(0.0015, 0.026, 0.022), new THREE.MeshBasicMaterial({ color: gc, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }), 0.136, 0.102, 0);
  add(new THREE.RingGeometry(0.004, 0.0055, 16), coreM, 0.135, 0.102, 0, 0, 0, Math.PI / 2);
  // פולט: קנה פנימי זוהר + 3 סלילים + שתי שיניים
  add(cylX(0.012, 0.012, 0.22, 16), M.dark, 0.39, 0.025, 0);
  add(cylX(0.006, 0.006, 0.222, 12), coreM, 0.39, 0.025, 0);
  const coils = [];
  for (let i = 0; i < 4; i++) {
    add(ringX(0.02, 0.004, 20), shell, 0.32 + i * 0.045, 0.025, 0);
    coils.push(add(ringX(0.0155, 0.0022, 20), glowM.clone(), 0.32 + i * 0.045, 0.025, 0));
  }
  for (const y of [1, -1]) add(profile([[0, 0], [0.2, 0.004], [0.24, 0.012], [0.2, 0.012], [0, 0.01]], 0.012, { bevel: 0.0015 }), shell, 0.32, 0.025 + y * 0.014, 0, 0, y < 0 ? Math.PI : 0);
  add(new THREE.SphereGeometry(0.009, 12, 10), coreM, 0.505, 0.025, 0);
  // אחיזה + משמר הדק משולב
  add(profile([[-0.045, -0.01], [0.002, -0.01], [0.006, -0.03], [-0.008, -0.1], [-0.044, -0.1], [-0.046, -0.06]], 0.03, { bevel: 0.003 }), M.poly, 0, 0, 0);
  add(profile([[0.005, -0.012], [0.07, -0.012], { q: [0.075, -0.05, 0.03, -0.055] }, [0.006, -0.055], [0.006, -0.048], [0.03, -0.048], { q: [0.066, -0.045, 0.062, -0.012] }], 0.012, { bevel: 0.001 }), shell, 0, 0, 0);
  add(profile([[0, 0], [0.004, 0], { q: [0.008, -0.01, 0.002, -0.017] }, [0, -0.017], { q: [0.004, -0.009, 0, 0] }], 0.005, { bevel: 0.0008 }), glowM, 0.022, -0.013, 0);
  // אחיזה קדמית (יד שמאל)
  add(box(0.1, 0.022, 0.044), M.poly, 0.2, -0.008, 0);
  for (let i = 0; i < 4; i++) add(box(0.006, 0.006, 0.046), M.dark, 0.165 + i * 0.022, -0.02, 0);
  // תא אנרגיה מאחורי האחיזה (בולפאפ)
  add(box(0.06, 0.012, 0.04), M.dark, -0.13, -0.018, 0);
  add(cylY(0.016, 0.07, 16), cellM, -0.13, -0.058, 0);
  const cellCore = add(cylY(0.007, 0.066, 10), coreM, -0.13, -0.058, 0);
  for (const y of [-0.024, -0.092]) add(cylY(0.019, 0.008, 16), M.dark, -0.13, y, 0);
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + Math.PI / 4; add(box(0.003, 0.06, 0.003), M.dark, -0.13 + Math.cos(a) * 0.017, -0.058, Math.sin(a) * 0.017); }
  // קת + רפידה
  add(box(0.014, 0.085, 0.048), M.rubber, -0.302, 0.012, 0, -0.18);
  const ud = {
    length: 0.86,
    gripPoint: V(-0.024, -0.016, 0), supportPoint: V(0.19, -0.012, -0.024),
    magPoint: V(-0.13, -0.06, 0), muzzle: V(0.515, 0.025, 0), sightPoint: V(0.08, 0.102, 0),
    glowColor: gc,
    animate(t) {
      coils.forEach((c, i) => c.material.color.set(gc).multiplyScalar(0.55 + 0.45 * Math.sin(t * 6 - i * 0.9) ** 2));
      cellCore.scale.set(1, 1, 1).multiplyScalar(0.85 + 0.15 * Math.sin(t * 3));
      holo.material.opacity = 0.18 + 0.08 * Math.sin(t * 5);
    },
  };
  return finish(g, 'plasma', s, ud);
}

const B = { pistol: buildPistol, rifle: buildRifle, smg: buildSmg, shotgun: buildShotgun, sniper: buildSniper, grenade: buildGrenade, plasma: buildPlasma };

/** בונה נשק לפי id מ-data/weapons.js וסקין מ-data/skins.js. מחזיר THREE.Group עם userData לפי החוזה. */
export function buildWeapon(id, skinId = 'default') {
  if (id === 'knife') return buildKnife(skinId);
  const f = B[id];
  if (!f) throw new Error('unknown weapon: ' + id);
  return f(getSkin(skinId));
}

/** בנאים לנשקייה: BUILDERS[id](skinId) */
export const BUILDERS = Object.fromEntries(['knife', ...Object.keys(B)].map((id) => [id, (skinId) => buildWeapon(id, skinId)]));

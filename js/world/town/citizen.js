// אזרחי העיר: דמות קלה על השלד של core/anim.js (makeRig + Animator), עם בגדים מגוונים.
// הכול ממוזג ל-SkinnedMesh אחד (צבעי קודקוד, כל קודקוד צמוד למפרק אחד) → draw call אחד לאזרח.
// buildCitizen(look) → rig = { root, j, anim, eyes, hand (נקודת אחיזה לאוכל), look }
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeRig, Animator, DIM } from '../../core/anim.js';

const _c = new THREE.Color(), _M = new THREE.Matrix4(), _Q = new THREE.Quaternion(), _E = new THREE.Euler(), _P = new THREE.Vector3(), _S = new THREE.Vector3();

/** בונה גאומטריה ממוזגת לכל מפרק. put(bone, geo, color, {p, r, s, kind}) ואז bake(mats). */
export function partsBuilder() {
  const parts = new Map();
  function put(bone, geo, color, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1], kind = 'body' } = {}) {
    if (geo.attributes.uv) geo.deleteAttribute('uv');
    if (!geo.index) geo.setIndex([...Array(geo.attributes.position.count).keys()]);
    _M.compose(_P.set(...p), _Q.setFromEuler(_E.set(...r)), _S.set(...s));
    geo.applyMatrix4(_M);
    _c.set(color).convertSRGBToLinear();
    const n = geo.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (!parts.has(bone)) parts.set(bone, {});
    (parts.get(bone)[kind] ||= []).push(geo);
  }
  /** מיזוג הכול לרשת מעור אחת (SkinnedMesh, כל קודקוד צמוד למפרק אחד) → draw call אחד לדמות.
   *  המפרקים נשארים ה-Groups של makeRig, כך שה-Animator ממשיך לעבוד כרגיל. */
  function bakeSkinned(root, mat) {
    root.updateMatrixWorld(true);
    const bones = [...parts.keys()], geos = [];
    bones.forEach((bone, bi) => {
      for (const k in parts.get(bone)) for (const g of parts.get(bone)[k]) {
        g.applyMatrix4(bone.matrixWorld);
        const n = g.attributes.position.count, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
        for (let i = 0; i < n; i++) { si[i * 4] = bi; sw[i * 4] = 1; }
        g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
        g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
        geos.push(g);
      }
    });
    const geo = mergeGeometries(geos, false); geos.forEach((g) => g.dispose());
    const mesh = new THREE.SkinnedMesh(geo, mat); mesh.name = 'citizen';
    root.add(mesh); root.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(bones));
    parts.clear();
    return mesh;
  }
  function bake(mats) {
    const meshes = [];
    for (const [bone, kinds] of parts) for (const k in kinds) {
      const g = mergeGeometries(kinds[k], false); kinds[k].forEach((x) => x.dispose());
      const m = new THREE.Mesh(g, mats[k] || mats.body); m.name = bone.name + '_' + k; bone.add(m); meshes.push(m);
    }
    parts.clear();
    return meshes;
  }
  return { put, bake, bakeSkinned };
}

export const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
export const cyl = (rt, rb, h, seg = 10) => new THREE.CylinderGeometry(rt, rb, h, seg, 1);
export const sph = (r, ws = 10, hs = 8, ...a) => new THREE.SphereGeometry(r, ws, hs, ...a);
export const cone = (r, h, seg = 6) => new THREE.ConeGeometry(r, h, seg, 1);
export const lathe = (pts, seg = 12) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

let MATS = null;
const mats = () => (MATS ||= {
  body: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.02 }),
  shiny: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.2 }),
  skin: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.02 }),
  hit: new THREE.MeshBasicMaterial({ visible: false }),
});

// ---------- מראה אקראי ----------
export const SKIN_TONES = ['#f1cfb0', '#e7b48f', '#c98e66', '#a56b45', '#7a4b30', '#f5dcc6'];
const SHIRTS = ['#c0392b', '#2e86c1', '#27ae60', '#f1c40f', '#8e44ad', '#e67e22', '#ecf0f1', '#34495e', '#16a085', '#d35400', '#7f8c8d', '#e84393', '#2d3436', '#55efc4'];
const PANTS = ['#2c3e50', '#34495e', '#5d4037', '#1b2631', '#7b6d5d', '#3e5c76', '#424949', '#a1887f'];
const HAIRS = ['#1a1410', '#3b2414', '#6d4c2f', '#b08d57', '#d9c08c', '#8a8a8a', '#e8e4dc', '#7a2a14'];
const SHOES = ['#1c1c1c', '#5b3a24', '#e8e8e8', '#7a1f1f', '#2a3a5a'];
const HATS = ['#2d3436', '#c0392b', '#1e3799', '#d4a017', '#6d4c41', '#f5f6fa'];

/** look אקראי. rand = פונקציית אקראי; over = שדות קבועים (gender, age, role...) */
export function randomLook(rand = Math.random, over = {}) {
  const pick = (a) => a[Math.floor(rand() * a.length)];
  const gender = over.gender || (rand() < 0.5 ? 'f' : 'm');
  const age = over.age || (rand() < 0.15 ? 'kid' : rand() < 0.2 ? 'old' : 'adult');
  const L = {
    gender, age,
    skin: pick(SKIN_TONES), shirt: pick(SHIRTS), shirt2: pick(SHIRTS), pants: pick(PANTS), shoes: pick(SHOES),
    hair: age === 'old' ? pick(['#8a8a8a', '#e8e4dc', '#cfcfcf']) : pick(HAIRS),
    hairStyle: gender === 'f' ? pick(['long', 'bun', 'pony', 'short', 'curly']) : pick(['short', 'short', 'bald', 'curly', 'spiky']),
    hat: rand() < 0.3 ? pick(['cap', 'beanie', 'fedora']) : null, hatColor: pick(HATS),
    dress: gender === 'f' && rand() < 0.45, sleeves: rand() < 0.5 ? 'long' : 'short',
    glasses: rand() < 0.25, beard: gender === 'm' && age !== 'kid' && rand() < 0.3,
    apron: false, backpack: rand() < 0.15, jacket: rand() < 0.3 ? pick(PANTS) : null,
    height: age === 'kid' ? 0.68 + rand() * 0.08 : age === 'old' ? 0.92 + rand() * 0.06 : 0.94 + rand() * 0.12,
    width: 0.92 + rand() * 0.2,
    cane: false,
    ...over,
  };
  if (L.age === 'kid') { L.beard = false; L.hat = L.hat === 'fedora' ? 'cap' : L.hat; }
  return L;
}

export function buildCitizen(look = randomLook()) {
  const L = look, M = mats();
  const rig = makeRig(); const j = rig.j;
  const B = partsBuilder(), put = B.put;
  const top = L.jacket || L.shirt, W = L.width;
  const sleeve = L.sleeves === 'long' || L.jacket ? top : L.skin;

  // אגן + בטן + חזה
  put(j.hips, sph(1, 10, 8), L.dress ? L.shirt : L.pants, { p: [0, -0.01, 0], s: [0.15 * W, 0.12, 0.105 * W] });
  if (L.dress) put(j.hips, lathe([[0.27, -0.42], [0.22, -0.2], [0.16, 0.02], [0.15, 0.08]], 12), L.shirt2, { s: [W, 1, 0.8 * W] });
  else put(j.hips, cyl(0.155 * W, 0.155 * W, 0.04, 12), '#2a2420', { p: [0, 0.07, 0], s: [1, 1, 0.72] }); // חגורה
  put(j.spine, lathe([[0.15, 0.0], [0.145, 0.12], [0.155, 0.25]], 12), L.dress ? L.shirt2 : L.shirt, { s: [1.05 * W, 1, 0.72 * W] });
  put(j.chest, lathe([[0.155, -0.02], [0.165, 0.12], [0.162, 0.2], [0.13, 0.255], [0.06, 0.28]], 12), L.dress ? L.shirt2 : L.shirt, { s: [1.08 * W, 1, 0.7 * W] });
  for (const sx of [1, -1]) put(j.chest, sph(0.075, 8, 6), top, { p: [sx * 0.165 * W, 0.2, 0] });
  if (L.jacket) {
    for (const sx of [1, -1]) {
      put(j.chest, box(0.09 * W, 0.27, 0.03), L.jacket, { p: [sx * 0.085 * W, 0.13, 0.11 * W], r: [-0.05, 0, 0] });
      put(j.spine, box(0.09 * W, 0.26, 0.03), L.jacket, { p: [sx * 0.09 * W, 0.12, 0.105 * W] });
    }
    put(j.chest, box(0.3 * W, 0.28, 0.03), L.jacket, { p: [0, 0.13, -0.11 * W] });
  }
  if (L.apron) {
    put(j.chest, box(0.24, 0.2, 0.02), '#f5f5f0', { p: [0, 0.1, 0.118 * W] });
    put(j.spine, box(0.26, 0.26, 0.02), '#f5f5f0', { p: [0, 0.1, 0.115 * W] });
    put(j.hips, box(0.28, 0.3, 0.02), '#f5f5f0', { p: [0, -0.12, 0.12 * W] });
  }
  if (L.backpack) put(j.chest, box(0.26, 0.32, 0.14), L.shirt2, { p: [0, 0.1, -0.18 * W] });
  if (L.vest) put(j.chest, box(0.33 * W, 0.24, 0.25 * W), L.vest, { p: [0, 0.12, 0] });
  if (L.badge) put(j.chest, box(0.05, 0.05, 0.01), '#f1c40f', { p: [0.07, 0.17, 0.125 * W], kind: 'shiny' });

  // צוואר + ראש
  put(j.neck, cyl(0.045, 0.055, 0.1, 8), L.skin, { p: [0, 0.02, 0] });
  const HY = 0.1;
  put(j.head, sph(0.105, 14, 10), L.skin, { p: [0, HY, 0], s: [0.92, 1.05, 1] });
  put(j.head, box(0.02, 0.035, 0.03), L.skin, { p: [0, HY - 0.01, 0.1] }); // אף
  put(j.head, box(0.04, 0.008, 0.01), '#7a3b2e', { p: [0, HY - 0.05, 0.096] }); // פה
  for (const sx of [1, -1]) put(j.head, sph(0.022, 6, 5), L.skin, { p: [sx * 0.095, HY, -0.005], s: [0.5, 1, 0.8] });
  if (L.beard) put(j.head, sph(0.085, 10, 6, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.4), L.hair, { p: [0, HY - 0.02, 0.025], s: [1.05, 1.1, 1.05] });
  if (L.glasses) {
    for (const sx of [1, -1]) put(j.head, box(0.038, 0.026, 0.008), '#151515', { p: [sx * 0.037, HY + 0.02, 0.1], kind: 'shiny' });
    put(j.head, box(0.03, 0.006, 0.006), '#151515', { p: [0, HY + 0.025, 0.103] });
  }
  const hs = L.hairStyle;
  if (hs !== 'bald') put(j.head, sph(0.113, 14, 8, 0, Math.PI * 2, 0, Math.PI * (hs === 'short' || hs === 'spiky' ? 0.42 : 0.5)), L.hair, { p: [0, HY + 0.008, -0.008], s: [0.97, 1.05, 1.04] });
  else put(j.head, sph(0.112, 12, 6, Math.PI * 0.6, Math.PI * 0.8, Math.PI * 0.35, Math.PI * 0.2), L.hair, { p: [0, HY, -0.005] }); // שוליים
  if (hs === 'long') put(j.head, box(0.2, 0.22, 0.06), L.hair, { p: [0, HY - 0.08, -0.07] });
  if (hs === 'bun') put(j.head, sph(0.05, 8, 6), L.hair, { p: [0, HY + 0.1, -0.06] });
  if (hs === 'pony') put(j.head, cone(0.035, 0.2, 6), L.hair, { p: [0, HY - 0.02, -0.12], r: [Math.PI - 0.4, 0, 0] });
  if (hs === 'curly') for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; put(j.head, sph(0.04, 6, 5), L.hair, { p: [Math.cos(a) * 0.085, HY + 0.07, Math.sin(a) * 0.08 - 0.01] }); }
  if (hs === 'spiky') for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; put(j.head, cone(0.03, 0.09, 4), L.hair, { p: [Math.cos(a) * 0.06, HY + 0.11, Math.sin(a) * 0.06 - 0.01], r: [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5] }); }
  if (L.hat === 'cap') { put(j.head, sph(0.116, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.45), L.hatColor, { p: [0, HY + 0.012, 0] }); put(j.head, box(0.15, 0.012, 0.09), L.hatColor, { p: [0, HY + 0.04, 0.12] }); }
  if (L.hat === 'beanie') put(j.head, sph(0.118, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), L.hatColor, { p: [0, HY + 0.02, 0], s: [1, 1.12, 1] });
  if (L.hat === 'fedora') { put(j.head, cyl(0.17, 0.17, 0.012, 14), L.hatColor, { p: [0, HY + 0.06, 0] }); put(j.head, cyl(0.085, 0.1, 0.1, 12), L.hatColor, { p: [0, HY + 0.11, 0] }); put(j.head, cyl(0.101, 0.101, 0.02, 12), '#222', { p: [0, HY + 0.075, 0] }); }
  if (L.hat === 'police') { put(j.head, cyl(0.12, 0.11, 0.07, 12), '#1e2a4a', { p: [0, HY + 0.09, 0] }); put(j.head, box(0.15, 0.01, 0.07), '#111', { p: [0, HY + 0.06, 0.11] }); }
  if (L.hat === 'chef') { put(j.head, cyl(0.1, 0.09, 0.12, 12), '#fafafa', { p: [0, HY + 0.13, 0] }); put(j.head, sph(0.11, 10, 6), '#fafafa', { p: [0, HY + 0.2, 0], s: [1, 0.6, 1] }); }

  // ידיים
  for (const s of ['L', 'R']) {
    const U = j['upperArm' + s], F = j['foreArm' + s], H = j['hand' + s];
    put(U, cyl(0.06, 0.052, DIM.upper, 8), sleeve, { p: [0, -DIM.upper / 2, 0] });
    put(U, sph(0.062, 8, 6), top, { p: [0, -0.02, 0] });
    put(F, cyl(0.05, 0.042, DIM.fore, 8), L.sleeves === 'long' || L.jacket ? top : L.skin, { p: [0, -DIM.fore / 2, 0] });
    put(H, box(0.06, 0.085, 0.04), L.gloves || L.skin, { p: [0, -0.04, 0] });
    put(H, box(0.022, 0.04, 0.025), L.gloves || L.skin, { p: [0, -0.03, 0.03] });
    // רגליים
    const T = j['thigh' + s], S = j['shin' + s], Ft = j['foot' + s];
    const legC = L.dress ? L.skin : L.pants;
    put(T, cyl(0.082 * W, 0.068, DIM.thigh, 8), legC, { p: [0, -DIM.thigh / 2, 0] });
    put(S, cyl(0.066, 0.055, DIM.shin, 8), legC, { p: [0, -DIM.shin / 2, 0] });
    if (L.dress) put(S, cyl(0.058, 0.058, 0.08, 8), L.shoes, { p: [0, -DIM.shin + 0.04, 0] });
    put(Ft, box(0.1, 0.075, 0.23), L.shoes, { p: [0, -0.01, 0.05] });
  }
  if (L.cane) put(j.handL, cyl(0.012, 0.012, 0.9, 6), '#5d4037', { p: [0, -0.45, 0.06] });

  // עיניים: "מפרק" קטן לכל עין – ה-Animator מכווץ אותו במצמוץ (scale.y)
  const eyes = [1, -1].map((sx) => {
    const e = new THREE.Group(); e.name = 'eye'; e.position.set(sx * 0.037, HY + 0.02, 0.097); j.head.add(e);
    put(e, sph(0.014, 8, 6), '#111216', { s: [1, 1.15, 0.5] });
    return e;
  });
  j.head.userData.eyes = eyes;
  B.bakeSkinned(rig.root, M.skin);

  // נקודת אחיזה לאוכל ביד ימין
  const hand = new THREE.Group(); hand.position.set(0, -0.09, 0.05); j.handR.add(hand);

  rig.root.scale.setScalar(L.height);
  rig.anim = new Animator(rig);
  rig.eyes = eyes; rig.hand = hand; rig.look = L;
  return rig;
}

/** תיבות פגיעה בלתי נראות: גוף (על root) + ראש (על head). מחזיר [body, head]. */
export function addHitBoxes(rig, ent) {
  const M = mats();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.45, 0.4), M.hit); body.position.y = 0.75; rig.root.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), M.hit); head.position.y = 0.1; rig.j.head.add(head);
  body.userData = { ent, zone: 'body' }; head.userData = { ent, zone: 'head' };
  return [body, head];
}

/** תנוחת זרועות רגועה לאזרח (אחרי anim.update – ה-Animator מגיע עם "שמירה" של לוחם) */
export function relaxArms(j, walk) {
  for (const s of ['L', 'R']) {
    const sx = s === 'L' ? 1 : -1;
    j['foreArm' + s].rotation.x = j['foreArm' + s].rotation.x * 0.45 - 0.05;
    j['upperArm' + s].rotation.x *= 0.8;
    j['upperArm' + s].rotation.z = sx * (0.07 + walk * 0.02);
  }
}

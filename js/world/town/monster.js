// הצורה האמיתית של המתחזה: מפלצת כפופה על אותו שלד (makeRig + Animator), גדולה פי ~1.8.
// buildMonster() → rig = { root, j, anim, tentacles[], jaw, eyes, glow, update(dt, t, rage) }
import * as THREE from 'three';
import { makeRig, Animator, DIM } from '../../core/anim.js';
import { partsBuilder, box, cyl, sph, cone, lathe } from './citizen.js';

export function buildMonster({ scale = 1.8, skin = '#3b2a4a', belly = '#6b3f5a', bone = '#e6dcc0', glow = '#7dff4a' } = {}) {
  const rig = makeRig(); const j = rig.j;
  const B = partsBuilder(), put = B.put;
  const mats = {
    body: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.1 }),
    bone: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.05 }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }),
  };
  // גוף: אגן צר, חזה ענק וכפוף, קוצים על הגב
  put(j.hips, sph(0.17, 10, 8), skin, { s: [1.1, 0.9, 0.9] });
  put(j.spine, lathe([[0.16, 0], [0.19, 0.12], [0.23, 0.25]], 12), skin, { s: [1.1, 1, 0.85] });
  put(j.spine, box(0.22, 0.22, 0.05), belly, { p: [0, 0.12, 0.16] });
  put(j.chest, lathe([[0.23, -0.02], [0.3, 0.12], [0.3, 0.22], [0.2, 0.3], [0.08, 0.33]], 14), skin, { s: [1.25, 1, 0.9] });
  put(j.chest, box(0.3, 0.2, 0.05), belly, { p: [0, 0.12, 0.25] });
  for (const sx of [1, -1]) put(j.chest, sph(0.13, 10, 8), skin, { p: [sx * 0.25, 0.24, 0] });
  for (let i = 0; i < 5; i++) put(j.chest, cone(0.045, 0.2 - i * 0.02, 5), bone, { p: [0, 0.3 - i * 0.07, -0.22 + i * 0.01], r: [-0.9, 0, 0], kind: 'bone' });
  for (let i = 0; i < 3; i++) put(j.spine, cone(0.04, 0.14, 5), bone, { p: [0, 0.2 - i * 0.08, -0.17], r: [-1.0, 0, 0], kind: 'bone' });
  // ראש: גולגולת שטוחה, לסת גדולה, קרניים, עיניים זוהרות
  put(j.neck, cyl(0.09, 0.12, 0.14, 8), skin, { p: [0, 0.02, 0.02] });
  const HY = 0.1;
  put(j.head, sph(0.15, 12, 10), skin, { p: [0, HY, 0.03], s: [1.1, 0.85, 1.25] });
  for (const sx of [1, -1]) {
    put(j.head, cone(0.04, 0.26, 6), bone, { p: [sx * 0.11, HY + 0.15, -0.04], r: [-0.6, 0, -sx * 0.5], kind: 'bone' });
    put(j.head, sph(0.032, 8, 6), glow, { p: [sx * 0.06, HY + 0.035, 0.18], s: [1.3, 0.7, 0.6], kind: 'glow' });
  }
  put(j.head, box(0.16, 0.03, 0.04), '#1a0d14', { p: [0, HY - 0.03, 0.19] }); // פה פתוח
  for (let i = 0; i < 6; i++) put(j.head, cone(0.011, 0.04, 4), bone, { p: [-0.065 + i * 0.026, HY - 0.012, 0.2], r: [Math.PI, 0, 0], kind: 'bone' });
  // לסת (נפרדת – נפתחת בשאגה)
  const jaw = new THREE.Group(); jaw.position.set(0, HY - 0.04, 0.05); j.head.add(jaw);
  put(jaw, box(0.18, 0.05, 0.17), skin, { p: [0, -0.02, 0.07] });
  for (let i = 0; i < 6; i++) put(jaw, cone(0.011, 0.04, 4), bone, { p: [-0.065 + i * 0.026, 0.02, 0.15], kind: 'bone' });
  // זרועות ארוכות עם טפרים
  for (const s of ['L', 'R']) {
    const U = j['upperArm' + s], F = j['foreArm' + s], H = j['hand' + s];
    put(U, cyl(0.09, 0.07, DIM.upper + 0.05, 8), skin, { p: [0, -DIM.upper / 2, 0] });
    put(F, cyl(0.075, 0.06, DIM.fore + 0.06, 8), skin, { p: [0, -DIM.fore / 2, 0] });
    for (let k = 0; k < 3; k++) put(F, cone(0.025, 0.09, 4), bone, { p: [s === 'L' ? 0.07 : -0.07, -0.05 - k * 0.07, -0.02], r: [0, 0, s === 'L' ? -1.2 : 1.2], kind: 'bone' });
    put(H, box(0.11, 0.1, 0.09), skin, { p: [0, -0.05, 0] });
    for (let k = 0; k < 4; k++) put(H, cone(0.016, 0.16, 5), bone, { p: [0, -0.16, -0.035 + k * 0.024], r: [Math.PI, 0, 0], kind: 'bone' });
    // רגליים: ברך הפוכה (נראה), טפרים
    const T = j['thigh' + s], S = j['shin' + s], Ft = j['foot' + s];
    put(T, cyl(0.11, 0.08, DIM.thigh, 8), skin, { p: [0, -DIM.thigh / 2, 0] });
    put(S, cyl(0.08, 0.06, DIM.shin, 8), skin, { p: [0, -DIM.shin / 2, 0] });
    put(Ft, box(0.14, 0.07, 0.24), skin, { p: [0, -0.02, 0.06] });
    for (let k = 0; k < 3; k++) put(Ft, cone(0.02, 0.09, 4), bone, { p: [-0.045 + k * 0.045, -0.03, 0.2], r: [Math.PI / 2, 0, 0], kind: 'bone' });
  }
  B.bake(mats);
  // מחושים על הגב: שרשרת קטעים
  const tentacles = [];
  const segGeo = new THREE.CylinderGeometry(0.035, 0.045, 0.16, 6).translate(0, 0.08, 0);
  const tMat = new THREE.MeshStandardMaterial({ color: belly, roughness: 0.5 });
  for (let i = 0; i < 4; i++) {
    let parent = new THREE.Group();
    parent.position.set((i - 1.5) * 0.09, 0.22, -0.2); parent.rotation.set(-0.9, 0, (i - 1.5) * 0.45);
    j.chest.add(parent);
    const segs = [];
    for (let k = 0; k < 6; k++) {
      const m = new THREE.Mesh(segGeo, tMat); m.scale.setScalar(1 - k * 0.12);
      if (k) m.position.y = 0.16 * (1 - (k - 1) * 0.12);
      parent.add(m); segs.push(m); parent = m;
    }
    tentacles.push(segs);
  }
  const light = new THREE.PointLight(glow, 3, 6, 2); light.position.set(0, HY + 0.05, 0.3); j.head.add(light);

  rig.root.scale.setScalar(scale);
  rig.anim = new Animator(rig);
  rig.jaw = jaw; rig.tentacles = tentacles; rig.glow = light;
  rig.update = (dt, t, rage = 0) => {
    tentacles.forEach((segs, i) => segs.forEach((m, k) => {
      m.rotation.x = Math.sin(t * (2.2 + rage * 2) + i * 1.3 + k * 0.7) * (0.25 + rage * 0.15);
      m.rotation.z = Math.cos(t * 1.7 + i + k * 0.5) * 0.2;
    }));
    jaw.rotation.x = 0.15 + Math.max(0, Math.sin(t * 1.3)) * 0.15 + rage * 0.5;
    light.intensity = 2.5 + Math.sin(t * 9) * 0.6;
  };
  return rig;
}

/** תיבות פגיעה למפלצת (זונות body/head) */
export function monsterHitBoxes(rig, ent) {
  const m = new THREE.MeshBasicMaterial({ visible: false });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.2, 0.65), m); body.position.y = 0.95; rig.root.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), m); head.position.set(0, 0.1, 0.05); rig.j.head.add(head);
  body.userData = { ent, zone: 'body' }; head.userData = { ent, zone: 'head' };
  return [body, head];
}

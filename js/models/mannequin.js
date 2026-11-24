// דמות זמנית על השלד של core/anim.js – סוכן הדמויות מחליף ב-models/character.js (אותו שלד, אותם שמות מפרקים).
import * as THREE from 'three';
import { makeRig, DIM } from '../core/anim.js';

const mat = (c, r = 0.8) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: 0.05 });

export function buildMannequin({ hoodie = '#2c3038', vest = '#3d4430', pants = '#4a4f57', boots = '#1b1d21', skin = '#e0b48f', hair = '#1d1a22', mask = '#121316' } = {}) {
  const rig = makeRig(); const j = rig.j;
  const M = { hoodie: mat(hoodie), vest: mat(vest, 0.9), pants: mat(pants), boots: mat(boots, 0.6), skin: mat(skin, 0.6), hair: mat(hair, 0.7), mask: mat(mask, 0.5) };
  const add = (parent, geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); parent.add(o); return o; };
  const limb = (parent, len, r, m, r2 = r) => add(parent, new THREE.CylinderGeometry(r, r2, len, 10), m, 0, -len / 2, 0);

  // גוף
  add(j.hips, new THREE.BoxGeometry(0.32, 0.16, 0.2), M.pants, 0, 0, 0);
  add(j.spine, new THREE.BoxGeometry(0.33, DIM.spine + 0.02, 0.21), M.hoodie, 0, DIM.spine / 2, 0);
  add(j.chest, new THREE.BoxGeometry(0.4, DIM.chest, 0.24), M.hoodie, 0, DIM.chest / 2, 0);
  // אפוד + כיסים
  add(j.chest, new THREE.BoxGeometry(0.36, 0.24, 0.27), M.vest, 0, 0.11, 0.005);
  for (let i = 0; i < 3; i++) add(j.chest, new THREE.BoxGeometry(0.075, 0.09, 0.05), M.vest, -0.1 + i * 0.1, 0.06, 0.155);
  add(j.spine, new THREE.BoxGeometry(0.36, 0.05, 0.25), M.boots, 0, 0.0, 0); // חגורה
  // ברדס מאחור
  add(j.chest, new THREE.SphereGeometry(0.13, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.hoodie, 0, DIM.chest - 0.02, -0.1).scale.set(1.2, 0.7, 0.8);
  // צוואר + ראש
  add(j.neck, new THREE.CylinderGeometry(0.05, 0.06, 0.1, 8), M.skin, 0, 0.02, 0);
  const head = add(j.head, new THREE.SphereGeometry(0.115, 16, 12), M.skin, 0, 0.1, 0); head.scale.set(0.92, 1.05, 1);
  const m = add(j.head, new THREE.SphereGeometry(0.118, 16, 8, -Math.PI * 0.55, Math.PI * 1.1, Math.PI * 0.52, Math.PI * 0.35), M.mask, 0, 0.1, 0.004);
  m.scale.set(0.95, 1.06, 1.03);
  // עיניים (למצמוץ)
  const eyeM = new THREE.MeshBasicMaterial({ color: '#16181c' });
  j.head.userData.eyes = [-1, 1].map((sx) => add(j.head, new THREE.BoxGeometry(0.03, 0.014, 0.01), eyeM, sx * 0.04, 0.115, 0.108));
  // שיער פרוע
  const hairG = new THREE.ConeGeometry(0.045, 0.15, 5);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2, r = 0.085;
    const c = add(j.head, hairG, M.hair, Math.cos(a) * r, 0.17 + Math.random() * 0.03, Math.sin(a) * r * 0.9 - 0.01);
    c.lookAt(new THREE.Vector3(Math.cos(a) * 2, 0.6 + Math.random() * 0.5, Math.sin(a) * 2 - 0.2).add(c.position));
    c.rotateX(Math.PI / 2);
  }
  add(j.head, new THREE.SphereGeometry(0.12, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.hair, 0, 0.13, -0.005).scale.set(1, 0.7, 1.05);
  // ידיים
  for (const s of ['L', 'R']) {
    limb(j['upperArm' + s], DIM.upper, 0.065, M.hoodie, 0.058);
    limb(j['foreArm' + s], DIM.fore, 0.058, M.hoodie, 0.048);
    add(j['foreArm' + s], new THREE.CylinderGeometry(0.05, 0.05, 0.04, 10), M.hoodie, 0, -DIM.fore + 0.03, 0); // שרוול
    add(j['hand' + s], new THREE.BoxGeometry(0.075, 0.085, 0.04), M.mask, 0, -0.045, 0);
    // רגליים
    limb(j['thigh' + s], DIM.thigh, 0.085, M.pants, 0.07);
    add(j['thigh' + s], new THREE.BoxGeometry(0.06, 0.1, 0.12), M.pants, (s === 'L' ? 1 : -1) * 0.085, -0.22, 0.0); // כיס צד
    limb(j['shin' + s], DIM.shin, 0.07, M.pants, 0.06);
    add(j['shin' + s], new THREE.CylinderGeometry(0.075, 0.075, 0.12, 10), M.boots, 0, -DIM.shin + 0.08, 0);
    add(j['foot' + s], new THREE.BoxGeometry(0.11, 0.08, 0.25), M.boots, 0, 0.0, 0.05);
  }
  rig.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return rig;
}

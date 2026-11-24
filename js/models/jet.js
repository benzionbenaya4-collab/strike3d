// מטוס קרב חמקני – מודל פרוצדורלי לפי refs/jet.jpg.
// חרטום לכיוון +Z, ציר Y למעלה, יחידה = מטר. אורך ~18 מ׳, מוטת כנפיים ~13.6 מ׳.
// buildJet() מחזיר THREE.Group עם userData: { length, span, nozzles, setThrottle(v), update(dt) }.
// flyover() – עוזר תנועה: מעבר בקו ישר (עם הטיה קלה) + אירוע הצנחה מעל נקודה.
import * as THREE from 'three';

const M = (color, metal, rough, extra = {}) => new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough, ...extra });

// צורה במישור XZ (מבט על) → ExtrudeGeometry לעובי בציר Y. נקודות: [x, z].
function plate(points, thick, bevel = 0.04) {
  const s = new THREE.Shape();
  points.forEach(([x, z], i) => (i ? s.lineTo(x, z) : s.moveTo(x, z)));
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 4 });
  g.rotateX(Math.PI / 2);            // shape-y → z, עומק → -y
  g.translate(0, thick / 2, 0);      // ממורכז סביב y=0
  g.computeVertexNormals();
  return g;
}

export function buildJet({ color = '#bcc5cf' } = {}) {
  const g = new THREE.Group();
  g.name = 'jet';
  const body = M(color, 0.35, 0.48);
  const bodyDark = M('#9aa3ae', 0.4, 0.55);
  const metal = M('#3b4048', 0.8, 0.35);
  const black = M('#0d0f13', 0.2, 0.9);
  const glass = M('#2a2f38', 0.9, 0.12, { envMapIntensity: 2.5, emissive: '#3a2c12', emissiveIntensity: 0.25 });

  const add = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };

  // גוף מרכזי: לייט סביב ציר Z, משוטח (רחב ונמוך) – חרטום חד בצורת יהלום
  const prof = [[0, 9.2], [0.18, 8.7], [0.42, 7.8], [0.66, 6.6], [0.85, 5.2], [0.98, 3.6], [1.02, 1.5], [1.0, -2], [0.92, -5.5], [0.8, -7.6], [0.72, -8.4], [0, -8.45]]
    .map(([r, z]) => new THREE.Vector2(r, z));
  const fus = new THREE.LatheGeometry(prof, 8);       // 8 צלעות = מראה פאות חמקני
  fus.rotateX(Math.PI / 2); fus.rotateZ(Math.PI / 8);
  fus.scale(1.15, 0.62, 1);
  fus.computeVertexNormals();
  add(fus, body, 0, 0.05, 0);

  // גוף נושא (מבט על): עובר מהתעלות עד הזנב, נותן את הצללית הרחבה
  add(plate([[-0.9, 5.4], [0.9, 5.4], [2.05, 2.6], [2.25, -5.2], [1.4, -8.2], [-1.4, -8.2], [-2.25, -5.2], [-2.05, 2.6]], 0.5, 0.12), body, 0, -0.08, 0);
  // שפת ה"צ'ין" (chine) לאורך החרטום – קצה חד
  add(plate([[0, 8.9], [0.75, 6.2], [1.0, 4.0], [-1.0, 4.0], [-0.75, 6.2]], 0.06, 0.03), body, 0, -0.02, 0);

  // כנפיים משולשות/טרפזיות
  for (const sd of [1, -1]) {
    const w = plate([[1.6, 2.0], [6.8, -3.3], [6.8, -4.5], [5.9, -4.9], [2.0, -5.6], [1.6, -5.6]].map(([x, z]) => [x * sd, z]), 0.12, 0.05);
    add(w, body, 0, -0.1, 0);
    // מייצב גובה אחורי (יהלום)
    add(plate([[1.9, -6.0], [4.6, -7.6], [4.4, -8.6], [2.2, -8.9], [1.4, -8.2]].map(([x, z]) => [x * sd, z]), 0.09, 0.04), bodyDark, 0, -0.12, 0);
    // שתי זנבות V – נטויים החוצה
    const finS = new THREE.Shape();
    finS.moveTo(0, 0); finS.lineTo(-2.4, 0); finS.lineTo(-3.4, 2.6); finS.lineTo(-2.5, 2.6); finS.lineTo(0, 0);
    const finG = new THREE.ExtrudeGeometry(finS, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1 });
    finG.rotateY(-Math.PI / 2); // shape-x → z
    const fin = new THREE.Mesh(finG, body);
    fin.position.set(sd * 1.55, 0.3, -4.9);
    fin.rotation.z = -sd * 0.42;
    g.add(fin);
    // תעלות אוויר: פתח זוויתי + פנים שחור
    const intake = add(new THREE.BoxGeometry(0.75, 0.85, 2.6), bodyDark, sd * 1.35, -0.05, 2.9);
    intake.rotation.y = sd * -0.12;
    const mouth = add(new THREE.PlaneGeometry(0.62, 0.72), black, sd * 1.5, -0.05, 4.21);
    mouth.rotation.y = sd * -0.12;
    // נחיר מנוע
    add(new THREE.CylinderGeometry(0.5, 0.55, 1.1, 8).rotateX(Math.PI / 2), metal, sd * 0.62, 0.02, -8.55);
    // גלגלי נחיתה מקופלים – פס כהה מתחת
    add(new THREE.BoxGeometry(0.15, 0.04, 2.2), black, sd * 1.2, -0.38, -1.5);
  }

  // תא טייס כהה – כיפה אליפטית
  const can = new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  can.scale(0.52, 0.48, 1.9);
  add(can, glass, 0, 0.42, 4.6);

  // זוהר מנועים: דיסק + להבה שקופה בתוספת (additive)
  const glowMat = new THREE.MeshBasicMaterial({ color: '#ff9a3c', transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  const flameMat = new THREE.MeshBasicMaterial({ color: '#5fb6ff', transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
  const nozzles = [];
  for (const sd of [1, -1]) {
    const disc = add(new THREE.CircleGeometry(0.42, 12), glowMat, sd * 0.62, 0.02, -9.11);
    disc.rotation.y = Math.PI;
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.36, 1, 10, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -0.5), flameMat);
    flame.position.set(sd * 0.62, 0.02, -9.12);
    g.add(flame);
    nozzles.push({ disc, flame });
  }

  let throttle = 0.7, t = 0;
  g.userData = {
    length: 18.4, span: 13.6, nozzles,
    setThrottle(v) { throttle = THREE.MathUtils.clamp(v, 0, 1); },
    update(dt) {
      t += dt;
      const f = throttle * (0.9 + Math.sin(t * 47) * 0.06 + Math.sin(t * 31) * 0.04);
      for (const n of nozzles) { n.flame.scale.set(1, 1, 0.4 + f * 3.2); n.disc.material.opacity = 0.4 + throttle * 0.6; }
      flameMat.opacity = 0.15 + throttle * 0.45;
    },
  };
  return g;
}

// מעבר טיסה בקו ישר. from/to: Vector3. מחזיר אובייקט עם update(dt) → true כשהסתיים.
// dropAt (אופציונלי): נקודה בקרקע; onDrop(pos) נקרא כשהמטוס הכי קרוב אליה (שם קופצים מהמטוס).
export function flyover(jet, { from, to, speed = 70, bank = 0.25, dropAt = null, onDrop = null } = {}) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length(); dir.normalize();
  const yaw = Math.atan2(dir.x, dir.z), pitch = -Math.asin(dir.y);
  let s = 0, dropped = !dropAt;
  const dropS = dropAt ? THREE.MathUtils.clamp(new THREE.Vector3().subVectors(dropAt, from).dot(dir), 0, len) : 0;
  jet.position.copy(from);
  jet.rotation.set(pitch, yaw, 0, 'YXZ');
  const fl = {
    done: false, progress: 0,
    update(dt) {
      if (fl.done) return true;
      s = Math.min(len, s + speed * dt);
      fl.progress = s / len;
      jet.position.copy(from).addScaledVector(dir, s);
      // הטיה עדינה (נדנוד כנפיים) לתחושת חיים
      jet.rotation.set(pitch, yaw, Math.sin(fl.progress * Math.PI * 2) * bank, 'YXZ');
      jet.userData.update?.(dt);
      if (!dropped && s >= dropS) { dropped = true; onDrop?.(jet.position.clone()); }
      if (s >= len) fl.done = true;
      return fl.done;
    },
  };
  return fl;
}

// מסלול מעבר אקראי מעל זירה בגודל size (מטר), בגובה alt – נוח לקרב ולתצוגת המפה.
export function randomPass(size = 100, alt = 55, rand = Math.random) {
  const a = rand() * Math.PI * 2, r = size * 0.95;
  const off = (rand() - 0.5) * size * 0.4;
  const d = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), n = new THREE.Vector3(-d.z, 0, d.x);
  const from = d.clone().multiplyScalar(-r).addScaledVector(n, off).setY(alt);
  const to = d.clone().multiplyScalar(r).addScaledVector(n, off).setY(alt + 4);
  return { from, to };
}

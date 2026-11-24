// סכין קרבית טקטית – מודל פרוצדורלי. אורך ~0.31 מ׳, להב לכיוון +X, אחיזה סביב הראשית.
import * as THREE from 'three';
import { skin as getSkin } from '../data/skins.js';

const M = (color, metal = 0.2, rough = 0.6, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough, ...extra });

export function buildKnife(skinId = 'default') {
  const s = getSkin(skinId);
  const g = new THREE.Group();
  g.name = 'knife';

  const steel = s.id === 'default' ? '#c7ccd3' : s.a;
  const bladeMat = M(steel, 0.9, 0.25, s.glow ? { emissive: s.glow, emissiveIntensity: 0.04 } : {});
  const darkMat = M(s.b, 0.4, 0.7);
  const gripMat = M(s.id === 'default' ? '#2b2f35' : s.b, 0.1, 0.9);

  // להב: גב ישר, חוד clip-point, חוד חיתוך מעוגל
  const sh = new THREE.Shape();
  sh.moveTo(0, 0.017);
  sh.lineTo(0.12, 0.017);
  sh.lineTo(0.165, 0.008);            // clip – ירידה לחוד
  sh.lineTo(0.185, 0.0);              // חוד
  sh.quadraticCurveTo(0.15, -0.02, 0.09, -0.022);
  sh.lineTo(0.012, -0.02);
  sh.quadraticCurveTo(0, -0.02, 0, -0.012);
  sh.lineTo(0, 0.017);
  const blade = new THREE.Mesh(
    new THREE.ExtrudeGeometry(sh, { depth: 0.003, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0012, bevelSegments: 2, curveSegments: 10 }),
    bladeMat,
  );
  blade.geometry.translate(0, 0, -0.0015);
  blade.position.x = 0.012;
  g.add(blade);

  // חריץ (fuller) משני הצדדים
  for (const z of [0.0032, -0.0032]) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.004, 0.0006), darkMat);
    f.position.set(0.075, 0.005, z);
    g.add(f);
  }
  // שיניים על הגב
  for (let i = 0; i < 6; i++) {
    const t = new THREE.Mesh(new THREE.ConeGeometry(0.0028, 0.006, 4), bladeMat);
    t.position.set(0.03 + i * 0.009, 0.02, 0);
    t.rotation.z = -0.5;
    g.add(t);
  }
  // קו זוהר על החוד בסקינים מיוחדים
  if (s.glow) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.0015, 0.0075),
      new THREE.MeshBasicMaterial({ color: s.glow }));
    edge.position.set(0.1, -0.019, 0);
    g.add(edge);
  }

  // מגן
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.058, 0.018), darkMat);
  guard.position.set(0.006, -0.002, 0);
  g.add(guard);

  // ידית שטוחה עם טבעות אחיזה
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.0145, 0.0125, 0.11, 14), gripMat);
  handle.rotation.z = Math.PI / 2;
  handle.scale.set(1, 1, 0.72);
  handle.position.x = -0.055;
  g.add(handle);
  for (let i = 0; i < 5; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.0142, 0.0022, 6, 16), darkMat);
    r.rotation.y = Math.PI / 2;
    r.scale.set(1, 1, 0.72);
    r.position.x = -0.02 - i * 0.018;
    g.add(r);
  }
  // פומל + חור לרצועה
  const pommel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.012, 0.016, 8), darkMat);
  pommel.rotation.z = Math.PI / 2;
  pommel.scale.set(1, 1, 0.75);
  pommel.position.x = -0.118;
  g.add(pommel);
  const loop = new THREE.Mesh(new THREE.TorusGeometry(0.006, 0.002, 6, 12), bladeMat);
  loop.position.x = -0.13;
  g.add(loop);

  g.userData = { weaponId: 'knife', skin: s.id, length: 0.31, gripPoint: new THREE.Vector3(-0.055, 0, 0) };
  return g;
}

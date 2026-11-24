// חיסכון ב-draw calls: איחוד רשתות לפי צבע-קודקוד.
//   mergeStatic(group)  – כל הרשתות הסטטיות בקבוצה → רשת אחת (צבעי החומרים נאפים לקודקודים).
//   skinify(root)       – היררכיה מונפשת (Groups + Meshes) → SkinnedMesh אחד; ה-Groups הם המפרקים ונשארים לאנימציה.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _c = new THREE.Color();
function prep(mesh, matrix) {
  let g = mesh.geometry.clone();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
  if (!g.attributes.normal) g.computeVertexNormals();
  g.applyMatrix4(matrix);
  const m = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  _c.copy(m.color || _c.set('#fff'));
  if (m.isMeshBasicMaterial) _c.multiplyScalar(1.6); // "זוהר" בערך
  const n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

let MAT = null;
const vcMat = () => (MAT ||= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05 }));

export function mergeStatic(group, mat = vcMat()) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert(), M = new THREE.Matrix4();
  const geos = [], drop = [];
  group.traverse((o) => { if (o.isMesh && !o.material.map) { geos.push(prep(o, M.multiplyMatrices(inv, o.matrixWorld))); drop.push(o); } });
  for (const o of drop) o.parent.remove(o);
  if (!geos.length) return null;
  const mesh = new THREE.Mesh(mergeGeometries(geos, false), mat); mesh.name = group.name + '_merged';
  geos.forEach((g) => g.dispose());
  group.add(mesh);
  return mesh;
}

export function skinify(root, mat = vcMat()) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), M = new THREE.Matrix4();
  const bones = [], geos = [], drop = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    const b = o.parent; let bi = bones.indexOf(b); if (bi < 0) { bi = bones.length; bones.push(b); }
    const g = prep(o, M.multiplyMatrices(inv, o.matrixWorld));
    const n = g.attributes.position.count, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { si[i * 4] = bi; sw[i * 4] = 1; }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    geos.push(g); drop.push(o);
  });
  for (const o of drop) o.parent.remove(o);
  const mesh = new THREE.SkinnedMesh(mergeGeometries(geos, false), mat);
  geos.forEach((g) => g.dispose());
  root.add(mesh); root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));
  return mesh;
}

// בסיס 9 – בניית העולם: אתר ההתרסקות ביער (z<0), לובי + מסדרון + חדרים (0..42), מעבדה (42..58), האנגר (58..96).
// יחידה = מטר, Y למעלה. כל ההתנגשויות הן תיבות AABB ב-boxes (כמו training.js).
// buildBase9() מחזיר:
//   group, boxes, items (נקודות אינטראקציה), doors, lamps (מנורות לפי מקור חשמל), fires, spots (נקודות צללים לכל פרק),
//   jet (מטוס בהאנגר), wreck, areaAt(pos), openDoor(id), setPower(src, on), update(dt, t), dispose()
import * as THREE from 'three';
import { buildJet } from '../../models/jet.js';

const V3 = THREE.Vector3;
const H = 3.2;        // גובה תקרה בבניין
const HH = 10;        // גובה ההאנגר
const T = 0.3;        // עובי קיר
const DOOR_H = 2.5;

function canvasTex(w, h, draw, rx = 1, ry = rx) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 4;
  return t;
}
const speckle = (g, w, h, n, a) => { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * a})`; g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 3, 2 + Math.random() * 3); } };

let MAT = null;
function mats() {
  if (MAT) return MAT;
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0, ...o });
  const dirt = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#2d3222'; g.fillRect(0, 0, w, h); speckle(g, w, h, 1600, 0.12);
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(20,16,10,${Math.random() * 0.4})`; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 6 + Math.random() * 18, 0, 7); g.fill(); }
  }, 30);
  const concrete = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#6c6f72'; g.fillRect(0, 0, w, h); speckle(g, w, h, 1400, 0.08);
    for (let i = 0; i < 9; i++) { const x = Math.random() * w; const gr = g.createLinearGradient(x, 0, x, h); gr.addColorStop(0, 'rgba(40,30,20,0.35)'); gr.addColorStop(1, 'rgba(40,30,20,0)'); g.fillStyle = gr; g.fillRect(x, 0, 6 + Math.random() * 14, h * (0.3 + Math.random() * 0.6)); }
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2; g.strokeRect(0, 0, w, h);
  }, 1);
  const tiles = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#4a4d50'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = `hsl(200,4%,${26 + Math.random() * 8}%)`; g.fillRect(x * 64 + 2, y * 64 + 2, 60, 60); }
    speckle(g, w, h, 900, 0.1);
  }, 1);
  const metalT = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#3d4248'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) { g.fillStyle = 'rgba(255,255,255,0.04)'; g.fillRect(0, y, w, 2); }
    speckle(g, w, h, 300, 0.12);
  }, 1);
  const wall = std({ map: concrete });
  MAT = {
    dirt: std({ map: dirt, color: '#9aa39a' }), wall, facade: std({ map: concrete, color: '#8a8d92' }), floor: std({ map: tiles }), ceil: std({ color: '#2a2c2f' }),
    metal: std({ map: metalT, metalness: 0.4, roughness: 0.6 }), dark: std({ color: '#1c1e22', roughness: 0.7 }), wood: std({ color: '#5a4430' }),
    trunk: std({ color: '#2b2219' }), leaf: std({ color: '#16231a' }), white: std({ color: '#b9bcbf' }), orange: std({ color: '#d0661f' }),
    door: std({ map: metalT, color: '#7b8592', metalness: 0.5, roughness: 0.5 }), hazard: std({ color: '#c9a227' }),
    lampOff: new THREE.MeshStandardMaterial({ color: '#555', emissive: '#000', roughness: 0.4 }),
    glass: new THREE.MeshStandardMaterial({ color: '#2a8c5a', emissive: '#1b6b3f', emissiveIntensity: 0.9, transparent: true, opacity: 0.55, roughness: 0.1 }),
    fire: new THREE.MeshBasicMaterial({ color: '#ff8a2a', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
    glowItem: (c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.5, roughness: 0.5 }),
    padRed: new THREE.MeshBasicMaterial({ color: '#ff2a2a' }), padGreen: new THREE.MeshBasicMaterial({ color: '#2aff6a' }),
    paper: std({ color: '#d9d2bc', emissive: '#3a3628', emissiveIntensity: 0.6 }),
  };
  return MAT;
}

// אקראי קבוע (אותו יער בכל משחק)
const seeded = (s) => () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;

export function buildBase9() {
  const M = mats();
  const group = new THREE.Group(); group.name = 'base9';
  const geos = [];
  const G = (g) => { geos.push(g); return g; };
  const boxes = [], items = [], lamps = [], fires = [], doors = {}, anim = [];
  const mesh = (geo, mat, x, y, z, parent = group) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  const box = (cx, cz, w, h, d, mat, y0 = 0, collide = true, uv = true) => {
    const g = G(new THREE.BoxGeometry(w, h, d));
    if (uv && mat.map) { const a = g.attributes.uv, n = g.attributes.normal; // UV לפי מטרים: 1 חזרה ל-2.5 מ׳
      for (let i = 0; i < a.count; i++) { const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)); const sw = nx > 0.5 ? d : w, sh = ny > 0.5 ? d : h; a.setXY(i, a.getX(i) * sw / 2.5, a.getY(i) * sh / 2.5); } }
    const m = mesh(g, mat, cx, y0 + h / 2, cz);
    if (collide) boxes.push({ min: new V3(cx - w / 2, y0, cz - d / 2), max: new V3(cx + w / 2, y0 + h, cz + d / 2), m });
    return m;
  };
  // קיר לאורך X ב-z קבוע, עם פתחים [[x1,x2],...]
  const wallX = (z, x1, x2, h, gaps = [], mat = M.wall) => {
    let x = x1;
    for (const [a, b] of [...gaps].sort((p, q) => p[0] - q[0])) {
      if (a > x) box((x + a) / 2, z, a - x, h, T, mat);
      box((a + b) / 2, z, b - a, h - DOOR_H, T, mat, DOOR_H, false); // משקוף
      x = b;
    }
    if (x2 > x) box((x + x2) / 2, z, x2 - x, h, T, mat);
  };
  const wallZ = (x, z1, z2, h, gaps = [], mat = M.wall) => {
    let z = z1;
    for (const [a, b] of [...gaps].sort((p, q) => p[0] - q[0])) {
      if (a > z) box(x, (z + a) / 2, T, h, a - z, mat);
      box(x, (a + b) / 2, T, h - DOOR_H, b - a, mat, DOOR_H, false);
      z = b;
    }
    if (z2 > z) box(x, (z + z2) / 2, T, h, z2 - z, mat);
  };
  const plane = (x1, z1, x2, z2, y, mat, down = false, rep = 2.5) => {
    const w = x2 - x1, d = z2 - z1, g = G(new THREE.PlaneGeometry(w, d));
    if (mat.map) { const a = g.attributes.uv; for (let i = 0; i < a.count; i++) a.setXY(i, a.getX(i) * w / rep, a.getY(i) * d / rep); }
    const m = mesh(g, mat, (x1 + x2) / 2, y, (z1 + z2) / 2); m.rotation.x = down ? Math.PI / 2 : -Math.PI / 2; return m;
  };
  const item = (id, x, y, z, obj, label, r = 1.6) => {
    if (obj) { obj.position.set(x, y, z); group.add(obj); }
    const it = { id, pos: new V3(x, y, z), obj, label, r, done: false };
    items.push(it); return it;
  };
  const lamp = (x, y, z, src, { flicker = 0, r = 4.5, color = '#ffe2b0', big = false, broken = false } = {}) => {
    const m = mesh(G(new THREE.BoxGeometry(big ? 1.6 : 1.1, 0.08, big ? 0.5 : 0.28)), new THREE.MeshStandardMaterial({ color: '#888', emissive: color, emissiveIntensity: 0 }), x, y - 0.05, z);
    const l = { pos: new V3(x, y - 0.3, z), src, flicker, r, color: new THREE.Color(color), m, on: false, broken, k: 0, ph: Math.random() * 100, lit: 0 };
    lamps.push(l); return l;
  };
  const door = (id, cx, cz, w, h, alongX, mat = M.door, slide = 'up') => {
    const m = box(cx, cz, alongX ? w : 0.18, h, alongX ? 0.18 : w, mat);
    const b = boxes[boxes.length - 1];
    const d = { id, m, b, open: false, k: 0, h, slide, y0: m.position.y, alongX };
    doors[id] = d; return d;
  };

  // ======================= חוץ: יער ואתר התרסקות =======================
  plane(-34, -64, 34, 0, 0, M.dirt, false, 8);
  // גבולות בלתי נראים
  for (const [cx, cz, w, d] of [[-33, -32, 1, 64], [33, -32, 1, 64], [0, -63, 66, 1]]) boxes.push({ min: new V3(cx - w / 2, 0, cz - d / 2), max: new V3(cx + w / 2, 6, cz + d / 2) });
  // חזית הבסיס (z=0) עם דלת ראשית
  wallX(0, -33, 33, 7, [[-1.6, 1.6]], M.facade);
  box(0, -0.6, 4.6, 0.25, 1.2, M.dark, DOOR_H + 0.2, false);    // גגון
  box(0, -0.25, 0.7, 0.12, 0.3, M.lampOff, DOOR_H + 0.05, false); // מנורה מתה מעל הדלת
  door('main', 0, 0, 3.2, DOOR_H, true);
  const reader = box(2.1, -0.2, 0.22, 0.32, 0.08, M.dark, 1.15, false);
  const readerLed = mesh(G(new THREE.BoxGeometry(0.06, 0.06, 0.02)), M.padRed, 2.1, 1.4, -0.25);
  item('main', 1.6, 1.2, -0.6, null, 'דלת הבסיס', 2.2);
  // שלט
  const sign = canvasTex(256, 64, (g, w, h) => { g.fillStyle = '#1b1d20'; g.fillRect(0, 0, w, h); g.fillStyle = '#c9a227'; g.font = 'bold 34px Rubik, sans-serif'; g.textAlign = 'center'; g.fillText('בסיס 9 · אזור סגור', w / 2, 44); });
  mesh(G(new THREE.PlaneGeometry(3.2, 0.8)), new THREE.MeshStandardMaterial({ map: sign, roughness: 0.8 }), 0, 4.2, -0.17).rotation.y = Math.PI;

  // עצים (InstancedMesh: גזע + 2 קונוסים)
  const rnd = seeded(9);
  const clear = [[8, -38, 11], [0, -20, 3.2], [-18, -14, 5], [16, -15, 5], [0, -4, 5], [0, -44, 5]];
  const trees = [];
  for (let i = 0; i < 400 && trees.length < 85; i++) {
    const x = -31 + rnd() * 62, z = -61 + rnd() * 57;
    if (clear.some(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < r)) continue;
    if (Math.abs(x) < 3 && z > -36) continue; // שביל לדלת
    if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < 2.6)) continue;
    trees.push({ x, z, s: 0.8 + rnd() * 0.7, r: rnd() * 6 });
  }
  const trunkG = G(new THREE.CylinderGeometry(0.14, 0.22, 3.4, 6).translate(0, 1.7, 0));
  const leafG = G(new THREE.ConeGeometry(1.6, 4.2, 7).translate(0, 4.6, 0));
  const leafG2 = G(new THREE.ConeGeometry(1.15, 3.2, 7).translate(0, 6.6, 0));
  const imT = new THREE.InstancedMesh(trunkG, M.trunk, trees.length), imL = new THREE.InstancedMesh(leafG, M.leaf, trees.length), imL2 = new THREE.InstancedMesh(leafG2, M.leaf, trees.length);
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new V3();
  trees.forEach((t, i) => {
    _q.setFromAxisAngle(new V3(0, 1, 0), t.r); _s.setScalar(t.s); _m.compose(new V3(t.x, 0, t.z), _q, _s);
    imT.setMatrixAt(i, _m); imL.setMatrixAt(i, _m); imL2.setMatrixAt(i, _m);
    boxes.push({ min: new V3(t.x - 0.25, 0, t.z - 0.25), max: new V3(t.x + 0.25, 4, t.z + 0.25), tree: true });
  });
  group.add(imT, imL, imL2);

  // הריסות המטוס: נקודת החרטום תקועה באדמה
  const wreck = buildJet({ color: '#7d858e' });
  wreck.position.set(8, 0.9, -38); wreck.rotation.set(0.12, Math.PI / 2 + 0.25, 0.32, 'YXZ');
  wreck.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color?.multiplyScalar(0.55); } });
  group.add(wreck);
  boxes.push({ min: new V3(0, 0, -40.2), max: new V3(16, 2.6, -35.8) }, { min: new V3(4.5, 0, -45), max: new V3(10.5, 1.3, -31) });
  // שברים
  box(-1.5, -33, 2.4, 0.3, 1.2, M.metal, 0, true, false).rotation.set(0.2, 0.7, 0.3);
  box(14, -44, 1.6, 0.7, 1.0, M.metal, 0, true, false).rotation.set(0, 0.4, 0.5);
  // אש: להבות + נקודה מוארת (צללים לא נכנסים)
  const fireG = G(new THREE.ConeGeometry(0.45, 1.4, 6).translate(0, 0.7, 0));
  for (const [fx, fz, s] of [[15.2, -37.6, 1.2], [15.8, -38.6, 0.8], [3.2, -39.6, 0.7]]) {
    const f = new THREE.Group(); f.position.set(fx, 0.15, fz);
    for (let i = 0; i < 3; i++) { const c = mesh(fireG, M.fire, (i - 1) * 0.25 * s, 0, (i % 2) * 0.2, f); c.scale.setScalar(s * (0.7 + i * 0.2)); }
    group.add(f); fires.push({ pos: new V3(fx, 1, fz), r: 3.6 * s, g: f, s });
    if (s > 1) lamps.push({ pos: new V3(fx, 1.2, fz), src: 'always', fire: true, flicker: 0, r: 6, color: new THREE.Color('#ff7a2a'), m: { material: {} }, on: false, cur: 1 });
  }

  // פריטים בפרק 1
  const flashlightM = new THREE.Group();
  mesh(G(new THREE.CylinderGeometry(0.05, 0.05, 0.28, 10)), M.dark, 0, 0, 0, flashlightM).rotation.z = Math.PI / 2;
  mesh(G(new THREE.CylinderGeometry(0.07, 0.055, 0.08, 10)), M.metal, 0.17, 0, 0, flashlightM).rotation.z = Math.PI / 2;
  mesh(G(new THREE.CircleGeometry(0.06, 10)), new THREE.MeshBasicMaterial({ color: '#fff6c8' }), 0.215, 0, 0, flashlightM).rotation.y = Math.PI / 2;
  item('flashlight', 1.2, 0.07, -40.5, flashlightM, 'פנס');
  const kitM = new THREE.Group(); mesh(G(new THREE.BoxGeometry(0.6, 0.28, 0.4)), M.glowItem('#c2551b'), 0, 0.14, 0, kitM); mesh(G(new THREE.BoxGeometry(0.3, 0.04, 0.06)), M.dark, 0, 0.3, 0, kitM);
  item('kit', 12.5, 0, -32.6, kitM, 'ערכת הישרדות');
  item('radio', 3.4, 1.1, -37.2, null, 'רדיו המטוס', 1.8);

  // עמדת שמירה ביער
  const bx = -18, bz = -14;
  wallX(bz - 1.6, bx - 1.6, bx + 1.6, 2.7); wallX(bz + 1.6, bx - 1.6, bx + 1.6, 2.7); wallZ(bx - 1.6, bz - 1.6, bz + 1.6, 2.7); wallZ(bx + 1.6, bz - 1.6, bz + 1.6, 2.7, [[bz - 0.6, bz + 0.6]]);
  box(bx, bz, 3.6, 0.15, 3.6, M.dark, 2.7, false);
  box(bx - 0.9, bz, 0.7, 0.8, 1.6, M.wood);
  const cardM = new THREE.Group(); mesh(G(new THREE.BoxGeometry(0.16, 0.01, 0.1)), M.glowItem('#2a7bd6'), 0, 0, 0, cardM);
  item('card', bx - 0.9, 0.81, bz - 0.4, cardM, 'כרטיס כניסה');
  const paperG = G(new THREE.BoxGeometry(0.22, 0.01, 0.3));
  const paper = () => { const g = new THREE.Group(); mesh(paperG, M.paper, 0, 0, 0, g); return g; };
  item('log1', bx - 0.9, 0.81, bz + 0.35, paper(), 'יומן שומר');
  // משאית נטושה + סוללה מאחוריה
  box(16, -15, 2.6, 2.4, 6.2, M.metal, 0.5); box(16, -11.5, 2.4, 1.6, 1.2, M.dark, 0.7);
  for (const [wx, wz] of [[14.7, -13], [17.3, -13], [14.7, -17.4], [17.3, -17.4]]) mesh(G(new THREE.CylinderGeometry(0.5, 0.5, 0.35, 10)), M.dark, wx, 0.5, wz).rotation.z = Math.PI / 2;
  const batG = G(new THREE.CylinderGeometry(0.06, 0.06, 0.18, 8));
  const battery = () => { const g = new THREE.Group(); mesh(batG, M.glowItem('#3fd16b'), 0, 0.09, 0, g); return g; };
  item('bat1', 18.1, 0, -17.8, battery(), 'סוללה');

  // ======================= בפנים: לובי, מסדרון, חדרים =======================
  plane(-7, 0, 7, 9, 0.001, M.floor); plane(-7, 0, 7, 9, H, M.ceil, true);
  wallZ(-7, 0, 9, H); wallZ(7, 0, 9, H); wallX(9, -7, 7, H, [[-2, 2]]);
  box(-3.5, 6.5, 3, 1.05, 0.8, M.wood); // דלפק קבלה
  item('log2', -3.2, 1.06, 6.4, paper(), 'הודעה');
  // מנורת חירום אדומה ליד הכניסה = נקודה בטוחה (נקודת שמירה)
  lamp(0, H, 2, 'always', { r: 3.2, color: '#ff3b2a', flicker: 0.15 });
  item('save1', 0, 1, 2.5, null, null, 0);

  // מסדרון
  plane(-2, 9, 2, 42, 0.001, M.floor); plane(-2, 9, 2, 42, H, M.ceil, true);
  wallZ(-2, 9, 42, H, [[14, 16.4]]);
  wallZ(2, 9, 42, H, [[14, 16.4], [27, 29.4]]);
  for (const z of [12, 18, 24, 30, 36]) lamp(0, H, z, 'gen', { flicker: z === 24 ? 0.6 : z === 36 ? 0.35 : 0.05 });
  // לוח רופף בקיר המסדרון
  const panel = box(-1.8, 24, 0.06, 0.8, 0.9, M.metal, 0.5, false, false);
  item('panel', -1.6, 0.9, 24, null, 'לוח רופף בקיר', 1.5).panel = panel;
  // צינורות על התקרה
  box(1.5, 25.5, 0.16, 0.16, 33, M.metal, H - 0.35, false, false); box(1.2, 25.5, 0.1, 0.1, 33, M.metal, H - 0.3, false, false);

  // חדר גנרטור (מערב)
  plane(-11, 11, -2, 20, 0.001, M.floor); plane(-11, 11, -2, 20, H, M.ceil, true);
  wallX(11, -11, -2, H); wallX(20, -11, -2, H); wallZ(-11, 11, 20, H);
  const gen = box(-8, 16, 2.6, 1.8, 1.6, M.metal); box(-8, 16, 0.4, 0.6, 0.4, M.dark, 1.8, false); box(-6.4, 16, 0.6, 1.2, 0.3, M.hazard, 0.3, false);
  const genLed = mesh(G(new THREE.BoxGeometry(0.08, 0.08, 0.02)), M.padRed, -6.8, 1.3, 16.82);
  item('gen', -7, 0.9, 17.3, null, 'גנרטור', 2.2);
  box(-10.4, 12.2, 0.8, 2, 2, M.metal); item('tape1', -10.3, 2.02, 12.6, tape(), 'קלטת');
  lamp(-6.5, H, 15, 'gen', { flicker: 0.2 });

  // חדר ארוניות (מזרח)
  plane(2, 11, 11, 20, 0.001, M.floor); plane(2, 11, 11, 20, H, M.ceil, true);
  wallX(11, 2, 11, H); wallX(20, 2, 11, H); wallZ(11, 11, 20, H);
  for (let i = 0; i < 6; i++) box(4 + i * 1.0, 19.5, 0.9, 2.1, 0.6, M.door);
  const lockerDoor = mesh(G(new THREE.BoxGeometry(0.86, 2.0, 0.04)), M.hazard, 8, 1.05, 19.18);
  item('locker', 8, 1.1, 18.6, null, 'ארונית נעולה', 1.6).door = lockerDoor;
  box(6.5, 14, 3.4, 0.45, 0.8, M.wood); // ספסל
  item('note', 6.8, 0.46, 14, paper(), 'פתק');
  lamp(6.5, H, 15.5, 'gen', { flicker: 0.5 });

  // חדר אבטחה (נעול בקוד)
  plane(2, 25, 9, 32, 0.001, M.floor); plane(2, 25, 9, 32, H, M.ceil, true);
  wallX(25, 2, 9, H); wallX(32, 2, 9, H); wallZ(9, 25, 32, H);
  door('sec', 2, 28.2, 2.4, DOOR_H, false);
  const secPad = mesh(G(new THREE.BoxGeometry(0.04, 0.26, 0.18)), M.padRed, 1.83, 1.3, 26.5);
  item('secpad', 1.4, 1.2, 26.6, null, 'מקלדת קוד', 1.6);
  box(6, 30.8, 3.5, 0.9, 1, M.metal); // שולחן מסכים
  for (let i = 0; i < 3; i++) mesh(G(new THREE.BoxGeometry(0.7, 0.45, 0.06)), new THREE.MeshStandardMaterial({ color: '#111', emissive: '#16304a', emissiveIntensity: 0.6 }), 5 + i * 1, 1.25, 30.5);
  const crateM = new THREE.Group(); mesh(G(new THREE.BoxGeometry(0.9, 0.5, 0.55)), M.glowItem('#4b5a2a'), 0, 0.25, 0, crateM);
  item('cache', 7.8, 0, 26.2, crateM, 'ארגז תחמושת');
  item('bat3', 3.2, 0, 31, battery(), 'סוללה');
  lamp(5.5, H, 28.5, 'gen', { flicker: 0.1 });

  // ======================= מעבדה =======================
  plane(-13, 42, 13, 58, 0.001, M.floor); plane(-13, 42, 13, 58, H + 0.8, M.ceil, true);
  wallX(42, -13, 13, H + 0.8, [[-2, 2]]); wallZ(-13, 42, 58, H + 0.8); wallZ(13, 42, 58, H + 0.8);
  wallX(58, -13, 13, H + 0.8, [[-2, 2]]);
  door('hangar', 0, 58, 4, DOOR_H, true);
  const hanPad = mesh(G(new THREE.BoxGeometry(0.18, 0.26, 0.04)), M.padRed, 2.6, 1.3, 57.83);
  item('hanpad', 2.6, 1.2, 57.2, null, 'מקלדת ההאנגר', 1.7);
  // שולחנות מעבדה
  for (const [tx, tz] of [[-7, 47], [7, 47], [-7, 53], [7, 53]]) { box(tx, tz, 3.6, 0.95, 1.3, M.white); box(tx + 1.2, tz, 0.4, 0.25, 0.4, M.metal, 0.95, false); }
  // מכלי ניסוי זוהרים
  const tankG = G(new THREE.CylinderGeometry(0.6, 0.6, 2.4, 14));
  for (const tz of [45, 49.5, 54]) {
    box(-11.8, tz, 1.6, 0.25, 1.6, M.metal); box(-11.8, tz, 1.6, 0.25, 1.6, M.metal, 2.65, false);
    const t = mesh(tankG, M.glass, -11.8, 1.45, tz); boxes.push({ min: new V3(-12.5, 0, tz - 0.7), max: new V3(-11.1, 2.9, tz + 0.7) });
    const body = mesh(G(new THREE.CapsuleGeometry(0.22, 0.8, 4, 8)), new THREE.MeshBasicMaterial({ color: '#050806' }), -11.8, 1.4, tz); anim.push({ m: body, k: tz });
    void t;
  }
  // לוח מחיק
  const wb = canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#d8dcd8'; g.fillRect(0, 0, w, h); g.strokeStyle = '#2a3a6a'; g.lineWidth = 3; g.font = 'bold 30px Rubik, sans-serif'; g.fillStyle = '#2a3a6a'; g.textAlign = 'right';
    g.fillText('ניסוי "החייל המושלם"', w - 20, 50); g.font = '24px Rubik, sans-serif';
    g.fillText('שלב 1: הסרת פחד ✔', w - 20, 100); g.fillText('שלב 2: ראייה בחושך ✔', w - 20, 140); g.fillStyle = '#a02020'; g.fillText('שלב 3: ??? – אובדן הצל', w - 20, 180);
    g.beginPath(); g.arc(90, 150, 60, 0, 7); g.stroke(); g.fillText('אור = עצירה', 170, 230);
  });
  mesh(G(new THREE.PlaneGeometry(3.2, 1.6)), new THREE.MeshStandardMaterial({ map: wb, roughness: 0.7 }), 6, 1.9, 57.82).rotation.y = Math.PI;
  item('log3', -6.4, 0.96, 46.8, paper(), 'יומן ד״ר');
  item('tape2', 7.6, 0.96, 53.2, tape(), 'קלטת');
  const fuseM = new THREE.Group(); mesh(G(new THREE.CylinderGeometry(0.05, 0.05, 0.22, 8)), M.glowItem('#e0b03a'), 0, 0.05, 0, fuseM).rotation.z = Math.PI / 2;
  item('fuse', 6.2, 0.96, 46.6, fuseM, 'נתיך');
  box(10.8, 56.6, 2, 0.8, 1, M.wood); // שולחן עם מגירה
  item('drawer', 10.8, 0.6, 55.8, null, 'מגירה', 1.5);
  item('bat4', -3, 0, 56.8, battery(), 'סוללה');
  for (const [lx, lz] of [[-6, 46], [6, 46], [-6, 54], [6, 54]]) lamp(lx, H + 0.8, lz, 'gen', { flicker: lx < 0 && lz > 50 ? 0.55 : 0.12 });

  // ======================= האנגר =======================
  plane(-24, 58, 24, 96, 0.001, M.floor, false, 4); plane(-24, 58, 24, 96, HH, M.ceil, true);
  wallX(58, -24, -13, HH); wallX(58, 13, 24, HH); box(0, 58, 26, HH - (H + 0.8), T, M.wall, H + 0.8, false);
  wallZ(-24, 58, 96, HH); wallZ(24, 58, 96, HH);
  wallX(96, -24, -12, HH); wallX(96, 12, 24, HH); box(0, 96, 24, HH - 8, T, M.wall, 8, false);
  door('bay', 0, 96, 24, 8, true, M.door);
  for (let i = -5; i <= 5; i++) box(i * 2.2, 95.85, 0.12, 8, 0.1, M.hazard, 0, false, false);
  // מסלול בחוץ (נראה כשהשערים נפתחים)
  plane(-30, 96, 30, 200, 0, M.dirt, false, 8);
  for (let z = 100; z < 200; z += 8) plane(-0.3, z, 0.3, z + 4, 0.01, M.white);
  // מטוס תקין
  const jet = buildJet(); jet.position.set(0, 0, 76); group.add(jet);
  // מנועים כבויים (גם בהריסות)
  for (const j of [jet, wreck]) { j.userData.setThrottle?.(0); j.userData.update?.(0); for (const n of j.userData.nozzles || []) { if (n.flame) n.flame.visible = false; if (n.disc) n.disc.visible = false; } }
  boxes.push({ min: new V3(-1.6, 0, 67.5), max: new V3(1.6, 3, 85) }, { min: new V3(-6.8, 0.6, 73), max: new V3(6.8, 1.7, 80), jet: true });
  // ארגזים, מדפים, ספסלי עבודה
  for (const [cx, cz, w, h, d] of [[-20, 66, 3, 2.2, 2], [-21, 72, 2, 1.2, 2], [19, 62, 4, 2.6, 1.2], [20, 86, 2, 2, 2], [-14, 88, 3, 1, 1.5], [12, 64, 2, 1.1, 1.5]]) box(cx, cz, w, h, d, M.metal);
  box(10, 92, 4, 0.95, 1.2, M.wood);
  const fuelM = new THREE.Group(); mesh(G(new THREE.BoxGeometry(0.36, 0.5, 0.2)), M.glowItem('#b0281e'), 0, 0.25, 0, fuelM);
  item('p_fuel', -22.5, 0, 61, fuelM, 'מיכל דלק');
  const cellM = new THREE.Group(); mesh(G(new THREE.BoxGeometry(0.5, 0.3, 0.3)), M.glowItem('#2f8fd6'), 0, 0.15, 0, cellM);
  item('p_cell', 19, 2.6, 62, cellM, 'סוללת מטוס');
  const modM = new THREE.Group(); mesh(G(new THREE.BoxGeometry(0.3, 0.12, 0.3)), M.glowItem('#9a3ad6'), 0, 0.06, 0, modM);
  item('p_mod', -14.6, 1.0, 88.2, modM, 'מודול בקרה');
  item('log4', 9.2, 0.96, 92, paper(), 'יומן טיסה');
  item('bat5', 22.6, 0, 92.5, battery(), 'סוללה');
  const ammoM = new THREE.Group(); mesh(G(new THREE.BoxGeometry(0.3, 0.18, 0.2)), M.glowItem('#6b6b2a'), 0, 0.09, 0, ammoM);
  item('ammo_h', -20.6, 1.2, 72, ammoM, 'קופסת כדורים');
  item('jetfix', 3, 1, 70.5, null, 'המטוס – תא המנוע', 2.6);
  const lever = new THREE.Group(); mesh(G(new THREE.BoxGeometry(0.1, 0.5, 0.5)), M.dark, 0, 0, 0, lever);
  const leverArm = mesh(G(new THREE.BoxGeometry(0.06, 0.5, 0.06)), M.hazard, -0.08, 0.15, 0, lever); leverArm.rotation.z = -0.6;
  item('lever', 23.7, 1.4, 80, lever, 'ידית השערים', 2).arm = leverArm;
  item('board', -2.8, 1, 83.5, null, 'תא הטייס', 2.6);
  for (const [lx, lz, br] of [[-12, 66, false], [12, 66, true], [-12, 80, true], [12, 80, false], [-12, 92, true], [12, 92, true]]) lamp(lx, HH, lz, 'hangar', { big: true, r: 7, flicker: br ? 0 : 0.45, broken: br });

  function tape() { const g = new THREE.Group(); mesh(G(new THREE.BoxGeometry(0.18, 0.04, 0.11)), M.glowItem('#333'), 0, 0.02, 0, g); return g; }

  // ======================= API =======================
  const L = {
    group, boxes, items, doors, lamps, fires, wreck, jet, readerLed, genLed, secPad, hanPad, gen,
    spots: {
      1: [[-9, -28], [-22, -26], [-12, -5], [22, -28], [10, -6], [-24, -42], [-6, -50], [24, -48]],
      2: [[0, 34], [-9, 18.5], [9, 12.5], [-10, 51], [10, 50], [0, 55], [4, 29], [0, 40]],
      3: [[-20, 70], [20, 70], [-20, 90], [20, 90], [0, 93], [-12, 61], [12, 61], [-8, 84], [8, 84]],
    },
    item: (id) => items.find((i) => i.id === id),
    areaAt: (p) => (p.z < 0 ? 'outdoor' : p.z < 58 ? 'indoor' : 'hangar'),
    ceilAt: (p) => (p.z < 0 ? 99 : p.z < 42 ? H : p.z < 58 ? H + 0.8 : HH),
    openDoor(id) { const d = doors[id]; if (!d || d.open) return; d.open = true; const i = boxes.indexOf(d.b); if (i >= 0) boxes.splice(i, 1); },
    setPower(src, on) { for (const l of lamps) if (l.src === src) l.on = on && !l.broken; },
    take(id) { const it = L.item(id); if (!it) return; it.done = true; if (it.obj) it.obj.visible = false; },
    update(dt, t) {
      for (const d of Object.values(doors)) if (d.open && d.k < 1) {
        d.k = Math.min(1, d.k + dt / (d.id === 'bay' ? 4 : 1.1));
        const e = d.k * d.k * (3 - 2 * d.k);
        d.m.position.y = d.y0 + e * (d.h - 0.15);
      }
      for (const f of fires) { f.g.children.forEach((c, i) => { c.scale.y = f.s * (0.8 + 0.35 * Math.sin(t * (9 + i * 3) + i)); }); }
      for (const a of anim) a.m.position.y = 1.4 + Math.sin(t * 0.7 + a.k) * 0.05;
    },
    dispose() { group.removeFromParent(); geos.forEach((g) => g.dispose()); imT.dispose(); imL.dispose(); imL2.dispose(); },
  };
  void reader; void gen;
  return L;
}

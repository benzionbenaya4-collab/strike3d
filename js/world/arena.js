// זירת קרב: עיר קטנה בשקיעה. buildArena() מחזיר THREE.Group.
// יחידה = מטר, Y למעלה, מרכז הזירה בראשית, קיר היקפי ב-±HALF.
// userData:
//   coinSpots  [{ pos: Vector3, tier: 'easy'|'medium'|'hard', value }]  – 14 נקודות
//   chestSpots [{ pos: Vector3, rotY }]                                   – 6
//   spawnPoints[{ pos: Vector3, rotY }]  (rotY = פונה למרכז, הדמות פונה +Z)  – 8
//   colliders  [THREE.Box3 + .kind]  – AABB לכל דבר מוצק (בניינים, מדרגות, ארגזים, קירות...). הרצפה = y=0.
//   ladders    [{ pos: Vector3 (תחתית), top: y, normal: Vector3 (החוצה מהקיר) }]
//   bounds Box3, half, fog: THREE.Fog, background: Color, lights: [] (כבר בתוך הקבוצה)
import * as THREE from 'three';

export const HALF = 44;

function rng(seed) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const canvasTex = (w, h, draw, srgb = true) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
};

// ---------- טקסטורות ----------
const TILE = 12; // אריח קיר = 12x12 מ׳ (4 חלונות × 4 קומות)
function wallTextures(r) {
  const S = 512, cell = S / 4;
  const lit = [];
  const map = canvasTex(S, S, (x) => {
    x.fillStyle = '#d9d4cb'; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 1600; i++) { x.fillStyle = `rgba(0,0,0,${r() * 0.05})`; x.fillRect(r() * S, r() * S, 2 + r() * 6, 2 + r() * 6); }
    for (let row = 0; row < 4; row++) {
      x.fillStyle = 'rgba(0,0,0,0.12)'; x.fillRect(0, row * cell, S, 3);               // קו קומה
      for (let col = 0; col < 4; col++) {
        const wx = col * cell + cell * 0.25, wy = row * cell + cell * 0.22, ww = cell * 0.5, wh = cell * 0.5;
        x.fillStyle = '#8f8a82'; x.fillRect(wx - 4, wy - 4, ww + 8, wh + 10);             // מסגרת
        x.fillStyle = '#29303b'; x.fillRect(wx, wy, ww, wh);                             // זכוכית
        x.fillStyle = 'rgba(255,255,255,0.08)'; x.fillRect(wx, wy, ww * 0.45, wh);
        x.fillStyle = '#5c5a55'; x.fillRect(wx - 6, wy + wh + 4, ww + 12, 5);            // אדן
        if (r() < 0.38) lit.push([wx, wy, ww, wh, r()]);
      }
    }
  });
  const emi = canvasTex(S, S, (x) => {
    x.fillStyle = '#000'; x.fillRect(0, 0, S, S);
    for (const [wx, wy, ww, wh, k] of lit) {
      x.fillStyle = k < 0.7 ? '#ffb45e' : '#9fd0ff';
      x.fillRect(wx, wy, ww, wh);
      x.fillStyle = 'rgba(0,0,0,0.45)'; x.fillRect(wx + ww * (0.2 + k * 0.4), wy, 6, wh);  // צללית וילון
    }
  });
  for (const t of [map, emi]) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return { map, emi };
}

function groundTexture(r) {
  const S = 1024, k = S / (HALF * 2);           // פיקסלים למטר
  const P = (m) => (m + HALF) * k;
  return canvasTex(S, S, (x) => {
    x.fillStyle = '#4a4d4a'; x.fillRect(0, 0, S, S);                       // מדרכה/בטון
    for (let i = 0; i < 9000; i++) { x.fillStyle = `rgba(${r() < 0.5 ? 0 : 255},${r() < 0.5 ? 0 : 255},${r() < 0.5 ? 0 : 255},${r() * 0.035})`; x.fillRect(r() * S, r() * S, 3, 3); }
    // רחובות
    x.fillStyle = '#2a2c30';
    x.fillRect(0, P(-4), S, 8 * k); x.fillRect(P(-4), 0, 8 * k, S);
    // שולי מדרכה
    x.fillStyle = '#6b6d6a';
    for (const s of [-4, 4]) { x.fillRect(0, P(s) - 2, S, 4); x.fillRect(P(s) - 2, 0, 4, S); }
    // כיכר מרוצפת
    x.fillStyle = '#5b554c'; x.fillRect(P(-8), P(-8), 16 * k, 16 * k);
    x.strokeStyle = 'rgba(0,0,0,0.18)'; x.lineWidth = 1;
    for (let m = -8; m <= 8; m += 1) { x.beginPath(); x.moveTo(P(m), P(-8)); x.lineTo(P(m), P(8)); x.moveTo(P(-8), P(m)); x.lineTo(P(8), P(m)); x.stroke(); }
    x.strokeStyle = '#8a7f6c'; x.lineWidth = 6; x.beginPath(); x.arc(P(0), P(0), 6.2 * k, 0, Math.PI * 2); x.stroke();
    // פסים מקווקווים
    x.fillStyle = '#d8c07a';
    for (let m = -HALF; m < HALF; m += 4) {
      if (Math.abs(m) < 9) continue;
      x.fillRect(P(m), P(0) - 2, 2 * k, 4); x.fillRect(P(0) - 2, P(m), 4, 2 * k);
    }
    // מעברי חציה
    x.fillStyle = '#d9d9d4';
    for (const s of [-1, 1]) for (let i = -3.5; i <= 3; i += 1) {
      x.fillRect(P(s * 9.5) - 0.7 * k, P(i), 1.4 * k, 0.5 * k);
      x.fillRect(P(i), P(s * 9.5) - 0.7 * k, 0.5 * k, 1.4 * k);
    }
    // כתמים
    for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(0,0,0,${0.08 + r() * 0.1})`; x.beginPath(); x.ellipse(r() * S, r() * S, 10 + r() * 30, 6 + r() * 18, r() * 3, 0, 7); x.fill(); }
  });
}

// UV לפי מידות אמיתיות – כדי שחלונות לא יימתחו
function boxUV(geo, w, h, d) {
  const uv = geo.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
    const j = f * 4 + i;
    uv.setXY(j, uv.getX(j) * dims[f][0] / TILE, uv.getY(j) * dims[f][1] / TILE);
  }
  return geo;
}

// ---------- עזר אינסטנסים ----------
class Batch {
  constructor(geo, mat) { this.geo = geo; this.mat = mat; this.items = []; }
  add(x, y, z, sx = 1, sy = 1, sz = 1, ry = 0, color = null) { this.items.push({ x, y, z, sx, sy, sz, ry, color }); }
  build(parent) {
    if (!this.items.length) return null;
    const m = new THREE.InstancedMesh(this.geo, this.mat, this.items.length);
    const o = new THREE.Object3D();
    this.items.forEach((it, i) => {
      o.position.set(it.x, it.y, it.z); o.scale.set(it.sx, it.sy, it.sz); o.rotation.set(0, it.ry, 0); o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      if (it.color) m.setColorAt(i, new THREE.Color(it.color));
    });
    m.instanceMatrix.needsUpdate = true;
    parent.add(m);
    return m;
  }
}

// ---------- מפת הבניינים ----------
// x,z = מרכז; w (ציר X), d (ציר Z), h; tint; stairs/ladder = צד הקיר: 'n'(+z) 's'(-z) 'e'(+x) 'w'(-x)
const BUILDINGS = [
  { x: 15, z: 14, w: 12, d: 10, h: 9, tint: '#e8dccb', stairs: 's' },
  { x: 31, z: 12, w: 10, d: 8, h: 6, tint: '#c98d73', ladder: 'w' },
  { x: 14, z: 31, w: 10, d: 12, h: 12, tint: '#9fb0b5', ladder: 'e' },
  { x: 31, z: 31, w: 10, d: 10, h: 6, tint: '#d8c49a', stairs: 'w' },
  { x: 15, z: -14, w: 10, d: 12, h: 6, tint: '#b7a58f', stairs: 'e' },
  { x: 31, z: -15, w: 10, d: 14, h: 9, tint: '#e0d6c4', ladder: 'w' },
  { x: 22, z: -34, w: 24, d: 6, h: 4, tint: '#8f9a8c', stairs: 'n' },
  { x: -15, z: 14, w: 12, d: 10, h: 6, tint: '#c98d73', stairs: 'n' },
  { x: -31, z: 15, w: 8, d: 12, h: 9, tint: '#d8c49a', ladder: 'e' },
  { x: -20, z: 33, w: 18, d: 7, h: 6, tint: '#9fb0b5', stairs: 's' },
  { x: -14, z: -15, w: 10, d: 10, h: 12, tint: '#e8dccb', ladder: 'n' },
  { x: -31, z: -14, w: 10, d: 12, h: 3, tint: '#b7a58f', stairs: 'n' },
  { x: -22, z: -33, w: 16, d: 8, h: 9, tint: '#c98d73', stairs: 'n' },
];
const SIDE = { n: [0, 1], s: [0, -1], e: [1, 0], w: [-1, 0] };

export function buildArena({ lights = true } = {}) {
  const r = rng(1234);
  const root = new THREE.Group();
  root.name = 'arena';
  const colliders = [], ladders = [], lightList = [];
  const col = (x0, y0, z0, x1, y1, z1, kind) => { const b = new THREE.Box3(V(x0, y0, z0), V(x1, y1, z1)); b.kind = kind; colliders.push(b); return b; };
  const colC = (x, y, z, sx, sy, sz, kind) => col(x - sx / 2, y - sy / 2, z - sz / 2, x + sx / 2, y + sy / 2, z + sz / 2, kind);

  // ---- שמיים + ערפל (שקיעה) ----
  const sky = new THREE.Mesh(new THREE.SphereGeometry(220, 24, 12), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { sun: { value: V(-0.75, 0.12, -0.65).normalize() } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `uniform vec3 sun; varying vec3 vD;
      void main(){ float h = vD.y;
        vec3 top = vec3(0.10,0.14,0.30), mid = vec3(0.55,0.42,0.52), hor = vec3(1.0,0.62,0.38), low = vec3(0.16,0.15,0.2);
        vec3 c = h > 0. ? mix(hor, mix(mid, top, smoothstep(0.08,0.6,h)), smoothstep(0.,0.12,h)) : mix(hor, low, smoothstep(0.,0.08,-h));
        float s = max(dot(vD, sun), 0.);
        c += vec3(1.0,0.55,0.25) * pow(s, 18.) * 0.7 + vec3(1.0,0.9,0.7) * pow(s, 700.) * 2.;
        gl_FragColor = vec4(c,1.); }`,
  }));
  sky.renderOrder = -1; sky.frustumCulled = false;
  root.add(sky);
  const fog = new THREE.Fog('#7b6470', 45, 165);

  // ---- תאורה ----
  const hemi = new THREE.HemisphereLight('#a9b8e8', '#3a2f2c', 0.9);
  const sun = new THREE.DirectionalLight('#ffb27a', 2.2); sun.position.set(-60, 22, -50);
  const fill = new THREE.DirectionalLight('#6f86c9', 0.5); fill.position.set(40, 30, 50);
  root.add(hemi, sun, fill); lightList.push(hemi, sun, fill);

  // ---- קרקע ----
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(440, 440), new THREE.MeshStandardMaterial({ color: '#3b3632', roughness: 1 }));
  outer.rotation.x = -Math.PI / 2; outer.position.y = -0.02; root.add(outer);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2), new THREE.MeshStandardMaterial({ map: groundTexture(r), roughness: 0.92 }));
  ground.rotation.x = -Math.PI / 2; root.add(ground);

  // ---- חומרים ----
  const wt = wallTextures(r);
  const roofMat = new THREE.MeshStandardMaterial({ color: '#5d5a57', roughness: 0.95 });
  const wallMats = {};
  const wallMat = (tint) => (wallMats[tint] ||= new THREE.MeshStandardMaterial({ map: wt.map, emissiveMap: wt.emi, emissive: '#ffffff', emissiveIntensity: 0.9, color: tint, roughness: 0.85 }));
  const concrete = new THREE.MeshStandardMaterial({ color: '#8d8a84', roughness: 0.9 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: '#2c3036', metalness: 0.6, roughness: 0.5 });
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const unitBase = unit.clone().translate(0, 0.5, 0);   // קופסה שבסיסה ב-y=0

  const steps = new Batch(unitBase, concrete);
  const parapets = new Batch(unitBase, new THREE.MeshStandardMaterial({ color: '#77736d', roughness: 0.9 }));
  const doors = new Batch(unit, new THREE.MeshStandardMaterial({ color: '#3a2a22', roughness: 0.8 }));
  const acUnits = new Batch(unitBase, new THREE.MeshStandardMaterial({ color: '#a9adb2', metalness: 0.3, roughness: 0.6 }));
  const tanks = new Batch(new THREE.CylinderGeometry(1, 1, 1, 12).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: '#6e5a48', roughness: 0.8 }));
  const rails = new Batch(unitBase, darkMetal);
  const awnings = new Batch(unit, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 }));

  // ---- בניינים ----
  for (const b of BUILDINGS) {
    const geo = boxUV(new THREE.BoxGeometry(b.w, b.h, b.d), b.w, b.h, b.d);
    const wm = wallMat(b.tint);
    const m = new THREE.Mesh(geo, [wm, wm, roofMat, roofMat, wm, wm]);
    m.position.set(b.x, b.h / 2, b.z);
    root.add(m);
    col(b.x - b.w / 2, 0, b.z - b.d / 2, b.x + b.w / 2, b.h, b.z + b.d / 2, 'building');

    // מעקה גג נמוך (0.45 מ׳ – אפשר לדלג)
    const T = 0.25, P = 0.45, x0 = b.x - b.w / 2, x1 = b.x + b.w / 2, z0 = b.z - b.d / 2, z1 = b.z + b.d / 2;
    for (const [cx, cz, sx, sz] of [[b.x, z0 + T / 2, b.w, T], [b.x, z1 - T / 2, b.w, T], [x0 + T / 2, b.z, T, b.d], [x1 - T / 2, b.z, T, b.d]]) {
      parapets.add(cx, b.h, cz, sx, P, sz);
      col(cx - sx / 2, b.h, cz - sz / 2, cx + sx / 2, b.h + P, cz + sz / 2, 'parapet');
    }
    // ציוד גג (מחסה על הגג)
    const ac = [b.x - b.w * 0.22 + r() * 1.5, b.z + b.d * 0.18];
    acUnits.add(ac[0], b.h, ac[1], 1.6, 1.1, 1.2);
    colC(ac[0], b.h + 0.55, ac[1], 1.6, 1.1, 1.2, 'roofprop');
    if (b.h >= 9) {
      const tx = b.x + b.w * 0.22, tz = b.z - b.d * 0.2;
      rails.add(tx, b.h, tz, 1.8, 1.4, 1.8);            // רגליים/בסיס
      tanks.add(tx, b.h + 1.4, tz, 1.1, 2.0, 1.1);
      colC(tx, b.h + 1.7, tz, 2.2, 3.4, 2.2, 'roofprop');
    }

    // דלת + סוכך בצד הפונה לרחוב
    // קרוב יותר לרחוב בציר Z (x=0) → הדלת פונה ל-x; אחרת לרחוב בציר X (z=0)
    const [nx, nz] = Math.abs(b.x) < Math.abs(b.z) ? [-Math.sign(b.x), 0] : [0, -Math.sign(b.z)];
    const fx = b.x + nx * (b.w / 2 + 0.03), fz = b.z + nz * (b.d / 2 + 0.03);
    doors.add(fx, 1.1, fz, nx ? 0.1 : 1.4, 2.2, nz ? 0.1 : 1.4);
    awnings.add(b.x + nx * (b.w / 2 + 0.6), 2.9, b.z + nz * (b.d / 2 + 0.6), nx ? 1.2 : 3.2, 0.12, nz ? 1.2 : 3.2, 0, ['#b8402f', '#2f6f7a', '#d39b2a'][Math.floor(r() * 3)]);

    // מדרגות חיצוניות לאורך הקיר – כל מדרגה בלוק מלא מהקרקע (קל לפיזיקה)
    if (b.stairs) {
      const [sx, sz] = SIDE[b.stairs];
      const RISE = 0.3, RUN = 0.32, W = 1.3, n = Math.round(b.h / RISE);
      const along = sx ? b.d : b.w;
      const tx = sx ? 0 : 1, tz = sx ? 1 : 0;                         // משיק לקיר
      const start = -along / 2 + 0.3;
      const off = (sx ? b.w : b.d) / 2 + W / 2;
      for (let i = 0; i < n; i++) {
        const t = start + (i + 0.5) * RUN, hgt = (i + 1) * RISE;
        const cx = b.x + sx * off + tx * t, cz = b.z + sz * off + tz * t;
        const ssx = sx ? W : RUN, ssz = sx ? RUN : W;
        steps.add(cx, hgt - RISE, cz, ssx, RISE, ssz);                 // נראה: מדרך; ההתנגשות: בלוק מלא
        col(cx - ssx / 2, 0, cz - ssz / 2, cx + ssx / 2, hgt, cz + ssz / 2, 'stairs');
      }
      // מעקה חיצוני
      const len = n * RUN, mid = start + len / 2;
      const rx = b.x + sx * (off + W / 2) + tx * mid, rz = b.z + sz * (off + W / 2) + tz * mid;
      const hyp = Math.hypot(len, b.h);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(sx ? 0.06 : hyp, 0.06, sx ? hyp : 0.06), darkMetal);
      rail.position.set(rx, b.h / 2 + 1.0, rz);
      const beam = rail.clone(); beam.scale.set(sx ? 3 : 1, 5, sx ? 1 : 3); beam.position.set(rx - sx * W / 2, b.h / 2 - 0.25, rz - sz * W / 2); root.add(beam);
      if (sx) rail.rotation.x = -Math.atan2(b.h, len); else rail.rotation.z = Math.atan2(b.h, len);
      root.add(rail);
    }

    // סולם
    if (b.ladder) {
      const [sx, sz] = SIDE[b.ladder];
      const along = sx ? b.d : b.w, t = along * 0.3;
      const lx = b.x + sx * (b.w / 2 + 0.12) + (sx ? 0 : t), lz = b.z + sz * (b.d / 2 + 0.12) + (sx ? t : 0);
      const top = b.h + 0.9;
      for (const o of [-0.25, 0.25]) rails.add(lx + (sx ? 0 : o), 0, lz + (sx ? o : 0), 0.06, top, 0.06);
      for (let y = 0.3; y < top; y += 0.32) rails.add(lx, y, lz, sx ? 0.05 : 0.5, 0.04, sx ? 0.5 : 0.05);
      ladders.push({ pos: V(lx, 0, lz), top: b.h, normal: V(sx, 0, sz) });
    }
  }

  // ---- גשר קרשים בין גגות (B ↔ D, גובה 6) – נקודה קשה ----
  {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.15, 10.4), new THREE.MeshStandardMaterial({ color: '#7a5634', roughness: 0.9 }));
    plank.position.set(31, 6.08, 21); root.add(plank);
    col(30.3, 6, 15.8, 31.7, 6.16, 26.2, 'bridge');
    for (const s of [-1, 1]) {
      rails.add(31 + s * 0.68, 6.95, 21, 0.06, 0.06, 10.2);
      for (let z = 16.2; z <= 26; z += 2.4) rails.add(31 + s * 0.68, 6.15, z, 0.05, 0.8, 0.05);
    }
  }

  // ---- אנדרטה בכיכר (מחסה מרכזי) ----
  {
    const stone = new THREE.MeshStandardMaterial({ color: '#a49c8e', roughness: 0.85 });
    const tiers = [[4.2, 0.8], [2.8, 0.8], [1.0, 4.2]];
    let y = 0;
    for (const [s, hh] of tiers) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(s, hh, s), stone); m.position.set(0, y + hh / 2, 0); root.add(m);
      col(-s / 2, y, -s / 2, s / 2, y + hh, s / 2, 'monument'); y += hh;
    }
    const top = new THREE.Mesh(new THREE.OctahedronGeometry(0.7), new THREE.MeshStandardMaterial({ color: '#d9a640', metalness: 0.9, roughness: 0.3 }));
    top.position.set(0, y + 0.6, 0); root.add(top);
  }

  // ---- ארגזים (אינסטנס) ----
  const crateTex = canvasTex(128, 128, (x) => {
    x.fillStyle = '#8a6a3f'; x.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 8; i++) { x.fillStyle = `rgba(0,0,0,${0.06 + (i % 2) * 0.05})`; x.fillRect(0, i * 16, 128, 2); }
    x.strokeStyle = '#5a4126'; x.lineWidth = 10; x.strokeRect(5, 5, 118, 118);
    x.beginPath(); x.moveTo(8, 8); x.lineTo(120, 120); x.stroke();
  });
  const crates = new Batch(unitBase, new THREE.MeshStandardMaterial({ map: crateTex, roughness: 0.85 }));
  const crate = (x, z, stack = 1, s = 1.2, ry = 0) => {
    for (let i = 0; i < stack; i++) {
      const rr = ry + (r() - 0.5) * 0.25 * (i ? 1 : 0.3);
      crates.add(x, i * s, z, s, s, s, rr, i % 2 ? '#e6d8bf' : '#ffffff');
    }
    col(x - s / 2, 0, z - s / 2, x + s / 2, stack * s, z + s / 2, 'crate');
    return stack * s;
  };
  crate(23.5, 4, 2); crate(24.8, 4.1, 1); crate(-23.5, 9, 3); crate(-22.2, 9, 2); crate(-24.8, 9.1, 1);
  crate(23, -27, 2); crate(24.3, -27.1, 1); crate(-8, 23, 1); crate(-8, 24.3, 2);
  crate(38, 22, 2); crate(38, 23.3, 1); crate(-38, -27, 2); crate(-36.7, -27, 1);
  crate(7.5, -8.2, 1, 1.0); crate(-7.4, 8.1, 1, 1.0); crate(8.5, 38, 2); crate(-38, 4, 1);
  crate(-24.5, -21.7, 1); crate(-25.7, -21.6, 2);                 // ליד בניין L (גובה 3) – מדרגה לגג
  crate(4.8, -24, 1); crate(-4.8, 30, 1); crate(36.5, -2, 1, 1.0);

  // ---- מחסומי בטון (ג'רזי) ----
  const jsh = new THREE.Shape(); jsh.moveTo(-0.32, 0); jsh.lineTo(0.32, 0); jsh.lineTo(0.12, 0.3); jsh.lineTo(0.1, 0.85); jsh.lineTo(-0.1, 0.85); jsh.lineTo(-0.12, 0.3); jsh.closePath();
  const jgeo = new THREE.ExtrudeGeometry(jsh, { depth: 2.4, bevelEnabled: false }).translate(0, 0, -1.2);
  const barriers = new Batch(jgeo, new THREE.MeshStandardMaterial({ color: '#c9c5bb', roughness: 0.9 }));
  const barrier = (x, z, ry) => {
    barriers.add(x, 0, z, 1, 1, 1, ry, r() < 0.3 ? '#d9b23a' : '#ffffff');
    const along = Math.abs(Math.sin(ry)) > 0.5;
    colC(x, 0.425, z, along ? 2.4 : 0.64, 0.85, along ? 0.64 : 2.4, 'barrier');
  };
  barrier(0, 18, Math.PI / 2); barrier(2.6, 18, Math.PI / 2); barrier(-2, -20, Math.PI / 2);
  barrier(19, 1.2, 0); barrier(-20, -1.5, 0); barrier(-20, 1.0, 0); barrier(34, -1.8, 0);
  barrier(0.5, -34, Math.PI / 2); barrier(-1.5, 36, Math.PI / 2); barrier(-34, 2, 0);

  // ---- מכוניות נטושות (מחסה) ----
  const carBody = new Batch(unitBase, new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 0.5, roughness: 0.45 }));
  const carTop = new Batch(unitBase, new THREE.MeshStandardMaterial({ color: '#1b2029', metalness: 0.8, roughness: 0.15 }));
  const wheels = new Batch(new THREE.CylinderGeometry(0.34, 0.34, 0.25, 10).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.9 }));
  const car = (x, z, ry, c) => {
    carBody.add(x, 0.28, z, 1.8, 0.75, 4.2, ry, c);
    const cs = Math.cos(ry), sn = Math.sin(ry), off = (dx, dz) => [x + dx * cs + dz * sn, z - dx * sn + dz * cs];
    const [tx, tz] = off(0, -0.3); carTop.add(tx, 1.03, tz, 1.6, 0.6, 2.2, ry);
    for (const [dx, dz] of [[-0.9, 1.3], [0.9, 1.3], [-0.9, -1.3], [0.9, -1.3]]) { const [wx, wz] = off(dx, dz); wheels.add(wx, 0.34, wz, 1, 1, 1, ry); }
    const along = Math.abs(sn) > 0.5;
    colC(x, 0.82, z, along ? 4.2 : 1.8, 1.64, along ? 1.8 : 4.2, 'car');
  };
  car(2.2, 26, 0.12, '#8a1f1f'); car(-2.4, -14, -0.1, '#2b4c7e'); car(26, -2.2, Math.PI / 2 + 0.15, '#c9c1ae'); car(-31, 2.3, Math.PI / 2 - 0.2, '#3c5a3a');
  car(-2.3, 40, 0, '#6b6f75');

  // ---- פחי אשפה בסמטאות ----
  const bins = new Batch(unitBase, new THREE.MeshStandardMaterial({ color: '#2f5a3c', roughness: 0.7 }));
  for (const [x, z, ry] of [[23.5, 20, 0], [-23, 20.5, 0.3], [23.2, -22, 0], [-22.6, -24.5, 0.2], [8.2, 22, Math.PI / 2], [-38.5, -6, 0]]) {
    bins.add(x, 0, z, 1.7, 1.3, 1.0, ry); colC(x, 0.65, z, 1.7, 1.3, 1.7, 'bin');
  }

  // ---- עצים בכיכר ----
  const trunks = new Batch(new THREE.CylinderGeometry(0.12, 0.18, 1, 6).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: '#4a3424', roughness: 1 }));
  const leaves = new Batch(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: '#4f6b39', roughness: 0.9, flatShading: true }));
  for (const [x, z] of [[-6.5, -6.5], [6.5, -6.5], [-6.5, 6.5], [6.5, 6.5]]) {
    trunks.add(x, 0, z, 1, 2.2, 1); leaves.add(x, 3.0, z, 1.5, 1.4, 1.5, r() * 3);
    colC(x, 1.1, z, 0.4, 2.2, 0.4, 'tree');
  }

  // ---- פנסי רחוב ----
  const poles = new Batch(new THREE.CylinderGeometry(0.07, 0.1, 1, 6).translate(0, 0.5, 0), darkMetal);
  const arms = new Batch(unit, darkMetal);
  const heads = new Batch(unit, new THREE.MeshStandardMaterial({ color: '#ffd9a0', emissive: '#ffc070', emissiveIntensity: 2.5 }));
  const glowPos = [];
  const lamp = (x, z, dx, dz) => {
    poles.add(x, 0, z, 1, 5.2, 1);
    arms.add(x + dx * 0.55, 5.15, z + dz * 0.55, dx ? 1.1 : 0.08, 0.08, dz ? 1.1 : 0.08);
    heads.add(x + dx * 1.05, 5.05, z + dz * 1.05, dx ? 0.5 : 0.28, 0.12, dz ? 0.5 : 0.28);
    glowPos.push(x + dx * 1.05, 4.95, z + dz * 1.05);
    colC(x, 2.6, z, 0.2, 5.2, 0.2, 'pole');
  };
  for (const m of [-38, -24, 24, 38]) { lamp(m, 5.3, 0, -1); lamp(m, -5.3, 0, 1); lamp(5.3, m, -1, 0); lamp(-5.3, m, 1, 0); }
  for (const [x, z] of [[8.6, 8.6], [-8.6, 8.6], [8.6, -8.6], [-8.6, -8.6]]) lamp(x, z, -Math.sign(x), 0);
  const glowTex = canvasTex(64, 64, (x) => {
    const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,220,160,1)'); gr.addColorStop(0.25, 'rgba(255,190,110,0.5)'); gr.addColorStop(1, 'rgba(255,170,80,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  });
  const gGeo = new THREE.BufferGeometry(); gGeo.setAttribute('position', new THREE.Float32BufferAttribute(glowPos, 3));
  root.add(new THREE.Points(gGeo, new THREE.PointsMaterial({ map: glowTex, size: 3.2, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: '#ffffff' })));
  if (lights) for (const [x, z] of [[7.6, 7.6], [-7.6, -7.6], [-24, -4.3], [24, 4.3]]) {
    const pl = new THREE.PointLight('#ffb766', 18, 16, 1.6); pl.position.set(x, 4.8, z); root.add(pl); lightList.push(pl);
  }

  // ---- קיר היקפי ----
  const wallM = new THREE.MeshStandardMaterial({ color: '#6d6a66', roughness: 0.95 });
  for (const [x, z, sx, sz] of [[0, HALF + 0.4, HALF * 2 + 1.6, 0.8], [0, -HALF - 0.4, HALF * 2 + 1.6, 0.8], [HALF + 0.4, 0, 0.8, HALF * 2], [-HALF - 0.4, 0, 0.8, HALF * 2]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, 3.6, sz), wallM); m.position.set(x, 1.8, z); root.add(m);
    colC(x, 6, z, sx, 12, sz, 'boundary'); // קיר בלתי נראה גבוה יותר
  }
  // קו רקיע רחוק (רק אווירה, בלי התנגשות)
  const sky2 = new Batch(unitBase, new THREE.MeshStandardMaterial({ color: '#4a4552', roughness: 1, emissive: '#ff9c5a', emissiveIntensity: 0.0 }));
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2 + r() * 0.08, d = 110 + r() * 50;
    sky2.add(Math.cos(a) * d, 0, Math.sin(a) * d, 8 + r() * 12, 5 + r() * 12, 8 + r() * 12, r() * 3);
  }

  for (const b of [steps, parapets, doors, acUnits, tanks, rails, awnings, crates, barriers, carBody, carTop, wheels, bins, trunks, leaves, poles, arms, heads, sky2]) b.build(root);

  // ---- נקודות משחק ----
  const coin = (x, y, z, tier) => ({ pos: V(x, y + 0.6, z), tier, value: { easy: 5, medium: 15, hard: 40 }[tier] });
  const coinSpots = [
    coin(-23, 0, 0.0, 'easy'), coin(23.5, 0, 14, 'easy'), coin(23, 0, -20, 'easy'), coin(-38, 0, 25, 'easy'), coin(0, 0, -40, 'easy'),
    coin(-23.5, 3.6, 9, 'medium'), coin(31, 6, 12, 'medium'), coin(22, 4, -34, 'medium'), coin(-31, 3, -14, 'medium'), coin(15, 6, -14, 'medium'), coin(0.95, 1.6, 0.95, 'medium'),
    coin(31, 6.15, 21, 'hard'), coin(14, 12, 31, 'hard'), coin(-14 + 10 * 0.22, 12 + 3.4, -15 - 10 * 0.2, 'hard'), coin(-22, 9, -33, 'hard'),
  ];
  const ang = (x, z) => Math.atan2(-x, -z);   // פונה למרכז
  const chestSpots = [[23.5, 8], [-23.5, -8.5], [8.5, -23], [-8.5, 27], [38, -38], [-38, 38]].map(([x, z]) => ({ pos: V(x, 0, z), rotY: ang(x, z) }));
  const spawnPoints = [[40, 0], [-40, -6], [0, 40], [6, -40], [38, 38], [-39, -39], [39, -26], [-27, 39]].map(([x, z]) => ({ pos: V(x, 0, z), rotY: ang(x, z) }));

  root.userData = {
    half: HALF, coinSpots, chestSpots, spawnPoints, colliders, ladders,
    bounds: new THREE.Box3(V(-HALF, 0, -HALF), V(HALF, 40, HALF)),
    fog, background: new THREE.Color('#7b6470'), lights: lightList,
  };
  return root;
}

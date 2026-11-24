// העיר של "המתחזה": הזירה מ-world/arena.js + שוק, ספסלים, בית קפה, מקומות לשגרה, ניווט ויום/לילה.
// buildTown() → { group, A (arena.userData), nav, places, lamps, setDaylight(p) }
//   places: { doors[], stalls[], benches[], cafe[], square[], lamps[], parks[] } – כל אחד { pos, face }
//   setDaylight(p): p=0 אחר הצהריים → 0.45 שקיעה → 0.6+ לילה. מחזיר { night (0..1), sunDir }
import * as THREE from 'three';
import { buildArena } from '../arena.js';
import { buildProps } from './props.js';
import { createNav } from './nav.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ראשי הפנסים – כמו ב-arena.js (lamp(x, z, dx, dz) → x + dx·1.05)
export const LAMPS = (() => {
  const out = [];
  for (const m of [-38, -24, 24, 38]) out.push([m, 4.25], [m, -4.25], [4.25, m], [-4.25, m]);
  for (const [x, z] of [[8.6, 8.6], [-8.6, 8.6], [8.6, -8.6], [-8.6, -8.6]]) out.push([x - Math.sign(x) * 1.05, z]);
  return out.map(([x, z]) => V(x, 4.95, z));
})();

export function buildTown() {
  const arena = buildArena({ lights: true });
  const A = arena.userData;
  const group = new THREE.Group(); group.name = 'town'; group.add(arena);
  const props = buildProps(A.colliders);
  group.add(props.group);
  const nav = createNav(A.colliders, A.half);

  // דלתות הבתים (לפי אותו כלל כמו arena.js: הצד הפונה לרחוב)
  const doors = A.colliders.filter((b) => b.kind === 'building').map((b) => {
    const c = b.getCenter(V()), s = b.getSize(V());
    const [nx, nz] = Math.abs(c.x) < Math.abs(c.z) ? [-Math.sign(c.x), 0] : [0, -Math.sign(c.z)];
    const p = nav.nearestFree(c.x + nx * (s.x / 2 + 1.0), c.z + nz * (s.z / 2 + 1.0));
    return { pos: p, face: Math.atan2(nx, nz) };
  });
  const square = [];
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; square.push({ pos: nav.nearestFree(Math.cos(a) * 9.5, Math.sin(a) * 9.5), face: Math.atan2(-Math.cos(a), -Math.sin(a)) }); }
  const lamps = LAMPS.map((l) => ({ pos: nav.nearestFree(l.x * 0.97, l.z * 0.97), face: Math.atan2(-l.x, -l.z), light: l }));
  const parks = [[-6.5, -6.5], [6.5, -6.5], [-6.5, 6.5], [6.5, 6.5]].map(([x, z]) => ({ pos: nav.nearestFree(x * 0.8, z * 0.8), face: Math.atan2(x, z) }));
  const places = { doors, stalls: props.stalls, benches: props.benches, cafe: props.cafe, square, lamps, parks };

  // ---- יום/לילה ----
  const sky = arena.children.find((o) => o.material?.isShaderMaterial);
  if (sky) sky.visible = false;
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { sun: { value: V(-0.75, 0.5, -0.65).normalize() }, night: { value: 0 }, blood: { value: 0 } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `uniform vec3 sun; uniform float night; uniform float blood; varying vec3 vD;
      float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
      void main(){ float h = vD.y;
        float dusk = clamp(1. - abs(night - 0.45) * 3., 0., 1.);
        vec3 dTop = vec3(0.32,0.55,0.9), dHor = vec3(0.78,0.86,0.95);
        vec3 sTop = vec3(0.12,0.16,0.34), sHor = vec3(1.0,0.58,0.34);
        vec3 nTop = vec3(0.01,0.015,0.05), nHor = vec3(0.06,0.07,0.14);
        float n = smoothstep(0.35, 0.75, night);
        vec3 top = mix(mix(dTop, sTop, smoothstep(0.1,0.45,night)), nTop, n);
        vec3 hor = mix(mix(dHor, sHor, smoothstep(0.15,0.45,night)), nHor, n);
        vec3 c = h > 0. ? mix(hor, top, smoothstep(0., 0.5, h)) : mix(hor, hor * 0.4, smoothstep(0., 0.1, -h));
        float s = max(dot(vD, sun), 0.);
        c += vec3(1.0,0.6,0.3) * pow(s, 14.) * 0.6 * (1. - n) + vec3(1.0,0.95,0.8) * pow(s, 600.) * 2. * (1. - n);
        // ירח + כוכבים
        vec3 moon = normalize(vec3(0.6, 0.55, 0.58));
        c += vec3(0.85,0.9,1.0) * smoothstep(0.9993, 0.9996, dot(vD, moon)) * n;
        vec3 q = floor(vD * 180.);
        c += vec3(1.) * step(0.9975, hash(q)) * n * smoothstep(0.05, 0.3, h);
        c = mix(c, vec3(0.5,0.03,0.02) + c * 0.3, blood);
        gl_FragColor = vec4(c,1.); }`,
  });
  const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(215, 24, 12), skyMat);
  skyMesh.renderOrder = -1; skyMesh.frustumCulled = false; group.add(skyMesh);
  // כתמי אור מתחת לכל פנס (בלי אורות אמיתיים – InstancedMesh אחד, מתחזק בלילה)
  const poolTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,200,130,0.85)'); g.addColorStop(0.45, 'rgba(255,170,90,0.35)'); g.addColorStop(1, 'rgba(255,150,70,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, fog: false, polygonOffset: true, polygonOffsetFactor: -1 });
  const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(9, 9).rotateX(-Math.PI / 2), poolMat, LAMPS.length);
  LAMPS.forEach((l, i) => pools.setMatrixAt(i, new THREE.Matrix4().makeTranslation(l.x, 0.02, l.z)));
  pools.renderOrder = 1; group.add(pools);
  const [hemi, sun, fill, ...pls] = A.lights;
  const fogDay = new THREE.Color('#b9c8d6'), fogDusk = new THREE.Color('#7b6470'), fogNight = new THREE.Color('#0d1220'), fogBlood = new THREE.Color('#3a0806');
  const sunDir = V();
  const lampGlow = arena.children.find((o) => o.isPoints);

  function setDaylight(p, blood = 0) {
    const night = smooth(0.42, 0.68, p);
    // השמש שוקעת: גובה 50° → -8°
    const elev = THREE.MathUtils.degToRad(50 - 58 * smooth(0, 0.62, p));
    const az = -2.3 + p * 0.5;
    sunDir.set(Math.cos(elev) * Math.cos(az), Math.sin(elev), Math.cos(elev) * Math.sin(az)).normalize();
    skyMat.uniforms.sun.value.copy(sunDir); skyMat.uniforms.night.value = p; skyMat.uniforms.blood.value = blood;
    sun.position.copy(sunDir).multiplyScalar(80);
    sun.intensity = 2.4 * (1 - night) * smooth(-0.1, 0.12, Math.sin(elev) + 0.05) + 0.7 * night; // בלילה = ירח
    sun.color.set(night > 0.5 ? '#9fb4ff' : p > 0.3 ? '#ffb27a' : '#fff1d6');
    if (night > 0.5) sun.position.set(48, 44, 46);
    hemi.intensity = 1.0 - night * 0.5; hemi.color.set(night > 0.5 ? '#7f8fd0' : '#cfe0ff'); // לילה כהה אבל רואים אנשים
    fill.intensity = 0.5 - night * 0.3;
    for (const pl of pls) pl.intensity = 18 + night * 22;
    if (lampGlow) lampGlow.material.opacity = 0.25 + night * 0.75;
    poolMat.opacity = smooth(0.25, 0.8, night) * 0.55; pools.visible = poolMat.opacity > 0.01;
    const fc = night > 0 ? fogDusk.clone().lerp(fogNight, night) : fogDay.clone().lerp(fogDusk, smooth(0.2, 0.42, p));
    if (blood) fc.lerp(fogBlood, blood);
    A.fog.color.copy(fc); A.fog.near = 40 - night * 12; A.fog.far = 150 - night * 55;
    return { night, sunDir, elev };
  }
  if (lampGlow) lampGlow.material.transparent = true;
  setDaylight(0);
  return { group, arena, A, nav, places, lamps: LAMPS, setDaylight, sky: skyMesh };
}

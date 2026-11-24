// מטבעות על המפה: מטבעות מסתובבים ומרחפים בנקודות arena.userData.coinSpots, איסוף לפי קרבה → onCoin(value).
// createCoins(spots, { onCoin, radius, respawn }) – לשימוש בקרב/אימון. startCoinDemo(...) – הדגמה בזירה (מהחנות).
import * as THREE from 'three';
import { addCoins, getWallet } from '../store.js';
import { buildArena } from './arena.js';

const TIER = {
  easy:   { color: '#ffd54a', scale: 1.0 },
  medium: { color: '#ffae2b', scale: 1.2 },
  hard:   { color: '#ff5bd8', scale: 1.5 },
};
let G = null;
function geos() {
  if (G) return G;
  // מטבע: דיסקה עם שפה מוגבהת וכוכב באמצע (Extrude), פנים ל-+Z
  const disc = new THREE.CylinderGeometry(0.32, 0.32, 0.06, 28).rotateX(Math.PI / 2);
  const rim = new THREE.TorusGeometry(0.31, 0.03, 8, 28);
  const star = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 + Math.PI / 2, r = i % 2 ? 0.08 : 0.18; star[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); }
  const starG = new THREE.ExtrudeGeometry(star, { depth: 0.09, bevelEnabled: false }).translate(0, 0, -0.045);
  const glow = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, '#ffffffcc'); gr.addColorStop(0.3, '#ffffff55'); gr.addColorStop(1, '#ffffff00');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  G = { disc, rim, star: starG, glow, mats: {} };
  for (const k in TIER) {
    const col = TIER[k].color;
    G.mats[k] = {
      body: new THREE.MeshStandardMaterial({ color: col, metalness: 0.85, roughness: 0.28, emissive: col, emissiveIntensity: 0.35 }),
      star: new THREE.MeshStandardMaterial({ color: '#fff3c4', metalness: 0.7, roughness: 0.3, emissive: col, emissiveIntensity: 0.6 }),
      glow: new THREE.SpriteMaterial({ map: glow, color: col, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
    };
  }
  return G;
}

/**
 * spots: [{ pos: Vector3, tier, value }] (arena.userData.coinSpots)
 * onCoin(value, spot, index) – ברירת מחדל: addCoins מ-store.js. size: מכפיל גודל. respawn: שניות עד שמטבע חוזר (null = לא חוזר).
 * מחזיר { group, coins, update(dt, playerPos?) → מספר שנאספו בפריים, collect(i), reset(), left(), dispose() }.
 */
export function createCoins(spots, { onCoin = (v) => addCoins(v, 'map'), radius = 1.1, respawn = null, size = 1 } = {}) {
  const g = geos();
  const group = new THREE.Group(); group.name = 'coins';
  const coins = spots.map((s, i) => {
    const tier = TIER[s.tier] ? s.tier : 'easy', m = g.mats[tier];
    const c = new THREE.Group();
    const spin = new THREE.Group(); c.add(spin);
    spin.add(new THREE.Mesh(g.disc, m.body), new THREE.Mesh(g.rim, m.body), new THREE.Mesh(g.star, m.star));
    const halo = new THREE.Sprite(m.glow); halo.scale.setScalar(1.5); c.add(halo);
    c.scale.setScalar(TIER[tier].scale * size); c.position.copy(s.pos);
    group.add(c);
    return { obj: c, spin, halo, spot: s, value: s.value ?? 5, alive: true, pop: 0, timer: 0, phase: i * 1.7 };
  });
  let t = 0;
  const r2 = radius * radius;
  function collect(i) {
    const c = coins[i]; if (!c || !c.alive) return 0;
    c.alive = false; c.pop = 1e-6; c.timer = respawn ?? 0;
    onCoin?.(c.value, c.spot, i);
    return c.value;
  }
  return {
    group, coins, collect,
    left: () => coins.filter((c) => c.alive).length,
    reset() { for (const c of coins) { c.alive = true; c.pop = 0; c.obj.visible = true; c.obj.scale.setScalar((TIER[c.spot.tier]?.scale || 1) * size); } },
    update(dt, playerPos = null) {
      t += dt; let got = 0;
      for (let i = 0; i < coins.length; i++) {
        const c = coins[i], base = (TIER[c.spot.tier]?.scale || 1) * size;
        if (c.alive) {
          c.spin.rotation.y = t * 2.6 + c.phase;
          c.obj.position.y = c.spot.pos.y + 0.15 + Math.sin(t * 2.2 + c.phase) * 0.12;
          c.halo.material.opacity = 0.6 + Math.sin(t * 4 + c.phase) * 0.2;
          if (playerPos && c.obj.position.distanceToSquared(playerPos) < r2 * base * base) { collect(i); got++; }
        } else if (c.pop > 0) { // אנימציית איסוף: קופץ, מסתובב מהר ונעלם
          c.pop += dt * 2.6;
          c.spin.rotation.y += dt * 30;
          c.obj.position.y = c.spot.pos.y + 0.15 + c.pop * 1.4;
          c.obj.scale.setScalar(base * Math.max(0, 1.25 - c.pop * 1.25));
          if (c.pop >= 1) { c.pop = 0; c.obj.visible = false; }
        } else if (respawn != null && (c.timer -= dt) <= 0) { c.alive = true; c.obj.visible = true; c.obj.scale.setScalar(base); }
      }
      return got;
    },
    dispose() { group.removeFromParent(); },
  };
}

/** הדגמה: הזירה עם המטבעות, ורחפן איסוף שעובר ביניהם. כל מטבע שנאסף נכנס לארנק. */
export function startCoinDemo(scene, camera, ui, back) {
  const grp = new THREE.Group(); scene.add(grp);
  const arena = buildArena(); grp.add(arena);
  const A = arena.userData;
  const saved = { bg: scene.background, fog: scene.fog, fov: camera.fov, far: camera.far, near: camera.near, lights: [] };
  scene.children.forEach((o) => { if (o.isLight && o.visible) { saved.lights.push(o); o.visible = false; } });
  scene.background = A.background; scene.fog = A.fog;
  camera.fov = 60; camera.far = 500; camera.near = 0.1; camera.updateProjectionMatrix();

  let earned = 0;
  const C = createCoins(A.coinSpots, { onCoin: (v) => { addCoins(v, 'demo'); earned += v; flash(`+${v} 🪙`); draw(); }, size: 2, radius: 0.9 });
  grp.add(C.group);

  // רחפן: כדור זוהר + טבעת. עובר בין המטבעות לפי הסדר הקרוב ביותר.
  const drone = new THREE.Group();
  drone.add(new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), new THREE.MeshStandardMaterial({ color: '#2b3a55', emissive: '#4ff0ff', emissiveIntensity: 0.8, metalness: 0.6, roughness: 0.3 })));
  const dRing = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.04, 8, 32).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#4ff0ff' }));
  drone.add(dRing);
  const sp0 = A.spawnPoints[0]?.pos || new THREE.Vector3();
  drone.position.copy(sp0).setY(3); grp.add(drone);
  const order = []; {
    const left = A.coinSpots.map((s, i) => i), p = drone.position.clone();
    while (left.length) { let bi = 0, bd = Infinity; left.forEach((i, k) => { const d = A.coinSpots[i].pos.distanceToSquared(p); if (d < bd) { bd = d; bi = k; } }); const i = left.splice(bi, 1)[0]; order.push(i); p.copy(A.coinSpots[i].pos); }
  }
  let target = 0, pause = 1.2;

  const draw = () => {
    ui.innerHTML = `<div class="bar"><button class="chip" id="back">→ חזרה</button>
      <button class="chip" id="again">🔁 שוב</button><span style="flex:1"></span>
      <span class="chip" style="color:#ffd54a">🪙 ${getWallet().coins}</span></div>
      <div class="info">🪙 <b>מטבעות במפה</b> · נאספו ${A.coinSpots.length - C.left()}/${A.coinSpots.length} · הרווחת ${earned}<br>
      <span style="color:${TIER.easy.color}">●</span> קל 5 <span style="color:${TIER.medium.color}">●</span> בינוני 15 <span style="color:${TIER.hard.color}">●</span> קשה 40</div>
      <div id="cflash" style="position:absolute;top:40%;left:50%;transform:translate(-50%,-50%);font:900 42px Rubik;color:#ffd54a;text-shadow:0 0 20px #ff9a00;pointer-events:none;opacity:0;transition:opacity .5s"></div>`;
    ui.querySelector('#back').onclick = () => { stop(); back(); };
    ui.querySelector('#again').onclick = () => { C.reset(); target = 0; pause = 0.6; drone.position.copy(sp0).setY(3); draw(); };
  };
  let ft = 0;
  const flash = (txt) => { ft = 0.9; requestAnimationFrame(() => { const f = ui.querySelector('#cflash'); if (f) { f.textContent = txt; f.style.opacity = 1; } }); };
  draw();

  const stop = () => {
    scene.remove(grp);
    scene.background = saved.bg; scene.fog = saved.fog;
    saved.lights.forEach((l) => (l.visible = true));
    camera.fov = saved.fov; camera.far = saved.far; camera.near = saved.near; camera.updateProjectionMatrix();
    view.active = false;
  };
  const camPos = new THREE.Vector3(), look = new THREE.Vector3(), dir = new THREE.Vector3();
  camPos.copy(drone.position).add(new THREE.Vector3(0, 8, 12));
  let t = 0;
  const view = {
    active: true, coins: C, drone, stop,
    update(dt) {
      t += dt; dt = Math.min(dt, 0.25);
      if (ft > 0 && (ft -= dt) <= 0) { const f = ui.querySelector('#cflash'); if (f) f.style.opacity = 0; }
      if (target < order.length) {
        if (pause > 0) pause -= dt;
        else {
          const goal = A.coinSpots[order[target]].pos;
          dir.copy(goal).sub(drone.position); const d = dir.length();
          // עולה מעל המכשולים בדרך ויורד אל המטבע
          const lift = Math.min(1, d / 6) * 6;
          const step = Math.min(d, 11 * dt);
          drone.position.addScaledVector(dir.normalize(), step);
          drone.position.y += ((goal.y + 0.15 + lift) - drone.position.y) * Math.min(1, dt * 3);
          if (d < 0.6) { target++; pause = 0.35; }
        }
      }
      dRing.rotation.z = Math.sin(t * 3) * 0.3; dRing.rotation.y = t * 4;
      C.update(dt, drone.position);
      // מצלמה עוקבת מאחור-למעלה
      look.copy(drone.position);
      const want = look.clone().add(new THREE.Vector3(Math.sin(t * 0.15) * 7, 13, Math.cos(t * 0.15) * 7)); // מלמעלה, כדי שבניינים לא יסתירו
      camPos.lerp(want, Math.min(1, dt * 2));
      camera.position.copy(camPos); camera.lookAt(look);
    },
  };
  return view;
}

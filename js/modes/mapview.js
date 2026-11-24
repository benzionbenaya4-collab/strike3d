// תצוגת מפה: מצלמה מסתובבת סביב הזירה, מטוס עובר מעל, סימוני מטבעות/תיבות/לידה.
import * as THREE from 'three';
import { buildArena } from '../world/arena.js';
import { buildJet, flyover, randomPass } from '../models/jet.js';

export function startMap(scene, camera, ui, back) {
  const grp = new THREE.Group(); scene.add(grp);
  const arena = buildArena(); grp.add(arena);
  const A = arena.userData;

  // שמירת מצב הסצנה והחלפה לאווירת הזירה
  const saved = { bg: scene.background, fog: scene.fog, fov: camera.fov, far: camera.far, lights: [] };
  scene.children.forEach((o) => { if (o.isLight && o.visible) { saved.lights.push(o); o.visible = false; } });
  scene.background = A.background; scene.fog = A.fog;
  camera.fov = 55; camera.far = 500; camera.updateProjectionMatrix();

  // סימונים
  const marks = new THREE.Group(); grp.add(marks);
  const TIER = { easy: '#ffd54a', medium: '#ffae2b', hard: '#ff5bd8' };
  const coinGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.08, 16).rotateX(Math.PI / 2);
  const coins = A.coinSpots.map((c) => {
    const m = new THREE.Mesh(coinGeo, new THREE.MeshStandardMaterial({ color: TIER[c.tier], emissive: TIER[c.tier], emissiveIntensity: 0.6, metalness: 0.8, roughness: 0.3 }));
    m.position.copy(c.pos); m.scale.setScalar(c.tier === 'hard' ? 1.5 : 1.15); marks.add(m); return m;
  });
  const chestGeo = new THREE.BoxGeometry(1.0, 0.7, 0.65).translate(0, 0.35, 0);
  const chestMat = new THREE.MeshStandardMaterial({ color: '#5a3ea8', emissive: '#7d55ff', emissiveIntensity: 0.5, roughness: 0.5 });
  for (const c of A.chestSpots) { const m = new THREE.Mesh(chestGeo, chestMat); m.position.copy(c.pos); m.rotation.y = c.rotY; marks.add(m); }
  const ringGeo = new THREE.RingGeometry(0.6, 0.9, 24).rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({ color: '#4ff0ff', transparent: true, opacity: 0.8, side: THREE.DoubleSide });
  for (const s of A.spawnPoints) { const m = new THREE.Mesh(ringGeo, ringMat); m.position.copy(s.pos).setY(0.05); marks.add(m); }

  // מטוס
  const jet = buildJet(); grp.add(jet);
  let flight = null, wait = 0.5;
  const newPass = () => { const p = randomPass(A.half * 2, 42 + Math.random() * 12); flight = flyover(jet, { ...p, speed: 55 }); jet.visible = true; };

  const st = { orbit: 0.8, spin: true, marks: true, chase: false };
  const chip = (id, on, label) => `<button class="chip ${on ? 'on' : ''}" id="${id}">${label}</button>`;
  const draw = () => {
    ui.innerHTML = `<div class="bar" style="flex-wrap:wrap">
      <button class="chip" id="back">→ חזרה</button>
      ${chip('spin', st.spin, '🎥 סיבוב')}${chip('marks', st.marks, '📍 סימונים')}${chip('chase', st.chase, '✈️ מצלמת מטוס')}
    </div>
    <div class="info">🗺️ <b>העיר</b> · ${A.coinSpots.length} מטבעות · ${A.chestSpots.length} תיבות · ${A.spawnPoints.length} נקודות לידה<br>
      <span style="color:${TIER.easy}">●</span> קל <span style="color:${TIER.medium}">●</span> בינוני <span style="color:${TIER.hard}">●</span> קשה
      <span style="color:#7d55ff">■</span> תיבה <span style="color:#4ff0ff">○</span> לידה</div>`;
    ui.querySelector('#back').onclick = () => { stop(); back(); };
    ui.querySelector('#spin').onclick = () => { st.spin = !st.spin; draw(); };
    ui.querySelector('#marks').onclick = () => { st.marks = !st.marks; marks.visible = st.marks; draw(); };
    ui.querySelector('#chase').onclick = () => { st.chase = !st.chase; draw(); };
  };
  draw();

  let dx = null;
  const down = (e) => { if (e.target.tagName === 'CANVAS') { dx = e.clientX; st.spin = false; } };
  const move = (e) => { if (dx !== null) { st.orbit -= (e.clientX - dx) * 0.006; dx = e.clientX; } };
  const up = () => { if (dx !== null) { dx = null; draw(); } };
  addEventListener('pointerdown', down); addEventListener('pointermove', move); addEventListener('pointerup', up);

  const stop = () => {
    removeEventListener('pointerdown', down); removeEventListener('pointermove', move); removeEventListener('pointerup', up);
    scene.remove(grp);
    scene.background = saved.bg; scene.fog = saved.fog;
    saved.lights.forEach((l) => (l.visible = true));
    camera.fov = saved.fov; camera.far = saved.far; camera.updateProjectionMatrix();
    view.active = false;
  };

  let t = 0;
  const tmp = new THREE.Vector3(), fwd = new THREE.Vector3();
  const view = {
    active: true, arena, jet, st,
    update(dt) {
      t += dt;
      if (st.spin) st.orbit += dt * 0.12;
      coins.forEach((c, i) => { c.rotation.y = t * 2 + i; c.position.y = A.coinSpots[i].pos.y + Math.sin(t * 2 + i) * 0.12; });
      if (flight) { if (flight.update(dt)) { flight = null; wait = 2.5; jet.visible = false; } }
      else if ((wait -= dt) <= 0) newPass();
      if (st.chase && flight) {
        fwd.set(0, 0, 1).applyQuaternion(jet.quaternion);
        tmp.copy(jet.position).addScaledVector(fwd, -26).add(new THREE.Vector3(0, 7, 0));
        camera.position.lerp(tmp, Math.min(1, dt * 4));
        camera.lookAt(jet.position);
      } else {
        const R = 58, H = 30;
        camera.position.set(Math.sin(st.orbit) * R, H + Math.sin(t * 0.2) * 3, Math.cos(st.orbit) * R);
        camera.lookAt(0, 2, 0);
      }
    },
  };
  return view;
}

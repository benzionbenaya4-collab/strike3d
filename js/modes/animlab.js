// מעבדת תנועה: בדיקת אחיזת נשקים ותנועות הדמות.
import * as THREE from 'three';
import { Animator } from '../core/anim.js';
import { buildCharacter } from '../models/character.js';
import { SKINS } from '../data/skins.js';
import { buildKnife } from '../models/knife.js';
import { buildWeapon } from '../models/weapons.js';

// נשקים זמניים (גיבוי) – הנשקים האמיתיים מ-models/weapons.js, אותו חוזה userData.
const gm = (c) => new THREE.MeshStandardMaterial({ color: c, metalness: 0.6, roughness: 0.45 });
function box(g, w, h, d, m, x, y, z, rz = 0) { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.z = rz; g.add(o); return o; }
export function tempPistol() {
  const g = new THREE.Group(), a = gm('#2a2d33'), b = gm('#15171a');
  box(g, 0.19, 0.035, 0.03, a, 0.05, 0.02, 0);
  box(g, 0.035, 0.1, 0.028, b, -0.005, -0.04, 0, -0.25);
  box(g, 0.03, 0.012, 0.024, b, 0.035, -0.012, 0);
  g.userData = { gripPoint: new THREE.Vector3(0, -0.035, 0), supportPoint: new THREE.Vector3(-0.004, -0.045, -0.048), muzzle: new THREE.Vector3(0.145, 0.02, 0) };
  return g;
}
export function tempRifle() {
  const g = new THREE.Group(), a = gm('#2a2d33'), b = gm('#15171a'), c = gm('#3b4130');
  box(g, 0.42, 0.06, 0.04, a, 0.08, 0.03, 0);            // גוף
  box(g, 0.3, 0.035, 0.025, b, 0.42, 0.04, 0);            // קנה
  box(g, 0.2, 0.05, 0.035, c, 0.22, 0.02, 0);             // מגן יד
  box(g, 0.2, 0.06, 0.035, c, -0.2, 0.0, 0, 0.12);        // קת
  box(g, 0.035, 0.1, 0.03, b, 0.0, -0.05, 0, -0.3);       // אחיזה
  box(g, 0.04, 0.12, 0.03, a, 0.1, -0.06, 0, 0.15);       // מחסנית
  box(g, 0.12, 0.035, 0.035, b, 0.06, 0.08, 0);           // כוונת
  g.userData = { gripPoint: new THREE.Vector3(0, -0.045, 0), supportPoint: new THREE.Vector3(0.22, -0.01, -0.025), magPoint: new THREE.Vector3(0.1, -0.1, 0), muzzle: new THREE.Vector3(0.57, 0.04, 0) };
  return g;
}

export function startLab(scene, camera, ui, back) {
  const grp = new THREE.Group(); scene.add(grp);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(12, 48), new THREE.MeshStandardMaterial({ color: '#1a1f29', roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; grp.add(ground);
  const grid = new THREE.GridHelper(24, 24, '#2c3445', '#222838'); grid.position.y = 0.002; grp.add(grid);
  const sun = new THREE.DirectionalLight('#fff4e0', 1.6); sun.position.set(3, 6, 4); grp.add(sun);

  const st = { weapon: 'rifle', skin: 'default', move: 0, aim: false, walkCircle: true, angle: 0, orbit: 0.6, auto: false };
  const W = (id) => () => buildWeapon(id, st.skin);
  const MAKE = { none: () => null, knife: () => buildKnife(st.skin) };
  for (const id of ['pistol', 'rifle', 'smg', 'shotgun', 'sniper', 'grenade', 'plasma']) MAKE[id] = W(id);
  let rig, an;
  // רימון: ב-core/anim.js הוא 'unarmed' – בינתיים מחזיקים אותו בתנוחת אקדח
  const equip = () => an.setWeapon(MAKE[st.weapon](), st.weapon === 'none' ? null : st.weapon === 'grenade' ? 'pistol' : st.weapon);
  const build = () => {
    const prev = rig?.root;
    if (prev) grp.remove(prev);
    rig = buildCharacter({ skin: st.skin }); an = rig.anim; grp.add(rig.root);
    if (prev) { rig.root.position.copy(prev.position); rig.root.rotation.copy(prev.rotation); }
    lab.rig = rig; lab.an = an;
    equip();
  };

  const chip = (k, v, label) => `<button class="chip ${st[k] === v ? 'on' : ''}" data-k="${k}" data-v="${v}">${label}</button>`;
  const draw = () => {
    ui.innerHTML = `<div class="rows"><div class="row">
      <button class="chip" id="back">→ חזרה</button>
      ${chip('weapon', 'none', '✊ בלי')}${chip('weapon', 'knife', '🔪 סכין')}${chip('weapon', 'pistol', '🔫 אקדח')}${chip('weapon', 'rifle', '🎯 רובה')}${chip('weapon', 'smg', '⚡ תת־מקלע')}${chip('weapon', 'shotgun', '💥 שוטגן')}${chip('weapon', 'sniper', '🔭 צלף')}${chip('weapon', 'grenade', '💣 רימון')}${chip('weapon', 'plasma', '🌀 פלזמה')}
    </div>
    <div class="row">${SKINS.map((x) => chip('skin', x.id, '👕 ' + x.he)).join('')}</div></div>
    <div class="skins" style="flex-wrap:wrap">
      ${chip('move', 0, '🧍 עומד')}${chip('move', 0.5, '🚶 הולך')}${chip('move', 1, '🏃 רץ')}
      <button class="chip" id="shoot">💥 ירי / דקירה</button>
      <button class="chip" id="reload">🔄 טעינה</button>
      <button class="chip ${st.aim ? 'on' : ''}" id="aim">🎯 כיוון</button>
    </div>`;
    ui.querySelector('#back').onclick = () => { scene.remove(grp); stop(); back(); };
    ui.querySelectorAll('[data-k]').forEach((b) => (b.onclick = () => {
      const k = b.dataset.k, v = k === 'move' ? +b.dataset.v : b.dataset.v;
      st[k] = v; if (k === 'weapon') equip(); if (k === 'skin') build(); draw();
    }));
    ui.querySelector('#shoot').onclick = () => an.trigger(st.weapon === 'knife' ? 'slash' : 'shoot');
    ui.querySelector('#reload').onclick = () => an.trigger('reload');
    ui.querySelector('#aim').onclick = () => { st.aim = !st.aim; draw(); };
  };
  draw();

  // גרירה = סיבוב מצלמה
  let dx = null;
  const down = (e) => { if (e.target.tagName !== 'CANVAS') return; dx = e.clientX; };
  const move = (e) => { if (dx !== null) { st.orbit -= (e.clientX - dx) * 0.01; dx = e.clientX; } };
  const up = () => { dx = null; };
  addEventListener('pointerdown', down); addEventListener('pointermove', move); addEventListener('pointerup', up);
  const stop = () => { removeEventListener('pointerdown', down); removeEventListener('pointermove', move); removeEventListener('pointerup', up); lab.active = false; };

  const R = 3;
  const lab = {
    active: true, st, an, rig,
    update(dt) {
      const sp = st.move;
      let yawRate = 0;
      if (sp > 0) {
        const w = (sp < 0.75 ? 1.4 : 4.2) / R; // מהירות זוויתית לפי מהירות הליכה
        st.angle += w * dt; yawRate = w;
        rig.root.position.set(Math.cos(st.angle) * R, 0, Math.sin(st.angle) * R);
        rig.root.rotation.y = -st.angle; // פונה לכיוון התנועה (משיק)
      } else { rig.root.position.set(0, 0, 0); rig.root.rotation.y = 0; }
      an.update(dt, { speed: sp, pitch: 0, yawRate, aiming: st.aim });
      an.weapon?.userData.animate?.(an.t);
      const c = rig.root.position, a = st.orbit + (sp > 0 ? -st.angle + Math.PI / 2 : 0);
      camera.position.set(c.x + Math.sin(a) * 3.6, 1.35, c.z + Math.cos(a) * 3.6);
      camera.lookAt(c.x, 0.92, c.z);
    },
  };
  build();
  return lab;
}
